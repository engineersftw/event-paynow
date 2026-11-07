import type { Env } from "./env";
import { validateSecret, handleWebhook } from "./bot";

export default {
  async fetch(request: Request, env: Env, _ctx: ExecutionContext): Promise<Response> {
    const url = new URL(request.url);

    // Health check
    if (url.pathname === "/" && request.method === "GET") {
      return new Response("event-paynow bot running", { status: 200 });
    }

    // Telegram webhook endpoint
    if (url.pathname === "/webhook" && request.method === "POST") {
      // Validate secret BEFORE creating bot (avoids "Empty token" error in tests)
      if (!validateSecret(request, env.TELEGRAM_BOT_TOKEN)) {
        return new Response("Unauthorized", { status: 403 });
      }
      return handleWebhook(request, env);
    }

    return new Response("Not found", { status: 404 });
  },
};
