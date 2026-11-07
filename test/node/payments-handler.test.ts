import type { Context } from 'grammy';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { PaymentsCommandHandler } from '../../src/commands/payments-handler.js';
import type { Payment, Repository, User } from '../../src/db/repository.js';

describe('PaymentsCommandHandler', () => {
  let handler: PaymentsCommandHandler;
  let mockRepository: Repository;
  let mockCtx: Context;

  beforeEach(() => {
    // Create mock repository
    mockRepository = {
      getUser: vi.fn(),
      listPaymentsByUser: vi.fn(),
    } as unknown as Repository;

    // Create mock context
    mockCtx = {
      from: { id: 123456789 },
      reply: vi.fn(),
    } as unknown as Context;

    // Create handler with mock repository
    handler = new PaymentsCommandHandler(mockRepository);
  });

  describe('handle', () => {
    it('should prompt /init when user does not exist', async () => {
      // Arrange
      vi.mocked(mockRepository.getUser).mockResolvedValue(null);

      // Act
      await handler.handle(mockCtx);

      // Assert
      expect(mockRepository.getUser).toHaveBeenCalledWith(123456789);
      expect(mockRepository.listPaymentsByUser).not.toHaveBeenCalled();
      expect(mockCtx.reply).toHaveBeenCalledWith(
        expect.stringContaining("haven't set up your PayNow reference")
      );
      expect(mockCtx.reply).toHaveBeenCalledWith(expect.stringContaining('/init'));
    });

    it('should show empty message when user has no payments', async () => {
      // Arrange
      const user: User = {
        telegramId: 123456789,
        payeeType: 'mobile',
        payeeValue: '+6591234567',
        displayName: 'Test User',
        createdAt: '2024-01-01T00:00:00Z',
        updatedAt: '2024-01-01T00:00:00Z',
      };
      vi.mocked(mockRepository.getUser).mockResolvedValue(user);
      vi.mocked(mockRepository.listPaymentsByUser).mockResolvedValue([]);

      // Act
      await handler.handle(mockCtx);

      // Assert
      expect(mockRepository.getUser).toHaveBeenCalledWith(123456789);
      expect(mockRepository.listPaymentsByUser).toHaveBeenCalledWith(123456789);
      expect(mockCtx.reply).toHaveBeenCalledWith(
        expect.stringContaining("don't have any payments yet")
      );
      expect(mockCtx.reply).toHaveBeenCalledWith(expect.stringContaining('/start'));
    });

    it('should display formatted payments list', async () => {
      // Arrange
      const user: User = {
        telegramId: 123456789,
        payeeType: 'mobile',
        payeeValue: '+6591234567',
        displayName: 'Test User',
        createdAt: '2024-01-01T00:00:00Z',
        updatedAt: '2024-01-01T00:00:00Z',
      };
      const payments: Payment[] = [
        {
          id: 1,
          ref: 'PAY001',
          userId: 123456789,
          description: 'Lunch',
          amountCents: 1500,
          payeeType: 'mobile',
          payeeValue: '+6591234567',
          status: 'pending',
          source: 'manual',
          qrPayload: 'payload1',
          createdAt: '2024-01-15T12:30:00Z',
          receivedAt: null,
        },
        {
          id: 2,
          ref: 'PAY002',
          userId: 123456789,
          description: 'Coffee',
          amountCents: 550,
          payeeType: 'mobile',
          payeeValue: '+6591234567',
          status: 'received',
          source: 'manual',
          qrPayload: 'payload2',
          createdAt: '2024-01-14T10:00:00Z',
          receivedAt: '2024-01-14T10:05:00Z',
        },
      ];
      vi.mocked(mockRepository.getUser).mockResolvedValue(user);
      vi.mocked(mockRepository.listPaymentsByUser).mockResolvedValue(payments);

      // Act
      await handler.handle(mockCtx);

      // Assert
      expect(mockRepository.getUser).toHaveBeenCalledWith(123456789);
      expect(mockRepository.listPaymentsByUser).toHaveBeenCalledWith(123456789);

      const replyCall = vi.mocked(mockCtx.reply).mock.calls[0];
      expect(replyCall).toBeDefined();
      const message = replyCall[0] as string;

      // Check header
      expect(message).toContain('💰 *Your Payments*');

      // Check payments are displayed (sorted by date, newest first)
      expect(message).toContain('$15.00');
      expect(message).toContain('Lunch');
      expect(message).toContain('PAY001');
      expect(message).toContain('Pending');

      expect(message).toContain('$5.50');
      expect(message).toContain('Coffee');
      expect(message).toContain('PAY002');
      expect(message).toContain('Received');

      // Check status icons
      expect(message).toContain('⏳'); // Pending
      expect(message).toContain('✅'); // Received

      // Check footer
      expect(message).toContain('Use the buttons above to manage your payments.');
    });

    it('should format amounts correctly', async () => {
      // Arrange
      const user: User = {
        telegramId: 123456789,
        payeeType: 'mobile',
        payeeValue: '+6591234567',
        displayName: 'Test User',
        createdAt: '2024-01-01T00:00:00Z',
        updatedAt: '2024-01-01T00:00:00Z',
      };
      const payments: Payment[] = [
        {
          id: 1,
          ref: 'PAY001',
          userId: 123456789,
          description: 'Test',
          amountCents: 12345, // $123.45
          payeeType: 'mobile',
          payeeValue: '+6591234567',
          status: 'pending',
          source: 'manual',
          qrPayload: 'payload',
          createdAt: '2024-01-15T12:30:00Z',
          receivedAt: null,
        },
      ];
      vi.mocked(mockRepository.getUser).mockResolvedValue(user);
      vi.mocked(mockRepository.listPaymentsByUser).mockResolvedValue(payments);

      // Act
      await handler.handle(mockCtx);

      // Assert
      const replyCall = vi.mocked(mockCtx.reply).mock.calls[0];
      const message = replyCall[0] as string;
      expect(message).toContain('$123.45');
    });

    it('should handle repository errors gracefully', async () => {
      // Arrange
      vi.mocked(mockRepository.getUser).mockRejectedValue(new Error('Database error'));

      // Act
      await handler.handle(mockCtx);

      // Assert
      expect(mockCtx.reply).toHaveBeenCalledWith(
        expect.stringContaining('Failed to fetch your payments')
      );
    });

    it('should format dates correctly', async () => {
      // Arrange
      const user: User = {
        telegramId: 123456789,
        payeeType: 'mobile',
        payeeValue: '+6591234567',
        displayName: 'Test User',
        createdAt: '2024-01-01T00:00:00Z',
        updatedAt: '2024-01-01T00:00:00Z',
      };
      const payments: Payment[] = [
        {
          id: 1,
          ref: 'PAY001',
          userId: 123456789,
          description: 'Test',
          amountCents: 100,
          payeeType: 'mobile',
          payeeValue: '+6591234567',
          status: 'pending',
          source: 'manual',
          qrPayload: 'payload',
          createdAt: '2024-12-25T15:30:00Z',
          receivedAt: null,
        },
      ];
      vi.mocked(mockRepository.getUser).mockResolvedValue(user);
      vi.mocked(mockRepository.listPaymentsByUser).mockResolvedValue(payments);

      // Act
      await handler.handle(mockCtx);

      // Assert
      const replyCall = vi.mocked(mockCtx.reply).mock.calls[0];
      const message = replyCall[0] as string;
      // Date should be formatted as DD/MM/YYYY HH:MM
      expect(message).toMatch(/\d{2}\/\d{2}\/\d{4} \d{2}:\d{2}/);
    });

    it('should sort payments by date (newest first)', async () => {
      // Arrange
      const user: User = {
        telegramId: 123456789,
        payeeType: 'mobile',
        payeeValue: '+6591234567',
        displayName: 'Test User',
        createdAt: '2024-01-01T00:00:00Z',
        updatedAt: '2024-01-01T00:00:00Z',
      };
      const payments: Payment[] = [
        {
          id: 1,
          ref: 'PAY001',
          userId: 123456789,
          description: 'Older',
          amountCents: 100,
          payeeType: 'mobile',
          payeeValue: '+6591234567',
          status: 'pending',
          source: 'manual',
          qrPayload: 'payload',
          createdAt: '2024-01-10T10:00:00Z',
          receivedAt: null,
        },
        {
          id: 2,
          ref: 'PAY002',
          userId: 123456789,
          description: 'Newer',
          amountCents: 200,
          payeeType: 'mobile',
          payeeValue: '+6591234567',
          status: 'pending',
          source: 'manual',
          qrPayload: 'payload',
          createdAt: '2024-01-20T10:00:00Z',
          receivedAt: null,
        },
      ];
      vi.mocked(mockRepository.getUser).mockResolvedValue(user);
      vi.mocked(mockRepository.listPaymentsByUser).mockResolvedValue(payments);

      // Act
      await handler.handle(mockCtx);

      // Assert
      const replyCall = vi.mocked(mockCtx.reply).mock.calls[0];
      const message = replyCall[0] as string;

      // "Newer" should appear before "Older" in the message
      const newerIndex = message.indexOf('Newer');
      const olderIndex = message.indexOf('Older');
      expect(newerIndex).toBeLessThan(olderIndex);
    });
  });
});
