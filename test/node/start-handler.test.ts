import { describe, it, expect, beforeEach, vi } from 'vitest';
import { InputFile } from 'grammy';
import { StartCommandHandler } from '../../src/commands/start-handler.js';
import type { Context } from 'grammy';
import type { ConversationDO } from '../../src/worker/conversation-do.js';
import type { Repository, User, Payment } from '../../src/db/repository.js';
import { buildPayNowPayload } from '../../src/sgqr/paynow.js';

describe('StartCommandHandler', () => {
  let handler: StartCommandHandler;
  let mockConversationDO: ConversationDO;
  let mockRepository: Repository;
  let mockCtx: Context;

  const configuredUser: User = {
    telegramId: 123456789,
    payeeType: 'mobile',
    payeeValue: '+6591234567',
    displayName: 'Test User',
    createdAt: '2024-01-01T00:00:00Z',
    updatedAt: '2024-01-01T00:00:00Z',
  };

  function startState(step: number, context: Record<string, unknown> = {}) {
    return {
      flow: 'start',
      step,
      context: {
        payeeType: 'mobile',
        payeeValue: '+6591234567',
        displayName: 'Test User',
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

  function lastReply(): string {
    const calls = vi.mocked(mockCtx.reply).mock.calls;
    return String(calls[calls.length - 1]?.[0] ?? '');
  }

  beforeEach(() => {
    mockConversationDO = {
      fetch: vi.fn().mockResolvedValue(
        stateResponse({ flow: 'idle', step: 0, context: {}, lastActivity: new Date().toISOString() })
      ),
    } as unknown as ConversationDO;

    mockRepository = {
      getUser: vi.fn(),
      createPayment: vi.fn(async (input) => ({
        id: 1,
        ref: input.ref,
        userId: input.userId,
        description: input.description,
        amountCents: input.amountCents,
        payeeType: input.payeeType,
        payeeValue: input.payeeValue,
        status: input.status,
        source: input.source,
        qrPayload: input.qrPayload,
        createdAt: input.timestamp,
        receivedAt: null,
      })),
    } as unknown as Repository;

    mockCtx = {
      from: { id: 123456789 },
      chat: { id: 123456789 },
      reply: vi.fn(),
      replyWithPhoto: vi.fn(),
    } as unknown as Context;

    handler = new StartCommandHandler(mockConversationDO, mockRepository);
  });

  describe('start — guard (task 5.1)', () => {
    it('prompts unconfigured users to run /init and does not start a flow', async () => {
      vi.mocked(mockRepository.getUser).mockResolvedValue(null);

      await handler.start(mockCtx);

      expect(mockRepository.getUser).toHaveBeenCalledWith(123456789);
      expect(lastReply()).toContain('run /init first');
      // No conversation state was created for the start flow
      expect(mockConversationDO.fetch).not.toHaveBeenCalled();
      // No QR and no payment
      expect(mockCtx.replyWithPhoto).not.toHaveBeenCalled();
      expect(mockRepository.createPayment).not.toHaveBeenCalled();
    });

    it('starts the flow for configured users and snapshots the payee', async () => {
      vi.mocked(mockRepository.getUser).mockResolvedValue(configuredUser);

      await handler.start(mockCtx);

      const states = await postedStates();
      expect(states).toHaveLength(1);
      const state = states[0] as { flow: string; step: number; context: Record<string, unknown> };
      expect(state.flow).toBe('start');
      expect(state.step).toBe(1);
      expect(state.context).toMatchObject({
        payeeType: 'mobile',
        payeeValue: '+6591234567',
        displayName: 'Test User',
      });

      expect(lastReply()).toContain('Enter a short description');
    });

    it('handles repository errors gracefully', async () => {
      vi.mocked(mockRepository.getUser).mockRejectedValue(new Error('DB error'));

      await handler.start(mockCtx);

      expect(lastReply()).toContain('Failed to start');
    });
  });

  describe('step 1 — description collection (task 5.2)', () => {
    it('accepts a description and prompts for the amount', async () => {
      const ctx = { ...mockCtx, message: { text: 'Dinner split' } } as unknown as Context;

      vi.mocked(mockConversationDO.fetch)
        .mockResolvedValueOnce(stateResponse(startState(1)))
        .mockResolvedValueOnce(okResponse);

      const consumed = await handler.handleInput(ctx);

      expect(consumed).toBe(true);
      expect(lastReply()).toContain('Enter the amount');

      const states = await postedStates();
      const state = states[states.length - 1] as { step: number; context: Record<string, unknown> };
      expect(state.step).toBe(2);
      expect(state.context.description).toBe('Dinner split');
    });
  });

  describe('step 2 — amount validation (task 5.2)', () => {
    it('re-prompts on non-numeric input and creates nothing', async () => {
      const ctx = { ...mockCtx, message: { text: 'abc' } } as unknown as Context;

      vi.mocked(mockConversationDO.fetch)
        .mockResolvedValueOnce(stateResponse(startState(2, { description: 'Dinner split' })));

      const consumed = await handler.handleInput(ctx);

      expect(consumed).toBe(true);
      expect(lastReply()).toContain('Invalid amount');
      expect(mockRepository.createPayment).not.toHaveBeenCalled();
      // No state advance
      expect(mockConversationDO.fetch).toHaveBeenCalledTimes(1);
    });

    it('re-prompts on amounts with more than 2 decimals (12.505)', async () => {
      const ctx = { ...mockCtx, message: { text: '12.505' } } as unknown as Context;

      vi.mocked(mockConversationDO.fetch)
        .mockResolvedValueOnce(stateResponse(startState(2, { description: 'Dinner split' })));

      await handler.handleInput(ctx);

      expect(lastReply()).toContain('Invalid amount');
      expect(mockRepository.createPayment).not.toHaveBeenCalled();
    });

    it('re-prompts on negative or zero amounts', async () => {
      for (const bad of ['-5', '0', '0.00']) {
        vi.mocked(mockCtx.reply).mockClear();
        vi.mocked(mockRepository.createPayment).mockClear();
        const ctx = { ...mockCtx, message: { text: bad } } as unknown as Context;

        vi.mocked(mockConversationDO.fetch)
          .mockResolvedValueOnce(stateResponse(startState(2, { description: 'Dinner split' })));

        await handler.handleInput(ctx);

        expect(lastReply()).toContain('Invalid amount');
        expect(mockRepository.createPayment).not.toHaveBeenCalled();
      }
    });
  });

  describe('completion — payment record and QR (task 5.3)', () => {
    it('creates the payment row, sends the QR photo with the spec caption, and resets state', async () => {
      const ctx = { ...mockCtx, message: { text: '12.50' } } as unknown as Context;

      vi.mocked(mockConversationDO.fetch)
        .mockResolvedValueOnce(stateResponse(startState(2, { description: 'Dinner split' })))
        .mockResolvedValueOnce(okResponse); // reset after success

      const consumed = await handler.handleInput(ctx);
      expect(consumed).toBe(true);

      // Payment record: pending, base32 ref, payee snapshot, 2-decimal parse
      expect(mockRepository.createPayment).toHaveBeenCalledTimes(1);
      const input = vi.mocked(mockRepository.createPayment).mock.calls[0]![0];
      expect(input.ref).toMatch(/^[A-Z2-7]{10}$/);
      expect(input.userId).toBe(123456789);
      expect(input.description).toBe('Dinner split');
      expect(input.amountCents).toBe(1250);
      expect(input.status).toBe('pending');
      expect(input.source).toBe('manual');
      expect(input.payeeType).toBe('mobile');
      expect(input.payeeValue).toBe('+6591234567');

      // Payload built by the 2.2 builder with the snapshot, ref, and amount
      const expectedPayload = buildPayNowPayload({
        proxyType: 'mobile',
        proxyValue: '+6591234567',
        amountCents: 1250,
        merchantName: 'Test User',
        reference: input.ref,
        description: 'Dinner split',
      });
      expect(input.qrPayload).toBe(expectedPayload);
      // Fixed-amount flag (26.03=0) and amount tag present
      expect(input.qrPayload).toContain('03010');
      expect(input.qrPayload).toContain('540512.50');

      // sendPhoto with QR image bytes and caption per task 5.3
      expect(mockCtx.replyWithPhoto).toHaveBeenCalledTimes(1);
      const [photo, photoOpts] = vi.mocked(mockCtx.replyWithPhoto).mock.calls[0]!;
      expect(photo).toBeInstanceOf(InputFile);
      const caption = String((photoOpts as { caption?: string }).caption);
      expect(caption).toBe(`Dinner split / SGD 12.50 / ${input.ref} / Forward this message to share`);

      // Conversation reset to idle afterwards
      const states = await postedStates();
      expect(states[states.length - 1]).toMatchObject({ flow: 'idle', step: 0 });

      // Tracking hint mentioning /payments
      expect(lastReply()).toContain('/payments');
    });

    it('stays in the flow and reports failure when record creation throws', async () => {
      const ctx = { ...mockCtx, message: { text: '12.50' } } as unknown as Context;
      vi.mocked(mockRepository.createPayment).mockRejectedValue(new Error('DB write failed'));

      vi.mocked(mockConversationDO.fetch)
        .mockResolvedValueOnce(stateResponse(startState(2, { description: 'Dinner split' })));

      const consumed = await handler.handleInput(ctx);

      expect(consumed).toBe(true);
      expect(lastReply()).toContain('Failed to create the payment');
      expect(mockCtx.replyWithPhoto).not.toHaveBeenCalled();
      // No reset posted — user can retry
      expect(mockConversationDO.fetch).toHaveBeenCalledTimes(1);
    });
  });

  describe('cancel and expiry create no record (task 5.2)', () => {
    it('cancels mid-flow via "cancel" text without writing anything', async () => {
      const ctx = { ...mockCtx, message: { text: 'cancel' } } as unknown as Context;

      vi.mocked(mockConversationDO.fetch)
        .mockResolvedValueOnce(stateResponse(startState(1)))
        .mockResolvedValueOnce(okResponse);

      const consumed = await handler.handleInput(ctx);

      expect(consumed).toBe(true);
      expect(lastReply()).toContain('Start cancelled. No payment was created.');
      expect(mockRepository.createPayment).not.toHaveBeenCalled();

      const states = await postedStates();
      expect(states[states.length - 1]).toMatchObject({ flow: 'idle', step: 0, context: {} });
    });

    it('cancels at the amount step via "/cancel" text without writing anything', async () => {
      const ctx = { ...mockCtx, message: { text: '/cancel' } } as unknown as Context;

      vi.mocked(mockConversationDO.fetch)
        .mockResolvedValueOnce(stateResponse(startState(2, { description: 'Dinner split' })))
        .mockResolvedValueOnce(okResponse);

      await handler.handleInput(ctx);

      expect(lastReply()).toContain('Start cancelled. No payment was created.');
      expect(mockRepository.createPayment).not.toHaveBeenCalled();
    });

    it('cancel() resets an active start flow', async () => {
      vi.mocked(mockConversationDO.fetch)
        .mockResolvedValueOnce(stateResponse(startState(2, { description: 'Coffee' })))
        .mockResolvedValueOnce(okResponse);

      await handler.cancel(mockCtx);

      expect(lastReply()).toContain('Start cancelled');
      expect(mockRepository.createPayment).not.toHaveBeenCalled();
    });

    it('cancel() outside the flow is a no-op message', async () => {
      // default beforeEach state is idle
      await handler.cancel(mockCtx);

      expect(lastReply()).toContain('Nothing to cancel');
      expect(mockConversationDO.fetch).toHaveBeenCalledTimes(1); // only getState
    });

    it('produces no record when the alarm expiry reset the conversation (idle)', async () => {
      const ctx = { ...mockCtx, message: { text: '12.50' } } as unknown as Context;

      // After the 10-min DO alarm, state is back to idle
      vi.mocked(mockConversationDO.fetch).mockResolvedValueOnce(
        stateResponse({ flow: 'idle', step: 0, context: {}, lastActivity: new Date().toISOString() })
      );

      const consumed = await handler.handleInput(ctx);

      expect(consumed).toBe(false);
      expect(mockRepository.createPayment).not.toHaveBeenCalled();
      expect(mockCtx.replyWithPhoto).not.toHaveBeenCalled();
    });

    it('returns false when not in a start flow', async () => {
      const ctx = { ...mockCtx, message: { text: 'hello' } } as unknown as Context;

      vi.mocked(mockConversationDO.fetch).mockResolvedValueOnce(
        stateResponse({ flow: 'payback', step: 1, context: {}, lastActivity: new Date().toISOString() })
      );

      const consumed = await handler.handleInput(ctx);

      expect(consumed).toBe(false);
      expect(mockRepository.createPayment).not.toHaveBeenCalled();
    });
  });
});
