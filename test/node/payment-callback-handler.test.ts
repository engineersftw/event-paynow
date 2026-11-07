import { describe, it, expect, beforeEach, vi } from 'vitest';
import { PaymentCallbackHandler } from '../../src/commands/payment-callback-handler.js';
import type { Context, CallbackQuery } from 'grammy';
import type { ConversationDO } from '../../src/worker/conversation-do.js';
import type { Repository, Payment } from '../../src/db/repository.js';

describe('PaymentCallbackHandler', () => {
  let handler: PaymentCallbackHandler;
  let mockRepository: Repository;
  let mockConversationDO: ConversationDO;
  let mockCtx: Context;

  beforeEach(() => {
    mockRepository = {
      getPaymentByRef: vi.fn(),
      updatePaymentStatus: vi.fn(),
      listPaybacksByPayment: vi.fn(),
    } as unknown as Repository;

    mockConversationDO = {
      fetch: vi.fn(),
    } as unknown as ConversationDO;

    handler = new PaymentCallbackHandler(mockConversationDO, mockRepository);

    mockCtx = {
      from: { id: 123456789 },
      callbackQuery: {
        data: '',
        message: { chat: { id: 123456789 } },
      } as CallbackQuery,
      answerCallbackQuery: vi.fn(),
      editMessageText: vi.fn(),
      reply: vi.fn(),
    } as unknown as Context;
  });

  describe('handleCallback - Mark as Received', () => {
    it('should mark payment as received successfully', async () => {
      // Setup
      const payment: Payment = {
        id: 1,
        ref: 'PAY123',
        userId: 123456789,
        amountCents: 1000,
        status: 'pending',
        createdAt: new Date().toISOString(),
        description: 'Test payment',
        payeeType: 'mobile',
        payeeValue: '+6512345678',
        qrPayload: 'test-payload',
        source: 'manual',
        receivedAt: null,
      };

      mockCtx.callbackQuery!.data = 'mark_received:PAY123';
      vi.mocked(mockRepository.getPaymentByRef).mockResolvedValue(payment);
      vi.mocked(mockRepository.updatePaymentStatus).mockResolvedValue({
        ...payment,
        status: 'received',
        receivedAt: new Date().toISOString(),
      });

      // Execute
      await handler.handleCallback(mockCtx);

      // Verify
      expect(mockRepository.getPaymentByRef).toHaveBeenCalledWith('PAY123');
      expect(mockRepository.updatePaymentStatus).toHaveBeenCalledWith(
        'PAY123',
        'received',
        'manual',
        expect.any(String)
      );
      expect(mockCtx.answerCallbackQuery).toHaveBeenCalledWith({
        text: '✅ Payment marked as received!',
      });
      expect(mockCtx.editMessageText).toHaveBeenCalled();
    });

    it('should reject if payment not found', async () => {
      // Setup
      mockCtx.callbackQuery!.data = 'mark_received:PAY999';
      vi.mocked(mockRepository.getPaymentByRef).mockResolvedValue(null);

      // Execute
      await handler.handleCallback(mockCtx);

      // Verify
      expect(mockCtx.answerCallbackQuery).toHaveBeenCalledWith({
        text: '❌ Payment not found',
      });
      expect(mockRepository.updatePaymentStatus).not.toHaveBeenCalled();
    });

    it('should reject if user does not own the payment', async () => {
      // Setup
      const payment: Payment = {
        id: 1,
        ref: 'PAY123',
        userId: 999999999, // Different user
        amountCents: 1000,
        status: 'pending',
        createdAt: new Date().toISOString(),
        description: 'Test payment',
        payeeType: 'mobile',
        payeeValue: '+6512345678',
        qrPayload: 'test-payload',
        source: 'manual',
        receivedAt: null,
      };

      mockCtx.callbackQuery!.data = 'mark_received:PAY123';
      vi.mocked(mockRepository.getPaymentByRef).mockResolvedValue(payment);

      // Execute
      await handler.handleCallback(mockCtx);

      // Verify
      expect(mockCtx.answerCallbackQuery).toHaveBeenCalledWith({
        text: '❌ You do not own this payment',
      });
      expect(mockRepository.updatePaymentStatus).not.toHaveBeenCalled();
    });

    it('should handle already received payment gracefully', async () => {
      // Setup
      const payment: Payment = {
        id: 1,
        ref: 'PAY123',
        userId: 123456789,
        amountCents: 1000,
        status: 'received', // Already received
        createdAt: new Date().toISOString(),
        description: 'Test payment',
        payeeType: 'mobile',
        payeeValue: '+6512345678',
        qrPayload: 'test-payload',
        source: 'manual',
        receivedAt: new Date().toISOString(),
      };

      mockCtx.callbackQuery!.data = 'mark_received:PAY123';
      vi.mocked(mockRepository.getPaymentByRef).mockResolvedValue(payment);

      // Execute
      await handler.handleCallback(mockCtx);

      // Verify
      expect(mockCtx.answerCallbackQuery).toHaveBeenCalledWith({
        text: '⚠️ Payment already marked as received',
      });
      expect(mockRepository.updatePaymentStatus).not.toHaveBeenCalled();
    });

    it('should handle database update failure', async () => {
      // Setup
      const payment: Payment = {
        id: 1,
        ref: 'PAY123',
        userId: 123456789,
        amountCents: 1000,
        status: 'pending',
        createdAt: new Date().toISOString(),
        description: 'Test payment',
        payeeType: 'mobile',
        payeeValue: '+6512345678',
        qrPayload: 'test-payload',
        source: 'manual',
        receivedAt: null,
      };

      mockCtx.callbackQuery!.data = 'mark_received:PAY123';
      vi.mocked(mockRepository.getPaymentByRef).mockResolvedValue(payment);
      vi.mocked(mockRepository.updatePaymentStatus).mockResolvedValue(null);

      // Execute
      await handler.handleCallback(mockCtx);

      // Verify
      expect(mockCtx.answerCallbackQuery).toHaveBeenCalledWith({
        text: '❌ Failed to update payment status',
      });
    });
  });

  describe('handleCallback - Payback', () => {
    it('should start payback flow successfully', async () => {
      // Setup
      const payment: Payment = {
        id: 1,
        ref: 'PAY123',
        userId: 123456789,
        amountCents: 1000,
        status: 'received',
        createdAt: new Date().toISOString(),
        description: 'Test payment',
        payeeType: 'mobile',
        payeeValue: '+6512345678',
        qrPayload: 'test-payload',
        source: 'manual',
        receivedAt: new Date().toISOString(),
      };

      mockCtx.callbackQuery!.data = 'payback:PAY123';
      vi.mocked(mockRepository.getPaymentByRef).mockResolvedValue(payment);
      vi.mocked(mockConversationDO.fetch).mockResolvedValue(new Response());

      // Execute
      await handler.handleCallback(mockCtx);

      // Verify
      expect(mockConversationDO.fetch).toHaveBeenCalled();
      const fetchCall = vi.mocked(mockConversationDO.fetch).mock.calls[0][0] as Request;
      expect(fetchCall.method).toBe('POST');
      const body = await fetchCall.text();
      expect(body).toContain('payback');
      expect(body).toContain('PAY123');
      
      expect(mockCtx.answerCallbackQuery).toHaveBeenCalledWith({
        text: '🔄 Starting payback flow...',
      });
      expect(mockCtx.reply).toHaveBeenCalledWith(
        expect.stringContaining('PAY123'),
        { parse_mode: 'Markdown' }
      );
    });

    it('should reject payback if user does not own the payment', async () => {
      // Setup
      const payment: Payment = {
        id: 1,
        ref: 'PAY123',
        userId: 999999999, // Different user
        amountCents: 1000,
        status: 'received',
        createdAt: new Date().toISOString(),
        description: 'Test payment',
        payeeType: 'mobile',
        payeeValue: '+6512345678',
        qrPayload: 'test-payload',
        source: 'manual',
        receivedAt: new Date().toISOString(),
      };

      mockCtx.callbackQuery!.data = 'payback:PAY123';
      vi.mocked(mockRepository.getPaymentByRef).mockResolvedValue(payment);

      // Execute
      await handler.handleCallback(mockCtx);

      // Verify
      expect(mockCtx.answerCallbackQuery).toHaveBeenCalledWith({
        text: '❌ You do not own this payment',
      });
      expect(mockConversationDO.fetch).not.toHaveBeenCalled();
    });
  });

  describe('handleCallback - View Payment Details', () => {
    it('should display payment details with no paybacks', async () => {
      // Setup
      const payment: Payment = {
        id: 1,
        ref: 'PAY123',
        userId: 123456789,
        amountCents: 1000,
        status: 'received',
        createdAt: '2024-01-15T10:30:00Z',
        description: 'Test payment',
        payeeType: 'mobile',
        payeeValue: '+6512345678',
        qrPayload: 'test-payload',
        source: 'manual',
        receivedAt: '2024-01-15T10:35:00Z',
      };

      mockCtx.callbackQuery!.data = 'view:PAY123';
      vi.mocked(mockRepository.getPaymentByRef).mockResolvedValue(payment);
      vi.mocked(mockRepository.listPaybacksByPayment).mockResolvedValue([]);

      // Execute
      await handler.handleCallback(mockCtx);

      // Verify
      expect(mockRepository.listPaybacksByPayment).toHaveBeenCalledWith(1);
      expect(mockCtx.answerCallbackQuery).toHaveBeenCalledWith({
        text: '📋 Payment details loaded',
      });
      expect(mockCtx.editMessageText).toHaveBeenCalledWith(
        expect.stringContaining('💳 *Payment Details*'),
        { parse_mode: 'Markdown' }
      );
      
      const message = vi.mocked(mockCtx.editMessageText).mock.calls[0][0] as string;
      expect(message).toContain('PAY123');
      expect(message).toContain('$10.00');
      expect(message).toContain('Test payment');
      expect(message).toContain('✅ Received');
      expect(message).toContain('Manual');
      expect(message).toContain('💸 *Paybacks:* None');
    });

    it('should display payment details with paybacks', async () => {
      // Setup
      const payment: Payment = {
        id: 1,
        ref: 'PAY123',
        userId: 123456789,
        amountCents: 10000, // $100.00
        status: 'received',
        createdAt: '2024-01-15T10:30:00Z',
        description: 'Test payment',
        payeeType: 'mobile',
        payeeValue: '+6512345678',
        qrPayload: 'test-payload',
        source: 'notification',
        receivedAt: '2024-01-15T10:35:00Z',
      };

      const paybacks = [
        {
          id: 1,
          ref: 'PB1',
          paymentId: 1,
          payerType: 'mobile' as const,
          payerValue: '+6598765432',
          amountCents: 3000,
          status: 'sent' as const,
          qrPayload: 'payload1',
          createdAt: '2024-01-15T11:00:00Z',
          sentAt: '2024-01-15T11:05:00Z',
        },
        {
          id: 2,
          ref: 'PB2',
          paymentId: 1,
          payerType: 'uen' as const,
          payerValue: '201234567A',
          amountCents: 2000,
          status: 'pending' as const,
          qrPayload: 'payload2',
          createdAt: '2024-01-15T12:00:00Z',
          sentAt: null,
        },
      ];

      mockCtx.callbackQuery!.data = 'view:PAY123';
      vi.mocked(mockRepository.getPaymentByRef).mockResolvedValue(payment);
      vi.mocked(mockRepository.listPaybacksByPayment).mockResolvedValue(paybacks);

      // Execute
      await handler.handleCallback(mockCtx);

      // Verify
      const message = vi.mocked(mockCtx.editMessageText).mock.calls[0][0] as string;
      expect(message).toContain('💸 *Paybacks:*');
      expect(message).toContain('$30.00 to +6598765432');
      expect(message).toContain('$20.00 to 201234567A');
      expect(message).toContain('*Total Payback:* $50.00');
      expect(message).toContain('*Remaining:* $50.00');
      expect(message).toContain('Notification');
    });

    it('should handle errors when loading payment details', async () => {
      // Setup
      const payment: Payment = {
        id: 1,
        ref: 'PAY123',
        userId: 123456789,
        amountCents: 1000,
        status: 'pending',
        createdAt: new Date().toISOString(),
        description: 'Test payment',
        payeeType: 'mobile',
        payeeValue: '+6512345678',
        qrPayload: 'test-payload',
        source: 'manual',
        receivedAt: null,
      };

      mockCtx.callbackQuery!.data = 'view:PAY123';
      vi.mocked(mockRepository.getPaymentByRef).mockResolvedValue(payment);
      vi.mocked(mockRepository.listPaybacksByPayment).mockRejectedValue(new Error('DB error'));

      // Execute
      await handler.handleCallback(mockCtx);

      // Verify
      expect(mockCtx.answerCallbackQuery).toHaveBeenCalledWith({
        text: '❌ Failed to load payment details',
      });
      expect(mockCtx.editMessageText).not.toHaveBeenCalled();
    });
  });

  describe('handleCallback - Invalid data', () => {
    it('should handle missing callback data', async () => {
      // Setup
      mockCtx.callbackQuery!.data = undefined;

      // Execute
      await handler.handleCallback(mockCtx);

      // Verify
      expect(mockRepository.getPaymentByRef).not.toHaveBeenCalled();
    });

    it('should handle malformed callback data', async () => {
      // Setup
      mockCtx.callbackQuery!.data = 'invalid_format';

      // Execute
      await handler.handleCallback(mockCtx);

      // Verify
      expect(mockCtx.answerCallbackQuery).toHaveBeenCalledWith({
        text: '❌ Invalid callback data',
      });
    });

    it('should handle unknown action', async () => {
      // Setup
      const payment: Payment = {
        id: 1,
        ref: 'PAY123',
        userId: 123456789,
        amountCents: 1000,
        status: 'pending',
        createdAt: new Date().toISOString(),
        description: 'Test payment',
        payeeType: 'mobile',
        payeeValue: '+6512345678',
        qrPayload: 'test-payload',
        source: 'manual',
        receivedAt: null,
      };

      mockCtx.callbackQuery!.data = 'unknown_action:PAY123';
      vi.mocked(mockRepository.getPaymentByRef).mockResolvedValue(payment);

      // Execute
      await handler.handleCallback(mockCtx);

      // Verify
      expect(mockCtx.answerCallbackQuery).toHaveBeenCalledWith({
        text: '❌ Unknown action',
      });
    });
  });
});
