import { describe, it, expect, beforeEach, beforeAll } from 'vitest';
import { env } from 'cloudflare:test';
import { D1Repository } from '../../src/db/drizzle-repository';

// Apply migrations once before all tests
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
    `CREATE INDEX IF NOT EXISTS idx_paybacks_ref ON paybacks(ref)`
  ];
  
  for (const stmt of statements) {
    await env.DB.prepare(stmt).run();
  }
});

describe('D1Repository', () => {
  let repo: D1Repository;
  const testUser = {
    telegramId: 123456789,
    payeeType: 'mobile' as const,
    payeeValue: '+6591234567',
    displayName: 'Test User',
  };
  const testTimestamp = '2024-01-01T00:00:00Z';

  beforeEach(() => {
    // Database is seeded by beforeAll hook
    repo = new D1Repository(env.DB);
  });

  // ============================================================================
  // Users
  // ============================================================================

  describe('Users', () => {
    it('creates a new user', async () => {
      const user = await repo.upsertUser({ ...testUser, timestamp: testTimestamp });

      expect(user.telegramId).toBe(testUser.telegramId);
      expect(user.payeeType).toBe(testUser.payeeType);
      expect(user.payeeValue).toBe(testUser.payeeValue);
      expect(user.displayName).toBe(testUser.displayName);
      expect(user.createdAt).toBe(testTimestamp);
      expect(user.updatedAt).toBe(testTimestamp);
    });

    it('updates an existing user', async () => {
      // Create user
      await repo.upsertUser({ ...testUser, timestamp: testTimestamp });

      // Update user
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
      await repo.upsertUser({ ...testUser, timestamp: testTimestamp });

      const user = await repo.getUser(testUser.telegramId);

      expect(user).not.toBeNull();
      expect(user!.telegramId).toBe(testUser.telegramId);
    });

    it('returns null for non-existent user', async () => {
      const user = await repo.getUser(999999999);
      expect(user).toBeNull();
    });

    it('enforces cross-user isolation', async () => {
      const user1 = { telegramId: 111111111, payeeType: 'mobile' as const, payeeValue: '+6591111111', displayName: 'User 1' };
      const user2 = { telegramId: 222222222, payeeType: 'uen' as const, payeeValue: '201111111A', displayName: 'User 2' };

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
    const testPayment = {
      ref: 'pay-ref-001',
      userId: 123456789,
      description: 'Test payment',
      amountCents: 1000,
      payeeType: 'mobile' as const,
      payeeValue: '+6591234567',
      status: 'pending' as const,
      source: 'manual' as const,
      qrPayload: '00020101021126380009SG.PAYNOW010100211+6591234567030115204000053037025802SG5908Test User6009Singapore63041234',
    };

    beforeEach(async () => {
      // Create user for payment tests
      await repo.upsertUser({ ...testUser, timestamp: testTimestamp });
    });

    it('creates a new payment', async () => {
      const payment = await repo.createPayment({
        ...testPayment,
        timestamp: testTimestamp,
      });

      expect(payment.ref).toBe(testPayment.ref);
      expect(payment.userId).toBe(testPayment.userId);
      expect(payment.status).toBe('pending');
      expect(payment.receivedAt).toBeNull();
      expect(payment.createdAt).toBe(testTimestamp);
    });

    it('retrieves a payment by ref', async () => {
      await repo.createPayment({ ...testPayment, timestamp: testTimestamp });

      const payment = await repo.getPaymentByRef(testPayment.ref);

      expect(payment).not.toBeNull();
      expect(payment!.ref).toBe(testPayment.ref);
    });

    it('returns null for non-existent payment ref', async () => {
      const payment = await repo.getPaymentByRef('non-existent-ref');
      expect(payment).toBeNull();
    });

    it('lists payments by user', async () => {
      await repo.createPayment({
        ...testPayment,
        ref: 'pay-ref-001',
        timestamp: testTimestamp,
      });
      await repo.createPayment({
        ...testPayment,
        ref: 'pay-ref-002',
        description: 'Second payment',
        amountCents: 2000,
        timestamp: testTimestamp,
      });

      const payments = await repo.listPaymentsByUser(testPayment.userId);

      expect(payments).toHaveLength(2);
      expect(payments.map(p => p.ref)).toContain('pay-ref-001');
      expect(payments.map(p => p.ref)).toContain('pay-ref-002');
    });

    it('returns empty array for user with no payments', async () => {
      const payments = await repo.listPaymentsByUser(999999999);
      expect(payments).toEqual([]);
    });

    it('updates payment status to received', async () => {
      await repo.createPayment({ ...testPayment, timestamp: testTimestamp });

      const updated = await repo.updatePaymentStatus(
        testPayment.ref,
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
      await repo.createPayment({ ...testPayment, timestamp: testTimestamp });

      const updated = await repo.updatePaymentStatus(
        testPayment.ref,
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
      // Create payment
      const created = await repo.createPayment({
        ...testPayment,
        timestamp: testTimestamp,
      });

      // Immediately read it back
      const retrieved = await repo.getPaymentByRef(created.ref);

      expect(retrieved).not.toBeNull();
      expect(retrieved!.ref).toBe(created.ref);
      expect(retrieved!.amountCents).toBe(created.amountCents);
    });

    it('enforces cross-user isolation on payments', async () => {
      const user1 = 111111111;
      const user2 = 222222222;

      await repo.upsertUser({ telegramId: user1, payeeType: 'mobile', payeeValue: '+6591111111', displayName: 'User 1', timestamp: testTimestamp });
      await repo.upsertUser({ telegramId: user2, payeeType: 'uen', payeeValue: '201111111A', displayName: 'User 2', timestamp: testTimestamp });

      await repo.createPayment({
        ...testPayment,
        userId: user1,
        ref: 'user1-payment',
        timestamp: testTimestamp,
      });
      await repo.createPayment({
        ...testPayment,
        userId: user2,
        ref: 'user2-payment',
        timestamp: testTimestamp,
      });

      const user1Payments = await repo.listPaymentsByUser(user1);
      const user2Payments = await repo.listPaymentsByUser(user2);

      expect(user1Payments).toHaveLength(1);
      expect(user1Payments[0].ref).toBe('user1-payment');

      expect(user2Payments).toHaveLength(1);
      expect(user2Payments[0].ref).toBe('user2-payment');
    });
  });

  // ============================================================================
  // Paybacks
  // ============================================================================

  describe('Paybacks', () => {
    const testPayment = {
      ref: 'pay-ref-001',
      userId: 123456789,
      description: 'Test payment',
      amountCents: 1000,
      payeeType: 'mobile' as const,
      payeeValue: '+6591234567',
      status: 'received' as const,
      source: 'manual' as const,
      qrPayload: '00020101021126380009SG.PAYNOW010100211+6591234567030115204000053037025802SG5908Test User6009Singapore63041234',
    };

    let paymentId: number;

    beforeEach(async () => {
      await repo.upsertUser({ ...testUser, timestamp: testTimestamp });
      const payment = await repo.createPayment({
        ...testPayment,
        timestamp: testTimestamp,
      });
      paymentId = payment.id;
    });

    it('creates a new payback', async () => {
      const payback = await repo.createPayback({
        ref: 'payback-ref-001',
        paymentId,
        payerType: 'mobile',
        payerValue: '+6598765432',
        amountCents: 500,
        status: 'pending',
        qrPayload: '00020101021126380009SG.PAYNOW010100211+6598765432030115204000053037025802SG5904Payer6009Singapore63045678',
        timestamp: testTimestamp,
      });

      expect(payback.ref).toBe('payback-ref-001');
      expect(payback.paymentId).toBe(paymentId);
      expect(payback.amountCents).toBe(500);
      expect(payback.status).toBe('pending');
      expect(payback.sentAt).toBeNull();
    });

    it('lists paybacks by payment', async () => {
      await repo.createPayback({
        ref: 'payback-ref-001',
        paymentId,
        payerType: 'mobile',
        payerValue: '+6598765432',
        amountCents: 300,
        status: 'pending',
        qrPayload: 'payload1',
        timestamp: testTimestamp,
      });
      await repo.createPayback({
        ref: 'payback-ref-002',
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
      expect(paybacks.map(p => p.ref)).toContain('payback-ref-001');
      expect(paybacks.map(p => p.ref)).toContain('payback-ref-002');
    });

    it('returns empty array for payment with no paybacks', async () => {
      const paybacks = await repo.listPaybacksByPayment(999999);
      expect(paybacks).toEqual([]);
    });

    it('sums active (pending) paybacks', async () => {
      await repo.createPayback({
        ref: 'payback-ref-001',
        paymentId,
        payerType: 'mobile',
        payerValue: '+6598765432',
        amountCents: 300,
        status: 'pending',
        qrPayload: 'payload1',
        timestamp: testTimestamp,
      });
      await repo.createPayback({
        ref: 'payback-ref-002',
        paymentId,
        payerType: 'mobile',
        payerValue: '+6598765433',
        amountCents: 200,
        status: 'pending',
        qrPayload: 'payload2',
        timestamp: testTimestamp,
      });

      const sum = await repo.sumActivePaybacks(paymentId);
      expect(sum).toBe(500);
    });

    it('excludes sent paybacks from sum', async () => {
      await repo.createPayback({
        ref: 'payback-ref-001',
        paymentId,
        payerType: 'mobile',
        payerValue: '+6598765432',
        amountCents: 300,
        status: 'pending',
        qrPayload: 'payload1',
        timestamp: testTimestamp,
      });
      await repo.createPayback({
        ref: 'payback-ref-002',
        paymentId,
        payerType: 'mobile',
        payerValue: '+6598765433',
        amountCents: 200,
        status: 'sent', // sent, not pending
        qrPayload: 'payload2',
        timestamp: testTimestamp,
      });

      const sum = await repo.sumActivePaybacks(paymentId);
      expect(sum).toBe(300); // only the pending one
    });

    it('returns 0 for payment with no active paybacks', async () => {
      const sum = await repo.sumActivePaybacks(999999);
      expect(sum).toBe(0);
    });
  });
});
