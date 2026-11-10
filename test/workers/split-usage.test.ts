import { env } from 'cloudflare:test';
import { beforeAll, describe, expect, it } from 'vitest';
import {
  D1UsageRepository,
  SPLIT_CLAIM_CREATED,
  SPLIT_CONFIRMED,
  SPLIT_QR_CHAT,
  SPLIT_TYPE_RECEIPT,
  sgDay,
} from '../../src/db/usage-repository';
import { applyTestSchema } from './harness';

beforeAll(async () => {
  await applyTestSchema(env.paynow_db);
});

const NOW = new Date('2026-11-10T04:00:00Z');
const repo = () => new D1UsageRepository(env.paynow_db);
const dayAgo = (d: number) => sgDay(new Date(NOW.getTime() - d * 86_400_000));
const count = (metric: string, day: string, n: number) =>
  env.paynow_db
    .prepare('INSERT INTO usage_counters (day, metric, count) VALUES (?1, ?2, ?3)')
    .bind(day, metric, n)
    .run();

describe('D1UsageRepository.splitSnapshot', () => {
  it('is all zeros on an empty database', async () => {
    const s = await repo().splitSnapshot(NOW);
    expect(s.confirmed).toEqual({ total: 0, last7: 0, last30: 0 });
    expect(s.contacts).toBe(0);
    expect(s.claims).toEqual({ created: 0, collected: 0, waiting: 0 });
  });

  it('sums the counters and applies the 7 and 30 day windows', async () => {
    await count(SPLIT_CONFIRMED, dayAgo(0), 2);
    await count(SPLIT_CONFIRMED, dayAgo(6), 1); // still inside 7 days
    await count(SPLIT_CONFIRMED, dayAgo(7), 4); // 30 days, not 7
    await count(SPLIT_CONFIRMED, dayAgo(29), 1);
    await count(SPLIT_CONFIRMED, dayAgo(45), 8); // total only
    await count(SPLIT_TYPE_RECEIPT, dayAgo(1), 3);
    await count(SPLIT_QR_CHAT, dayAgo(2), 5);
    // a counter of another bot must not leak in
    await count('simple_qr', dayAgo(0), 99);
    const s = await repo().splitSnapshot(NOW);
    expect(s.confirmed).toEqual({ total: 16, last7: 3, last30: 8 });
    expect(s.types.receipt).toBe(3);
    expect(s.qrs.chat).toBe(5);
  });

  it('counts remembered people and unexpired waiting QRs only', async () => {
    await env.paynow_db
      .prepare(
        "INSERT INTO split_contacts (username, user_id, updated_at) VALUES ('a_user', 1, 'x'), ('b_user', 2, 'x')"
      )
      .run();
    const claim = (token: string, expires: string) =>
      env.paynow_db
        .prepare(
          `INSERT INTO split_claims (token, name, amount_cents, payload, organiser, chat_id, expires_at)
           VALUES (?1, 'n', 100, 'p', 'o', 1, ?2)`
        )
        .bind(token, expires)
        .run();
    await claim('live', new Date(NOW.getTime() + 3600_000).toISOString());
    await claim('dead', new Date(NOW.getTime() - 3600_000).toISOString());
    await count(SPLIT_CLAIM_CREATED, dayAgo(0), 2);
    const s = await repo().splitSnapshot(NOW);
    expect(s.contacts).toBe(2);
    expect(s.claims.waiting).toBe(1);
    expect(s.claims.created).toBe(2);
  });
});
