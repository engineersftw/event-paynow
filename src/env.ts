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
  /** Split_PayNow_Bot (bill splitter on /webhook/split); the route answers 404 until token and secret are set. */
  SPLIT_BOT_TOKEN?: string;
  SPLIT_WEBHOOK_SECRET?: string;
  SPLIT_BOT_USERNAME?: string;
  /** Workers AI binding for reading receipt photos in Split_PayNow_Bot; scanning is off without it. */
  AI?: Ai;
  /** Vision model used for receipts; defaults to Llama 4 Scout. */
  RECEIPT_MODEL?: string;
  /** Speech-to-text model for voice notes in Split_PayNow_Bot; defaults to Whisper large v3 turbo. */
  VOICE_MODEL?: string;
  /** Telegram user ids (comma-separated) allowed to use the hidden /stats command; none when unset. */
  STATS_USER_IDS?: string;
}
