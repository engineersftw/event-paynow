import { env } from 'cloudflare:test';
import { describe, expect, it } from 'vitest';

/**
 * /claim against the real CHAT_SESSION Durable Object (workerd), where requests are
 * processed one at a time — the property exactly-once Confirm taps rely on.
 */
describe('ConversationDO /claim (real binding)', () => {
  const stubFor = (chatId: number) =>
    env.CHAT_SESSION.get(env.CHAT_SESSION.idFromName(`chat-claim-${chatId}`));

  async function post(stub: DurableObjectStub, path: string, body: unknown): Promise<number> {
    const res = await stub.fetch(
      new Request(`http://localhost${path}`, { method: 'POST', body: JSON.stringify(body) })
    );
    await res.body?.cancel();
    return res.status;
  }

  it('of many concurrent claims exactly one wins', async () => {
    const stub = stubFor(1);
    await post(stub, '/state', { flow: 'start', step: 5, context: { amountCents: 1250 } });

    const statuses = await Promise.all(
      Array.from({ length: 8 }, () => post(stub, '/claim', { flow: 'start', step: 5 }))
    );

    expect(statuses.filter((s) => s === 200)).toHaveLength(1);
    expect(statuses.filter((s) => s === 409)).toHaveLength(7);

    const res = await stub.fetch(new Request('http://localhost/state', { method: 'GET' }));
    const state = (await res.json()) as { flow: string };
    expect(state.flow).toBe('idle');
  });
});
