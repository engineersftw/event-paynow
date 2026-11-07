import type { Context } from 'grammy';
import { InputFile } from 'grammy';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { PaybackCommandHandler } from '../../src/commands/payback-handler.js';
import type { CreatePaybackBoundedResult, Payment, Repository } from '../../src/db/repository.js';
import { buildPayNowPayload } from '../../src/sgqr/paynow.js';
import type { ConversationDO } from '../../src/worker/conversation-do.js';

describe('PaybackCommandHandler', () => {
  let handler: PaybackCommandHandler;
  let mockConversationDO: ConversationDO;
  let mockRepository: Repository;
  let mockCtx: Context;

  /** Payback-flow conversation state fixture (step 2+ contexts carry pendingPayer). */
  function paybackState(step: number, context: Record<string, unknown> = {}, flow = 'payback') {
    return {
      flow,
      step,
      context: {
        paymentRef: 'PAY123',
        paymentId: 42,
        paymentAmount: 1000,
        paymentDescription: 'Test payment',
        ...context,
      },
      lastActivity: new Date().toISOString(),
    };
  }

  function stateResponse(state: unknown) {
    return { status: 200, json: async () => state } as unknown as Response;
  }

  const okResponse = { status: 200 } as unknown as Response;

  /** Extract JSON bodies of all POST /state calls (setState) in order. */
  async function postedStates(): Promise<Array<Record<string, unknown>>> {
    const out: Array<Record<string, unknown>> = [];
    for (const [request] of vi.mocked(mockConversationDO.fetch).mock.calls) {
      const req = request as Request;
      if (req.method === 'POST') {
        out.push(JSON.parse(await req.text()) as Record<string, unknown>);
      }
    }
    return out;
  }

  /** Last reply text sent to the user. */
  function lastReply(): string {
    const calls = vi.mocked(mockCtx.reply).mock.calls;
    return String(calls[calls.length - 1]?.[0] ?? '');
  }

  const receivedPayment: Payment = {
    id: 42,
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

  beforeEach(() => {
    mockConversationDO = {
      fetch: vi.fn().mockResolvedValue(
        stateResponse({
          flow: 'idle',
          step: 0,
          context: {},
          lastActivity: new Date().toISOString(),
        })
      ),
    } as unknown as ConversationDO;

    mockRepository = {
      getPaymentByRef: vi.fn(),
      sumPaybacks: vi.fn().mockResolvedValue(0),
      createPaybackBounded: vi.fn(),
    } as unknown as Repository;

    mockCtx = {
      from: { id: 123456789 },
      chat: { id: 123456789 },
      reply: vi.fn(),
      replyWithPhoto: vi.fn(),
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
      expect(lastReply()).toContain('not found');
    });

    it('should reject if payment belongs to different user', async () => {
      vi.mocked(mockRepository.getPaymentByRef).mockResolvedValue({
        ...receivedPayment,
        userId: 999999999,
      });

      await handler.start(mockCtx, 'PAY123');

      expect(mockCtx.reply).toHaveBeenCalledWith('❌ You do not own this payment.');
    });

    it('should reject if payment not yet received', async () => {
      vi.mocked(mockRepository.getPaymentByRef).mockResolvedValue({
        ...receivedPayment,
        status: 'pending',
        receivedAt: null,
      });

      await handler.start(mockCtx, 'PAY123');

      expect(mockCtx.reply).toHaveBeenCalledWith(
        '⚠️ You can only create paybacks for received payments.'
      );
    });

    it('should start payback flow for valid received payment and store paymentId', async () => {
      vi.mocked(mockRepository.getPaymentByRef).mockResolvedValue(receivedPayment);

      await handler.start(mockCtx, 'PAY123');

      expect(mockCtx.reply).toHaveBeenCalled();
      expect(lastReply()).toContain('Payback for Payment');
      expect(lastReply()).toContain('PAY123');
      expect(lastReply()).toContain('$10.00');

      const states = await postedStates();
      expect(states).toHaveLength(1);
      const state = states[0] as { step: number; context: Record<string, unknown> };
      expect(state.step).toBe(1);
      expect(state.context.paymentId).toBe(42);
      expect(state.context.paymentRef).toBe('PAY123');
    });
  });

  describe('handleInput - Step 1: Payer Reference', () => {
    it('should accept valid mobile number and prompt for confirmation', async () => {
      const ctx = { ...mockCtx, message: { text: '91234567' } } as unknown as Context;

      vi.mocked(mockConversationDO.fetch)
        .mockResolvedValueOnce(stateResponse(paybackState(1)))
        .mockResolvedValueOnce(okResponse); // setState

      const result = await handler.handleInput(ctx);

      expect(result).toBe(true);
      expect(lastReply()).toContain('Mobile number: +6591234567');
      expect(lastReply()).toContain('Type "confirm" to continue');
    });

    it('should accept valid UEN and prompt for confirmation', async () => {
      const ctx = { ...mockCtx, message: { text: '201234567A' } } as unknown as Context;

      vi.mocked(mockConversationDO.fetch)
        .mockResolvedValueOnce(stateResponse(paybackState(1)))
        .mockResolvedValueOnce(okResponse);

      const result = await handler.handleInput(ctx);

      expect(result).toBe(true);
      expect(lastReply()).toContain('UEN: 201234567A');
    });

    it('should reject invalid payer reference and re-prompt without advancing', async () => {
      const ctx = { ...mockCtx, message: { text: 'invalid' } } as unknown as Context;

      vi.mocked(mockConversationDO.fetch).mockResolvedValueOnce(stateResponse(paybackState(1)));

      const result = await handler.handleInput(ctx);

      expect(result).toBe(true);
      expect(lastReply()).toContain('Invalid PayNow reference');
      // Only getState was called — no state advance
      expect(mockConversationDO.fetch).toHaveBeenCalledTimes(1);
    });
  });

  describe('handleInput - Step 2: Payer Confirmation', () => {
    it('should proceed to amount prompt showing remaining bound', async () => {
      const ctx = { ...mockCtx, message: { text: 'confirm' } } as unknown as Context;

      vi.mocked(mockConversationDO.fetch)
        .mockResolvedValueOnce(
          stateResponse(
            paybackState(2, {
              pendingPayer: { type: 'mobile', normalized: '+6591234567' },
            })
          )
        )
        .mockResolvedValueOnce(okResponse); // setState step 3
      vi.mocked(mockRepository.sumPaybacks).mockResolvedValue(0);

      const result = await handler.handleInput(ctx);

      expect(result).toBe(true);
      expect(mockRepository.sumPaybacks).toHaveBeenCalledWith(42);
      expect(lastReply()).toContain('Enter payback amount');
      expect(lastReply()).toContain('Maximum payback: $10.00');
      expect(lastReply()).toContain('Already paid back: $0.00');

      const states = await postedStates();
      const state = states[states.length - 1] as { step: number; context: Record<string, unknown> };
      expect(state.step).toBe(3);
      expect(state.context.remainingCents).toBe(1000);
    });

    it('should reduce maximum by existing paybacks (12.50 minus 8.00 → 4.50)', async () => {
      const ctx = { ...mockCtx, message: { text: 'confirm' } } as unknown as Context;

      vi.mocked(mockConversationDO.fetch)
        .mockResolvedValueOnce(
          stateResponse(
            paybackState(2, {
              paymentAmount: 1250,
              pendingPayer: { type: 'mobile', normalized: '+6591234567' },
            })
          )
        )
        .mockResolvedValueOnce(okResponse);
      vi.mocked(mockRepository.sumPaybacks).mockResolvedValue(800);

      await handler.handleInput(ctx);

      expect(lastReply()).toContain('Already paid back: $8.00');
      expect(lastReply()).toContain('Maximum payback: $4.50');
    });

    it('should refuse when the payment is already fully paid back', async () => {
      const ctx = { ...mockCtx, message: { text: 'confirm' } } as unknown as Context;

      vi.mocked(mockConversationDO.fetch)
        .mockResolvedValueOnce(
          stateResponse(
            paybackState(2, {
              pendingPayer: { type: 'mobile', normalized: '+6591234567' },
            })
          )
        )
        .mockResolvedValueOnce(okResponse); // reset to idle
      vi.mocked(mockRepository.sumPaybacks).mockResolvedValue(1000);

      await handler.handleInput(ctx);

      expect(lastReply()).toContain('fully paid back');
      expect(lastReply()).not.toContain('Enter payback amount');

      const states = await postedStates();
      expect(states[states.length - 1]).toMatchObject({ flow: 'idle', step: 0 });
    });

    it('should cancel on cancel input', async () => {
      const ctx = { ...mockCtx, message: { text: 'cancel' } } as unknown as Context;

      vi.mocked(mockConversationDO.fetch)
        .mockResolvedValueOnce(
          stateResponse(
            paybackState(2, {
              pendingPayer: { type: 'mobile', normalized: '+6591234567' },
            })
          )
        )
        .mockResolvedValueOnce(okResponse);

      const result = await handler.handleInput(ctx);

      expect(result).toBe(true);
      expect(mockCtx.reply).toHaveBeenCalledWith('❌ Payback cancelled.');
    });

    it('should re-prompt on invalid confirmation input', async () => {
      const ctx = { ...mockCtx, message: { text: 'maybe' } } as unknown as Context;

      vi.mocked(mockConversationDO.fetch).mockResolvedValueOnce(
        stateResponse(
          paybackState(2, {
            pendingPayer: { type: 'mobile', normalized: '+6591234567' },
          })
        )
      );

      await handler.handleInput(ctx);

      expect(mockCtx.reply).toHaveBeenCalledWith(
        'Please type "confirm" to continue or "cancel" to abort:'
      );
    });
  });

  describe('handleInput - Step 3: Amount Input', () => {
    const step3Context = {
      pendingPayer: { type: 'mobile', normalized: '+6591234567' },
      remainingCents: 1000,
    };

    it('should accept valid amount and prompt for confirmation', async () => {
      const ctx = { ...mockCtx, message: { text: '5.50' } } as unknown as Context;

      vi.mocked(mockConversationDO.fetch)
        .mockResolvedValueOnce(stateResponse(paybackState(3, step3Context)))
        .mockResolvedValueOnce(okResponse);
      vi.mocked(mockRepository.sumPaybacks).mockResolvedValue(0);

      const result = await handler.handleInput(ctx);

      expect(result).toBe(true);
      expect(lastReply()).toContain('Payback amount: $5.50');
    });

    it('should reject amount exceeding remaining bound and re-prompt', async () => {
      const ctx = { ...mockCtx, message: { text: '15.00' } } as unknown as Context;

      vi.mocked(mockConversationDO.fetch).mockResolvedValueOnce(
        stateResponse(paybackState(3, step3Context))
      );
      vi.mocked(mockRepository.sumPaybacks).mockResolvedValue(0);

      await handler.handleInput(ctx);

      expect(lastReply()).toContain('exceeds the remaining payable amount ($10.00)');
      // Stayed on step 3: no setState posted
      expect(mockConversationDO.fetch).toHaveBeenCalledTimes(1);
    });

    it('should reject amount that exceeds what is left after prior paybacks (5.00 > 4.50 remaining)', async () => {
      const ctx = { ...mockCtx, message: { text: '5.00' } } as unknown as Context;

      vi.mocked(mockConversationDO.fetch).mockResolvedValueOnce(
        stateResponse(
          paybackState(3, {
            ...step3Context,
            paymentAmount: 1250,
            remainingCents: 450,
          })
        )
      );
      vi.mocked(mockRepository.sumPaybacks).mockResolvedValue(800);

      await handler.handleInput(ctx);

      expect(lastReply()).toContain('exceeds the remaining payable amount ($4.50)');
    });

    it('should accept amount exactly equal to remaining', async () => {
      const ctx = { ...mockCtx, message: { text: '4.50' } } as unknown as Context;

      vi.mocked(mockConversationDO.fetch)
        .mockResolvedValueOnce(
          stateResponse(
            paybackState(3, {
              ...step3Context,
              paymentAmount: 1250,
              remainingCents: 450,
            })
          )
        )
        .mockResolvedValueOnce(okResponse);
      vi.mocked(mockRepository.sumPaybacks).mockResolvedValue(800);

      await handler.handleInput(ctx);

      expect(lastReply()).toContain('Payback amount: $4.50');
    });

    it('should reject invalid amount format without touching the database', async () => {
      const ctx = { ...mockCtx, message: { text: 'abc' } } as unknown as Context;

      vi.mocked(mockConversationDO.fetch).mockResolvedValueOnce(
        stateResponse(paybackState(3, step3Context))
      );

      await handler.handleInput(ctx);

      expect(lastReply()).toContain('Invalid amount');
      expect(mockRepository.sumPaybacks).not.toHaveBeenCalled();
    });

    it('should reject amounts with more than 2 decimals (12.505)', async () => {
      const ctx = { ...mockCtx, message: { text: '12.505' } } as unknown as Context;

      vi.mocked(mockConversationDO.fetch).mockResolvedValueOnce(
        stateResponse(paybackState(3, step3Context))
      );

      await handler.handleInput(ctx);

      expect(lastReply()).toContain('Invalid amount');
      expect(mockRepository.sumPaybacks).not.toHaveBeenCalled();
    });

    it('should refuse when a concurrent payback fully used the bound mid-conversation', async () => {
      const ctx = { ...mockCtx, message: { text: '5.00' } } as unknown as Context;

      vi.mocked(mockConversationDO.fetch)
        .mockResolvedValueOnce(stateResponse(paybackState(3, step3Context)))
        .mockResolvedValueOnce(okResponse); // reset
      vi.mocked(mockRepository.sumPaybacks).mockResolvedValue(1000);

      await handler.handleInput(ctx);

      expect(lastReply()).toContain('fully paid back');
      const states = await postedStates();
      expect(states[states.length - 1]).toMatchObject({ flow: 'idle', step: 0 });
    });
  });

  describe('handleInput - Step 4: Amount Confirmation (bounded record)', () => {
    const step4Context = {
      pendingPayer: { type: 'mobile', normalized: '+6591234567' },
      paymentAmount: 1250,
      remainingCents: 750,
      paybackAmount: 550,
    };

    function okBoundedResult(): CreatePaybackBoundedResult {
      return {
        ok: true,
        remainingCents: 700,
        payback: {
          id: 7,
          ref: 'ABCDEFGHIJK23456'.slice(0, 10),
          paymentId: 42,
          payerType: 'mobile',
          payerValue: '+6591234567',
          amountCents: 550,
          status: 'pending',
          qrPayload: 'placeholder',
          createdAt: '2024-01-01T00:00:00Z',
          sentAt: null,
        },
      };
    }

    it('should create the payback inside the bounded transaction on confirm', async () => {
      const ctx = { ...mockCtx, message: { text: 'confirm' } } as unknown as Context;

      vi.mocked(mockConversationDO.fetch)
        .mockResolvedValueOnce(stateResponse(paybackState(4, step4Context)))
        .mockResolvedValueOnce(okResponse); // reset to idle
      vi.mocked(mockRepository.createPaybackBounded).mockResolvedValue(okBoundedResult());

      const result = await handler.handleInput(ctx);

      expect(result).toBe(true);
      expect(mockRepository.createPaybackBounded).toHaveBeenCalledTimes(1);

      const input = vi.mocked(mockRepository.createPaybackBounded).mock.calls[0]![0];
      // 10-char base32 ref from the shared generator
      expect(input.ref).toMatch(/^[A-Z2-7]{10}$/);
      expect(input.paymentId).toBe(42);
      expect(input.payerType).toBe('mobile');
      expect(input.payerValue).toBe('+6591234567');
      expect(input.amountCents).toBe(550);
      expect(input.status).toBe('pending');
      expect(input.timestamp).toMatch(/^\d{4}-\d{2}-\d{2}T/);

      // Task 7.3: real SGQR payload — PAYER as payee proxy, payback ref embedded
      const expectedPayload = buildPayNowPayload({
        proxyType: 'mobile',
        proxyValue: '+6591234567',
        amountCents: 550,
        reference: input.ref,
        description: 'Refund PAY123',
      });
      expect(input.qrPayload).toBe(expectedPayload);
      expect(input.qrPayload).toContain('+6591234567');
      expect(input.qrPayload).toContain('54045.50');
      expect(input.qrPayload).not.toContain('PAYBACK-PENDING');

      // QR image uploaded with the payback caption
      expect(mockCtx.replyWithPhoto).toHaveBeenCalledTimes(1);
      const [photo, photoOpts] = vi.mocked(mockCtx.replyWithPhoto).mock.calls[0]!;
      expect(photo).toBeInstanceOf(InputFile);
      expect(String((photoOpts as { caption?: string }).caption)).toBe(
        'Payback for PAY123 / SGD 5.50 / ABCDEFGHIJ / Scan to send the money back'
      );

      // The reply echoes the stored row's reference, not the request input
      expect(lastReply()).toContain('Payback Recorded');
      expect(lastReply()).toContain('Payback reference: `ABCDEFGHIJ`');
      expect(lastReply()).toContain('Amount: $5.50');
      expect(lastReply()).toContain('Remaining payable: $7.00');
      expect(lastReply()).toContain('/payments');
    });

    it('should reset conversation after successful record', async () => {
      const ctx = { ...mockCtx, message: { text: 'confirm' } } as unknown as Context;

      vi.mocked(mockConversationDO.fetch)
        .mockResolvedValueOnce(stateResponse(paybackState(4, step4Context)))
        .mockResolvedValueOnce(okResponse);
      vi.mocked(mockRepository.createPaybackBounded).mockResolvedValue(okBoundedResult());

      await handler.handleInput(ctx);

      const states = await postedStates();
      expect(states[states.length - 1]).toMatchObject({ flow: 'idle', step: 0, context: {} });
    });

    it('should bounce back to amount step when the in-transaction re-check blocks', async () => {
      const ctx = { ...mockCtx, message: { text: 'confirm' } } as unknown as Context;

      vi.mocked(mockConversationDO.fetch)
        .mockResolvedValueOnce(stateResponse(paybackState(4, step4Context)))
        .mockResolvedValueOnce(okResponse); // setState back to step 3
      vi.mocked(mockRepository.createPaybackBounded).mockResolvedValue({
        ok: false,
        reason: 'over_bound',
        paymentAmountCents: 1250,
        paidBackCents: 800,
        remainingCents: 450,
      });

      await handler.handleInput(ctx);

      expect(lastReply()).toContain('exceeds the remaining payable amount ($4.50)');
      expect(lastReply()).toContain('Another payback may have landed just now');
      expect(mockCtx.replyWithPhoto).not.toHaveBeenCalled();

      const states = await postedStates();
      const state = states[states.length - 1] as {
        flow: string;
        step: number;
        context: Record<string, unknown>;
      };
      expect(state.flow).toBe('payback');
      expect(state.step).toBe(3);
      // The refused amount is cleared from the conversation context
      expect(state.context.paybackAmount).toBeUndefined();
    });

    it('should refuse with fully-paid-back message when nothing remains', async () => {
      const ctx = { ...mockCtx, message: { text: 'confirm' } } as unknown as Context;

      vi.mocked(mockConversationDO.fetch)
        .mockResolvedValueOnce(stateResponse(paybackState(4, step4Context)))
        .mockResolvedValueOnce(okResponse); // reset
      vi.mocked(mockRepository.createPaybackBounded).mockResolvedValue({
        ok: false,
        reason: 'over_bound',
        paymentAmountCents: 1250,
        paidBackCents: 1250,
        remainingCents: 0,
      });

      await handler.handleInput(ctx);

      expect(lastReply()).toContain('fully paid back');
      expect(mockCtx.replyWithPhoto).not.toHaveBeenCalled();
      const states = await postedStates();
      expect(states[states.length - 1]).toMatchObject({ flow: 'idle', step: 0 });
    });

    it('should report when the payment no longer exists', async () => {
      const ctx = { ...mockCtx, message: { text: 'confirm' } } as unknown as Context;

      vi.mocked(mockConversationDO.fetch)
        .mockResolvedValueOnce(stateResponse(paybackState(4, step4Context)))
        .mockResolvedValueOnce(okResponse); // reset
      vi.mocked(mockRepository.createPaybackBounded).mockResolvedValue({
        ok: false,
        reason: 'payment_not_found',
      });

      await handler.handleInput(ctx);

      expect(lastReply()).toContain('no longer exists');
      expect(mockCtx.replyWithPhoto).not.toHaveBeenCalled();
    });

    it('should handle repository errors gracefully', async () => {
      const ctx = { ...mockCtx, message: { text: 'confirm' } } as unknown as Context;

      vi.mocked(mockConversationDO.fetch).mockResolvedValueOnce(
        stateResponse(paybackState(4, step4Context))
      );
      vi.mocked(mockRepository.createPaybackBounded).mockRejectedValue(new Error('DB error'));

      await handler.handleInput(ctx);

      expect(lastReply()).toContain('Failed to record the payback');
    });

    it('should cancel on cancel input', async () => {
      const ctx = { ...mockCtx, message: { text: 'cancel' } } as unknown as Context;

      vi.mocked(mockConversationDO.fetch)
        .mockResolvedValueOnce(stateResponse(paybackState(4, step4Context)))
        .mockResolvedValueOnce(okResponse);

      const result = await handler.handleInput(ctx);

      expect(result).toBe(true);
      expect(mockCtx.reply).toHaveBeenCalledWith('❌ Payback cancelled.');
      expect(mockRepository.createPaybackBounded).not.toHaveBeenCalled();
    });
  });

  describe('handleInput - Not in payback flow', () => {
    it('should return false when idle', async () => {
      const ctx = { ...mockCtx, message: { text: '91234567' } } as unknown as Context;

      vi.mocked(mockConversationDO.fetch).mockResolvedValueOnce(
        stateResponse({
          flow: 'idle',
          step: 0,
          context: {},
          lastActivity: new Date().toISOString(),
        })
      );

      const result = await handler.handleInput(ctx);

      expect(result).toBe(false);
      expect(mockRepository.createPaybackBounded).not.toHaveBeenCalled();
    });

    it('should return false for a different active flow', async () => {
      const ctx = { ...mockCtx, message: { text: '91234567' } } as unknown as Context;

      vi.mocked(mockConversationDO.fetch).mockResolvedValueOnce(
        stateResponse({
          flow: 'init',
          step: 1,
          context: {},
          lastActivity: new Date().toISOString(),
        })
      );

      const result = await handler.handleInput(ctx);

      expect(result).toBe(false);
    });
  });
});
