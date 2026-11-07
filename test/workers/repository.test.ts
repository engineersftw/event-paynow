import { env } from 'cloudflare:test';
import { beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { D1Repository } from '../../src/db/drizzle-repository';

/**
 * Repository integration tests against a real local D1 binding.
 *
 * Storage isolation is PER TEST FILE in the Workers Vitest integration
 * (see docs isolation-and-concurrency), so every test seeds its own unique
 * user ids / refs — state accumulates across tests within this file.
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
    `CREATE TABLE IF NOT EXISTS payments (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      ref TEXT NOT NULL UNIQUE,
      user_id INTEGER NOT NULL,
      description TEXT NOT NULL,
      amount_cents INTEGER NOT NULL,
      payee_type TEXT NOT NULL CHECK(payee_type IN ('mobile', 'uen')),
      payee_value TEXT NOT NULL,
      status TEXT NOT NULL CHECK(status IN ('pending', 'received')),
      source TEXT NOT NULL CHECK(source IN ('manual', 'notification')),
      qr_payload TEXT NOT NULL,
      created_at TEXT NOT NULL,
      received_at TEXT,
      FOREIGN KEY (user_id) REFERENCES users(telegram_id)
    )`,
    `CREATE TABLE IF NOT EXISTS paybacks (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      ref TEXT NOT NULL UNIQUE,
      payment_id INTEGER NOT NULL,
      payer_type TEXT NOT NULL CHECK(payer_type IN ('mobile', 'uen')),
      payer_value TEXT NOT NULL,
      amount_cents INTEGER NOT NULL,
      status TEXT NOT NULL CHECK(status IN ('pending', 'sent')),
      qr_payload TEXT NOT NULL,
      created_at TEXT NOT NULL,
      sent_at TEXT,
      FOREIGN KEY (payment_id) REFERENCES payments(id)
    )`,
    `CREATE INDEX IF NOT EXISTS idx_payments_user_id ON payments(user_id)`,
    `CREATE INDEX IF NOT EXISTS idx_payments_ref ON payments(ref)`,
    `CREATE INDEX IF NOT EXISTS idx_paybacks_payment_id ON paybacks(payment_id)`,
    `CREATE INDEX IF NOT EXISTS idx_paybacks_ref ON paybacks(ref)`,
  ];

  for (const stmt of statements) {
    await env.DB.prepare(stmt).run();
  }
});

describe('D1Repository', () => {
  let repo: D1Repository;
  const testTimestamp = '2024-01-01T00:00:00Z';

  // Per-test-unique fixtures (storage is shared across tests in this file)
  let idSeq = 0;
  const nextUserId = () => 500000000 + ++idSeq;
  const nextRef = (prefix: string) => `${prefix}-${idSeq}-${++idSeq}`;

  let testUser: {
    telegramId: number;
    payeeType: 'mobile';
    payeeValue: string;
    displayName: string;
  };

  function makePayment(overrides: Record<string, unknown> = {}) {
    return {
      ref: nextRef('pay-ref'),
      userId: testUser.telegramId,
      description: 'Test payment',
      amountCents: 1000,
      payeeType: 'mobile' as const,
      payeeValue: '+6591234567',
      status: 'pending' as const,
      source: 'manual' as const,
      qrPayload:
        '00020101021126380009SG.PAYNOW010100211+6591234567030115204000053037025802SG5908Test User6009Singapore63041234',
      ...overrides,
    };
  }

  beforeEach(async () => {
    repo = new D1Repository(env.DB);
    testUser = {
      telegramId: nextUserId(),
      payeeType: 'mobile',
      payeeValue: '+6591234567',
      displayName: 'Test User',
    };
    // Seed a fresh user for every test
    await repo.upsertUser({ ...testUser, timestamp: testTimestamp });
  });

  // ============================================================================
  // Users
  // ============================================================================

  describe('Users', () => {
    it('creates a new user', async () => {
      const user = await repo.getUser(testUser.telegramId);

      expect(user).not.toBeNull();
      expect(user!.telegramId).toBe(testUser.telegramId);
      expect(user!.payeeType).toBe(testUser.payeeType);
      expect(user!.payeeValue).toBe(testUser.payeeValue);
      expect(user!.displayName).toBe(testUser.displayName);
      expect(user!.createdAt).toBe(testTimestamp);
      expect(user!.updatedAt).toBe(testTimestamp);
    });

    it('updates an existing user', async () => {
      const updatedUser = await repo.upsertUser({
        telegramId: testUser.telegramId,
        payeeType: 'uen',
        payeeValue: '201234567A',
        displayName: 'Updated Name',
        timestamp: '2024-01-02T00:00:00Z',
      });

      expect(updatedUser.payeeType).toBe('uen');
      expect(updatedUser.payeeValue).toBe('201234567A');
      expect(updatedUser.displayName).toBe('Updated Name');
      expect(updatedUser.createdAt).toBe(testTimestamp); // unchanged
      expect(updatedUser.updatedAt).toBe('2024-01-02T00:00:00Z');
    });

    it('retrieves a user by telegramId', async () => {
      const user = await repo.getUser(testUser.telegramId);

      expect(user).not.toBeNull();
      expect(user!.telegramId).toBe(testUser.telegramId);
    });

    it('returns null for non-existent user', async () => {
      const user = await repo.getUser(999999999);
      expect(user).toBeNull();
    });

    it('enforces cross-user isolation', async () => {
      const user1 = {
        telegramId: nextUserId(),
        payeeType: 'mobile' as const,
        payeeValue: '+6591111111',
        displayName: 'User 1',
      };
      const user2 = {
        telegramId: nextUserId(),
        payeeType: 'uen' as const,
        payeeValue: '201111111A',
        displayName: 'User 2',
      };

      await repo.upsertUser({ ...user1, timestamp: testTimestamp });
      await repo.upsertUser({ ...user2, timestamp: testTimestamp });

      const retrieved1 = await repo.getUser(user1.telegramId);
      const retrieved2 = await repo.getUser(user2.telegramId);

      expect(retrieved1!.displayName).toBe('User 1');
      expect(retrieved2!.displayName).toBe('User 2');
    });
  });

  // ============================================================================
  // Payments
  // ============================================================================

  describe('Payments', () => {
    it('creates a new payment', async () => {
      const input = makePayment();
      const payment = await repo.createPayment({ ...input, timestamp: testTimestamp });

      expect(payment.ref).toBe(input.ref);
      expect(payment.userId).toBe(testUser.telegramId);
      expect(payment.status).toBe('pending');
      expect(payment.receivedAt).toBeNull();
      expect(payment.createdAt).toBe(testTimestamp);
    });

    it('retrieves a payment by ref', async () => {
      const input = makePayment();
      await repo.createPayment({ ...input, timestamp: testTimestamp });

      const payment = await repo.getPaymentByRef(input.ref);

      expect(payment).not.toBeNull();
      expect(payment!.ref).toBe(input.ref);
    });

    it('returns null for non-existent payment ref', async () => {
      const payment = await repo.getPaymentByRef('non-existent-ref');
      expect(payment).toBeNull();
    });

    it('lists payments by user', async () => {
      const p1 = makePayment({ description: 'First' });
      const p2 = makePayment({ description: 'Second', amountCents: 2000 });
      await repo.createPayment({ ...p1, timestamp: testTimestamp });
      await repo.createPayment({ ...p2, timestamp: testTimestamp });

      const payments = await repo.listPaymentsByUser(testUser.telegramId);

      expect(payments).toHaveLength(2);
      expect(payments.map((p) => p.ref)).toContain(p1.ref);
      expect(payments.map((p) => p.ref)).toContain(p2.ref);
    });

    it('returns empty array for user with no payments', async () => {
      const payments = await repo.listPaymentsByUser(999999999);
      expect(payments).toEqual([]);
    });

    it('updates payment status to received', async () => {
      const input = makePayment();
      await repo.createPayment({ ...input, timestamp: testTimestamp });

      const updated = await repo.updatePaymentStatus(
        input.ref,
        'received',
        'manual',
        '2024-01-02T00:00:00Z'
      );

      expect(updated).not.toBeNull();
      expect(updated!.status).toBe('received');
      expect(updated!.source).toBe('manual');
      expect(updated!.receivedAt).toBe('2024-01-02T00:00:00Z');
    });

    it('updates payment status from notification source', async () => {
      const input = makePayment();
      await repo.createPayment({ ...input, timestamp: testTimestamp });

      const updated = await repo.updatePaymentStatus(
        input.ref,
        'received',
        'notification',
        '2024-01-02T00:00:00Z'
      );

      expect(updated!.source).toBe('notification');
    });

    it('returns null when updating non-existent payment', async () => {
      const updated = await repo.updatePaymentStatus(
        'non-existent-ref',
        'received',
        'manual',
        testTimestamp
      );
      expect(updated).toBeNull();
    });

    it('enforces read-back-after-write consistency', async () => {
      const created = await repo.createPayment({
        ...makePayment(),
        timestamp: testTimestamp,
      });

      const retrieved = await repo.getPaymentByRef(created.ref);

      expect(retrieved).not.toBeNull();
      expect(retrieved!.ref).toBe(created.ref);
      expect(retrieved!.amountCents).toBe(created.amountCents);
    });

    it('enforces cross-user isolation on payments', async () => {
      const user1 = nextUserId();
      const user2 = nextUserId();

      await repo.upsertUser({
        telegramId: user1,
        payeeType: 'mobile',
        payeeValue: '+6591111111',
        displayName: 'User 1',
        timestamp: testTimestamp,
      });
      await repo.upsertUser({
        telegramId: user2,
        payeeType: 'uen',
        payeeValue: '201111111A',
        displayName: 'User 2',
        timestamp: testTimestamp,
      });

      const p1 = makePayment({ userId: user1, ref: nextRef('user1-payment') });
      const p2 = makePayment({ userId: user2, ref: nextRef('user2-payment') });
      await repo.createPayment({ ...p1, timestamp: testTimestamp });
      await repo.createPayment({ ...p2, timestamp: testTimestamp });

      const user1Payments = await repo.listPaymentsByUser(user1);
      const user2Payments = await repo.listPaymentsByUser(user2);

      expect(user1Payments).toHaveLength(1);
      expect(user1Payments[0]!.ref).toBe(p1.ref);

      expect(user2Payments).toHaveLength(1);
      expect(user2Payments[0]!.ref).toBe(p2.ref);
    });
  });

  // ============================================================================
  // Paybacks
  // ============================================================================

  describe('Paybacks', () => {
    let paymentId: number;

    beforeEach(async () => {
      const payment = await repo.createPayment({
        ...makePayment({ status: 'received' }),
        timestamp: testTimestamp,
      });
      paymentId = payment.id;
    });

    it('creates a new payback', async () => {
      const ref = nextRef('payback-ref');
      const payback = await repo.createPayback({
        ref,
        paymentId,
        payerType: 'mobile',
        payerValue: '+6598765432',
        amountCents: 500,
        status: 'pending',
        qrPayload:
          '00020101021126380009SG.PAYNOW010100211+6598765432030115204000053037025802SG5904Payer6009Singapore63045678',
        timestamp: testTimestamp,
      });

      expect(payback.ref).toBe(ref);
      expect(payback.paymentId).toBe(paymentId);
      expect(payback.amountCents).toBe(500);
      expect(payback.status).toBe('pending');
      expect(payback.sentAt).toBeNull();
    });

    it('lists paybacks by payment', async () => {
      const r1 = nextRef('payback-ref');
      const r2 = nextRef('payback-ref');
      await repo.createPayback({
        ref: r1,
        paymentId,
        payerType: 'mobile',
        payerValue: '+6598765432',
        amountCents: 300,
        status: 'pending',
        qrPayload: 'payload1',
        timestamp: testTimestamp,
      });
      await repo.createPayback({
        ref: r2,
        paymentId,
        payerType: 'uen',
        payerValue: '201234567A',
        amountCents: 200,
        status: 'pending',
        qrPayload: 'payload2',
        timestamp: testTimestamp,
      });

      const paybacks = await repo.listPaybacksByPayment(paymentId);

      expect(paybacks).toHaveLength(2);
      expect(paybacks.map((p) => p.ref)).toContain(r1);
      expect(paybacks.map((p) => p.ref)).toContain(r2);
    });

    it('returns empty array for payment with no paybacks', async () => {
      const paybacks = await repo.listPaybacksByPayment(999999);
      expect(paybacks).toEqual([]);
    });

    it('sums paybacks across all statuses', async () => {
      await repo.createPayback({
        ref: nextRef('payback-ref'),
        paymentId,
        payerType: 'mobile',
        payerValue: '+6598765432',
        amountCents: 300,
        status: 'pending',
        qrPayload: 'payload1',
        timestamp: testTimestamp,
      });
      await repo.createPayback({
        ref: nextRef('payback-ref'),
        paymentId,
        payerType: 'mobile',
        payerValue: '+6598765433',
        amountCents: 200,
        status: 'pending',
        qrPayload: 'payload2',
        timestamp: testTimestamp,
      });

      const sum = await repo.sumPaybacks(paymentId);
      expect(sum).toBe(500);
    });

    it('includes sent paybacks in sum (bound counts delivery-completed paybacks)', async () => {
      await repo.createPayback({
        ref: nextRef('payback-ref'),
        paymentId,
        payerType: 'mobile',
        payerValue: '+6598765432',
        amountCents: 300,
        status: 'pending',
        qrPayload: 'payload1',
        timestamp: testTimestamp,
      });
      await repo.createPayback({
        ref: nextRef('payback-ref'),
        paymentId,
        payerType: 'mobile',
        payerValue: '+6598765433',
        amountCents: 200,
        status: 'sent', // sent counts too — status only tracks delivery
        qrPayload: 'payload2',
        timestamp: testTimestamp,
      });

      const sum = await repo.sumPaybacks(paymentId);
      expect(sum).toBe(500); // pending + sent both count
    });

    it('returns 0 for payment with no paybacks', async () => {
      const sum = await repo.sumPaybacks(999999);
      expect(sum).toBe(0);
    });

    // --------------------------------------------------------------------------
    // Task 7.4: getPaybackByRef + guarded pending → sent transition
    // --------------------------------------------------------------------------

    it('retrieves a payback by its ref', async () => {
      const ref = nextRef('pb-lookup');
      const created = await repo.createPayback({
        ref,
        paymentId,
        payerType: 'mobile',
        payerValue: '+6598765432',
        amountCents: 400,
        status: 'pending',
        qrPayload: 'payload',
        timestamp: testTimestamp,
      });

      const fetched = await repo.getPaybackByRef(ref);
      expect(fetched).not.toBeNull();
      expect(fetched!.id).toBe(created.id);
      expect(fetched!.ref).toBe(ref);
      expect(fetched!.paymentId).toBe(paymentId);
      expect(fetched!.status).toBe('pending');
      expect(fetched!.sentAt).toBeNull();
    });

    it('returns null when looking up an unknown payback ref', async () => {
      const payback = await repo.getPaybackByRef('pb-does-not-exist');
      expect(payback).toBeNull();
    });

    it('marks a pending payback as sent with a timestamp', async () => {
      const ref = nextRef('pb-sent');
      await repo.createPayback({
        ref,
        paymentId,
        payerType: 'mobile',
        payerValue: '+6598765432',
        amountCents: 300,
        status: 'pending',
        qrPayload: 'payload',
        timestamp: testTimestamp,
      });

      const updated = await repo.updatePaybackStatus(ref, 'sent', '2024-01-02T10:00:00Z');

      expect(updated).not.toBeNull();
      expect(updated!.status).toBe('sent');
      expect(updated!.sentAt).toBe('2024-01-02T10:00:00Z');

      // Read back: transition persisted
      const fetched = await repo.getPaybackByRef(ref);
      expect(fetched!.status).toBe('sent');
      expect(fetched!.sentAt).toBe('2024-01-02T10:00:00Z');

      // Sent paybacks still count toward the bound (status only tracks delivery)
      expect(await repo.sumPaybacks(paymentId)).toBe(300);
    });

    it('rejects a duplicate pending → sent transition (compare-and-set)', async () => {
      const ref = nextRef('pb-sent');
      await repo.createPayback({
        ref,
        paymentId,
        payerType: 'mobile',
        payerValue: '+6598765432',
        amountCents: 300,
        status: 'pending',
        qrPayload: 'payload',
        timestamp: testTimestamp,
      });

      const first = await repo.updatePaybackStatus(ref, 'sent', '2024-01-02T10:00:00Z');
      expect(first).not.toBeNull();

      // Second tap: no longer eligible — guarded update matches nothing
      const second = await repo.updatePaybackStatus(ref, 'sent', '2024-01-02T10:05:00Z');
      expect(second).toBeNull();

      // Original timestamp survives — no overwrite
      const fetched = await repo.getPaybackByRef(ref);
      expect(fetched!.sentAt).toBe('2024-01-02T10:00:00Z');
    });

    it('returns null when updating an unknown payback ref', async () => {
      const updated = await repo.updatePaybackStatus(
        'pb-nonexistent',
        'sent',
        '2024-01-02T10:00:00Z'
      );
      expect(updated).toBeNull();
    });

    it('concurrent duplicate taps yield exactly one winner', async () => {
      const ref = nextRef('pb-sent');
      await repo.createPayback({
        ref,
        paymentId,
        payerType: 'mobile',
        payerValue: '+6598765432',
        amountCents: 250,
        status: 'pending',
        qrPayload: 'payload',
        timestamp: testTimestamp,
      });

      const [a, b] = await Promise.all([
        repo.updatePaybackStatus(ref, 'sent', '2024-01-02T10:00:00Z'),
        repo.updatePaybackStatus(ref, 'sent', '2024-01-02T10:00:01Z'),
      ]);

      const winners = [a, b].filter((r) => r !== null);
      expect(winners).toHaveLength(1);

      const fetched = await repo.getPaybackByRef(ref);
      expect(fetched!.status).toBe('sent');
    });
  });
});
