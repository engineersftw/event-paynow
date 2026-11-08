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
}
