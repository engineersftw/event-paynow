import { env } from 'cloudflare:test';
import { beforeAll, describe, expect, it } from 'vitest';
import { CLAIM_TTL_MS, D1SplitDirectory } from '../../src/db/split-repository';
import { applyTestSchema } from './harness';

beforeAll(async () => {
  await applyTestSchema(env.paynow_db);
});

const dir = () => new D1SplitDirectory(env.paynow_db);
const claim = (
  token: string,
  over: Partial<Parameters<D1SplitDirectory['createClaim']>[0]> = {}
) => ({
  token,
  username: 'ann',
  userId: null,
  name: '@ann',
  amountCents: 4000,
  description: 'Dinner',
  payload: 'PAYLOAD',
  organiser: 'Michael',
  chatId: -1,
  expiresAt: new Date(Date.now() + CLAIM_TTL_MS).toISOString(),
  ...over,
});

describe('split contacts', () => {
  it('keeps one row per user and per username, and forgets', async () => {
    const d = dir();
    await d.saveContact('ann', 1001);
    await d.saveContact('bob', 1002);
    expect([...(await d.findContacts(['ann', 'bob', 'cy']))]).toEqual([
      ['ann', 1001],
      ['bob', 1002],
    ]);
    // a different user takes the username: the old holder's row is replaced
    await d.saveContact('ann', 1003);
    expect((await d.findContacts(['ann'])).get('ann')).toBe(1003);
    // the same user changes username: their old row goes
    await d.saveContact('bobby', 1002);
    const found = await d.findContacts(['bob', 'bobby']);
    expect(found.has('bob')).toBe(false);
    expect(found.get('bobby')).toBe(1002);

    await d.forget(1003);
    expect((await d.findContacts(['ann'])).size).toBe(0);
    await d.forget(424242); // forgetting nobody is fine
    expect((await d.findContacts([])).size).toBe(0);
  });
});

describe('split claims', () => {
  it('round-trips, groups by message, and deletes', async () => {
    const d = dir();
    await d.createClaim(claim('tok-a'));
    await d.createClaim(claim('tok-b', { username: 'bob', name: '@bob', amountCents: 2500 }));
    await d.setClaimsMessage(['tok-a', 'tok-b'], 77);
    const got = await d.getClaim('tok-a');
    expect(got).toMatchObject({
      username: 'ann',
      amountCents: 4000,
      payload: 'PAYLOAD',
      messageId: 77,
    });
    expect((await d.claimsForMessage(-1, 77)).map((c) => c.token)).toEqual(['tok-a', 'tok-b']);
    expect(await d.deleteClaim('tok-a')).toBe(true);
    expect(await d.deleteClaim('tok-a')).toBe(false); // already gone: only one caller wins
    expect(await d.getClaim('tok-a')).toBeNull();
    expect((await d.claimsForMessage(-1, 77)).map((c) => c.token)).toEqual(['tok-b']);
  });

  it('treats an expired claim as gone and purges it', async () => {
    const d = dir();
    await d.createClaim(claim('tok-old', { expiresAt: new Date(Date.now() - 1000).toISOString() }));
    expect(await d.getClaim('tok-old')).toBeNull();
    await d.createClaim(claim('tok-new'));
    // 49 hours later the fresh one is expired too
    expect(await d.getClaim('tok-new', new Date(Date.now() + 49 * 3600 * 1000))).toBeNull();
    const left = await env.paynow_db
      .prepare("SELECT COUNT(*) AS n FROM split_claims WHERE token IN ('tok-old','tok-new')")
      .first<{ n: number }>();
    expect(left?.n).toBe(0);
  });
});
