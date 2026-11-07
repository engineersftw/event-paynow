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
      voidPayment: vi.fn(),
      sumPaybacks: vi.fn(),
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
        message: { chat: { id: 123456789 }, message_id: 42 },
      } as CallbackQuery,
      answerCallbackQuery: vi.fn(),
      editMessageText: vi.fn(),
      reply: vi.fn(),
      api: {
        deleteMessage: vi.fn(),
      },
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
      // QR photo replaced with text message
      expect(mockCtx.reply).toHaveBeenCalledWith(expect.stringContaining('✅ Received'));
      expect(mockCtx.reply).toHaveBeenCalledWith(expect.stringContaining('PAY123'));
      // Original QR photo message deleted
      expect(mockCtx.api.deleteMessage).toHaveBeenCalledWith(123456789, 42);
    });

    it('puts the payer name (not the number) in the received status line', async () => {
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
        payerType: 'mobile',
        payerValue: '+6591234568',
        payerName: 'Alice',
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

      await handler.handleCallback(mockCtx);

      const line = vi.mocked(mockCtx.reply).mock.calls[0]![0] as string;
      expect(line).toMatch(/^Test payment \/ SGD 10\.00 \/ PAY123 \/ Payer: Alice \/ ✅ Received /);
      expect(line).not.toContain('91234568');

      // Without a name the line keeps the original format
      vi.mocked(mockCtx.reply).mockClear();
      const { payerName: _n, ...noName } = payment;
      vi.mocked(mockRepository.getPaymentByRef).mockResolvedValue(noName);
      await handler.handleCallback(mockCtx);
      expect(vi.mocked(mockCtx.reply).mock.calls[0]![0]).toMatch(
        /^Test payment \/ SGD 10\.00 \/ PAY123 \/ ✅ Received /
      );
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

  describe('handleCallback - Void', () => {
    const base: Payment = {
      id: 1,
      ref: 'PAY123',
      userId: 123456789,
      amountCents: 1000,
      status: 'pending',
      createdAt: new Date().toISOString(),
      description: 'Test payment',
      payeeType: 'mobile',
      payeeValue: '+6512345678',
      payerType: 'mobile',
      payerValue: '+6591234568',
      payerName: 'Alice',
      qrPayload: 'test-payload',
      source: 'manual',
      receivedAt: null,
    };
    const photoMessage = { chat: { id: 123456789 }, message_id: 77, photo: [] };

    function tapVoid(payment: Payment, onPhoto = true) {
      mockCtx.callbackQuery!.data = 'void:PAY123';
      if (onPhoto) (mockCtx.callbackQuery as { message: unknown }).message = photoMessage;
      vi.mocked(mockRepository.getPaymentByRef).mockResolvedValue(payment);
      vi.mocked(mockRepository.sumPaybacks).mockResolvedValue(0);
    }

    it('voids a pending payment: status line with the payer name replaces the QR photo', async () => {
      tapVoid(base);
      vi.mocked(mockRepository.voidPayment).mockResolvedValue({ ...base, status: 'voided' });

      await handler.handleCallback(mockCtx);

      expect(mockRepository.voidPayment).toHaveBeenCalledWith('PAY123');
      expect(mockCtx.answerCallbackQuery).toHaveBeenCalledWith({ text: '🚫 Payment voided' });
      const line = vi.mocked(mockCtx.reply).mock.calls[0]![0] as string;
      expect(line).toMatch(/^Test payment \/ SGD 10\.00 \/ PAY123 \/ Payer: Alice \/ 🚫 Voided /);
      expect(line).not.toContain('91234568');
      expect(mockCtx.api.deleteMessage).toHaveBeenCalledWith(123456789, 77);
    });

    it('still succeeds when the QR photo cannot be deleted', async () => {
      tapVoid(base);
      vi.mocked(mockRepository.voidPayment).mockResolvedValue({ ...base, status: 'voided' });
      vi.mocked(mockCtx.api.deleteMessage).mockRejectedValue(new Error('too old'));

      await expect(handler.handleCallback(mockCtx)).resolves.toBeUndefined();
      expect(mockCtx.reply).toHaveBeenCalled();
    });

    it('refuses received, voided and payback-bearing payments without writing', async () => {
      tapVoid({ ...base, status: 'received' });
      await handler.handleCallback(mockCtx);
      expect(mockCtx.answerCallbackQuery).toHaveBeenLastCalledWith({
        text: '⚠️ Payment was already received — it can’t be voided',
      });

      tapVoid({ ...base, status: 'voided' });
      await handler.handleCallback(mockCtx);
      expect(mockCtx.answerCallbackQuery).toHaveBeenLastCalledWith({
        text: '⚠️ Payment already voided',
      });

      tapVoid(base);
      vi.mocked(mockRepository.sumPaybacks).mockResolvedValue(500);
      await handler.handleCallback(mockCtx);
      expect(mockCtx.answerCallbackQuery).toHaveBeenLastCalledWith({
        text: '⚠️ This payment has paybacks and can’t be voided',
      });

      expect(mockRepository.voidPayment).not.toHaveBeenCalled();
      expect(mockCtx.reply).not.toHaveBeenCalled();
    });

    it('reports the winner when it loses a race against Received', async () => {
      tapVoid(base);
      vi.mocked(mockRepository.voidPayment).mockResolvedValue(null);
      vi.mocked(mockRepository.getPaymentByRef)
        .mockResolvedValueOnce(base)
        .mockResolvedValueOnce({ ...base, status: 'received' });

      await handler.handleCallback(mockCtx);

      expect(mockCtx.answerCallbackQuery).toHaveBeenLastCalledWith({
        text: '⚠️ Payment was already received — it can’t be voided',
      });
      expect(mockCtx.reply).not.toHaveBeenCalled();
      expect(mockCtx.api.deleteMessage).not.toHaveBeenCalled();
    });

    it('Received on a voided payment is refused, and a lost Received race says voided', async () => {
      mockCtx.callbackQuery!.data = 'mark_received:PAY123';
      vi.mocked(mockRepository.getPaymentByRef).mockResolvedValue({ ...base, status: 'voided' });
      await handler.handleCallback(mockCtx);
      expect(mockCtx.answerCallbackQuery).toHaveBeenLastCalledWith({
        text: '⚠️ Payment was voided',
      });
      expect(mockRepository.updatePaymentStatus).not.toHaveBeenCalled();

      // Pending when read, but Void wins before the guarded update
      vi.mocked(mockRepository.getPaymentByRef)
        .mockResolvedValueOnce(base)
        .mockResolvedValueOnce({ ...base, status: 'voided' });
      vi.mocked(mockRepository.updatePaymentStatus).mockResolvedValue(null);
      await handler.handleCallback(mockCtx);
      expect(mockCtx.answerCallbackQuery).toHaveBeenLastCalledWith({
        text: '⚠️ Payment was voided',
      });
      expect(mockCtx.reply).not.toHaveBeenCalled();
    });

    it('Payback button is refused for pending and voided payments', async () => {
      mockCtx.callbackQuery!.data = 'payback:PAY123';
      for (const status of ['pending', 'voided'] as const) {
        vi.mocked(mockRepository.getPaymentByRef).mockResolvedValue({ ...base, status });
        await handler.handleCallback(mockCtx);
        expect(mockCtx.answerCallbackQuery).toHaveBeenLastCalledWith({
          text: '⚠️ You can only create paybacks for received payments.',
        });
      }
      expect(mockConversationDO.fetch).not.toHaveBeenCalled();
      expect(mockCtx.reply).not.toHaveBeenCalled();
    });

    it('payment detail labels a voided payment', async () => {
      mockCtx.callbackQuery!.data = 'view:PAY123';
      vi.mocked(mockRepository.getPaymentByRef).mockResolvedValue({ ...base, status: 'voided' });
      vi.mocked(mockRepository.listPaybacksByPayment).mockResolvedValue([]);

      await handler.handleCallback(mockCtx);

      expect(vi.mocked(mockCtx.editMessageText).mock.calls[0]![0]).toContain('*Status:* 🚫 Voided');
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
    it('shows the payer in payment details when stored', async () => {
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
        payerType: 'mobile',
        payerValue: '+6591234568',
        payerName: 'Alice',
        qrPayload: 'test-payload',
        source: 'manual',
        receivedAt: '2024-01-15T10:35:00Z',
      };
      mockCtx.callbackQuery!.data = 'view:PAY123';
      vi.mocked(mockRepository.getPaymentByRef).mockResolvedValue(payment);
      vi.mocked(mockRepository.listPaybacksByPayment).mockResolvedValue([]);

      await handler.handleCallback(mockCtx);
      expect(mockCtx.editMessageText).toHaveBeenLastCalledWith(
        expect.stringContaining('*Payer:* Alice (+6591234568)'),
        expect.anything()
      );

      vi.mocked(mockRepository.getPaymentByRef).mockResolvedValue({ ...payment, payerName: null });
      await handler.handleCallback(mockCtx);
      expect(mockCtx.editMessageText).toHaveBeenLastCalledWith(
        expect.stringContaining('*Payer:* +6591234568'),
        expect.anything()
      );
    });

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

      // Pending paybacks get Mark-sent + Cancel buttons; sent ones don't
      const opts = vi.mocked(mockCtx.editMessageText).mock.calls[0]![1] as {
        reply_markup: { inline_keyboard: Array<Array<{ text: string; callback_data: string }>> };
      };
      const buttons = opts.reply_markup.inline_keyboard.flat();
      expect(buttons).toHaveLength(2);
      expect(buttons[0]!.callback_data).toBe('pb_sent:PAY123:PB2');
      expect(buttons[0]!.text).toContain('Mark sent: $20.00');
      expect(buttons[1]!.callback_data).toBe('pb_cancel:PAY123:PB2');
      expect(buttons[1]!.text).toContain('Cancel: $20.00');
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

    describe('from the payback QR photo and cancel', () => {
      const photoMessage = { chat: { id: 123456789 }, message_id: 77, photo: [] };

      function viewingPhoto(data: string) {
        setupPaybackView();
        mockCtx.callbackQuery!.data = data;
        (mockCtx.callbackQuery as { message: unknown }).message = photoMessage;
      }

      it('Sent on the QR photo replies with a status line and deletes the photo', async () => {
        viewingPhoto('pb_sent:PAY123:PB2');
        vi.mocked(mockRepository.updatePaybackStatus).mockResolvedValue({
          ...pendingPayback,
          status: 'sent',
          sentAt: '2024-01-16T09:00:00Z',
        });

        await handler.handleCallback(mockCtx);

        expect(mockCtx.reply).toHaveBeenCalledWith(
          expect.stringMatching(/^Payback for PAY123 \/ SGD 20\.00 \/ PB2 \/ ✅ Sent /)
        );
        expect(mockCtx.api.deleteMessage).toHaveBeenCalledWith(123456789, 77);
        expect(mockCtx.editMessageText).not.toHaveBeenCalled();
      });

      it('Cancel on the QR photo cancels, replies ❌ Cancelled and deletes the photo', async () => {
        viewingPhoto('pb_cancel:PAY123:PB2');
        vi.mocked(mockRepository.updatePaybackStatus).mockResolvedValue({
          ...pendingPayback,
          status: 'cancelled',
        });

        await handler.handleCallback(mockCtx);

        expect(mockRepository.updatePaybackStatus).toHaveBeenCalledWith(
          'PB2',
          'cancelled',
          expect.stringMatching(/^\d{4}-/)
        );
        expect(mockCtx.answerCallbackQuery).toHaveBeenCalledWith({ text: '❌ Payback cancelled' });
        expect(mockCtx.reply).toHaveBeenCalledWith(
          'Payback for PAY123 / SGD 20.00 / PB2 / ❌ Cancelled'
        );
        expect(mockCtx.api.deleteMessage).toHaveBeenCalledWith(123456789, 77);
      });

      it('status lines carry "To: <name>" only when the recipient is the stored payer', async () => {
        const named = {
          ...detailPayment,
          payerType: 'uen' as const,
          payerValue: '201234567A',
          payerName: 'Alice',
        };
        viewingPhoto('pb_cancel:PAY123:PB2');
        vi.mocked(mockRepository.getPaymentByRef).mockResolvedValue(named);
        vi.mocked(mockRepository.updatePaybackStatus).mockResolvedValue({
          ...pendingPayback,
          status: 'cancelled',
        });

        await handler.handleCallback(mockCtx);
        expect(mockCtx.reply).toHaveBeenLastCalledWith(
          'Payback for PAY123 / SGD 20.00 / PB2 / To: Alice / ❌ Cancelled'
        );

        // Recipient was changed to another proxy → no name segment
        vi.mocked(mockRepository.getPaybackByRef).mockResolvedValue({
          ...pendingPayback,
          payerValue: '+6598765432',
        });
        await handler.handleCallback(mockCtx);
        expect(mockCtx.reply).toHaveBeenLastCalledWith(
          'Payback for PAY123 / SGD 20.00 / PB2 / ❌ Cancelled'
        );
      });

      it('detail history shows "Name (proxy)" for the stored payer and the bare proxy otherwise', async () => {
        const named = {
          ...detailPayment,
          payerType: 'uen' as const,
          payerValue: '201234567A',
          payerName: 'Al_ice',
        };
        mockCtx.callbackQuery!.data = 'view:PAY123';
        vi.mocked(mockRepository.getPaymentByRef).mockResolvedValue(named);
        vi.mocked(mockRepository.listPaybacksByPayment).mockResolvedValue([
          pendingPayback,
          { ...pendingPayback, id: 3, ref: 'PB3', payerValue: '+6598765432' },
        ]);

        await handler.handleCallback(mockCtx);

        const message = vi.mocked(mockCtx.editMessageText).mock.calls[0]![0] as string;
        expect(message).toContain('$20.00 to Al\\_ice (201234567A)');
        expect(message).toContain('$20.00 to +6598765432');
      });

      it('still succeeds when the photo cannot be deleted', async () => {
        viewingPhoto('pb_cancel:PAY123:PB2');
        vi.mocked(mockRepository.updatePaybackStatus).mockResolvedValue({
          ...pendingPayback,
          status: 'cancelled',
        });
        vi.mocked(mockCtx.api.deleteMessage).mockRejectedValue(new Error('too old'));

        await expect(handler.handleCallback(mockCtx)).resolves.toBeUndefined();
        expect(mockCtx.reply).toHaveBeenCalled();
      });

      it('Cancel from the detail view re-renders with the payback marked cancelled', async () => {
        setupPaybackView();
        mockCtx.callbackQuery!.data = 'pb_cancel:PAY123:PB2';
        const cancelled = { ...pendingPayback, status: 'cancelled' as const };
        vi.mocked(mockRepository.updatePaybackStatus).mockResolvedValue(cancelled);
        vi.mocked(mockRepository.listPaybacksByPayment).mockResolvedValue([cancelled]);

        await handler.handleCallback(mockCtx);

        const message = vi.mocked(mockCtx.editMessageText).mock.calls[0]![0] as string;
        expect(message).toContain('❌ $20.00 to 201234567A');
        expect(message).toContain('(cancelled)');
        expect(message).toContain('*Total Payback:* $0.00');
        expect(message).toContain('*Remaining:* $100.00');
        expect(mockCtx.reply).not.toHaveBeenCalled();
      });

      it('refuses to cancel a sent payback and changes nothing', async () => {
        setupPaybackView();
        mockCtx.callbackQuery!.data = 'pb_cancel:PAY123:PB2';
        vi.mocked(mockRepository.getPaybackByRef).mockResolvedValue({
          ...pendingPayback,
          status: 'sent',
          sentAt: '2024-01-16T09:00:00Z',
        });

        await handler.handleCallback(mockCtx);

        expect(mockCtx.answerCallbackQuery).toHaveBeenCalledWith({
          text: '⚠️ Payback was already sent — it can’t be cancelled',
        });
        expect(mockRepository.updatePaybackStatus).not.toHaveBeenCalled();
      });

      it('refuses Sent on a cancelled payback and a repeat Cancel', async () => {
        setupPaybackView();
        vi.mocked(mockRepository.getPaybackByRef).mockResolvedValue({
          ...pendingPayback,
          status: 'cancelled',
        });

        mockCtx.callbackQuery!.data = 'pb_sent:PAY123:PB2';
        await handler.handleCallback(mockCtx);
        expect(mockCtx.answerCallbackQuery).toHaveBeenLastCalledWith({
          text: '⚠️ Payback was cancelled',
        });

        mockCtx.callbackQuery!.data = 'pb_cancel:PAY123:PB2';
        await handler.handleCallback(mockCtx);
        expect(mockCtx.answerCallbackQuery).toHaveBeenLastCalledWith({
          text: '⚠️ Payback already cancelled',
        });
        expect(mockRepository.updatePaybackStatus).not.toHaveBeenCalled();
      });
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
