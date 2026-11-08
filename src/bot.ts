import type { BotConfig, Context } from 'grammy';
import { Bot, webhookCallback } from 'grammy';
import { isChatAdmin } from './access/chat-admin';
import { EndEventHandler } from './commands/end-event-handler';
import { InitCommandHandler } from './commands/init-handler';
import { PaybackCommandHandler } from './commands/payback-handler';
import { createPaymentAccess } from './commands/payment-access';
import { PaymentCallbackHandler } from './commands/payment-callback-handler';
import { PaymentsCommandHandler } from './commands/payments-handler';
import { StartCommandHandler } from './commands/start-handler';
import { WebAdminCommandHandler } from './commands/web-admin-handler';
import { D1EventRepository, D1Repository } from './db/drizzle-repository';
import type { Env } from './env';
import type { ConversationDO } from './worker/conversation-do';

const HELP_TEXT =
  '🤖 *event-paynow bot*\n\n' +
  '/start — create a PayNow QR payment request\n' +
  '/payments — list your payments (with inline buttons)\n' +
  '/payback <ref> — pay back a received payment\n' +
  '/web_admin — open the web page for an event (admins)\n' +
  '/init — create a new event (name + PayNow payee)\n' +
  '/end_event — close an event\n' +
  '/cancel — abandon the current conversation\n\n' +
  'Commands must be set up with BotFather (task 1.3).';

/**
 * Build the fully-wired bot: all command handlers, inline-button callback
 * routing, and free-text conversation routing, riding the Worker's D1 and
 * CHAT_SESSION bindings.
 *
 * `config` lets tests inject `botInfo` + a stubbed `client.fetch` so updates
 * can be driven without the real Telegram API (see test/workers/bot-wiring.test.ts).
 */
