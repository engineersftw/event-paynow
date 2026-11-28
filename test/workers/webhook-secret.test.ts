import { env, SELF } from 'cloudflare:test';
import { describe, expect, it, vi } from 'vitest';
import { createWorkerFetch } from '../../src/worker';

describe('webhook secret validation', () => {
  it('rejects requests without the secret header with 403', async () => {
    const response = await SELF.fetch('http://localhost/webhook', {
      method: 'POST',
      body: JSON.stringify({ update_id: 1 }),
      headers: { 'Content-Type': 'application/json' },
    });

    expect(response.status).toBe(403);
    expect(await response.text()).toBe('Unauthorized');
  });

  it('rejects requests with wrong secret with 403', async () => {
    const response = await SELF.fetch('http://localhost/webhook', {
      method: 'POST',
      body: JSON.stringify({ update_id: 1 }),
      headers: {
        'Content-Type': 'application/json',
        'X-Telegram-Bot-Api-Secret-Token': 'wrong-token',
      },
    });

    expect(response.status).toBe(403);
  });

  it('returns 200 on health check without secret', async () => {
    const response = await SELF.fetch('http://localhost/');

    expect(response.status).toBe(200);
    expect(await response.text()).toContain('event-paynow bot running');
  });

  it.each([
    ['/webhook', 'event-secret'],
    ['/webhook/simple', 'simple-secret'],
    ['/webhook/split', 'split-secret'],
  ])('rejects unauthorized requests to %s before acquiring a bot', async (path, secret) => {
    const provider = vi.fn(async () => {
      throw new Error('Unauthorized request reached a bot provider');
    });
    const route = createWorkerFetch({ event: provider, simple: provider, split: provider });
    const waitUntil = vi.fn();
    const bindings = {
      ...env,
      TELEGRAM_WEBHOOK_SECRET: 'event-secret',
      SIMPLE_BOT_TOKEN: 'simple-token',
      SIMPLE_WEBHOOK_SECRET: 'simple-secret',
      SPLIT_BOT_TOKEN: 'split-token',
      SPLIT_WEBHOOK_SECRET: 'split-secret',
    };
    for (const supplied of [undefined, `${secret}-wrong`]) {
      const headers = new Headers();
      if (supplied) headers.set('X-Telegram-Bot-Api-Secret-Token', supplied);
      const response = await route(
        new Request(`https://bot.test${path}`, { method: 'POST', headers }),
        bindings,
        { waitUntil } as unknown as ExecutionContext
      );
      expect(response.status).toBe(403);
    }
    expect(provider).not.toHaveBeenCalled();
    expect(waitUntil).not.toHaveBeenCalled();
  });
});
