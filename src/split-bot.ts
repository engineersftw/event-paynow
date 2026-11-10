import type { BotConfig, Context } from 'grammy';
import { Bot, webhookCallback } from 'grammy';
import { collectClaim } from './commands/split-claim';
import { SPLIT_HELP, SplitCommandHandler } from './commands/split-handler';
import { D1SplitDirectory } from './db/split-repository';
import type { Env } from './env';
import type { ConversationDO } from './worker/conversation-do';

/**
 * Split_PayNow_Bot: splits a bill equally and makes a QR for one share. No database; the
 * conversation lives in the chat's Durable Object under its own key (`split-<id>`).
 * `token` is required here (the Worker route only builds this bot when it is configured).
 */
export function createSplitBot(env: Env, token: string, config?: BotConfig<Context>): Bot {
  const bot = new Bot(token, config);

  const directory = new D1SplitDirectory(env.paynow_db);

  const handler = (ctx: Context): SplitCommandHandler => {
    const id = ctx.chat?.id;
    if (typeof id !== 'number') throw new Error('Update without a chat identity');
    const stub = env.CHAT_SESSION.get(env.CHAT_SESSION.idFromName(`split-${id}`));
    return new SplitCommandHandler(
      stub as unknown as ConversationDO,
      directory,
      env.SPLIT_BOT_USERNAME
    );
  };

  // Private chats and groups only (no channels)
  bot.use(async (ctx, next) => {
    if (ctx.chat && ctx.chat.type !== 'channel') return next();
  });

  bot.command('split', (ctx) => handler(ctx).start(ctx));
  bot.command('split_custom', (ctx) => handler(ctx).start(ctx, 'custom'));
  bot.command('start', async (ctx) => {
    if (ctx.chat.type !== 'private') return;
    // A person who starts the bot becomes reachable by @username in later splits
    if (ctx.from?.username)
      await directory.saveContact(ctx.from.username.toLowerCase(), ctx.from.id);
    if (ctx.match.startsWith('claim_')) {
      await collectClaim(ctx, directory, ctx.match.slice('claim_'.length), env.SPLIT_BOT_USERNAME);
    } else {
      await handler(ctx).start(ctx);
    }
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

export async function handleSplitWebhook(request: Request, env: Env): Promise<Response> {
  const bot = await getSplitBot(env, env.SPLIT_BOT_TOKEN as string);
  return webhookCallback(bot, 'cloudflare-mod')(request);
}