export function createBot(env: Env, config?: BotConfig<Context>): Bot {
  const bot = new Bot(env.TELEGRAM_BOT_TOKEN, config);
  const repository = new D1Repository(env.paynow_db);
  const eventRepository = new D1EventRepository(env.paynow_db);
  // Chat admins may act on any payment of their chat's events (live getChatMember check)
  const isAdmin = (chatId: number, userId: number) =>
    isChatAdmin(chatId, userId, env.TELEGRAM_BOT_TOKEN);
  const canAct = createPaymentAccess(eventRepository, isAdmin);

  /** Per-chat conversation DO stub (keyed exactly like the webhook design). */
  const conversation = (ctx: Context): ConversationDO => {
    const chatId = ctx.chat?.id ?? ctx.from?.id;
    if (typeof chatId !== 'number') {
      throw new Error('Update without a chat identity');
    }
    const stub = env.CHAT_SESSION.get(env.CHAT_SESSION.idFromName(`chat-${chatId}`));
    return stub as unknown as ConversationDO;
  };

  // --- commands ------------------------------------------------------------
  bot.command('ping', (ctx) => ctx.reply('pong 🏓'));
  bot.command('help', (ctx) => ctx.reply(HELP_TEXT, { parse_mode: 'Markdown' }));

  bot.command('init', (ctx) =>
    new InitCommandHandler(conversation(ctx), repository, eventRepository).start(ctx)
  );

  bot.command('start', (ctx) =>
    new StartCommandHandler(conversation(ctx), repository, eventRepository).start(ctx)
  );

  bot.command('payments', (ctx) =>
    new PaymentsCommandHandler(repository, eventRepository, isAdmin).handle(ctx)
  );

  bot.command('web_admin', (ctx) =>
    new WebAdminCommandHandler(eventRepository, env.WEB_ADMIN_URL).handle(ctx)
  );

  bot.command('payback', (ctx) => {
    const arg = typeof ctx.match === 'string' ? ctx.match.trim() : '';
    return new PaybackCommandHandler(conversation(ctx), repository, canAct).start(
      ctx,
      arg || undefined
    );
  });

  bot.command('end_event', (ctx) =>
    new EndEventHandler(conversation(ctx), eventRepository).start(ctx)
  );

  bot.command('cancel', async (ctx) => {
    // Generic abort: reset the per-chat conversation state. No flow writes
    // records before final confirmation, so an abort never leaves partial data.
    const response = await conversation(ctx).fetch(
      new Request('http://localhost/state', {
        method: 'POST',
        body: JSON.stringify({
          flow: 'idle',
          step: 0,
          context: {},
          lastActivity: new Date().toISOString(),
        }),
      })
    );
    await response?.body?.cancel();
    await ctx.reply('❎ Conversation cancelled. No records were created.');
  });

  // --- inline button callbacks --------------------------------------------
  // Callbacks are dispatched by prefix. `init_*` flows to the init handler;
  // `payments:N` re-renders the list at page N; `payback_*` flows to the payback
  // handler; everything else falls through to PaymentCallbackHandler.
  bot.on('callback_query:data', async (ctx) => {
    const data = ctx.callbackQuery?.data ?? '';
    if (data.startsWith('init_confirm:') || data.startsWith('init_cancel:')) {
      await new InitCommandHandler(conversation(ctx), repository, eventRepository).handleCallback(
        ctx
      );
      return;
    }
    if (
      data.startsWith('start_pick:') ||
      data === 'start_skip_name' ||
      data === 'start_confirm' ||
      data === 'start_cancel'
    ) {
      await new StartCommandHandler(conversation(ctx), repository, eventRepository).handleCallback(
        ctx
      );
      return;
    }
    if (
      data.startsWith('end_pick:') ||
      data.startsWith('end_confirm:') ||
      data.startsWith('end_cancel:')
    ) {
      await new EndEventHandler(conversation(ctx), eventRepository).handleCallback(ctx);
      return;
    }
    if (data.startsWith('event_view:')) {
      const eventRef = data.split(':')[1];
      await new PaymentsCommandHandler(repository, eventRepository, isAdmin).handle(ctx, eventRef);
      return;
    }
    if (data.startsWith('payments:')) {
      const page = data.split(':')[1];
      await new PaymentsCommandHandler(repository, eventRepository, isAdmin).handle(ctx, page);
      return;
    }
    if (
      data.startsWith('payback_confirm_payer:') ||
      data.startsWith('payback_change_payer:') ||
      data.startsWith('payback_cancel:') ||
      data.startsWith('payback_confirm_amount:') ||
      data.startsWith('payback_cancel_amount:')
    ) {
      await new PaybackCommandHandler(conversation(ctx), repository, canAct).handleCallback(ctx);
      return;
    }
    await new PaymentCallbackHandler(conversation(ctx), repository, canAct).handleCallback(ctx);
  });

  // --- free-text conversation routing --------------------------------------
  // Exactly one flow is active per chat (DO FSM `flow` field); each handler
  // returns false unless it owns the conversation.
  bot.on('message:text', async (ctx) => {
    const doStub = conversation(ctx);
    if (await new PaybackCommandHandler(doStub, repository, canAct).handleInput(ctx)) return;
    if (await new StartCommandHandler(doStub, repository, eventRepository).handleInput(ctx)) return;
    if (await new InitCommandHandler(doStub, repository, eventRepository).handleInput(ctx)) return;
    if (await new EndEventHandler(doStub, eventRepository).handleInput(ctx)) return;
    await ctx.reply(
      '❓ No active conversation. Try /start, /payments, /init, /payback <ref> or /help.'
    );
  });

  return bot;
}

/**
 * Validates the Telegram webhook secret token.
 * Returns true if the secret matches the expected value.
 */
export function validateSecret(request: Request, expectedToken: string): boolean {
  if (!expectedToken) return false;
  const secretToken = request.headers.get('X-Telegram-Bot-Api-Secret-Token');
  return secretToken === expectedToken;
}

// The bot is cached per isolate: grammY requires botInfo before handleUpdate
// (fetched once via bot.init() → getMe), and env bindings are stable per
// isolate. A failed init is evicted so the next request can retry.
let botPromise: Promise<Bot> | null = null;

async function getBot(env: Env): Promise<Bot> {
  if (!botPromise) {
    const pending = (async () => {
      const bot = createBot(env);
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
 * Handles incoming Telegram webhook requests.
 * Secret validation happens in the fetch entrypoint before this is reached,
 * so createBot never runs with an empty/absent token on unauthorized traffic.
 */
export async function handleWebhook(request: Request, env: Env): Promise<Response> {
  const bot = await getBot(env);
  const webhookFn = webhookCallback(bot, 'cloudflare-mod');
  return webhookFn(request);
}
