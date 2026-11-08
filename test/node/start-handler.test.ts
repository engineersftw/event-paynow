import type { Context } from 'grammy';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { StartCommandHandler } from '../../src/commands/start-handler.js';
import type { Event, EventRepository, Repository } from '../../src/db/repository.js';
import { renderQrPng } from '../../src/sgqr/qr-render.js';
import type { ConversationDO } from '../../src/worker/conversation-do.js';

// Wrap the real renderer so tests can assert which detail lines are drawn on the image
vi.mock('../../src/sgqr/qr-render.js', async (orig) => {
  const actual = await orig<typeof import('../../src/sgqr/qr-render.js')>();
  return { renderQrPng: vi.fn(actual.renderQrPng) };
});

describe('StartCommandHandler', () => {
  let handler: StartCommandHandler;
  let mockConversationDO: ConversationDO;
  let mockRepository: Repository;
  let mockEventRepository: EventRepository;
  let mockCtx: Context;

  const openEvent: Event = {
    id: 1,
    ref: 'EVT-TEST1234',
    chatId: 123456789,
    topicId: 0,
    name: 'Test Event',
    payeeType: 'mobile',
    payeeValue: '+6591234567',
    status: 'open',
    createdAt: '2024-01-01T00:00:00Z',
    closedAt: null,
  };

  function stateResponse(state: unknown) {
    return { status: 200, json: async () => state } as unknown as Response;
  }

  const _okResponse = { status: 200 } as unknown as Response;

  function lastReply(): string {
    const calls = vi.mocked(mockCtx.reply).mock.calls;
    return String(calls[calls.length - 1]?.[0] ?? '');
  }

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
      voidPayment: vi.fn(async () => null),
      getUser: vi.fn(),
      createPayment: vi.fn(async (input: any) => ({
        id: 1,
        ref: input.ref,
        userId: input.userId,
        eventId: input.eventId,
        description: input.description,
        amountCents: input.amountCents,
        payeeType: input.payeeType,
        payeeValue: input.payeeValue,
        payerName: input.payerName,
        status: input.status,
        source: input.source,
        qrPayload: input.qrPayload,
        createdAt: input.timestamp,
        receivedAt: null,
      })),
    } as unknown as Repository;

    mockEventRepository = {
      listOpenEventsByChat: vi.fn(),
      getEventByRef: vi.fn(),
      createEvent: vi.fn(),
      listAllEventsByChat: vi.fn(),
      closeEvent: vi.fn(),
      getEventStats: vi.fn(),
    } as unknown as EventRepository;

    mockCtx = {
      from: { id: 123456789 },
      chat: { id: 123456789 },
      reply: vi.fn(),
      replyWithPhoto: vi.fn(),
      editMessageText: vi.fn(),
      answerCallbackQuery: vi.fn(),
    } as unknown as Context;

    handler = new StartCommandHandler(mockConversationDO, mockRepository, mockEventRepository);
  });

  describe('start — guard', () => {
    it('prompts when no open events exist', async () => {
      vi.mocked(mockEventRepository.listOpenEventsByChat).mockResolvedValue([]);

      await handler.start(mockCtx);

      expect(mockEventRepository.listOpenEventsByChat).toHaveBeenCalled();
      expect(lastReply()).toContain('No open events');
    });

    it('starts flow with single open event (auto-advance to payer)', async () => {
      vi.mocked(mockEventRepository.listOpenEventsByChat).mockResolvedValue([openEvent]);

      await handler.start(mockCtx);

      expect(mockEventRepository.listOpenEventsByChat).toHaveBeenCalled();
      expect(lastReply()).toContain("payer's PayNow");
    });

    it('shows event picker with multiple open events', async () => {
      const event2 = { ...openEvent, id: 2, ref: 'EVT-TEST5678', name: 'Event 2' };
      vi.mocked(mockEventRepository.listOpenEventsByChat).mockResolvedValue([openEvent, event2]);

      await handler.start(mockCtx);

      expect(mockCtx.reply).toHaveBeenCalledWith(
        expect.stringContaining('Which event is this payment for?'),
        expect.objectContaining({ reply_markup: expect.any(Object) })
      );
    });
  });

  describe('handleCallback - event picker', () => {
    it('picks an event and prompts for payer', async () => {
      vi.mocked(mockConversationDO.fetch)
        .mockResolvedValueOnce({
          status: 200,
          json: async () => ({
            flow: 'start',
            step: 1,
            context: { userId: 123456789, chatId: 123456789, topicId: 0, events: ['EVT-TEST1234'] },
            lastActivity: new Date().toISOString(),
          }),
        })
        .mockResolvedValueOnce({ status: 200 });

      vi.mocked(mockEventRepository.getEventByRef).mockResolvedValue(openEvent);

      const mockCtx2 = {
        ...mockCtx,
        callbackQuery: { data: 'start_pick:EVT-TEST1234' },
      } as unknown as Context;

      const result = await handler.handleCallback(mockCtx2);

      expect(result).toBe(true);
      expect(mockEventRepository.getEventByRef).toHaveBeenCalledWith('EVT-TEST1234');
    });
  });

  describe('handleInput - payer steps', () => {
    const stateAt = (step: number, extra: Record<string, unknown> = {}) => ({
      status: 200,
      json: async () => ({
        flow: 'start',
        step,
        context: {
          userId: 123456789,
          chatId: 123456789,
          topicId: 0,
          eventRef: 'EVT-TEST1234',
          eventName: 'Test Event',
          ...extra,
        },
        lastActivity: new Date().toISOString(),
      }),
    });
    it('rejects an invalid payer and stays on the payer step', async () => {
      vi.mocked(mockConversationDO.fetch).mockResolvedValueOnce(stateAt(2) as never);
      const ctx = { ...mockCtx, message: { text: 'nope' } } as unknown as Context;

      expect(await handler.handleInput(ctx)).toBe(true);
      expect(lastReply()).toContain('Invalid PayNow reference');
      expect(mockConversationDO.fetch).toHaveBeenCalledTimes(1); // no state write
    });

    it('stores a normalized payer and asks for an optional name with Skip', async () => {
      vi.mocked(mockConversationDO.fetch)
        .mockResolvedValueOnce(stateAt(2) as never)
        .mockResolvedValueOnce({ status: 200 } as never);
      const ctx = { ...mockCtx, message: { text: '91234568' } } as unknown as Context;

      await handler.handleInput(ctx);

      expect(lastReply()).toContain('+6591234568');
      expect(mockCtx.reply).toHaveBeenLastCalledWith(
        expect.any(String),
        expect.objectContaining({ reply_markup: expect.any(Object) })
      );
    });

    it('skip button advances from the name step to the amount step', async () => {
      vi.mocked(mockConversationDO.fetch)
        .mockResolvedValueOnce(
          stateAt(3, { payerType: 'mobile', payerValue: '+6591234568' }) as never
        )
        .mockResolvedValueOnce({ status: 200 } as never);
      const ctx = {
        ...mockCtx,
        callbackQuery: { data: 'start_skip_name' },
      } as unknown as Context;

      expect(await handler.handleCallback(ctx)).toBe(true);
      expect(mockCtx.editMessageText).toHaveBeenCalledWith(
        expect.stringContaining('Enter the amount'),
        expect.anything()
      );
    });

    it('rejects an over-long name', async () => {
      vi.mocked(mockConversationDO.fetch).mockResolvedValueOnce(stateAt(3) as never);
      const ctx = { ...mockCtx, message: { text: 'x'.repeat(41) } } as unknown as Context;

      await handler.handleInput(ctx);

      expect(lastReply()).toContain('too long');
    });
  });

  describe('handleInput - amount collection', () => {
    it('rejects invalid amount', async () => {
      vi.mocked(mockConversationDO.fetch).mockResolvedValueOnce({
        status: 200,
        json: async () => ({
          flow: 'start',
          step: 4,
          context: {
            userId: 123456789,
            chatId: 123456789,
            topicId: 0,
            eventRef: 'EVT-TEST1234',
            eventName: 'Test Event',
          },
          lastActivity: new Date().toISOString(),
        }),
      });

      const ctx = { ...mockCtx, message: { text: 'abc' } } as unknown as Context;
      const consumed = await handler.handleInput(ctx);

      expect(consumed).toBe(true);
      expect(lastReply()).toContain('Invalid amount');
      expect(mockRepository.createPayment).not.toHaveBeenCalled();
    });
  });

  describe('confirmation step', () => {
    const base = {
      userId: 123456789,
      chatId: 123456789,
      topicId: 0,
      eventRef: 'EVT-TEST1234',
      eventName: 'Test Event',
      payerType: 'mobile',
      payerValue: '+6591234568',
      payerName: 'Alice',
    };
    const at = (step: number, extra: Record<string, unknown> = {}) => ({
      flow: 'start',
      step,
      context: { ...base, ...extra },
      lastActivity: new Date().toISOString(),
    });
    const step5 = at(5, { amountCents: 1250, payeeValue: '+6591234567' });

    /** DO double: GET → state, POST /state → recorded, POST /claim → 200 state or 409. */
    function mockDo(state: unknown, claim: 'ok' | 'conflict' = 'ok') {
      const posted: Array<Record<string, any>> = [];
      vi.mocked(mockConversationDO.fetch).mockImplementation((async (req: Request) => {
        const url = new URL(req.url);
        if (url.pathname === '/claim') {
          return claim === 'ok'
            ? stateResponse(state)
            : ({ status: 409, body: null } as unknown as Response);
        }
        if (req.method === 'POST') {
          posted.push(JSON.parse(await req.text()));
          return { status: 200 } as unknown as Response;
        }
        return stateResponse(state);
      }) as never);
      return posted;
    }

    const callback = (data: string) =>
      ({ ...mockCtx, callbackQuery: { data } }) as unknown as Context;

    it('a valid amount shows a summary with Confirm/Cancel and persists nothing', async () => {
      vi.mocked(mockEventRepository.getEventByRef).mockResolvedValue(openEvent);
      const posted = mockDo(at(4));

      const consumed = await handler.handleInput({
        ...mockCtx,
        message: { text: '12.50' },
      } as unknown as Context);

      expect(consumed).toBe(true);
      expect(lastReply()).toBe(
        '🧾 Confirm payment request\n\nEvent: Test Event\nPayer: Alice (+6591234568)\n' +
          'Pay to: +6591234567\nAmount: SGD 12.50'
      );
      const opts = vi.mocked(mockCtx.reply).mock.calls.at(-1)![1] as {
        reply_markup: { inline_keyboard: Array<Array<{ callback_data: string }>> };
      };
      expect(opts.reply_markup.inline_keyboard.flat().map((b) => b.callback_data)).toEqual([
        'start_confirm',
        'start_cancel',
      ]);
      expect(posted.at(-1)).toMatchObject({
        step: 5,
        context: { amountCents: 1250, payeeValue: '+6591234567' },
      });
      expect(mockRepository.createPayment).not.toHaveBeenCalled();
      expect(mockCtx.replyWithPhoto).not.toHaveBeenCalled();
    });

    it('does not show a summary when the event closed before the amount was entered', async () => {
      vi.mocked(mockEventRepository.getEventByRef).mockResolvedValue({
        ...openEvent,
        status: 'closed',
      });
      const posted = mockDo(at(4));

      await handler.handleInput({ ...mockCtx, message: { text: '12.50' } } as unknown as Context);

      expect(lastReply()).toContain('event is closed');
      expect(posted.at(-1)).toMatchObject({ flow: 'idle' });
      expect(mockCtx.reply).toHaveBeenCalledTimes(1);
    });

    it('Confirm claims the step, creates one payment with the confirmed amount, and sends the QR', async () => {
      vi.mocked(mockEventRepository.getEventByRef).mockResolvedValue(openEvent);
      mockDo(step5);

      expect(await handler.handleCallback(callback('start_confirm'))).toBe(true);

      expect(mockRepository.createPayment).toHaveBeenCalledTimes(1);
      const input = vi.mocked(mockRepository.createPayment).mock.calls[0]![0];
      expect(input).toMatchObject({
        eventId: 1,
        description: 'Test Event',
        amountCents: 1250,
        payerValue: '+6591234568',
        payerName: 'Alice',
      });
      expect(mockCtx.editMessageText).toHaveBeenCalledWith(
        expect.stringContaining('✅ Confirmed'),
        expect.anything()
      );
      expect(mockCtx.replyWithPhoto).toHaveBeenCalledTimes(1);
      // Image carries the details as name-only text (never the payer's number)
      const lines = vi.mocked(renderQrPng).mock.calls.at(-1)![1]!;
      expect(lines).toEqual(['Test Event', 'SGD 12.50', expect.any(String), 'Payer: Alice']);
      expect(lines.join(' ')).not.toContain('91234568');
    });

    it('voids the just-created payment when the QR cannot be delivered', async () => {
      vi.mocked(mockEventRepository.getEventByRef).mockResolvedValue(openEvent);
      vi.mocked(mockCtx.replyWithPhoto).mockRejectedValueOnce(new Error('telegram down'));
      mockDo(step5);

      await handler.handleCallback(callback('start_confirm'));

      const created = await vi.mocked(mockRepository.createPayment).mock.results[0]!.value;
      expect(mockRepository.voidPayment).toHaveBeenCalledWith(created.ref);
      expect(lastReply()).toContain('Failed to create the payment');
    });

    it('a lost claim (double tap / expired) creates nothing', async () => {
      mockDo(step5, 'conflict');

      expect(await handler.handleCallback(callback('start_confirm'))).toBe(true);

      expect(mockCtx.answerCallbackQuery).toHaveBeenCalledWith({
        text: '⚠️ Already processed or expired. Run /start again.',
      });
      expect(mockRepository.createPayment).not.toHaveBeenCalled();
      expect(mockCtx.replyWithPhoto).not.toHaveBeenCalled();
    });

    it('Confirm on a now-closed event creates nothing', async () => {
      vi.mocked(mockEventRepository.getEventByRef).mockResolvedValue({
        ...openEvent,
        status: 'closed',
      });
      mockDo(step5);

      await handler.handleCallback(callback('start_confirm'));

      expect(lastReply()).toContain('event is closed');
      expect(mockRepository.createPayment).not.toHaveBeenCalled();
      expect(mockCtx.replyWithPhoto).not.toHaveBeenCalled();
    });

    it('a failure after the claim tells the user to run /start again', async () => {
      vi.mocked(mockEventRepository.getEventByRef).mockResolvedValue(openEvent);
      vi.mocked(mockRepository.createPayment).mockRejectedValue(new Error('db down'));
      mockDo(step5);

      await handler.handleCallback(callback('start_confirm'));

      expect(lastReply()).toBe('❌ Failed to create the payment. Please run /start again.');
      expect(mockCtx.replyWithPhoto).not.toHaveBeenCalled();
    });

    it('the Cancel button claims the step and creates nothing', async () => {
      mockDo(step5);

      expect(await handler.handleCallback(callback('start_cancel'))).toBe(true);

      expect(mockCtx.editMessageText).toHaveBeenCalledWith(
        '❌ Start cancelled. No payment was created.',
        expect.anything()
      );
      expect(mockRepository.createPayment).not.toHaveBeenCalled();
    });

    it('a stale Cancel tap is answered without side effects', async () => {
      mockDo(step5, 'conflict');

      await handler.handleCallback(callback('start_cancel'));

      expect(mockCtx.answerCallbackQuery).toHaveBeenCalledWith({
        text: '⚠️ Already processed or expired.',
      });
      expect(mockCtx.editMessageText).not.toHaveBeenCalled();
    });

    it('text at the summary nudges; typed cancel ends the flow without a payment', async () => {
      const posted = mockDo(step5);

      await handler.handleInput({ ...mockCtx, message: { text: '20' } } as unknown as Context);
      expect(lastReply()).toContain('tap Confirm or Cancel');
      expect(posted).toHaveLength(0);

      await handler.handleInput({ ...mockCtx, message: { text: 'cancel' } } as unknown as Context);
      expect(lastReply()).toContain('Start cancelled');
      expect(posted.at(-1)).toMatchObject({ flow: 'idle' });
      expect(mockRepository.createPayment).not.toHaveBeenCalled();
    });
  });

  describe('handleInput - not in start flow', () => {
    it('returns false when not in start flow', async () => {
      vi.mocked(mockConversationDO.fetch).mockResolvedValueOnce({
        status: 200,
        json: async () => ({
          flow: 'idle',
          step: 0,
          context: {},
          lastActivity: new Date().toISOString(),
        }),
      });

      const ctx = { ...mockCtx, message: { text: 'hello' } } as unknown as Context;
      const consumed = await handler.handleInput(ctx);

      expect(consumed).toBe(false);
    });
  });
});
