import { describe, it, expect, beforeEach } from 'vitest';
import { createPaymentService, type PaymentService } from '../../src/db/payment-service';
import type { Repository, Payment, ReceiptSource } from '../../src/db/repository';

/**
 * Mock repository for testing payment service.
 */
class MockRepository implements Repository {
  private payments = new Map<string, Payment>();

  async createPayment(payment: Payment): Promise<void> {
    this.payments.set(payment.ref, payment);
  }

  async getPaymentByRef(ref: string): Promise<Payment | null> {
    return this.payments.get(ref) ?? null;
  }

  async updatePayment(ref: string, updates: Partial<Payment>): Promise<void> {
    const payment = this.payments.get(ref);
    if (!payment) {
      throw new Error(`Payment ${ref} not found`);
    }
    this.payments.set(ref, { ...payment, ...updates });
  }

  // Other repository methods not needed for payment service tests
  async upsertUser(): Promise<void> { throw new Error('Not implemented'); }
  async getUser(): Promise<null> { return null; }
  async listPaymentsByUser(): Promise<[]> { return []; }
  async createPayback(): Promise<void> { throw new Error('Not implemented'); }
  async listPaybacksByPayment(): Promise<[]> { return []; }
  async sumActivePaybacks(): Promise<number> { return 0; }
}

describe('PaymentService', () => {
  let repo: MockRepository;
  let service: PaymentService;

  beforeEach(() => {
    repo = new MockRepository();
    service = createPaymentService(repo);
  });

  describe('markPaymentReceived', () => {
    it('should transition payment from pending to received', async () => {
      // Arrange
      const payment: Payment = {
        ref: 'ABC1234567',
        userId: 'user123',
        amount: 5000,
        status: 'pending',
        source: null,
        receivedAt: null,
        createdAt: '2024-01-01T00:00:00Z',
      };
      await repo.createPayment(payment);

      // Act
      const result = await service.markPaymentReceived('ABC1234567', 'manual');

      // Assert
      expect(result).not.toBeNull();
      expect(result!.status).toBe('received');
      expect(result!.source).toBe('manual');
      expect(result!.receivedAt).not.toBeNull();
      expect(result!.receivedAt).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/);
    });

    it('should record source as notification when provided', async () => {
      // Arrange
      const payment: Payment = {
        ref: 'XYZ9876543',
        userId: 'user456',
        amount: 10000,
        status: 'pending',
        source: null,
        receivedAt: null,
        createdAt: '2024-01-01T00:00:00Z',
      };
      await repo.createPayment(payment);

      // Act
      const result = await service.markPaymentReceived('XYZ9876543', 'notification');

      // Assert
      expect(result).not.toBeNull();
      expect(result!.source).toBe('notification');
    });

    it('should reject duplicate received status', async () => {
      // Arrange
      const payment: Payment = {
        ref: 'DUP1234567',
        userId: 'user789',
        amount: 7500,
        status: 'pending',
        source: null,
        receivedAt: null,
        createdAt: '2024-01-01T00:00:00Z',
      };
      await repo.createPayment(payment);

      // Act - first mark as received
      await service.markPaymentReceived('DUP1234567', 'manual');

      // Act - attempt duplicate
      const result = await service.markPaymentReceived('DUP1234567', 'manual');

      // Assert - should return null (rejected)
      expect(result).toBeNull();
    });

    it('should reject unknown payment reference', async () => {
      // Act
      const result = await service.markPaymentReceived('UNKNOWN123', 'manual');

      // Assert
      expect(result).toBeNull();
    });

    it('should preserve other payment fields when updating', async () => {
      // Arrange
      const payment: Payment = {
        ref: 'PRES123456',
        userId: 'user999',
        amount: 2500,
        status: 'pending',
        source: null,
        receivedAt: null,
        createdAt: '2024-01-01T00:00:00Z',
      };
      await repo.createPayment(payment);

      // Act
      const result = await service.markPaymentReceived('PRES123456', 'manual');

      // Assert
      expect(result).not.toBeNull();
      expect(result!.ref).toBe('PRES123456');
      expect(result!.userId).toBe('user999');
      expect(result!.amount).toBe(2500);
      expect(result!.createdAt).toBe('2024-01-01T00:00:00Z');
    });
  });
});
