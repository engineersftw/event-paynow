import { describe, it, expect, beforeEach } from 'vitest';
import { createPaymentService, type PaymentService } from '../../src/db/payment-service';
import type {
  Repository,
  Payment,
  PaymentStatus,
  ReceiptSource,
  User,
  Payback,
  CreatePaybackBoundedResult,
} from '../../src/db/repository';

/**
 * Mock repository for testing payment service — mirrors the real Repository
 * interface (same transition entry point semantics as D1Repository).
 */
class MockRepository implements Repository {
  private payments = new Map<string, Payment>();

  async createPayment(
    input: Omit<Payment, 'id' | 'createdAt' | 'receivedAt'> & { timestamp: string }
  ): Promise<Payment> {
    const created: Payment = {
      ...input,
      id: this.payments.size + 1,
      createdAt: input.timestamp,
      receivedAt: null,
    };
    this.payments.set(created.ref, created);
    return created;
  }

  async getPaymentByRef(ref: string): Promise<Payment | null> {
    return this.payments.get(ref) ?? null;
  }

  async updatePaymentStatus(
    ref: string,
    status: PaymentStatus,
    source: ReceiptSource,
    timestamp: string
  ): Promise<Payment | null> {
    const current = this.payments.get(ref);
    if (!current) return null;
    const updated: Payment = {
      ...current,
      status,
      source,
      receivedAt: status === 'received' ? timestamp : null,
    };
    this.payments.set(ref, updated);
    return updated;
  }

  // Other repository methods not needed for payment service tests
  async upsertUser(): Promise<User> {
    throw new Error('Not implemented');
  }
  async getUser(): Promise<User | null> {
    return null;
  }
  async listPaymentsByUser(): Promise<Payment[]> {
    return [];
  }
  async createPayback(): Promise<Payback> {
    throw new Error('Not implemented');
  }
  async createPaybackBounded(): Promise<CreatePaybackBoundedResult> {
    throw new Error('Not implemented');
  }
  async listPaybacksByPayment(): Promise<Payback[]> {
    return [];
  }
  async sumActivePaybacks(): Promise<number> {
    return 0;
  }
}

function seedPayment(
  repo: MockRepository,
  ref: string,
  amountCents: number
): Promise<Payment> {
  return repo.createPayment({
    ref,
    userId: 123456789,
    description: 'Lunch',
    amountCents,
    payeeType: 'mobile',
    payeeValue: '+6591234567',
    status: 'pending',
    source: 'manual',
    qrPayload: 'payload',
    timestamp: '2024-01-01T00:00:00Z',
  });
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
      await seedPayment(repo, 'ABC1234567', 5000);

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
      await seedPayment(repo, 'XYZ9876543', 10000);

      // Act
      const result = await service.markPaymentReceived('XYZ9876543', 'notification');

      // Assert
      expect(result).not.toBeNull();
      expect(result!.source).toBe('notification');
    });

    it('should reject duplicate received status', async () => {
      // Arrange
      await seedPayment(repo, 'DUP1234567', 7500);

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
      await seedPayment(repo, 'PRES123456', 2500);

      // Act
      const result = await service.markPaymentReceived('PRES123456', 'manual');

      // Assert
      expect(result).not.toBeNull();
      expect(result!.ref).toBe('PRES123456');
      expect(result!.userId).toBe(123456789);
      expect(result!.amountCents).toBe(2500);
      expect(result!.description).toBe('Lunch');
      expect(result!.payeeType).toBe('mobile');
      expect(result!.payeeValue).toBe('+6591234567');
      expect(result!.createdAt).toBe('2024-01-01T00:00:00Z');
    });
  });
});
