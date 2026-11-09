import type { BotConfig, Context } from 'grammy';
import { Bot, webhookCallback } from 'grammy';
import { SIMPLE_HELP, SimpleCommandHandler } from './commands/simple-handler';
import { D1UsageRepository } from './db/usage-repository';
import type { Env } from './env';
import type { ConversationDO } from './worker/conversation-do';

/**
 * Simple_PayNow_Bot: a QR-only bot. No database; the short conversation lives in the chat's
 * Durable Object under its own key (`simple-<id>`), so it never mixes with the event bot's.
 * `token` is required here (the Worker route only builds this bot when it is configured).
 */
export function createSimpleBot(env: Env, token: string, config?: BotConfig<Context>): Bot {
  const bot = new Bot(token, config);
  const counter = new D1UsageRepository(env.paynow_db); // anonymous daily counts only

  const handler = (ctx: Context): SimpleCommandHandler => {
    const id = ctx.chat?.id ?? ctx.from?.id;
    if (typeof id !== 'number') throw new Error('Update without a chat identity');
    const stub = env.CHAT_SESSION.get(env.CHAT_SESSION.idFromName(`simple-${id}`));
    return new SimpleCommandHandler(stub as unknown as ConversationDO, counter);
  };

  // Private chats only: payee numbers do not belong in a group
  bot.use(async (ctx, next) => {
    if (ctx.chat?.type === 'private') return next();
    if (ctx.message?.text?.startsWith('/start')) {
      await ctx.reply('Please message me directly to make a PayNow QR.');
    }
  });

  bot.command('start', (ctx) => handler(ctx).start(ctx));
  bot.command('help', (ctx) => ctx.reply(SIMPLE_HELP));
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
  return bot;
}

// Cached per isolate, like the event bot (botInfo is fetched once via getMe).
let botPromise: Promise<Bot> | null = null;

async function getSimpleBot(env: Env, token: string): Promise<Bot> {
  if (!botPromise) {
    const pending = (async () => {
      const bot = createSimpleBot(env, token);
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

export async function handleSimpleWebhook(request: Request, env: Env): Promise<Response> {
  const bot = await getSimpleBot(env, env.SIMPLE_BOT_TOKEN as string);
  return webhookCallback(bot, 'cloudflare-mod')(request);
}
