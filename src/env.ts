/**
 * Cloudflare Workers environment bindings as declared in wrangler.toml.
 */
export interface Env {
  paynow_db: D1Database;
  CHAT_SESSION: DurableObjectNamespace;
  TELEGRAM_BOT_TOKEN: string;
  TELEGRAM_WEBHOOK_SECRET: string;
  BOT_USERNAME: string;
  /** Base URL of the Pages event page, e.g. https://event-paynow-web.pages.dev */
  WEB_ADMIN_URL?: string;
  /** Simple_PayNow_Bot (QR-only bot on /webhook/simple); the route answers 404 until all three are set. */
  SIMPLE_BOT_TOKEN?: string;
  SIMPLE_WEBHOOK_SECRET?: string;
  SIMPLE_BOT_USERNAME?: string;
  /** Telegram user ids (comma-separated) allowed to use the hidden /stats command; none when unset. */
  STATS_USER_IDS?: string;
}
