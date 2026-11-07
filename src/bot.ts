import { Bot, webhookCallback } from "grammy";
import type { Env } from "./env";

export function createBot(token: string): Bot {
  const bot = new Bot(token);

  // Basic echo command for verification
  bot.command("ping", (ctx) => ctx.reply("pong 🏓"));

  // Start command
  bot.command("start", (ctx) =>
    ctx.reply("Welcome! Use /init to set your PayNow reference.")
  );

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

/**
 * Handles incoming Telegram webhook requests.
 */
export async function handleWebhook(
  request: Request,
  env: Env
): Promise<Response> {
  const bot = createBot(env.TELEGRAM_BOT_TOKEN);
  const webhookFn = webhookCallback(bot, "cloudflare-mod");
  return webhookFn(request);
}
