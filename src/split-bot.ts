import type { Api, BotConfig, Context } from 'grammy';
import { Bot } from 'grammy';
import { collectClaim } from './commands/split-claim';
import { SPLIT_HELP, SplitCommandHandler } from './commands/split-handler';
import { formatSplitStats } from './commands/split-stats-handler';
import { parseUserIds } from './commands/stats-handler';
import { D1SplitDirectory } from './db/split-repository';
import { D1UsageRepository } from './db/usage-repository';
import type { Env } from './env';
import {
  DEFAULT_RECEIPT_MODEL,
  type ReceiptReader,
  WorkersAiReceiptReader,
} from './receipt-reader';
import type { ConversationDO } from './worker/conversation-do';

/**
 * Split_PayNow_Bot: splits a bill equally and makes a QR for one share. No database; the
 * conversation lives in the chat's Durable Object under its own key (`split-<id>`).
 * `token` is required here (the Worker route only builds this bot when it is configured).
 */
export interface SplitBotDeps {
  /** Reads a receipt photo; defaults to Workers AI when the `AI` binding exists. */
  reader?: ReceiptReader;
  /** Downloads a Telegram file; defaults to the Bot API file endpoint. */
  download?: (api: Api, fileId: string) => Promise<Uint8Array>;
}

/** The photo's bytes through the Bot API file endpoint (capped: receipts are small). */
async function downloadTelegramFile(token: string, api: Api, fileId: string): Promise<Uint8Array> {
  const file = await api.getFile(fileId);
  if (!file.file_path || (file.file_size ?? 0) > 10_000_000) throw new Error('unusable file');
  const response = await fetch(`https://api.telegram.org/file/bot${token}/${file.file_path}`);
  if (!response.ok) throw new Error('download failed');
  return new Uint8Array(await response.arrayBuffer());
}

export function createSplitBot(
  env: Env,
  token: string,
  config?: BotConfig<Context>,
  deps: SplitBotDeps = {}
): Bot {
  const bot = new Bot(token, config);

  const directory = new D1SplitDirectory(env.paynow_db);
  const usage = new D1UsageRepository(env.paynow_db); // anonymous daily counts only
  const reader =
    deps.reader ??
    (env.AI
      ? new WorkersAiReceiptReader(env.AI, env.RECEIPT_MODEL ?? DEFAULT_RECEIPT_MODEL)
      : undefined);
  const download =
    deps.download ?? ((api: Api, fileId: string) => downloadTelegramFile(token, api, fileId));

  const handler = (ctx: Context): SplitCommandHandler => {
    const id = ctx.chat?.id;
    if (typeof id !== 'number') throw new Error('Update without a chat identity');
    const stub = env.CHAT_SESSION.get(env.CHAT_SESSION.idFromName(`split-${id}`));
    return new SplitCommandHandler(
      stub as unknown as ConversationDO,
      directory,
      env.SPLIT_BOT_USERNAME,
      { ...(reader ? { reader } : {}), download },
      usage
    );
  };

  // Private chats and groups only (no channels)
  bot.use(async (ctx, next) => {
    if (ctx.chat && ctx.chat.type !== 'channel') return next();
  });

  bot.command('split', (ctx) => handler(ctx).start(ctx));
  bot.command('split_custom', (ctx) => handler(ctx).start(ctx, 'custom'));
  bot.command('split_receipt', (ctx) => handler(ctx).start(ctx, 'receipt'));
  bot.command('start', async (ctx) => {
    if (ctx.chat.type !== 'private') return;
    // A person who starts the bot becomes reachable by @username in later splits
    if (ctx.from?.username)
      await directory.saveContact(ctx.from.username.toLowerCase(), ctx.from.id);
    if (ctx.match.startsWith('claim_')) {
      await collectClaim(
        ctx,
        directory,
        ctx.match.slice('claim_'.length),
        env.SPLIT_BOT_USERNAME,
        usage
      );
    } else {
      await handler(ctx).start(ctx);
    }
  });
  // Hidden (not in /help or the BotFather list): usage numbers for the ids in STATS_USER_IDS, the same
  // list as Event PayNow Bot's /stats, private chats only. Anyone else gets no reply at all.
  bot.command('stats', async (ctx) => {
    if (ctx.chat.type !== 'private' || !ctx.from) return;
    if (!parseUserIds(env.STATS_USER_IDS).has(ctx.from.id)) return;
    await ctx.reply(formatSplitStats(await usage.splitSnapshot()));
  });
  bot.command('forget', async (ctx) => {
    if (ctx.chat.type !== 'private' || !ctx.from) {
      await ctx.reply('Send /forget to me in a private chat.');
      return;
    }
    await directory.forget(ctx.from.id);
    await ctx.reply('Forgotten. I no longer remember your username.');
  });
  bot.command('help', (ctx) => ctx.reply(SPLIT_HELP));
  bot.command('cancel', (ctx) => handler(ctx).cancel(ctx));
  bot.on('callback_query:data', async (ctx) => {
    if (!(await handler(ctx).handleCallback(ctx, ctx.callbackQuery.data))) {
      await ctx.answerCallbackQuery();
    }
  });
  bot.on('message:text', async (ctx) => {
    if (ctx.message.text.startsWith('/')) return;
    await handler(ctx).handleText(ctx);
  });
  bot.on('message:photo', (ctx) => handler(ctx).handlePhoto(ctx));
  bot.on('edited_message:text', (ctx) => handler(ctx).handleEdit(ctx));
  return bot;
}

// Cached per isolate, like the other bots (botInfo is fetched once via getMe).
let botPromise: Promise<Bot> | null = null;

async function getSplitBot(env: Env, token: string): Promise<Bot> {
  if (!botPromise) {
    const pending = (async () => {
      const bot = createSplitBot(env, token);
      await bot.init();
      return bot;
    })();
    botPromise = pending;
    pending.catch(() => {
      if (botPromise === pending) botPromise = null;
    });
  }
  return botPromise;
}

/**
 * Answer Telegram at once and finish the update in the background. A receipt scan can take longer
 * than the 10 seconds a webhook response may wait; when one update failed, Telegram retried it
 * and held the chat's later messages behind it, so the group went silent. The update runs under
 * `waitUntil` (up to 30 more seconds), and a failure is logged instead of being retried forever.
 */
export async function acceptUpdate(
  bot: Bot,
  request: Request,
  ctx: Pick<ExecutionContext, 'waitUntil'>
): Promise<Response> {
  const update = (await request.json()) as Parameters<Bot['handleUpdate']>[0];
  const started = Date.now();
  ctx.waitUntil(
    bot
      .handleUpdate(update)
      .then(() => {
        const ms = Date.now() - started;
        if (ms > 8000) console.warn(`split update took ${ms} ms`);
      })
      .catch((error) => {
        // The error's own message only: updates carry payee numbers and receipts
        console.error(
          `split update failed: ${(error instanceof Error ? error.message : String(error)).slice(0, 200)}`
        );
      })
  );
  return new Response('ok');
}

export async function handleSplitWebhook(
  request: Request,
  env: Env,
  ctx: Pick<ExecutionContext, 'waitUntil'>
): Promise<Response> {
  const bot = await getSplitBot(env, env.SPLIT_BOT_TOKEN as string);
  return acceptUpdate(bot, request, ctx);
}
