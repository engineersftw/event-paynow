import type { Context } from 'grammy';
import { ConversationDO, type ConversationState } from '../worker/conversation-do.js';
import { detectProxyType } from '../db/proxy-validation.js';
import type { Repository, User } from '../db/repository.js';

/**
 * /init command handler - sets up user's PayNow reference
 * 
 * Flow:
 * 1. User sends /init
 * 2. Bot prompts for reference
 * 3. User provides mobile number or UEN
 * 4. Bot validates and normalizes, echoes back for confirmation
 * 5. User confirms
 * 6. Bot persists to database
 */

export class InitCommandHandler {
  private conversationDO: ConversationDO;
  private repository: Repository;

  constructor(conversationDO: ConversationDO, repository: Repository) {
    this.conversationDO = conversationDO;
    this.repository = repository;
  }

  /**
   * Handle /init command start
   */
  async start(ctx: Context): Promise<void> {
    const chatId = ctx.chat!.id;
    const userId = ctx.from!.id;
    const userName = ctx.from?.first_name || 'User';

    // Initialize conversation state
    await this.setState({
      flow: 'init',
      step: 1, // waiting for reference input
      context: { userId, chatId, userName },
      lastActivity: new Date().toISOString()
    });

    await ctx.reply('👋 Welcome! Let\'s set up your PayNow reference.\n\nPlease enter your mobile number (e.g., 91234567) or UEN (e.g., 201234567A):');
  }

  /**
   * Handle user input during init flow
   */
  async handleInput(ctx: Context): Promise<boolean> {
    const state = await this.getState();
    
    if (!state || state.flow !== 'init') {
      return false; // Not in init flow
    }

    const text = ctx.message?.text?.trim();
    if (!text) {
      return true; // Still in init flow
    }

    switch (state.step) {
      case 1:
        await this.handleReferenceInput(ctx, text, state);
        break;
      case 2:
        await this.handleConfirmation(ctx, text, state);
        break;
    }

    return true; // Still in init flow
  }

  /**
   * Step 1: Validate and echo reference for confirmation
   */
  private async handleReferenceInput(ctx: Context, input: string, state: ConversationState): Promise<void> {
    const normalized = detectProxyType(input);

    if (!normalized) {
      await ctx.reply('❌ Invalid reference. Please enter:\n• Mobile number (8 digits, starting with 6/8/9)\n• UEN (9-13 characters)\n\nTry again:');
      return;
    }

    // Store normalized proxy for confirmation
    await this.setState({
      flow: 'init',
      step: 2,
      context: {
        ...state.context,
        pendingProxy: normalized
      },
      lastActivity: new Date().toISOString()
    });

    const typeLabel = normalized.type === 'mobile' ? 'Mobile number' : 'UEN';
    await ctx.reply(`📱 ${typeLabel}: ${normalized.normalized}\n\nType "confirm" to save, or "cancel" to start over:`);
  }

  /**
   * Step 2: Handle confirmation
   */
  private async handleConfirmation(ctx: Context, input: string, state: ConversationState): Promise<void> {
    const pendingProxy = state.context.pendingProxy as { type: string; normalized: string };

    if (input.toLowerCase() === 'confirm') {
      await this.saveUser(ctx, pendingProxy, state);
    } else if (input.toLowerCase() === 'cancel') {
      await this.setState({
        flow: 'idle',
        step: 0,
        context: {},
        lastActivity: new Date().toISOString()
      });
      await ctx.reply('❌ Cancelled. Run /init again to start over.');
    } else {
      await ctx.reply('Please type "confirm" to save or "cancel" to start over:');
    }
  }

  /**
   * Save user to database
   */
  private async saveUser(ctx: Context, proxy: { type: string; normalized: string }, state: ConversationState): Promise<void> {
    const userId = state.context.userId as number;
    const userName = state.context.userName as string;

    try {
      // Check if user exists
      const existingUser = await this.repository.getUser(userId);

      if (existingUser) {
        // Update existing user
        await this.repository.upsertUser({
          telegramId: userId,
          payeeType: proxy.type as 'mobile' | 'uen',
          payeeValue: proxy.normalized,
          displayName: userName,
          timestamp: new Date().toISOString()
        });
        await ctx.reply('✅ Your PayNow reference has been updated!');
      } else {
        // Create new user
        await this.repository.upsertUser({
          telegramId: userId,
          payeeType: proxy.type as 'mobile' | 'uen',
          payeeValue: proxy.normalized,
          displayName: userName,
          timestamp: new Date().toISOString()
        });
        await ctx.reply('✅ Your PayNow reference has been saved!');
      }

      // Reset conversation state
      await this.setState({
        flow: 'idle',
        step: 0,
        context: {},
        lastActivity: new Date().toISOString()
      });

    } catch (error) {
      console.error('Failed to save user:', error);
      await ctx.reply('❌ Failed to save your reference. Please try again with /init.');
    }
  }

  /**
   * Get conversation state from DO
   */
  private async getState(): Promise<ConversationState | null> {
    const response = await this.conversationDO.fetch(new Request('http://localhost/state', { method: 'GET' }));
    if (response.status !== 200) return null;
    return await response.json() as ConversationState;
  }

  /**
   * Set conversation state in DO
   */
  private async setState(state: ConversationState): Promise<void> {
    const response = await this.conversationDO.fetch(new Request('http://localhost/state', {
      method: 'POST',
      body: JSON.stringify(state)
    }));
    // Drain the response so cross-isolate streams don't pin DO storage
    await response?.body?.cancel();
  }
}
