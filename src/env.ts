/**
 * Cloudflare Workers environment bindings as declared in wrangler.toml.
 */
export interface Env {
  DB: D1Database;
  CHAT_SESSION: DurableObjectNamespace;
  TELEGRAM_BOT_TOKEN: string;
  BOT_USERNAME: string;
}
