import { describe, it, expect, beforeEach, vi } from 'vitest';
import { InitCommandHandler } from '../../src/commands/init-handler';
import type { ConversationDO } from '../../src/worker/conversation-do';
import type { Repository, User } from '../../src/db/repository';

describe('/init command handler', () => {
  let mockConversationDO: ConversationDO;
  let mockRepository: Repository;
  let handler: InitCommandHandler;

  beforeEach(() => {
    // Mock ConversationDO
    mockConversationDO = {
      fetch: vi.fn(),
    } as unknown as ConversationDO;

    // Mock Repository
    mockRepository = {
      getUser: vi.fn(),
      upsertUser: vi.fn(),
    } as unknown as Repository;

    handler = new InitCommandHandler(mockConversationDO, mockRepository);
  });

  describe('start()', () => {
    it('should initialize conversation state and prompt for reference', async () => {
      const mockCtx = {
        chat: { id: 123456 },
        from: { id: 789, first_name: 'John' },
        reply: vi.fn(),
      } as any;

      // Mock successful state initialization
      (mockConversationDO.fetch as any).mockResolvedValue({
        status: 200,
        json: async () => ({ flow: 'init', step: 1, context: {}, lastActivity: new Date().toISOString() })
      });

      await handler.start(mockCtx);

      // Check that fetch was called with a POST request
      expect(mockConversationDO.fetch).toHaveBeenCalled();
      const fetchCall = (mockConversationDO.fetch as any).mock.calls[0][0];
      expect(fetchCall.method).toBe('POST');
      
      expect(mockCtx.reply).toHaveBeenCalledWith(
        expect.stringContaining('Let\'s set up your PayNow reference')
      );
    });
  });

  describe('handleInput() - Step 1: Reference Input', () => {
    it('should accept valid mobile number and prompt for confirmation', async () => {
      const mockCtx = {
        message: { text: '91234567' },
        reply: vi.fn(),
      } as any;

      // Mock getState to return init flow, step 1
      (mockConversationDO.fetch as any)
        .mockResolvedValueOnce({
          status: 200,
          json: async () => ({
            flow: 'init',
            step: 1,
            context: { userId: 789, chatId: 123456, userName: 'John' },
            lastActivity: new Date().toISOString()
          })
        })
        .mockResolvedValueOnce({ status: 200 }); // setState

      const result = await handler.handleInput(mockCtx);

      expect(result).toBe(true);
      expect(mockConversationDO.fetch).toHaveBeenCalledTimes(2);
      expect(mockCtx.reply).toHaveBeenCalledWith(
        expect.stringContaining('Mobile number: +6591234567')
      );
      expect(mockCtx.reply).toHaveBeenCalledWith(
        expect.stringContaining('Type "confirm" to save')
      );
    });

    it('should accept valid UEN and prompt for confirmation', async () => {
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
            lastActivity: new Date().toISOString()
          })
        })
        .mockResolvedValueOnce({ status: 200 });

      const result = await handler.handleInput(mockCtx);

      expect(result).toBe(true);
      expect(mockCtx.reply).toHaveBeenCalledWith(
        expect.stringContaining('UEN: 201234567A')
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
          lastActivity: new Date().toISOString()
        })
      });

      const result = await handler.handleInput(mockCtx);

      expect(result).toBe(true);
      expect(mockCtx.reply).toHaveBeenCalledWith(
        expect.stringContaining('Invalid reference')
      );
    });
  });

  describe('handleInput() - Step 2: Confirmation', () => {
    it('should save user on "confirm" and reset state', async () => {
      const mockCtx = {
        message: { text: 'confirm' },
        reply: vi.fn(),
      } as any;

      const pendingProxy = { type: 'mobile', normalized: '+6591234567' };

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
              pendingProxy
            },
            lastActivity: new Date().toISOString()
          })
        })
        .mockResolvedValueOnce({ status: 200 }); // setState

      (mockRepository.getUser as any).mockResolvedValue(null); // New user
      (mockRepository.upsertUser as any).mockResolvedValue({} as User);

      const result = await handler.handleInput(mockCtx);

      expect(result).toBe(true);
      expect(mockRepository.upsertUser).toHaveBeenCalledWith({
        telegramId: 789,
        payeeType: 'mobile',
        payeeValue: '+6591234567',
        displayName: 'John',
        timestamp: expect.any(String)
      });
      expect(mockCtx.reply).toHaveBeenCalledWith('✅ Your PayNow reference has been saved!');
    });

    it('should update existing user on "confirm"', async () => {
      const mockCtx = {
        message: { text: 'confirm' },
        reply: vi.fn(),
      } as any;

      const pendingProxy = { type: 'uen', normalized: '201234567A' };
      const existingUser: User = {
        telegramId: 789,
        payeeType: 'mobile',
        payeeValue: '+6591234567',
        displayName: 'John',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
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
              pendingProxy
            },
            lastActivity: new Date().toISOString()
          })
        })
        .mockResolvedValueOnce({ status: 200 });

      (mockRepository.getUser as any).mockResolvedValue(existingUser);
      (mockRepository.upsertUser as any).mockResolvedValue({} as User);

      const result = await handler.handleInput(mockCtx);

      expect(result).toBe(true);
      expect(mockRepository.upsertUser).toHaveBeenCalled();
      expect(mockCtx.reply).toHaveBeenCalledWith('✅ Your PayNow reference has been updated!');
    });

    it('should cancel on "cancel" and reset state', async () => {
      const mockCtx = {
        message: { text: 'cancel' },
        reply: vi.fn(),
      } as any;

      (mockConversationDO.fetch as any)
        .mockResolvedValueOnce({
          status: 200,
          json: async () => ({
            flow: 'init',
            step: 2,
            context: { userId: 789, chatId: 123456, userName: 'John', pendingProxy: {} },
            lastActivity: new Date().toISOString()
          })
        })
        .mockResolvedValueOnce({ status: 200 });

      const result = await handler.handleInput(mockCtx);

      expect(result).toBe(true);
      expect(mockRepository.upsertUser).not.toHaveBeenCalled();
      expect(mockCtx.reply).toHaveBeenCalledWith('❌ Cancelled. Run /init again to start over.');
    });

    it('should re-prompt on invalid confirmation input', async () => {
      const mockCtx = {
        message: { text: 'maybe' },
        reply: vi.fn(),
      } as any;

      (mockConversationDO.fetch as any).mockResolvedValueOnce({
        status: 200,
        json: async () => ({
          flow: 'init',
          step: 2,
          context: { userId: 789, chatId: 123456, userName: 'John', pendingProxy: {} },
          lastActivity: new Date().toISOString()
        })
      });

      const result = await handler.handleInput(mockCtx);

      expect(result).toBe(true);
      expect(mockCtx.reply).toHaveBeenCalledWith(
        'Please type "confirm" to save or "cancel" to start over:'
      );
    });
  });

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
          lastActivity: new Date().toISOString()
        })
      });

      const result = await handler.handleInput(mockCtx);

      expect(result).toBe(false);
      expect(mockCtx.reply).not.toHaveBeenCalled();
    });
  });

  describe('Error handling', () => {
    it('should handle database errors gracefully', async () => {
      const mockCtx = {
        message: { text: 'confirm' },
        reply: vi.fn(),
      } as any;

      const pendingProxy = { type: 'mobile', normalized: '+6591234567' };

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
              pendingProxy
            },
            lastActivity: new Date().toISOString()
          })
        })
        .mockResolvedValueOnce({ status: 200 });

      (mockRepository.getUser as any).mockResolvedValue(null);
      (mockRepository.upsertUser as any).mockRejectedValue(new Error('DB error'));

      const result = await handler.handleInput(mockCtx);

      expect(result).toBe(true);
      expect(mockCtx.reply).toHaveBeenCalledWith(
        '❌ Failed to save your reference. Please try again with /init.'
      );
    });
  });

  describe('Task 4.2: Reference update on re-run', () => {
    it('should update existing user reference when /init is re-run', async () => {
      const mockCtx = {
        message: { text: '81234567' },
        reply: vi.fn(),
      } as any;

      // Existing user with old mobile reference
      const existingUser: User = {
        telegramId: 789,
        payeeType: 'mobile',
        payeeValue: '+6591234567',
        displayName: 'John',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      };

      // Mock getUser to return existing user
      (mockRepository.getUser as any).mockResolvedValue(existingUser);
      (mockRepository.upsertUser as any).mockResolvedValue({} as User);

      // Step 1: User enters new mobile number
      (mockConversationDO.fetch as any)
        .mockResolvedValueOnce({
          status: 200,
          json: async () => ({
            flow: 'init',
            step: 1,
            context: { userId: 789, chatId: 123456, userName: 'John' },
            lastActivity: new Date().toISOString()
          })
        })
        .mockResolvedValueOnce({ status: 200 }); // setState

      await handler.handleInput(mockCtx);

      // Verify confirmation prompt was shown
      expect(mockCtx.reply).toHaveBeenCalledWith(
        expect.stringContaining('Mobile number: +6581234567')
      );

      // Step 2: User confirms
      mockCtx.message.text = 'confirm';
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
              pendingProxy: { type: 'mobile', normalized: '+6581234567' }
            },
            lastActivity: new Date().toISOString()
          })
        })
        .mockResolvedValueOnce({ status: 200 }); // setState

      await handler.handleInput(mockCtx);

      // Verify upsertUser was called with NEW reference
      expect(mockRepository.upsertUser).toHaveBeenCalledWith({
        telegramId: 789,
        payeeType: 'mobile',
        payeeValue: '+6581234567', // NEW reference, not the old one
        displayName: 'John',
        timestamp: expect.any(String)
      });

      // Verify "updated" message (not "saved")
      expect(mockCtx.reply).toHaveBeenCalledWith('✅ Your PayNow reference has been updated!');
    });

    it('should preserve existing user data when canceling', async () => {
      const mockCtx = {
        message: { text: '81234567' },
        reply: vi.fn(),
      } as any;

      // Existing user with original reference
      const existingUser: User = {
        telegramId: 789,
        payeeType: 'mobile',
        payeeValue: '+6591234567',
        displayName: 'John',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      };

      // Mock getUser to return existing user
      (mockRepository.getUser as any).mockResolvedValue(existingUser);

      // Step 1: User enters new mobile number
      (mockConversationDO.fetch as any)
        .mockResolvedValueOnce({
          status: 200,
          json: async () => ({
            flow: 'init',
            step: 1,
            context: { userId: 789, chatId: 123456, userName: 'John' },
            lastActivity: new Date().toISOString()
          })
        })
        .mockResolvedValueOnce({ status: 200 }); // setState

      await handler.handleInput(mockCtx);

      // Step 2: User cancels instead of confirming
      mockCtx.message.text = 'cancel';
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
              pendingProxy: { type: 'mobile', normalized: '+6581234567' }
            },
            lastActivity: new Date().toISOString()
          })
        })
        .mockResolvedValueOnce({ status: 200 }); // setState

      await handler.handleInput(mockCtx);

      // Verify upsertUser was NOT called (user data preserved)
      expect(mockRepository.upsertUser).not.toHaveBeenCalled();

      // Verify cancel message
      expect(mockCtx.reply).toHaveBeenCalledWith('❌ Cancelled. Run /init again to start over.');
    });

    it('should preserve existing user data when conversation expires (alarm)', async () => {
      // This test verifies that alarm expiry (handled by ConversationDO)
      // only clears conversation state, not user data.
      // The ConversationDO alarm handler deletes the 'conversation' key,
      // but never touches the users table.
      
      // When user re-runs /init after expiry, they should see the initial prompt
      const mockCtx = {
        chat: { id: 123456 },
        from: { id: 789, first_name: 'John' },
        reply: vi.fn(),
      } as any;

      // Mock getState to return null (conversation expired)
      (mockConversationDO.fetch as any).mockResolvedValue({
        status: 200,
        json: async () => null
      });

      await handler.start(mockCtx);

      // Verify initial prompt is shown (not trying to update anything)
      expect(mockCtx.reply).toHaveBeenCalledWith(
        expect.stringContaining('Let\'s set up your PayNow reference')
      );

      // Verify no database operations were triggered
      expect(mockRepository.upsertUser).not.toHaveBeenCalled();
    });
  });
});
