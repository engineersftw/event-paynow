import { env } from 'cloudflare:test';
import { beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { D1Repository } from '../../src/db/drizzle-repository';

/**
 * Task 7.2: payback bounds enforced inside a D1 batch (transaction).
 *
 * Design §5: `SUM(paybacks) <= payment.amount_cents` runs inside a D1 batch
 * issued as a compare-and-set (guarded INSERT ... SELECT). Per-chat DO serialization
 * covers same-chat writes; this in-transaction re-check closes cross-chat races on
 * the same payment, so concurrent creates can never push the total over the
 * original amount.
 *
 * Spec scenarios covered (payback-qr/spec.md):
 * - Partial payback history: 5.00 + 3.00 against 12.50 leaves remaining 4.50
 * - Over-payback blocked: paybacks already total 12.50 → refuse another
 * - Payback amount exceeds original → reject, create nothing
 */

// Apply schema once before all tests (idempotent)
beforeAll(async () => {
  const statements = [
    `CREATE TABLE IF NOT EXISTS users (
      telegram_id INTEGER PRIMARY KEY,
      payee_type TEXT NOT NULL CHECK(payee_type IN ('mobile', 'uen')),
      payee_value TEXT NOT NULL,
      display_name TEXT NOT NULL,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    )`,
    `CREATE TABLE IF NOT EXISTS events (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      ref TEXT NOT NULL UNIQUE,
      chat_id INTEGER NOT NULL,
      topic_id INTEGER NOT NULL DEFAULT 0,
      name TEXT NOT NULL,
      payee_type TEXT NOT NULL CHECK(payee_type IN ('mobile', 'uen')),
      payee_value TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'open' CHECK(status IN ('open', 'closed')),
      created_at TEXT NOT NULL,
      closed_at TEXT,
    default_amount_cents INTEGER,
    website_url TEXT
    )`,
    `CREATE TABLE IF NOT EXISTS payments (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      ref TEXT NOT NULL UNIQUE,
      user_id INTEGER NOT NULL,
      event_id INTEGER,
      description TEXT NOT NULL,
      amount_cents INTEGER NOT NULL,
      payee_type TEXT NOT NULL CHECK(payee_type IN ('mobile', 'uen')),
      payee_value TEXT NOT NULL,
      status TEXT NOT NULL CHECK(status IN ('pending', 'received', 'voided')),
      source TEXT NOT NULL CHECK(source IN ('manual', 'notification')),
      qr_payload TEXT NOT NULL,
      payer_type TEXT,
      payer_value TEXT,
      payer_name TEXT,
      created_at TEXT NOT NULL,
      received_at TEXT,
      received_by INTEGER,
      voided_by INTEGER,
      checked_in_at TEXT,
      checked_in_by INTEGER,
      FOREIGN KEY (user_id) REFERENCES users(telegram_id),
      FOREIGN KEY (event_id) REFERENCES events(id)
    )`,
    `CREATE TABLE IF NOT EXISTS paybacks (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      ref TEXT NOT NULL UNIQUE,
      payment_id INTEGER NOT NULL,
      payer_type TEXT NOT NULL CHECK(payer_type IN ('mobile', 'uen')),
      payer_value TEXT NOT NULL,
      amount_cents INTEGER NOT NULL,
      status TEXT NOT NULL CHECK(status IN ('pending', 'sent', 'cancelled')),
      qr_payload TEXT NOT NULL,
      created_at TEXT NOT NULL,
      sent_at TEXT,
      created_by INTEGER,
      sent_by INTEGER,
      cancelled_by INTEGER,
      FOREIGN KEY (payment_id) REFERENCES payments(id)
    )`,
    `CREATE INDEX IF NOT EXISTS idx_payments_user_id ON payments(user_id)`,
    `CREATE INDEX IF NOT EXISTS idx_payments_ref ON payments(ref)`,
    `CREATE INDEX IF NOT EXISTS idx_paybacks_payment_id ON paybacks(payment_id)`,
    `CREATE INDEX IF NOT EXISTS idx_paybacks_ref ON paybacks(ref)`,
  ];

  for (const stmt of statements) {
    await env.paynow_db.prepare(stmt).run();
  }
});

const T0 = '2024-01-01T00:00:00Z';

describe('createPaybackBounded (task 7.2)', () => {
  let repo: D1Repository;
  let userSeq = 0;
  let refSeq = 0;

  beforeEach(() => {
    repo = new D1Repository(env.paynow_db);
  });

  /** Seed a distinct received payment and return its id. */
  async function seedPayment(amountCents: number): Promise<number> {
    const userId = 720000000 + userSeq++;
    await repo.upsertUser({
      telegramId: userId,
      payeeType: 'mobile',
      payeeValue: '+6591234567',
      displayName: 'Payee',
      timestamp: T0,
    });
    const payment = await repo.createPayment({
      ref: `72-pay-${refSeq++}`,
      userId,
      description: 'Dinner split',
      amountCents,
      payeeType: 'mobile',
      payeeValue: '+6591234567',
      status: 'received',
      source: 'manual',
      qrPayload: 'PAYLOAD',
      timestamp: T0,
    });
    return payment.id;
  }

  function paybackInput(paymentId: number, amountCents: number, ref?: string) {
    const paybackRef = ref ?? `72-pb-${refSeq++}`;
    return {
      ref: paybackRef,
      paymentId,
      payerType: 'mobile' as const,
      payerValue: '+6598765432',
      amountCents,
      status: 'pending' as const,
      qrPayload: `PAYBACK-PENDING:${paybackRef}`,
      timestamp: T0,
    };
  }

  // ----------------------------------------------------------------------------
  // Spec scenario: partial payback history — 5.00 + 3.00 of 12.50, remaining 4.50
  // ----------------------------------------------------------------------------

  it('accepts a partial payback of 5.00 against a 12.50 payment', async () => {
    const paymentId = await seedPayment(1250);

    const result = await repo.createPaybackBounded(paybackInput(paymentId, 500));

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.payback.amountCents).toBe(500);
    expect(result.payback.status).toBe('pending');
    expect(result.payback.paymentId).toBe(paymentId);
    expect(result.remainingCents).toBe(750);
  });

  it('accepts a second partial payback of 3.00, leaving 4.50 remaining (spec scenario)', async () => {
    const paymentId = await seedPayment(1250);

    const first = await repo.createPaybackBounded(paybackInput(paymentId, 500));
    const second = await repo.createPaybackBounded(paybackInput(paymentId, 300));

    expect(first.ok).toBe(true);
    expect(second.ok).toBe(true);
    if (!second.ok) return;
    expect(second.remainingCents).toBe(450);

    // The two paybacks are visible, and the total matches
    expect(await repo.sumPaybacks(paymentId)).toBe(800);
    const paybacks = await repo.listPaybacksByPayment(paymentId);
    expect(paybacks).toHaveLength(2);
    expect(paybacks.map((p) => p.amountCents).sort()).toEqual([300, 500]);
  });

  // ----------------------------------------------------------------------------
  // Exact bound: amount equal to what remains must fit (<=, not <)
  // ----------------------------------------------------------------------------

  it('accepts a payback that exactly equals the payment amount', async () => {
    const paymentId = await seedPayment(1250);

    const result = await repo.createPaybackBounded(paybackInput(paymentId, 1250));

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.remainingCents).toBe(0);
    expect(await repo.sumPaybacks(paymentId)).toBe(1250);
  });

  it('accepts a payback that exactly fills the remaining balance', async () => {
    const paymentId = await seedPayment(1250);

    await repo.createPaybackBounded(paybackInput(paymentId, 800));
    const fill = await repo.createPaybackBounded(paybackInput(paymentId, 450));

    expect(fill.ok).toBe(true);
    if (!fill.ok) return;
    expect(fill.remainingCents).toBe(0);
    expect(await repo.sumPaybacks(paymentId)).toBe(1250);
  });

  // ----------------------------------------------------------------------------
  // Blocked-over: total paybacks (pending + sent) may never exceed the payment amount
  // ----------------------------------------------------------------------------

  it('blocks a payback that would exceed the payment amount and writes nothing', async () => {
    const paymentId = await seedPayment(1250);

    const result = await repo.createPaybackBounded(paybackInput(paymentId, 1300));

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.reason).toBe('over_bound');
    if (result.reason !== 'over_bound') return;
    expect(result.paymentAmountCents).toBe(1250);
    expect(result.paidBackCents).toBe(0);
    expect(result.remainingCents).toBe(1250);

    // Nothing was created
    expect(await repo.sumPaybacks(paymentId)).toBe(0);
    expect(await repo.listPaybacksByPayment(paymentId)).toEqual([]);
  });

  it('blocks a third payback of 5.00 when 5.00 + 3.00 already counted (would total 13.00 > 12.50)', async () => {
    const paymentId = await seedPayment(1250);

    await repo.createPaybackBounded(paybackInput(paymentId, 500));
    await repo.createPaybackBounded(paybackInput(paymentId, 300));
    const blocked = await repo.createPaybackBounded(paybackInput(paymentId, 500));

    expect(blocked.ok).toBe(false);
    if (blocked.ok) return;
    expect(blocked.reason).toBe('over_bound');
    if (blocked.reason !== 'over_bound') return;
    expect(blocked.paidBackCents).toBe(800);
    expect(blocked.remainingCents).toBe(450);

    // Still only the two accepted paybacks
    expect(await repo.sumPaybacks(paymentId)).toBe(800);
    expect(await repo.listPaybacksByPayment(paymentId)).toHaveLength(2);
  });

  it('refuses any further payback once fully paid back (spec: fully-paid-back message data)', async () => {
    const paymentId = await seedPayment(1250);

    await repo.createPaybackBounded(paybackInput(paymentId, 800));
    await repo.createPaybackBounded(paybackInput(paymentId, 450));

    const result = await repo.createPaybackBounded(paybackInput(paymentId, 1));

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.reason).toBe('over_bound');
    if (result.reason !== 'over_bound') return;
    expect(result.remainingCents).toBe(0);
    expect(await repo.listPaybacksByPayment(paymentId)).toHaveLength(2);
  });

  it('sent paybacks keep counting toward the bound — marking sent frees no room', async () => {
    const paymentId = await seedPayment(1250);

    // Pay back the full amount…
    const first = await repo.createPaybackBounded(paybackInput(paymentId, 1250));
    expect(first.ok).toBe(true);
    if (!first.ok) return;

    // …then mark it sent (delivery completed)
    const updated = await repo.updatePaybackStatus(
      first.payback.ref,
      'sent',
      '2024-01-02T00:00:00Z'
    );
    expect(updated).not.toBeNull();
    expect(updated!.status).toBe('sent');

    // The bound must NOT relax: another payback is refused with the full total counted
    const again = await repo.createPaybackBounded(paybackInput(paymentId, 100));
    expect(again.ok).toBe(false);
    if (again.ok) return;
    expect(again.reason).toBe('over_bound');
    if (again.reason !== 'over_bound') return;
    expect(again.paidBackCents).toBe(1250);
    expect(again.remainingCents).toBe(0);
    expect(await repo.listPaybacksByPayment(paymentId)).toHaveLength(1);
  });

  // ----------------------------------------------------------------------------
  // Cancelled paybacks release their amount
  // ----------------------------------------------------------------------------

  it('cancelling a pending payback frees its amount for a new payback', async () => {
    const paymentId = await seedPayment(1250);
    const first = await repo.createPaybackBounded(paybackInput(paymentId, 1250));
    expect(first.ok).toBe(true);
    if (!first.ok) return;

    const cancelled = await repo.updatePaybackStatus(first.payback.ref, 'cancelled', T0);
    expect(cancelled!.status).toBe('cancelled');
    expect(cancelled!.sentAt).toBeNull();
    expect(await repo.sumPaybacks(paymentId)).toBe(0);

    const again = await repo.createPaybackBounded(paybackInput(paymentId, 1250));
    expect(again.ok).toBe(true);
    if (!again.ok) return;
    expect(again.remainingCents).toBe(0);
    // history keeps the cancelled row
    expect(await repo.listPaybacksByPayment(paymentId)).toHaveLength(2);
  });

  it('cancelled amounts are excluded from the over-bound totals too', async () => {
    const paymentId = await seedPayment(1250);
    const a = await repo.createPaybackBounded(paybackInput(paymentId, 500));
    const b = await repo.createPaybackBounded(paybackInput(paymentId, 700));
    if (!a.ok || !b.ok) throw new Error('setup');
    await repo.updatePaybackStatus(a.payback.ref, 'cancelled', T0);

    const over = await repo.createPaybackBounded(paybackInput(paymentId, 600));
    expect(over.ok).toBe(false);
    if (over.ok || over.reason !== 'over_bound') return;
    expect(over.paidBackCents).toBe(700);
    expect(over.remainingCents).toBe(550);
  });

  it('Sent and Cancel are mutually exclusive: only the first transition from pending wins', async () => {
    const paymentId = await seedPayment(1250);
    const created = await repo.createPaybackBounded(paybackInput(paymentId, 500));
    if (!created.ok) throw new Error('setup');
    const ref = created.payback.ref;

    const [sent, cancelled] = await Promise.all([
      repo.updatePaybackStatus(ref, 'sent', T0),
      repo.updatePaybackStatus(ref, 'cancelled', T0),
    ]);
    expect([sent, cancelled].filter(Boolean)).toHaveLength(1);

    // Neither terminal state can be changed afterwards
    expect(await repo.updatePaybackStatus(ref, 'sent', T0)).toBeNull();
    expect(await repo.updatePaybackStatus(ref, 'cancelled', T0)).toBeNull();
  });

  // ----------------------------------------------------------------------------
  // Unknown payment: fail closed, create nothing
  // ----------------------------------------------------------------------------

  it('refuses to create a payback against a non-existent payment', async () => {
    const result = await repo.createPaybackBounded(paybackInput(999999, 100));

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.reason).toBe('payment_not_found');
  });

  // ----------------------------------------------------------------------------
  // Concurrency: two bounded creates racing on the same payment serialize in D1,
  // so the total never exceeds the original amount. This is the cross-chat
  // case the design closes with the in-transaction re-check (same-chat writes are
  // already serialized by the per-chat DO — see conversation-do.test.ts).
  // ----------------------------------------------------------------------------

  it('two concurrent 8.00 paybacks against 12.50: exactly one commits, sum never exceeds', async () => {
    const paymentId = await seedPayment(1250);

    // Two separate repository instances simulate two worker isolates / chats
    const repoA = new D1Repository(env.paynow_db);
    const repoB = new D1Repository(env.paynow_db);

    const [a, b] = await Promise.all([
      repoA.createPaybackBounded(paybackInput(paymentId, 800)),
      repoB.createPaybackBounded(paybackInput(paymentId, 800)),
    ]);

    const accepted = [a, b].filter((r) => r.ok);
    const rejected = [a, b].filter((r) => !r.ok);

    expect(accepted).toHaveLength(1);
    expect(rejected).toHaveLength(1);

    // Invariant: paybacks never exceed the payment amount
    const sum = await repo.sumPaybacks(paymentId);
    expect(sum).toBeLessThanOrEqual(1250);
    expect(sum).toBe(800);
    expect(await repo.listPaybacksByPayment(paymentId)).toHaveLength(1);
  });

  it('two concurrent paybacks that both fit are both accepted', async () => {
    const paymentId = await seedPayment(1250);

    const repoA = new D1Repository(env.paynow_db);
    const repoB = new D1Repository(env.paynow_db);

    const [a, b] = await Promise.all([
      repoA.createPaybackBounded(paybackInput(paymentId, 450)),
      repoB.createPaybackBounded(paybackInput(paymentId, 450)),
    ]);

    expect(a.ok).toBe(true);
    expect(b.ok).toBe(true);
    expect(await repo.sumPaybacks(paymentId)).toBe(900);
  });

  // ----------------------------------------------------------------------------
  // Read-back consistency of the stored row inside the same transaction
  // ----------------------------------------------------------------------------

  it('returns the stored row with payer snapshot and pending status', async () => {
    const paymentId = await seedPayment(1250);

    const result = await repo.createPaybackBounded(paybackInput(paymentId, 500));

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const payback = result.payback;
    expect(payback.id).toBeGreaterThan(0);
    expect(payback.ref).toMatch(/^72-pb-/);
    expect(payback.payerType).toBe('mobile');
    expect(payback.payerValue).toBe('+6598765432');
    expect(payback.amountCents).toBe(500);
    expect(payback.status).toBe('pending');
    expect(payback.sentAt).toBeNull();
    expect(payback.createdAt).toBe(T0);
    expect(payback.qrPayload).toBe(`PAYBACK-PENDING:${payback.ref}`);
  });
});
