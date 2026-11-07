import { beforeEach, describe, expect, it, vi } from 'vitest';
import { InitCommandHandler } from '../../src/commands/init-handler';
import type { Repository, User } from '../../src/db/repository';
import type { ConversationDO } from '../../src/worker/conversation-do';

describe('/init command handler', () => {
  let mockConversationDO: ConversationDO;
  let mockRepository: Repository;
  let handler: InitCommandHandler;

  beforeEach(() => {
    mockConversationDO = {
      fetch: vi.fn(),
    } as unknown as ConversationDO;

    mockRepository = {
      getUser: vi.fn(),
      upsertUser: vi.fn(),
    } as unknown as Repository;

    handler = new InitCommandHandler(mockConversationDO, mockRepository);
  });

  // ============================================================================
  // start()
  // ============================================================================

  describe('start()', () => {
    it('should initialize conversation state and prompt for reference', async () => {
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
        expect.stringContaining("Let's set up your PayNow reference")
      );
    });
  });

  // ============================================================================
  // handleInput() - Step 1: proxy entry
  // ============================================================================

  describe('handleInput() - Step 1: proxy entry', () => {
    it('should accept valid mobile number and prompt with Confirm/Cancel buttons', async () => {
      const mockCtx = {
        message: { text: '91234567' },
        reply: vi.fn(),
      } as any;

      (mockConversationDO.fetch as any)
        .mockResolvedValueOnce({
          status: 200,
          json: async () => ({
            flow: 'init',
            step: 1,
            context: { userId: 789, chatId: 123456, userName: 'John' },
            lastActivity: new Date().toISOString(),
          }),
        })
        .mockResolvedValueOnce({ status: 200 });

      const result = await handler.handleInput(mockCtx);

      expect(result).toBe(true);
      expect(mockConversationDO.fetch).toHaveBeenCalledTimes(2);
      expect(mockCtx.reply).toHaveBeenCalledWith(
        expect.stringContaining('Mobile number: +6591234567'),
        expect.objectContaining({ reply_markup: expect.any(Object) })
      );
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
            step: 1,
            context: { userId: 789, chatId: 123456, userName: 'John' },
            lastActivity: new Date().toISOString(),
          }),
        })
        .mockResolvedValueOnce({ status: 200 });

      const result = await handler.handleInput(mockCtx);

      expect(result).toBe(true);
      expect(mockCtx.reply).toHaveBeenCalledWith(
        expect.stringContaining('UEN: 201234567A'),
        expect.objectContaining({ reply_markup: expect.any(Object) })
      );
    });

    it('should reject invalid input and re-prompt', async () => {
      const mockCtx = {
        message: { text: 'invalid' },
        reply: vi.fn(),
      } as any;

      (mockConversationDO.fetch as any).mockResolvedValueOnce({
        status: 200,
        json: async () => ({
          flow: 'init',
          step: 1,
          context: { userId: 789, chatId: 123456, userName: 'John' },
          lastActivity: new Date().toISOString(),
        }),
      });

      const result = await handler.handleInput(mockCtx);

      expect(result).toBe(true);
      expect(mockCtx.reply).toHaveBeenCalledWith(expect.stringContaining('Invalid reference'));
    });
  });

  // ============================================================================
  // handleInput() - Step 2 (text typed while buttons are pending)
  // ============================================================================

  describe('handleInput() - Step 2 (text while buttons pending)', () => {
    it('should nudge the user to tap a button instead of typing', async () => {
      const mockCtx = {
        message: { text: 'anything', message_id: 42 },
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
  // handleCallback() - Confirm / Cancel buttons
  // ============================================================================

  describe('handleCallback() - Confirm / Cancel buttons', () => {
    it('should ignore non-init callbacks (let next dispatcher handle)', async () => {
      const mockCtx = {
        callbackQuery: { data: 'view:some-ref' },
        answerCallbackQuery: vi.fn(),
      } as any;

      const result = await handler.handleCallback(mockCtx);
      expect(result).toBe(false);
      expect(mockConversationDO.fetch).not.toHaveBeenCalled();
    });

    it('should save user on Confirm tap and reset state', async () => {
      const mockCtx = {
        from: { id: 789 },
        callbackQuery: { data: 'init_confirm:789' },
        answerCallbackQuery: vi.fn(),
        editMessageReplyMarkup: vi.fn(),
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
              pendingProxy: { type: 'mobile', normalized: '+6591234567' },
            },
            lastActivity: new Date().toISOString(),
          }),
        })
        .mockResolvedValueOnce({ status: 200 });

      (mockRepository.getUser as any).mockResolvedValue(null);
      (mockRepository.upsertUser as any).mockResolvedValue({} as User);

      const result = await handler.handleCallback(mockCtx);

      expect(result).toBe(true);
      expect(mockRepository.upsertUser).toHaveBeenCalledWith({
        telegramId: 789,
        payeeType: 'mobile',
        payeeValue: '+6591234567',
        displayName: 'John',
        timestamp: expect.any(String),
      });
      expect(mockCtx.answerCallbackQuery).toHaveBeenCalledWith({ text: '✅ Reference saved' });
    });

    it('should update existing user on Confirm tap', async () => {
      const mockCtx = {
        from: { id: 789 },
        callbackQuery: { data: 'init_confirm:789' },
        answerCallbackQuery: vi.fn(),
        editMessageReplyMarkup: vi.fn(),
        reply: vi.fn(),
      } as any;

      const existingUser: User = {
        telegramId: 789,
        payeeType: 'mobile',
        payeeValue: '+6591234567',
        displayName: 'John',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };

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
              pendingProxy: { type: 'uen', normalized: '201234567A' },
            },
            lastActivity: new Date().toISOString(),
          }),
        })
        .mockResolvedValueOnce({ status: 200 });

      (mockRepository.getUser as any).mockResolvedValue(existingUser);
      (mockRepository.upsertUser as any).mockResolvedValue({} as User);

      await handler.handleCallback(mockCtx);

      expect(mockRepository.upsertUser).toHaveBeenCalled();
      expect(mockCtx.answerCallbackQuery).toHaveBeenCalledWith({ text: '✅ Reference updated' });
    });

    it('should cancel on Cancel tap and reset state', async () => {
      const mockCtx = {
        from: { id: 789 },
        callbackQuery: { data: 'init_cancel:789' },
        answerCallbackQuery: vi.fn(),
        editMessageReplyMarkup: vi.fn(),
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
              pendingProxy: { type: 'mobile', normalized: '+6591234567' },
            },
            lastActivity: new Date().toISOString(),
          }),
        })
        .mockResolvedValueOnce({ status: 200 });

      const result = await handler.handleCallback(mockCtx);

      expect(result).toBe(true);
      expect(mockRepository.upsertUser).not.toHaveBeenCalled();
      expect(mockCtx.answerCallbackQuery).toHaveBeenCalledWith({ text: 'Cancelled' });
      expect(mockCtx.editMessageReplyMarkup).toHaveBeenCalledWith({
        reply_markup: { inline_keyboard: [] },
      });
      expect(mockCtx.reply).toHaveBeenCalledWith('❌ Cancelled. Run /init again to start over.');
    });

    it('should reject expired session taps', async () => {
      const mockCtx = {
        from: { id: 789 },
        callbackQuery: { data: 'init_confirm:789' },
        answerCallbackQuery: vi.fn(),
      } as any;

      // State is back to idle (e.g., after alarm or /cancel)
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
      expect(mockRepository.upsertUser).not.toHaveBeenCalled();
      expect(mockCtx.answerCallbackQuery).toHaveBeenCalledWith({
        text: '❌ Session expired. Run /init again.',
      });
    });

    it('should handle database errors gracefully on Confirm', async () => {
      const mockCtx = {
        from: { id: 789 },
        callbackQuery: { data: 'init_confirm:789' },
        answerCallbackQuery: vi.fn(),
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
              pendingProxy: { type: 'mobile', normalized: '+6591234567' },
            },
            lastActivity: new Date().toISOString(),
          }),
        })
        .mockResolvedValueOnce({ status: 200 });

      (mockRepository.getUser as any).mockResolvedValue(null);
      (mockRepository.upsertUser as any).mockRejectedValue(new Error('DB error'));

      await handler.handleCallback(mockCtx);

      expect(mockCtx.reply).toHaveBeenCalledWith(
        '❌ Failed to save your reference. Please try again with /init.'
      );
    });
  });

  // ============================================================================
  // handleInput() - Not in init flow
  // ============================================================================

  describe('handleInput() - Not in init flow', () => {
    it('should return false when not in init flow', async () => {
      const mockCtx = {
        message: { text: '91234567' },
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
  // Task 4.2: Reference update on re-run + cancel preserves existing data
  // ============================================================================

  describe('Task 4.2: Reference update on re-run', () => {
    it('should update existing user reference when /init is re-run and Confirm tapped', async () => {
      const existingUser: User = {
        telegramId: 789,
        payeeType: 'mobile',
        payeeValue: '+6591234567',
        displayName: 'John',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };

      (mockRepository.getUser as any).mockResolvedValue(existingUser);
      (mockRepository.upsertUser as any).mockResolvedValue({} as User);

      // Step 1: user enters new mobile
      const inputCtx: any = {
        message: { text: '81234567' },
        reply: vi.fn(),
      };
      (mockConversationDO.fetch as any)
        .mockResolvedValueOnce({
          status: 200,
          json: async () => ({
            flow: 'init',
            step: 1,
            context: { userId: 789, chatId: 123456, userName: 'John' },
            lastActivity: new Date().toISOString(),
          }),
        })
        .mockResolvedValueOnce({ status: 200 });

      await handler.handleInput(inputCtx);

      expect(inputCtx.reply).toHaveBeenCalledWith(
        expect.stringContaining('Mobile number: +6581234567'),
        expect.any(Object)
      );

      // Step 2: Confirm callback
      const callbackCtx: any = {
        from: { id: 789 },
        callbackQuery: { data: 'init_confirm:789' },
        answerCallbackQuery: vi.fn(),
        reply: vi.fn(),
      };
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
              pendingProxy: { type: 'mobile', normalized: '+6581234567' },
            },
            lastActivity: new Date().toISOString(),
          }),
        })
        .mockResolvedValueOnce({ status: 200 });

      await handler.handleCallback(callbackCtx);

      expect(mockRepository.upsertUser).toHaveBeenCalledWith({
        telegramId: 789,
        payeeType: 'mobile',
        payeeValue: '+6581234567',
        displayName: 'John',
        timestamp: expect.any(String),
      });
      expect(callbackCtx.answerCallbackQuery).toHaveBeenCalledWith({
        text: '✅ Reference updated',
      });
    });

    it('should preserve existing user data when Cancel tapped', async () => {
      const existingUser: User = {
        telegramId: 789,
        payeeType: 'mobile',
        payeeValue: '+6591234567',
        displayName: 'John',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };

      (mockRepository.getUser as any).mockResolvedValue(existingUser);

      // Step 1: user enters new mobile
      const inputCtx: any = {
        message: { text: '81234567' },
        reply: vi.fn(),
      };
      (mockConversationDO.fetch as any)
        .mockResolvedValueOnce({
          status: 200,
          json: async () => ({
            flow: 'init',
            step: 1,
            context: { userId: 789, chatId: 123456, userName: 'John' },
            lastActivity: new Date().toISOString(),
          }),
        })
        .mockResolvedValueOnce({ status: 200 });

      await handler.handleInput(inputCtx);

      // Step 2: Cancel callback
      const callbackCtx: any = {
        from: { id: 789 },
        callbackQuery: { data: 'init_cancel:789' },
        answerCallbackQuery: vi.fn(),
        editMessageReplyMarkup: vi.fn(),
        reply: vi.fn(),
      };
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
              pendingProxy: { type: 'mobile', normalized: '+6581234567' },
            },
            lastActivity: new Date().toISOString(),
          }),
        })
        .mockResolvedValueOnce({ status: 200 });

      await handler.handleCallback(callbackCtx);

      expect(mockRepository.upsertUser).not.toHaveBeenCalled();
      expect(callbackCtx.reply).toHaveBeenCalledWith(
        '❌ Cancelled. Run /init again to start over.'
      );
    });

    it('should preserve existing user data when conversation expires (alarm)', async () => {
      const mockCtx = {
        chat: { id: 123456 },
        from: { id: 789, first_name: 'John' },
        reply: vi.fn(),
      } as any;

      (mockConversationDO.fetch as any).mockResolvedValue({
        status: 200,
        json: async () => null,
      });

      await handler.start(mockCtx);

      expect(mockCtx.reply).toHaveBeenCalledWith(
        expect.stringContaining("Let's set up your PayNow reference")
      );
      expect(mockRepository.upsertUser).not.toHaveBeenCalled();
    });
  });
});
