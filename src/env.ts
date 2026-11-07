/**
 * Cloudflare Workers environment bindings as declared in wrangler.toml.
 */
export interface Env {
  paynow_db: D1Database;
  CHAT_SESSION: DurableObjectNamespace;
  TELEGRAM_BOT_TOKEN: string;
  TELEGRAM_WEBHOOK_SECRET: string;
  BOT_USERNAME: string;
}
