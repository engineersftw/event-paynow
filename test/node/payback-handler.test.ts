import { describe, it, expect, beforeEach, vi } from 'vitest';
import { PaybackCommandHandler } from '../../src/commands/payback-handler.js';
import type { Context } from 'grammy';
import type { ConversationDO } from '../../src/worker/conversation-do.js';
import type { Repository, Payment } from '../../src/db/repository.js';

describe('PaybackCommandHandler', () => {
  let handler: PaybackCommandHandler;
  let mockConversationDO: ConversationDO;
  let mockRepository: Repository;
  let mockCtx: Context;

  beforeEach(() => {
    mockConversationDO = {
      fetch: vi.fn().mockResolvedValue({
        status: 200,
        json: async () => ({ flow: 'idle', step: 0, context: {}, lastActivity: new Date().toISOString() })
      })
    } as unknown as ConversationDO;

    mockRepository = {
      getPaymentByRef: vi.fn(),
    } as unknown as Repository;

    mockCtx = {
      from: { id: 123456789 },
      reply: vi.fn(),
    } as unknown as Context;

    handler = new PaybackCommandHandler(mockConversationDO, mockRepository);
  });

  describe('start', () => {
    it('should reject if no payment reference provided', async () => {
      await handler.start(mockCtx);

      expect(mockCtx.reply).toHaveBeenCalledWith(
        expect.stringContaining('Please provide a payment reference')
      );
    });

    it('should reject if payment not found', async () => {
      vi.mocked(mockRepository.getPaymentByRef).mockResolvedValue(null);

      await handler.start(mockCtx, 'PAY123');

      expect(mockRepository.getPaymentByRef).toHaveBeenCalledWith('PAY123');
      expect(mockCtx.reply).toHaveBeenCalled();
      const replyCall = vi.mocked(mockCtx.reply).mock.calls[0];
      expect(replyCall[0]).toContain('not found');
    });

    it('should reject if payment belongs to different user', async () => {
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

      vi.mocked(mockRepository.getPaymentByRef).mockResolvedValue(payment);

      await handler.start(mockCtx, 'PAY123');

      expect(mockCtx.reply).toHaveBeenCalledWith('❌ You do not own this payment.');
    });

    it('should reject if payment not yet received', async () => {
      const payment: Payment = {
        id: 1,
        ref: 'PAY123',
        userId: 123456789,
        amountCents: 1000,
        status: 'pending', // Not received yet
        createdAt: new Date().toISOString(),
        description: 'Test payment',
        payeeType: 'mobile',
        payeeValue: '+6512345678',
        qrPayload: 'test-payload',
        source: 'manual',
        receivedAt: null,
      };

      vi.mocked(mockRepository.getPaymentByRef).mockResolvedValue(payment);

      await handler.start(mockCtx, 'PAY123');

      expect(mockCtx.reply).toHaveBeenCalledWith(
        '⚠️ You can only create paybacks for received payments.'
      );
    });

    it('should start payback flow for valid received payment', async () => {
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

      vi.mocked(mockRepository.getPaymentByRef).mockResolvedValue(payment);

      await handler.start(mockCtx, 'PAY123');

      expect(mockConversationDO.fetch).toHaveBeenCalled();
      expect(mockCtx.reply).toHaveBeenCalled();
      const replyCall = vi.mocked(mockCtx.reply).mock.calls[0];
      expect(replyCall[0]).toContain('Payback for Payment');
      expect(replyCall[0]).toContain('PAY123');
      expect(replyCall[0]).toContain('$10.00');
    });
  });

  describe('handleInput - Step 1: Payer Reference', () => {
    it('should accept valid mobile number and prompt for confirmation', async () => {
      const mockCtxWithMessage = {
        ...mockCtx,
        message: { text: '91234567' },
      } as unknown as Context;

      // Mock getState to return payback flow, step 1
      vi.mocked(mockConversationDO.fetch)
        .mockResolvedValueOnce({
          status: 200,
          json: async () => ({
            flow: 'payback',
            step: 1,
            context: { 
              paymentRef: 'PAY123',
              paymentAmount: 1000,
              paymentDescription: 'Test'
            },
            lastActivity: new Date().toISOString()
          })
        })
        .mockResolvedValueOnce({ status: 200 }); // setState

      const result = await handler.handleInput(mockCtxWithMessage);

      expect(result).toBe(true);
      expect(mockConversationDO.fetch).toHaveBeenCalledTimes(2);
      expect(mockCtx.reply).toHaveBeenCalledWith(
        expect.stringContaining('Mobile number: +6591234567')
      );
      expect(mockCtx.reply).toHaveBeenCalledWith(
        expect.stringContaining('Type "confirm" to continue')
      );
    });

    it('should accept valid UEN and prompt for confirmation', async () => {
      const mockCtxWithMessage = {
        ...mockCtx,
        message: { text: '201234567A' },
      } as unknown as Context;

      vi.mocked(mockConversationDO.fetch)
        .mockResolvedValueOnce({
          status: 200,
          json: async () => ({
            flow: 'payback',
            step: 1,
            context: { 
              paymentRef: 'PAY123',
              paymentAmount: 1000,
              paymentDescription: 'Test'
            },
            lastActivity: new Date().toISOString()
          })
        })
        .mockResolvedValueOnce({ status: 200 });

      const result = await handler.handleInput(mockCtxWithMessage);

      expect(result).toBe(true);
      expect(mockCtx.reply).toHaveBeenCalledWith(
        expect.stringContaining('UEN: 201234567A')
      );
    });

    it('should reject invalid payer reference and re-prompt', async () => {
      const mockCtxWithMessage = {
        ...mockCtx,
        message: { text: 'invalid' },
      } as unknown as Context;

      vi.mocked(mockConversationDO.fetch).mockResolvedValueOnce({
        status: 200,
        json: async () => ({
          flow: 'payback',
          step: 1,
          context: { 
            paymentRef: 'PAY123',
            paymentAmount: 1000,
            paymentDescription: 'Test'
          },
          lastActivity: new Date().toISOString()
        })
      });

      const result = await handler.handleInput(mockCtxWithMessage);

      expect(result).toBe(true);
      expect(mockCtx.reply).toHaveBeenCalledWith(
        expect.stringContaining('Invalid PayNow reference')
      );
    });
  });

  describe('handleInput - Step 2: Payer Confirmation', () => {
    it('should proceed to amount prompt on confirm', async () => {
      const mockCtxWithMessage = {
        ...mockCtx,
        message: { text: 'confirm' },
      } as unknown as Context;

      vi.mocked(mockConversationDO.fetch)
        .mockResolvedValueOnce({
          status: 200,
          json: async () => ({
            flow: 'payback',
            step: 2,
            context: { 
              paymentRef: 'PAY123',
              paymentAmount: 1000,
              pendingPayer: { type: 'mobile', normalized: '+6591234567' }
            },
            lastActivity: new Date().toISOString()
          })
        })
        .mockResolvedValueOnce({ status: 200 });

      const result = await handler.handleInput(mockCtxWithMessage);

      expect(result).toBe(true);
      expect(mockCtx.reply).toHaveBeenCalledWith(
        expect.stringContaining('Enter payback amount'),
        { parse_mode: 'Markdown' }
      );
    });

    it('should cancel on cancel input', async () => {
      const mockCtxWithMessage = {
        ...mockCtx,
        message: { text: 'cancel' },
      } as unknown as Context;

      vi.mocked(mockConversationDO.fetch)
        .mockResolvedValueOnce({
          status: 200,
          json: async () => ({
            flow: 'payback',
            step: 2,
            context: { 
              paymentRef: 'PAY123',
              paymentAmount: 1000,
              pendingPayer: { type: 'mobile', normalized: '+6591234567' }
            },
            lastActivity: new Date().toISOString()
          })
        })
        .mockResolvedValueOnce({ status: 200 });

      const result = await handler.handleInput(mockCtxWithMessage);

      expect(result).toBe(true);
      expect(mockCtx.reply).toHaveBeenCalledWith('❌ Payback cancelled.');
    });

    it('should re-prompt on invalid confirmation input', async () => {
      const mockCtxWithMessage = {
        ...mockCtx,
        message: { text: 'maybe' },
      } as unknown as Context;

      vi.mocked(mockConversationDO.fetch).mockResolvedValueOnce({
        status: 200,
        json: async () => ({
          flow: 'payback',
          step: 2,
          context: { 
            paymentRef: 'PAY123',
            paymentAmount: 1000,
            pendingPayer: { type: 'mobile', normalized: '+6591234567' }
          },
          lastActivity: new Date().toISOString()
        })
      });

      const result = await handler.handleInput(mockCtxWithMessage);

      expect(result).toBe(true);
      expect(mockCtx.reply).toHaveBeenCalledWith(
        'Please type "confirm" to continue or "cancel" to abort:'
      );
    });
  });

  describe('handleInput - Step 3: Amount Input', () => {
    it('should accept valid amount and prompt for confirmation', async () => {
      const mockCtxWithMessage = {
        ...mockCtx,
        message: { text: '5.50' },
      } as unknown as Context;

      vi.mocked(mockConversationDO.fetch)
        .mockResolvedValueOnce({
          status: 200,
          json: async () => ({
            flow: 'payback',
            step: 3,
            context: { 
              paymentRef: 'PAY123',
              paymentAmount: 1000,
              pendingPayer: { type: 'mobile', normalized: '+6591234567' }
            },
            lastActivity: new Date().toISOString()
          })
        })
        .mockResolvedValueOnce({ status: 200 });

      const result = await handler.handleInput(mockCtxWithMessage);

      expect(result).toBe(true);
      expect(mockCtx.reply).toHaveBeenCalledWith(
        expect.stringContaining('Payback amount: $5.50')
      );
    });

    it('should reject amount exceeding original payment', async () => {
      const mockCtxWithMessage = {
        ...mockCtx,
        message: { text: '15.00' },
      } as unknown as Context;

      vi.mocked(mockConversationDO.fetch).mockResolvedValueOnce({
        status: 200,
        json: async () => ({
          flow: 'payback',
          step: 3,
          context: { 
            paymentRef: 'PAY123',
            paymentAmount: 1000, // $10.00
            pendingPayer: { type: 'mobile', normalized: '+6591234567' }
          },
          lastActivity: new Date().toISOString()
        })
      });

      const result = await handler.handleInput(mockCtxWithMessage);

      expect(result).toBe(true);
      expect(mockCtx.reply).toHaveBeenCalledWith(
        expect.stringContaining('exceeds original payment amount')
      );
    });

    it('should reject invalid amount format', async () => {
      const mockCtxWithMessage = {
        ...mockCtx,
        message: { text: 'abc' },
      } as unknown as Context;

      vi.mocked(mockConversationDO.fetch).mockResolvedValueOnce({
        status: 200,
        json: async () => ({
          flow: 'payback',
          step: 3,
          context: { 
            paymentRef: 'PAY123',
            paymentAmount: 1000,
            pendingPayer: { type: 'mobile', normalized: '+6591234567' }
          },
          lastActivity: new Date().toISOString()
        })
      });

      const result = await handler.handleInput(mockCtxWithMessage);

      expect(result).toBe(true);
      expect(mockCtx.reply).toHaveBeenCalledWith(
        expect.stringContaining('Invalid amount')
      );
    });
  });

  describe('handleInput - Step 4: Amount Confirmation', () => {
    it('should generate payback QR on confirm', async () => {
      const mockCtxWithMessage = {
        ...mockCtx,
        message: { text: 'confirm' },
      } as unknown as Context;

      vi.mocked(mockConversationDO.fetch)
        .mockResolvedValueOnce({
          status: 200,
          json: async () => ({
            flow: 'payback',
            step: 4,
            context: { 
              paymentRef: 'PAY123',
              paymentAmount: 1000,
              pendingPayer: { type: 'mobile', normalized: '+6591234567' },
              paybackAmount: 550
            },
            lastActivity: new Date().toISOString()
          })
        })
        .mockResolvedValueOnce({ status: 200 }) // setState
        .mockResolvedValueOnce({ status: 200 }); // final setState

      const result = await handler.handleInput(mockCtxWithMessage);

      expect(result).toBe(true);
      expect(mockCtx.reply).toHaveBeenCalled();
      const replyCall = vi.mocked(mockCtx.reply).mock.calls[0];
      expect(replyCall[0]).toContain('Payback QR Generated');
      expect(replyCall[0]).toContain('$5.50');
    });

    it('should cancel on cancel input', async () => {
      const mockCtxWithMessage = {
        ...mockCtx,
        message: { text: 'cancel' },
      } as unknown as Context;

      vi.mocked(mockConversationDO.fetch)
        .mockResolvedValueOnce({
          status: 200,
          json: async () => ({
            flow: 'payback',
            step: 4,
            context: { 
              paymentRef: 'PAY123',
              paymentAmount: 1000,
              pendingPayer: { type: 'mobile', normalized: '+6591234567' },
              paybackAmount: 550
            },
            lastActivity: new Date().toISOString()
          })
        })
        .mockResolvedValueOnce({ status: 200 });

      const result = await handler.handleInput(mockCtxWithMessage);

      expect(result).toBe(true);
      expect(mockCtx.reply).toHaveBeenCalledWith('❌ Payback cancelled.');
    });
  });

  describe('handleInput - Not in payback flow', () => {
    it('should return false when not in payback flow', async () => {
      const mockCtxWithMessage = {
        ...mockCtx,
        message: { text: '91234567' },
      } as unknown as Context;

      vi.mocked(mockConversationDO.fetch).mockResolvedValueOnce({
        status: 200,
        json: async () => ({
          flow: 'idle',
          step: 0,
          context: {},
          lastActivity: new Date().toISOString()
        })
      });

      const result = await handler.handleInput(mockCtxWithMessage);

      expect(result).toBe(false);
    });
  });
});
