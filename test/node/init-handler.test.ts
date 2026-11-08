import { beforeEach, describe, expect, it, vi } from 'vitest';
import { InitCommandHandler } from '../../src/commands/init-handler';
import type { Event, EventRepository, Repository } from '../../src/db/repository';
import type { ConversationDO } from '../../src/worker/conversation-do';

describe('/init command handler (event creation)', () => {
  let mockConversationDO: ConversationDO;
  let mockRepository: Repository;
  let mockEventRepository: EventRepository;
  let handler: InitCommandHandler;

  beforeEach(() => {
    mockConversationDO = {
      fetch: vi.fn(),
    } as unknown as ConversationDO;

    mockRepository = {
      getUser: vi.fn(),
      upsertUser: vi.fn(),
    } as unknown as Repository;

    mockEventRepository = {
      createEvent: vi.fn(),
      listOpenEventsByChat: vi.fn(),
      listAllEventsByChat: vi.fn(),
      getEventByRef: vi.fn(),
      closeEvent: vi.fn(),
      getEventStats: vi.fn(),
    } as unknown as EventRepository;

    handler = new InitCommandHandler(mockConversationDO, mockRepository, mockEventRepository);
  });

  // ============================================================================
  // start()
  // ============================================================================

  describe('start()', () => {
    it('should initialize conversation state and prompt for event name', async () => {
      const mockCtx = {
        chat: { id: 123456 },
        from: { id: 789, first_name: 'John' },
        reply: vi.fn(),
      } as any;

      (mockConversationDO.fetch as any).mockResolvedValue({
        status: 200,
        json: async () => ({
          flow: 'init',
          step: 1,
          context: {},
          lastActivity: new Date().toISOString(),
        }),
      });

      await handler.start(mockCtx);

      expect(mockConversationDO.fetch).toHaveBeenCalled();
      const fetchCall = (mockConversationDO.fetch as any).mock.calls[0][0];
      expect(fetchCall.method).toBe('POST');

      expect(mockCtx.reply).toHaveBeenCalledWith(
        expect.stringContaining("Let's create a new event")
      );
    });
  });

  // ============================================================================
  // handleInput() - Step 1: Event Name
  // ============================================================================

  describe('handleInput() - Step 1: Event Name', () => {
    it('should accept valid event name and prompt for payee', async () => {
      const mockCtx = {
        message: { text: 'Dinner split' },
        reply: vi.fn(),
      } as any;

      (mockConversationDO.fetch as any)
        .mockResolvedValueOnce({
          status: 200,
          json: async () => ({
            flow: 'init',
            step: 1,
            context: { userId: 789, chatId: 123456, userName: 'John', topicId: 0 },
            lastActivity: new Date().toISOString(),
          }),
        })
        .mockResolvedValueOnce({ status: 200 });

      const result = await handler.handleInput(mockCtx);

      expect(result).toBe(true);
      expect(mockConversationDO.fetch).toHaveBeenCalledTimes(2);
      expect(mockCtx.reply).toHaveBeenCalledWith(expect.stringContaining('Event: Dinner split'));
      expect(mockCtx.reply).toHaveBeenCalledWith(expect.stringContaining('mobile number'));
    });

    it('should reject empty event name', async () => {
      const mockCtx = {
        message: { text: '   ' },
        reply: vi.fn(),
      } as any;

      (mockConversationDO.fetch as any).mockResolvedValueOnce({
        status: 200,
        json: async () => ({
          flow: 'init',
          step: 1,
          context: { userId: 789, chatId: 123456, userName: 'John', topicId: 0 },
          lastActivity: new Date().toISOString(),
        }),
      });

      const result = await handler.handleInput(mockCtx);

      // Whitespace-only name is empty after trim → ignored, stays in flow
      expect(result).toBe(true);
    });

    it('should reject event name longer than 50 chars', async () => {
      const mockCtx = {
        message: { text: 'A'.repeat(51) },
        reply: vi.fn(),
      } as any;

      (mockConversationDO.fetch as any).mockResolvedValueOnce({
        status: 200,
        json: async () => ({
          flow: 'init',
          step: 1,
          context: { userId: 789, chatId: 123456, userName: 'John', topicId: 0 },
          lastActivity: new Date().toISOString(),
        }),
      });

      const result = await handler.handleInput(mockCtx);

      expect(result).toBe(true);
      expect(mockCtx.reply).toHaveBeenCalledWith(
        expect.stringContaining('Event name must be between 1 and 50 characters')
      );
    });

    it('should reject invalid input and re-prompt (null text)', async () => {
      const mockCtx = {
        message: { text: '   ' },
        reply: vi.fn(),
      } as any;

      (mockConversationDO.fetch as any).mockResolvedValueOnce({
        status: 200,
        json: async () => ({
          flow: 'init',
          step: 1,
          context: { userId: 789, chatId: 123456, userName: 'John', topicId: 0 },
          lastActivity: new Date().toISOString(),
        }),
      });

      const result = await handler.handleInput(mockCtx);

      // Whitespace-only name is empty after trim → rejected
      expect(result).toBe(true);
    });
  });

  // ============================================================================
  // handleInput() - Step 2: Payee Proxy
  // ============================================================================

  describe('handleInput() - Step 2: Payee Proxy', () => {
    it('should accept valid mobile number and prompt with buttons', async () => {
      const mockCtx = {
        message: { text: '91234567' },
        reply: vi.fn(),
      } as any;

      (mockConversationDO.fetch as any)
        .mockResolvedValueOnce({
          status: 200,
          json: async () => ({
            flow: 'init',
            step: 2,
            context: {
              userId: 789,
              chatId: 123456,
              userName: 'John',
              topicId: 0,
              eventName: 'Dinner split',
            },
            lastActivity: new Date().toISOString(),
          }),
        })
        .mockResolvedValueOnce({ status: 200 });

      const result = await handler.handleInput(mockCtx);

      expect(result).toBe(true);
      expect(mockCtx.reply).toHaveBeenCalledWith(
        expect.stringContaining('Default amount to collect'),
        expect.objectContaining({ reply_markup: expect.any(Object) })
      );
      const saved = await ((mockConversationDO.fetch as any).mock.calls[1][0] as Request).json();
      expect(saved.step).toBe(3);
      expect(saved.context.pendingProxy).toEqual({ type: 'mobile', normalized: '+6591234567' });
    });

    it('should accept valid UEN and prompt with buttons', async () => {
      const mockCtx = {
        message: { text: '201234567A' },
        reply: vi.fn(),
      } as any;

      (mockConversationDO.fetch as any)
        .mockResolvedValueOnce({
          status: 200,
          json: async () => ({
            flow: 'init',
            step: 2,
            context: {
              userId: 789,
              chatId: 123456,
              userName: 'John',
              topicId: 0,
              eventName: 'Dinner split',
            },
            lastActivity: new Date().toISOString(),
          }),
        })
        .mockResolvedValueOnce({ status: 200 });

      const result = await handler.handleInput(mockCtx);

      expect(result).toBe(true);
      expect(mockCtx.reply).toHaveBeenCalledWith(
        expect.stringContaining('Default amount to collect'),
        expect.objectContaining({ reply_markup: expect.any(Object) })
      );
    });

    it('should reject invalid proxy and re-prompt', async () => {
      const mockCtx = {
        message: { text: 'invalid' },
        reply: vi.fn(),
      } as any;

      (mockConversationDO.fetch as any).mockResolvedValueOnce({
        status: 200,
        json: async () => ({
          flow: 'init',
          step: 2,
          context: {
            userId: 789,
            chatId: 123456,
            userName: 'John',
            topicId: 0,
            eventName: 'Dinner split',
          },
          lastActivity: new Date().toISOString(),
        }),
      });

      const result = await handler.handleInput(mockCtx);

      expect(result).toBe(true);
      expect(mockCtx.reply).toHaveBeenCalledWith(expect.stringContaining('Invalid reference'));
    });
  });

  // ============================================================================
  // handleInput() - Step 3: text while buttons pending
  // ============================================================================

  describe('handleInput() - Step 3: optional default amount', () => {
    const stateAt3 = {
      flow: 'init',
      step: 3,
      context: {
        userId: 789,
        chatId: 123456,
        userName: 'John',
        topicId: 0,
        eventName: 'Dinner split',
        pendingProxy: { type: 'mobile', normalized: '+6591234567' },
      },
      lastActivity: new Date().toISOString(),
    };

    it('accepts a valid amount, stores it in cents and shows the confirmation', async () => {
      const mockCtx = { message: { text: '21' }, reply: vi.fn() } as any;
      (mockConversationDO.fetch as any)
        .mockResolvedValueOnce({ status: 200, json: async () => stateAt3 })
        .mockResolvedValueOnce({ status: 200 });

      expect(await handler.handleInput(mockCtx)).toBe(true);

      const written = await ((mockConversationDO.fetch as any).mock.calls[1][0] as Request).json();
      expect(written.step).toBe(4);
      expect(written.context.defaultAmountCents).toBe(2100);
      expect(mockCtx.reply).toHaveBeenCalledWith(
        expect.stringContaining('Default amount: SGD 21.00'),
        expect.objectContaining({ reply_markup: expect.any(Object) })
      );
    });

    it.each(['abc', '0', '-5', '1.234'])('rejects %s and stays on the step', async (text) => {
      const mockCtx = { message: { text }, reply: vi.fn() } as any;
      (mockConversationDO.fetch as any).mockResolvedValueOnce({
        status: 200,
        json: async () => stateAt3,
      });

      expect(await handler.handleInput(mockCtx)).toBe(true);

      expect(mockCtx.reply).toHaveBeenCalledWith(expect.stringContaining('Invalid amount'));
      expect(mockConversationDO.fetch).toHaveBeenCalledTimes(1); // no state write
    });

    it('Skip moves to the confirmation without an amount', async () => {
      const mockCtx = {
        from: { id: 789 },
        callbackQuery: { data: 'init_skip_amount:789' },
        editMessageText: vi.fn(),
      } as any;
      (mockConversationDO.fetch as any)
        .mockResolvedValueOnce({ status: 200, json: async () => stateAt3 })
        .mockResolvedValueOnce({ status: 200 });

      expect(await handler.handleCallback(mockCtx)).toBe(true);

      const written = await ((mockConversationDO.fetch as any).mock.calls[1][0] as Request).json();
      expect(written.step).toBe(4);
      expect(written.context.defaultAmountCents).toBeUndefined();
      const [text] = mockCtx.editMessageText.mock.calls[0];
      expect(text).not.toContain('Default amount');
      expect(text).toContain('Dinner split');
    });

    it('Skip after the step has moved on is rejected as expired', async () => {
      const mockCtx = {
        from: { id: 789 },
        callbackQuery: { data: 'init_skip_amount:789' },
        editMessageText: vi.fn(),
      } as any;
      (mockConversationDO.fetch as any).mockResolvedValueOnce({
        status: 200,
        json: async () => ({ ...stateAt3, step: 4 }),
      });

      await handler.handleCallback(mockCtx);

      expect(mockCtx.editMessageText).toHaveBeenCalledWith(
        '❌ Session expired. Run /init again.',
        expect.anything()
      );
    });
  });

  describe('handleInput() - Step 4: text while buttons pending', () => {
    it('should nudge the user to tap a button instead of typing', async () => {
      const mockCtx = {
        message: { text: 'anything', message_id: 42 },
        reply: vi.fn(),
      } as any;

      (mockConversationDO.fetch as any).mockResolvedValueOnce({
        status: 200,
        json: async () => ({
          flow: 'init',
          step: 4,
          context: {
            userId: 789,
            chatId: 123456,
            userName: 'John',
            topicId: 0,
            eventName: 'Dinner split',
            pendingProxy: { type: 'mobile', normalized: '+6591234567' },
          },
          lastActivity: new Date().toISOString(),
        }),
      });

      const result = await handler.handleInput(mockCtx);

      expect(result).toBe(true);
      expect(mockCtx.reply).toHaveBeenCalledWith(
        expect.stringContaining('Waiting for confirmation')
      );
    });
  });

  // ============================================================================
  // handleInput() - Not in init flow
  // ============================================================================

  describe('handleInput() - Not in init flow', () => {
    it('should return false when not in init flow', async () => {
      const mockCtx = {
        message: { text: 'Dinner split' },
        reply: vi.fn(),
      } as any;

      (mockConversationDO.fetch as any).mockResolvedValueOnce({
        status: 200,
        json: async () => ({
          flow: 'idle',
          step: 0,
          context: {},
          lastActivity: new Date().toISOString(),
        }),
      });

      const result = await handler.handleInput(mockCtx);

      expect(result).toBe(false);
      expect(mockCtx.reply).not.toHaveBeenCalled();
    });
  });

  // ============================================================================
  // handleCallback() - Confirm / Cancel buttons
  // ============================================================================

  describe('handleCallback() - Confirm / Cancel buttons', () => {
    it('should ignore non-init callbacks', async () => {
      const mockCtx = {
        callbackQuery: { data: 'view:some-ref' },
        editMessageText: vi.fn(),
      } as any;

      const result = await handler.handleCallback(mockCtx);
      expect(result).toBe(false);
      expect(mockConversationDO.fetch).not.toHaveBeenCalled();
    });

    it('should create event on Confirm tap', async () => {
      const mockCtx = {
        from: { id: 789 },
        callbackQuery: { data: 'init_confirm:789' },
        editMessageText: vi.fn(),
      } as any;

      (mockConversationDO.fetch as any)
        .mockResolvedValueOnce({
          status: 200,
          json: async () => ({
            flow: 'init',
            step: 4,
            context: {
              userId: 789,
              chatId: 123456,
              topicId: 0,
              userName: 'John',
              eventName: 'Dinner split',
              pendingProxy: { type: 'mobile', normalized: '+6591234567' },
            },
            lastActivity: new Date().toISOString(),
          }),
        })
        .mockResolvedValueOnce({ status: 200 });

      (mockEventRepository.createEvent as any).mockResolvedValue({
        id: 1,
        ref: 'EVT-TEST1234',
        chatId: 123456,
        topicId: 0,
        name: 'Dinner split',
        payeeType: 'mobile',
        payeeValue: '+6591234567',
        status: 'open',
        createdAt: new Date().toISOString(),
        closedAt: null,
        defaultAmountCents: null,
      } as Event);

      const result = await handler.handleCallback(mockCtx);

      expect(result).toBe(true);
      expect(mockEventRepository.createEvent).toHaveBeenCalledWith(
        expect.objectContaining({
          name: 'Dinner split',
          payeeType: 'mobile',
          payeeValue: '+6591234567',
          status: 'open',
        })
      );
      expect(mockCtx.editMessageText).toHaveBeenCalledWith(
        expect.stringContaining('Event created'),
        expect.objectContaining({ parse_mode: 'Markdown' })
      );
    });

    it('should cancel on Cancel tap and reset state', async () => {
      const mockCtx = {
        from: { id: 789 },
        callbackQuery: { data: 'init_cancel:789' },
        editMessageText: vi.fn(),
      } as any;

      (mockConversationDO.fetch as any)
        .mockResolvedValueOnce({
          status: 200,
          json: async () => ({
            flow: 'init',
            step: 4,
            context: {
              userId: 789,
              chatId: 123456,
              topicId: 0,
              userName: 'John',
              eventName: 'Dinner split',
              pendingProxy: { type: 'mobile', normalized: '+6591234567' },
            },
            lastActivity: new Date().toISOString(),
          }),
        })
        .mockResolvedValueOnce({ status: 200 });

      const result = await handler.handleCallback(mockCtx);

      expect(result).toBe(true);
      expect(mockEventRepository.createEvent).not.toHaveBeenCalled();
      expect(mockCtx.editMessageText).toHaveBeenCalledWith(expect.stringContaining('Cancelled'), {
        reply_markup: { inline_keyboard: [] },
      });
    });

    it('should reject expired session taps', async () => {
      const mockCtx = {
        from: { id: 789 },
        callbackQuery: { data: 'init_confirm:789' },
        editMessageText: vi.fn(),
      } as any;

      (mockConversationDO.fetch as any).mockResolvedValueOnce({
        status: 200,
        json: async () => ({
          flow: 'idle',
          step: 0,
          context: {},
          lastActivity: new Date().toISOString(),
        }),
      });

      const result = await handler.handleCallback(mockCtx);

      expect(result).toBe(true);
      expect(mockEventRepository.createEvent).not.toHaveBeenCalled();
      expect(mockCtx.editMessageText).toHaveBeenCalledWith('❌ Session expired. Run /init again.', {
        reply_markup: { inline_keyboard: [] },
      });
    });

    it('should handle database errors gracefully on Confirm', async () => {
      const mockCtx = {
        from: { id: 789 },
        callbackQuery: { data: 'init_confirm:789' },
        editMessageText: vi.fn(),
      } as any;

      (mockConversationDO.fetch as any)
        .mockResolvedValueOnce({
          status: 200,
          json: async () => ({
            flow: 'init',
            step: 4,
            context: {
              userId: 789,
              chatId: 123456,
              topicId: 0,
              userName: 'John',
              eventName: 'Dinner split',
              pendingProxy: { type: 'mobile', normalized: '+6591234567' },
            },
            lastActivity: new Date().toISOString(),
          }),
        })
        .mockResolvedValueOnce({ status: 200 });

      (mockEventRepository.createEvent as any).mockRejectedValue(new Error('DB error'));

      await handler.handleCallback(mockCtx);

      expect(mockCtx.editMessageText).toHaveBeenCalledWith(
        expect.stringContaining('❌ Failed to create event'),
        { reply_markup: { inline_keyboard: [] } }
      );
    });
  });
});
