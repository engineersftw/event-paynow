import { SELF } from 'cloudflare:test';
import { describe, expect, it } from 'vitest';

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

  // Note: Testing with correct secret requires mocking the Telegram API
  // (grammY calls getMe internally). Full integration testing with mocked
  // API will be added in task 5.3.
});
