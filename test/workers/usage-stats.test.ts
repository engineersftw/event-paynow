import { env } from 'cloudflare:test';
import { beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { createBot, HELP_TEXT } from '../../src/bot';
import { formatStats } from '../../src/commands/stats-handler';
import { D1UsageRepository, sgDay } from '../../src/db/usage-repository';
import type { Env as WorkerEnv } from '../../src/env';
import {
  applyTestSchema,
  groupTextUpdate,
  TEST_BOT_INFO,
  TelegramStub,
  textUpdate,
} from './harness';

const NOW = new Date('2026-11-09T12:00:00Z');
const ago = (days: number) => new Date(NOW.getTime() - days * 86_400_000).toISOString();
const repo = () => new D1UsageRepository(env.paynow_db);

async function run(sql: string, ...binds: unknown[]) {
  await env.paynow_db
    .prepare(sql)
    .bind(...binds)
    .run();
}

async function event(ref: string, chat: number, status: 'open' | 'closed', createdAt: string) {
  await run(
    `INSERT INTO events (ref, chat_id, topic_id, name, payee_type, payee_value, status, created_at)
     VALUES (?1, ?2, 0, 'Secret Event Name', 'mobile', '+6591234567', ?3, ?4)`,
    ref,
    chat,
    status,
    createdAt
  );
}

async function payment(
  ref: string,
  userId: number,
  status: string,
  cents: number,
  createdAt: string,
  checkedIn = false
) {
  await run(
    `INSERT INTO payments (ref, user_id, description, amount_cents, payee_type, payee_value, status, source,
       qr_payload, payer_name, created_at, checked_in_at)
     VALUES (?1, ?2, 'Dinner', ?3, 'mobile', '+6591234567', ?4, 'manual', 'x', 'Alex Tan', ?5, ?6)`,
    ref,
    userId,
    cents,
    status,
    createdAt,
    checkedIn ? ago(1) : null
  );
}

beforeAll(async () => {
  await applyTestSchema(env.paynow_db);
});

describe('usage snapshot', () => {
  it('counts events, payment requests, outcomes, paybacks and the simple bot by window', async () => {
    await run('DELETE FROM paybacks');
    await run('DELETE FROM payments');
    await run('DELETE FROM events');
    await run('DELETE FROM usage_counters');
    // events: 3 in 2 chats; one is 40 days old
    await event('USEV00001', 1, 'open', ago(1));
    await event('USEV00002', 1, 'closed', ago(10));
    await event('USEV00003', 2, 'open', ago(40));
    // payments: 5; two received (SGD 12.50 each), one voided, two anonymous (user 0), one checked in
    await payment('USPAY0001', 5, 'pending', 1000, ago(1));
    await payment('USPAY0002', 5, 'received', 1250, ago(2), true);
    await payment('USPAY0003', 0, 'received', 1250, ago(20));
    await payment('USPAY0004', 5, 'voided', 900, ago(40));
    await payment('USPAY0005', 0, 'pending', 700, ago(3));
    const p = await env.paynow_db
      .prepare("SELECT id FROM payments WHERE ref = 'USPAY0002'")
      .first<{ id: number }>();
    for (const [ref, status] of [
      ['USPB00001', 'sent'],
      ['USPB00002', 'pending'],
    ] as const)
      await run(
        `INSERT INTO paybacks (ref, payment_id, payer_type, payer_value, amount_cents, status, qr_payload, created_at)
         VALUES (?1, ?2, 'mobile', '+6598765432', 500, ?3, 'x', ?4)`,
        ref,
        p!.id,
        status,
        ago(1)
      );
    // simple bot counters: today 2 QRs (skipped, editable), 10 days ago 1 (fixed), 40 days ago 1 (skipped)
    const today = sgDay(NOW);
    const r = repo();
    for (const [m, d] of [
      ['simple_qr', today],
      ['simple_amount_skipped', today],
      ['simple_qr', today],
      ['simple_amount_editable', today],
      ['simple_qr', sgDay(new Date(NOW.getTime() - 10 * 86_400_000))],
      ['simple_amount_fixed', sgDay(new Date(NOW.getTime() - 10 * 86_400_000))],
      ['simple_qr', sgDay(new Date(NOW.getTime() - 40 * 86_400_000))],
      ['simple_amount_skipped', sgDay(new Date(NOW.getTime() - 40 * 86_400_000))],
    ] as const)
      await r.increment(m, d);

    const s = await r.snapshot(NOW);
    expect(s.events).toEqual({ total: 3, open: 2, closed: 1, last7: 1, last30: 2, chats: 2 });
    expect(s.payments).toEqual({
      total: 5,
      last7: 3,
      last30: 4,
      pending: 2,
      received: 2,
      voided: 1,
      anonymous: 2,
      receivedCents: 2500,
      checkedIn: 1,
    });
    expect(s.paybacks).toEqual({ total: 2, sent: 1 });
    expect(s.simple).toEqual({
      total: 4,
      last7: 2,
      last30: 3,
      skipped: 2,
      fixed: 1,
      editable: 1,
    });

    const text = formatStats(s, NOW);
    expect(text).toContain('Events: 3 (open 2, closed 1)');
    expect(text).toContain('from 2 different chats');
    expect(text).toContain('QR codes (payment requests): 5');
    expect(text).toContain('pending 2, received 2, voided 1');
    expect(text).toContain('public payment page (no sign-in): 2');
    expect(text).toContain('Received: SGD 25.00');
    expect(text).toContain('Checked in: 1');
    expect(text).toContain('Paybacks: 2 (sent 1)');
    expect(text).toContain('QR codes made: 4 (last 7 days 2, last 30 days 3)');
    expect(text).toContain('skipped (payer enters it): 2 (50%)');
    expect(text).toContain('fixed: 1 (25%)');
    expect(text).toContain('payer can change: 1 (25%)');
    // no personal data anywhere in the report
    for (const secret of [
      'Alex',
      'Tan',
      '+65',
      '9123',
      'Secret Event',
      'USPAY',
      'USEV',
      'Dinner',
    ]) {
      expect(text).not.toContain(secret);
    }
  });

  it('says so when the simple bot has no counts', async () => {
    await run('DELETE FROM usage_counters');
    const text = formatStats(await repo().snapshot(NOW), NOW);
    expect(text).toContain('No QR codes counted yet.');
    expect(text).not.toContain('%');
  });

  it('adds one atomically even for concurrent increments', async () => {
    await run('DELETE FROM usage_counters');
    await Promise.all(
      Array.from({ length: 10 }, () => repo().increment('simple_qr', '2026-11-09'))
    );
    const row = await env.paynow_db
      .prepare('SELECT count FROM usage_counters')
      .first<{ count: number }>();
    expect(row?.count).toBe(10);
  });
});

describe('/stats access', () => {
  const stub = new TelegramStub();
  let upd = 100;
  beforeEach(() => stub.reset());

  const bot = (ids: string | undefined) =>
    createBot({ ...env, STATS_USER_IDS: ids } as unknown as WorkerEnv, {
      botInfo: TEST_BOT_INFO,
      client: { fetch: stub.fetch },
    });

  it('replies to listed users in a private chat, including with spaces and junk entries', async () => {
    const b = bot('8001, 8002,abc,,-5');
    await b.handleUpdate(textUpdate(8001, '/stats', upd++));
    expect(stub.lastText()).toContain('📊 Usage');
    stub.reset();
    await b.handleUpdate(textUpdate(8002, '/stats', upd++));
    expect(stub.lastText()).toContain('📊 Usage');
  });

  it('is silent for users not on the list, in groups, and when no list is set', async () => {
    const b = bot('8001');
    await b.handleUpdate(textUpdate(9999, '/stats', upd++));
    await b.handleUpdate(groupTextUpdate(-700, 8001, '/stats', undefined, upd++));
    for (const ids of [undefined, '', 'abc, ,']) {
      await bot(ids).handleUpdate(textUpdate(8001, '/stats', upd++));
    }
    expect(stub.sentMessages).toHaveLength(0);
  });

  it('stays out of /help', () => {
    expect(HELP_TEXT).not.toContain('/stats');
  });
});
