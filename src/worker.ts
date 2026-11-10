import { handleWebhook, validateSecret } from './bot';
import type { Env } from './env';
import { handleSimpleWebhook } from './simple-bot';
import { handleSplitWebhook } from './split-bot';

export default {
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    const url = new URL(request.url);

    // Health check
    if (url.pathname === '/' && request.method === 'GET') {
      return new Response('event-paynow bot running', { status: 200 });
    }

    // Telegram webhook endpoint
    if (url.pathname === '/webhook' && request.method === 'POST') {
      // Validate secret BEFORE creating bot (avoids "Empty token" error in tests)
      if (!validateSecret(request, env.TELEGRAM_WEBHOOK_SECRET)) {
        return new Response('Unauthorized', { status: 403 });
      }
      return handleWebhook(request, env);
    }

    // Simple_PayNow_Bot: own secret, 404 until it is configured
    if (url.pathname === '/webhook/simple' && request.method === 'POST') {
      if (!env.SIMPLE_BOT_TOKEN || !env.SIMPLE_WEBHOOK_SECRET) {
        return new Response('Not found', { status: 404 });
      }
      if (!validateSecret(request, env.SIMPLE_WEBHOOK_SECRET)) {
        return new Response('Unauthorized', { status: 403 });
      }
      return handleSimpleWebhook(request, env);
    }

    // Split_PayNow_Bot: own secret, 404 until it is configured
    if (url.pathname === '/webhook/split' && request.method === 'POST') {
      if (!env.SPLIT_BOT_TOKEN || !env.SPLIT_WEBHOOK_SECRET) {
        return new Response('Not found', { status: 404 });
      }
      if (!validateSecret(request, env.SPLIT_WEBHOOK_SECRET)) {
        return new Response('Unauthorized', { status: 403 });
      }
      return handleSplitWebhook(request, env, ctx);
    }

    return new Response('Not found', { status: 404 });
  },
};
