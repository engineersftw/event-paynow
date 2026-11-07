import { Bot, webhookCallback } from "grammy";
import type { BotConfig, Context } from "grammy";
import type { Env } from "./env";
import type { ConversationDO } from "./worker/conversation-do";
import { D1Repository } from "./db/drizzle-repository";
import { InitCommandHandler } from "./commands/init-handler";
import { StartCommandHandler } from "./commands/start-handler";
import { PaymentsCommandHandler } from "./commands/payments-handler";
import { PaybackCommandHandler } from "./commands/payback-handler";
import { PaymentCallbackHandler } from "./commands/payment-callback-handler";

const HELP_TEXT =
  "🤖 *event-paynow bot*\n\n" +
  "/start — create a PayNow QR payment request\n" +
  "/payments — list your payments (with inline buttons)\n" +
  "/payback <ref> — pay back a received payment\n" +
  "/init — set your PayNow reference (mobile/UEN)\n" +
  "/cancel — abandon the current conversation\n\n" +
  "Commands must be set up with BotFather (task 1.3).";

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
  const repository = new D1Repository(env.DB);

  /** Per-chat conversation DO stub (keyed exactly like the webhook design). */
  const conversation = (ctx: Context): ConversationDO => {
    const chatId = ctx.chat?.id ?? ctx.from?.id;
    if (typeof chatId !== "number") {
      throw new Error("Update without a chat identity");
    }
    const stub = env.CHAT_SESSION.get(env.CHAT_SESSION.idFromName(`chat-${chatId}`));
    return stub as unknown as ConversationDO;
  };

  // --- commands ------------------------------------------------------------
  bot.command("ping", (ctx) => ctx.reply("pong 🏓"));
  bot.command("help", (ctx) => ctx.reply(HELP_TEXT, { parse_mode: "Markdown" }));

  bot.command("init", (ctx) =>
    new InitCommandHandler(conversation(ctx), repository).start(ctx)
  );

  bot.command("start", (ctx) =>
    new StartCommandHandler(conversation(ctx), repository).start(ctx)
  );

  bot.command("payments", (ctx) =>
    new PaymentsCommandHandler(repository).handle(ctx)
  );

  bot.command("payback", (ctx) => {
    const arg = typeof ctx.match === "string" ? ctx.match.trim() : "";
    return new PaybackCommandHandler(conversation(ctx), repository).start(
      ctx,
      arg || undefined
    );
  });

  bot.command("cancel", async (ctx) => {
    // Generic abort: reset the per-chat conversation state. No flow writes
    // records before final confirmation, so an abort never leaves partial data.
    const response = await conversation(ctx).fetch(
      new Request("http://localhost/state", {
        method: "POST",
        body: JSON.stringify({
          flow: "idle",
          step: 0,
          context: {},
          lastActivity: new Date().toISOString(),
        }),
      })
    );
    await response?.body?.cancel();
    await ctx.reply("❎ Conversation cancelled. No records were created.");
  });

  // --- inline button callbacks (View / Mark as received / Payback) ---------
  bot.on("callback_query:data", (ctx) =>
    new PaymentCallbackHandler(conversation(ctx), repository).handleCallback(ctx)
  );

  // --- free-text conversation routing --------------------------------------
  // Exactly one flow is active per chat (DO FSM `flow` field); each handler
  // returns false unless it owns the conversation.
  bot.on("message:text", async (ctx) => {
    const doStub = conversation(ctx);
    if (await new PaybackCommandHandler(doStub, repository).handleInput(ctx)) return;
    if (await new StartCommandHandler(doStub, repository).handleInput(ctx)) return;
    if (await new InitCommandHandler(doStub, repository).handleInput(ctx)) return;
    await ctx.reply(
      "❓ No active conversation. Try /start, /payments, /init, /payback <ref> or /help."
    );
  });

  return bot;
}

/**
 * Validates the Telegram webhook secret token.
 * Returns true if the secret matches the expected value.
 */
export function validateSecret(
  request: Request,
  expectedToken: string
): boolean {
  if (!expectedToken) return false;
  const secretToken = request.headers.get("X-Telegram-Bot-Api-Secret-Token");
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
export async function handleWebhook(
  request: Request,
  env: Env
): Promise<Response> {
  const bot = await getBot(env);
  const webhookFn = webhookCallback(bot, "cloudflare-mod");
  return webhookFn(request);
}
