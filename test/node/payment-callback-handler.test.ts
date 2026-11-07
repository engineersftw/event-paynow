import type { CallbackQuery, Context } from 'grammy';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { PaymentCallbackHandler } from '../../src/commands/payment-callback-handler.js';
import type { Payment, Repository } from '../../src/db/repository.js';
import type { ConversationDO } from '../../src/worker/conversation-do.js';

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
      getPaybackByRef: vi.fn(),
      updatePaybackStatus: vi.fn(),
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
      expect(mockCtx.reply).toHaveBeenCalledWith(expect.stringContaining('PAY123'), {
        parse_mode: 'Markdown',
      });
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
        expect.objectContaining({ parse_mode: 'Markdown' })
      );
      // Detail view replaces the list keyboard; with no paybacks it is empty
      const opts = vi.mocked(mockCtx.editMessageText).mock.calls[0]![1] as {
        reply_markup: { inline_keyboard: unknown[][] };
      };
      expect(opts.reply_markup.inline_keyboard.flat()).toHaveLength(0);

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

      // Task 7.4: pending paybacks get a Mark-sent button; sent ones don't
      const opts = vi.mocked(mockCtx.editMessageText).mock.calls[0]![1] as {
        reply_markup: { inline_keyboard: Array<Array<{ text: string; callback_data: string }>> };
      };
      const buttons = opts.reply_markup.inline_keyboard.flat();
      expect(buttons).toHaveLength(1);
      expect(buttons[0]!.callback_data).toBe('pb_sent:PAY123:PB2');
      expect(buttons[0]!.text).toContain('Mark sent: $20.00');
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

  describe('handleCallback - Mark payback as sent (task 7.4)', () => {
    const detailPayment: Payment = {
      id: 1,
      ref: 'PAY123',
      userId: 123456789,
      amountCents: 10000,
      status: 'received',
      createdAt: '2024-01-15T10:30:00Z',
      description: 'Test payment',
      payeeType: 'mobile',
      payeeValue: '+6591234567',
      qrPayload: 'test-payload',
      source: 'manual',
      receivedAt: '2024-01-15T10:35:00Z',
    };

    const pendingPayback = {
      id: 2,
      ref: 'PB2',
      paymentId: 1,
      payerType: 'mobile' as const,
      payerValue: '201234567A',
      amountCents: 2000,
      status: 'pending' as const,
      qrPayload: 'payload2',
      createdAt: '2024-01-15T12:00:00Z',
      sentAt: null,
    };

    function setupPaybackView() {
      mockCtx.callbackQuery!.data = 'pb_sent:PAY123:PB2';
      vi.mocked(mockRepository.getPaymentByRef).mockResolvedValue(detailPayment);
      vi.mocked(mockRepository.getPaybackByRef).mockResolvedValue(pendingPayback);
    }

    it('transitions the payback to sent with a timestamp and re-renders details', async () => {
      setupPaybackView();
      const sentRow = {
        ...pendingPayback,
        status: 'sent' as const,
        sentAt: '2024-01-16T09:00:00Z',
      };
      vi.mocked(mockRepository.updatePaybackStatus).mockResolvedValue(sentRow);
      vi.mocked(mockRepository.listPaybacksByPayment).mockResolvedValue([sentRow]);

      await handler.handleCallback(mockCtx);

      expect(mockRepository.getPaybackByRef).toHaveBeenCalledWith('PB2');
      expect(mockRepository.updatePaybackStatus).toHaveBeenCalledWith(
        'PB2',
        'sent',
        expect.stringMatching(/^\d{4}-\d{2}-\d{2}T/)
      );
      expect(mockCtx.answerCallbackQuery).toHaveBeenCalledWith({
        text: '✅ Payback marked as sent',
      });

      // Re-rendered detail: sent icon + timestamp, no remaining buttons
      const message = vi.mocked(mockCtx.editMessageText).mock.calls[0]![0] as string;
      expect(message).toContain('✅ $20.00 to 201234567A');
      expect(message).toContain('(sent');
      expect(message).toContain('*Remaining:* $80.00');
      const opts = vi.mocked(mockCtx.editMessageText).mock.calls[0]![1] as {
        reply_markup: { inline_keyboard: unknown[][] };
      };
      expect(opts.reply_markup.inline_keyboard.flat()).toHaveLength(0);
    });

    it('reports not found when the payback ref is unknown', async () => {
      setupPaybackView();
      vi.mocked(mockRepository.getPaybackByRef).mockResolvedValue(null);

      await handler.handleCallback(mockCtx);

      expect(mockCtx.answerCallbackQuery).toHaveBeenCalledWith({
        text: '❌ Payback not found',
      });
      expect(mockRepository.updatePaybackStatus).not.toHaveBeenCalled();
    });

    it('rejects a payback that belongs to a different payment', async () => {
      setupPaybackView();
      vi.mocked(mockRepository.getPaybackByRef).mockResolvedValue({
        ...pendingPayback,
        paymentId: 999,
      });

      await handler.handleCallback(mockCtx);

      expect(mockCtx.answerCallbackQuery).toHaveBeenCalledWith({
        text: '❌ Payback not found',
      });
      expect(mockRepository.updatePaybackStatus).not.toHaveBeenCalled();
    });

    it('rejects a duplicate tap on an already-sent payback', async () => {
      setupPaybackView();
      vi.mocked(mockRepository.getPaybackByRef).mockResolvedValue({
        ...pendingPayback,
        status: 'sent',
        sentAt: '2024-01-16T09:00:00Z',
      });

      await handler.handleCallback(mockCtx);

      expect(mockCtx.answerCallbackQuery).toHaveBeenCalledWith({
        text: '⚠️ Payback already marked as sent',
      });
      expect(mockRepository.updatePaybackStatus).not.toHaveBeenCalled();
    });

    it('loses a concurrent duplicate tap gracefully (guarded update returns null)', async () => {
      setupPaybackView();
      // First read: still pending…
      vi.mocked(mockRepository.getPaybackByRef)
        .mockResolvedValueOnce(pendingPayback)
        // …but the CAS update loses; re-read shows another tap won
        .mockResolvedValueOnce({
          ...pendingPayback,
          status: 'sent',
          sentAt: '2024-01-16T09:00:00Z',
        });
      vi.mocked(mockRepository.updatePaybackStatus).mockResolvedValue(null);

      await handler.handleCallback(mockCtx);

      expect(mockCtx.answerCallbackQuery).toHaveBeenCalledWith({
        text: '⚠️ Payback already marked as sent',
      });
      expect(mockCtx.editMessageText).not.toHaveBeenCalled();
    });

    it('reports failure when the update returns null but the row is still pending', async () => {
      setupPaybackView();
      vi.mocked(mockRepository.getPaybackByRef)
        .mockResolvedValueOnce(pendingPayback)
        .mockResolvedValueOnce(pendingPayback);
      vi.mocked(mockRepository.updatePaybackStatus).mockResolvedValue(null);

      await handler.handleCallback(mockCtx);

      expect(mockCtx.answerCallbackQuery).toHaveBeenCalledWith({
        text: '❌ Failed to update payback status',
      });
    });

    it('rejects when the caller does not own the payment', async () => {
      mockCtx.callbackQuery!.data = 'pb_sent:PAY123:PB2';
      vi.mocked(mockRepository.getPaymentByRef).mockResolvedValue({
        ...detailPayment,
        userId: 999999999,
      });

      await handler.handleCallback(mockCtx);

      expect(mockCtx.answerCallbackQuery).toHaveBeenCalledWith({
        text: '❌ You do not own this payment',
      });
      expect(mockRepository.getPaybackByRef).not.toHaveBeenCalled();
    });

    it('rejects malformed pb_sent data without a payback ref', async () => {
      mockCtx.callbackQuery!.data = 'pb_sent:PAY123';
      vi.mocked(mockRepository.getPaymentByRef).mockResolvedValue(detailPayment);

      await handler.handleCallback(mockCtx);

      expect(mockCtx.answerCallbackQuery).toHaveBeenCalledWith({
        text: '❌ Invalid callback data',
      });
      expect(mockRepository.getPaybackByRef).not.toHaveBeenCalled();
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
