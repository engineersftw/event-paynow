import type { Context } from 'grammy';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { StartCommandHandler } from '../../src/commands/start-handler.js';
import type { Event, EventRepository, Repository } from '../../src/db/repository.js';
import type { ConversationDO } from '../../src/worker/conversation-do.js';

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
    it('accepts valid amount and creates payment', async () => {
      vi.mocked(mockEventRepository.getEventByRef).mockResolvedValue(openEvent);

      vi.mocked(mockConversationDO.fetch)
        .mockResolvedValueOnce({
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
              payerType: 'mobile',
              payerValue: '+6591234568',
              payerName: 'Alice',
            },
            lastActivity: new Date().toISOString(),
          }),
        })
        .mockResolvedValueOnce({ status: 200 });

      const ctx = { ...mockCtx, message: { text: '12.50' } } as unknown as Context;
      const consumed = await handler.handleInput(ctx);

      expect(consumed).toBe(true);
      expect(mockRepository.createPayment).toHaveBeenCalled();
      const input = vi.mocked(mockRepository.createPayment).mock.calls[0]![0];
      expect(input.eventId).toBe(1);
      expect(input.description).toBe('Test Event');
      expect(input.payerValue).toBe('+6591234568');
      expect(input.payerName).toBe('Alice');
      expect(mockCtx.replyWithPhoto).toHaveBeenCalledTimes(1);
    });

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
