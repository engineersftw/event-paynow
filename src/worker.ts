import { handleWebhook, validateSecret } from './bot';
import type { Env } from './env';
import { handleSimpleWebhook } from './simple-bot';
import { handleSplitAppApi, handleSplitAppPage, SPLIT_APP_API } from './split-app/api';
import { handleSplitWebhook } from './split-bot';
import { handleSplitQrBatch, SPLIT_QR_QUEUE, type SplitQrMessage } from './split-qr-queue';

type BotProviders = {
  event?: NonNullable<Parameters<typeof handleWebhook>[3]>;
  simple?: NonNullable<Parameters<typeof handleSimpleWebhook>[3]>;
  split?: NonNullable<Parameters<typeof handleSplitWebhook>[3]>;
};

/** Construct the same router with optional bot providers supplied by the caller. */
export function createWorkerFetch(providers: BotProviders = {}) {
  return async (request: Request, env: Env, ctx: ExecutionContext): Promise<Response> => {
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
      return handleWebhook(request, env, ctx, providers.event);
    }

    // Simple_PayNow_Bot: own secret, 404 until it is configured
    if (url.pathname === '/webhook/simple' && request.method === 'POST') {
      if (!env.SIMPLE_BOT_TOKEN || !env.SIMPLE_WEBHOOK_SECRET) {
        return new Response('Not found', { status: 404 });
      }
      if (!validateSecret(request, env.SIMPLE_WEBHOOK_SECRET)) {
        return new Response('Unauthorized', { status: 403 });
      }
      return handleSimpleWebhook(request, env, ctx, providers.simple);
    }

    // Split_PayNow_Bot: own secret, 404 until it is configured
    if (url.pathname === '/webhook/split' && request.method === 'POST') {
      if (!env.SPLIT_BOT_TOKEN || !env.SPLIT_WEBHOOK_SECRET) {
        return new Response('Not found', { status: 404 });
      }
      if (!validateSecret(request, env.SPLIT_WEBHOOK_SECRET)) {
        return new Response('Unauthorized', { status: 403 });
      }
      return handleSplitWebhook(request, env, ctx, providers.split);
    }

    // The Split Mini App's interface for the claim organiser: 404 until the app is configured
    if (
      (url.pathname === '/split-app' || url.pathname === '/split-app/') &&
      request.method === 'GET'
    )
      return handleSplitAppPage(env);
    if (url.pathname.startsWith(`${SPLIT_APP_API}/`))
      return handleSplitAppApi(request, env, { waitUntil: (work) => ctx.waitUntil(work) });

    return new Response('Not found', { status: 404 });
  };
}

export default {
  fetch: createWorkerFetch(),
  /** Queue consumer: Split_PayNow_Bot QR sends, one message per QR. */
  async queue(batch: MessageBatch<SplitQrMessage>, env: Env): Promise<void> {
    if (batch.queue === SPLIT_QR_QUEUE) await handleSplitQrBatch(batch, env);
  },
};
