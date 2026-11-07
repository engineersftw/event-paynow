import type { Context } from 'grammy';
import { InlineKeyboard } from 'grammy';
import { detectProxyType } from '../db/proxy-validation.js';
import type { Repository } from '../db/repository.js';
import type { ConversationDO, ConversationState } from '../worker/conversation-do.js';

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
      lastActivity: new Date().toISOString(),
    });

    await ctx.reply(
      "👋 Welcome! Let's set up your PayNow reference.\n\nPlease enter your mobile number (e.g., 91234567) or UEN (e.g., 201234567A):"
    );
  }

  /**
   * Handle user input during init flow
   */
  async handleInput(ctx: Context): Promise<boolean> {
    const state = await this.getState();

    if (state?.flow !== 'init') {
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
        // Step 2 is now button-driven; text input here means the user typed
        // something after the buttons appeared. Re-show the prompt silently.
        await ctx.reply('⏳ Waiting for confirmation. Please tap a button above.');
        break;
    }

    return true; // Still in init flow
  }

  /**
   * Step 1: Validate and echo reference with Confirm / Cancel buttons.
   */
  private async handleReferenceInput(
    ctx: Context,
    input: string,
    state: ConversationState
  ): Promise<void> {
    const normalized = detectProxyType(input);

    if (!normalized) {
      await ctx.reply(
        '❌ Invalid reference. Please enter:\n• Mobile number (8 digits, starting with 6/8/9)\n• UEN (9-13 characters)\n\nTry again:'
      );
      return;
    }

    // Store normalized proxy for the button callback to pick up
    await this.setState({
      flow: 'init',
      step: 2,
      context: {
        ...state.context,
        pendingProxy: normalized,
      },
      lastActivity: new Date().toISOString(),
    });

    const typeLabel = normalized.type === 'mobile' ? 'Mobile number' : 'UEN';
    const keyboard = new InlineKeyboard()
      .text('✅ Confirm', `init_confirm:${state.context.userId as number}`)
      .text('❌ Cancel', `init_cancel:${state.context.userId as number}`);

    await ctx.reply(
      `📱 ${typeLabel}: ${normalized.normalized}\n\nTap a button to confirm or cancel:`,
      { reply_markup: keyboard }
    );
  }

  /**
   * Handle Confirm / Cancel inline-button taps.
   * All outcomes update the original confirmation message in place
   * (editMessageText with buttons cleared) — no extra chat bubbles.
   */
  async handleCallback(ctx: Context): Promise<boolean> {
    const data = ctx.callbackQuery?.data;
    if (!data || (!data.startsWith('init_confirm:') && !data.startsWith('init_cancel:'))) {
      return false; // Not ours — let the next dispatcher try
    }

    const state = await this.getState();
    if (state?.flow !== 'init' || state.step !== 2) {
      // Session gone — replace the confirmation message with an expired note.
      await ctx.editMessageText('❌ Session expired. Run /init again.', {
        reply_markup: { inline_keyboard: [] },
      });
      return true;
    }

    const pendingProxy = state.context.pendingProxy as { type: string; normalized: string };
    const confirmed = data.startsWith('init_confirm:');

    if (confirmed) {
      await this.saveUser(ctx, pendingProxy, state);
    } else {
      // Reset state first so a double-tap sees idle.
      await this.setState({
        flow: 'idle',
        step: 0,
        context: {},
        lastActivity: new Date().toISOString(),
      });
      const proxyLabel = pendingProxy.type === 'mobile' ? 'Mobile number' : 'UEN';
      await ctx.editMessageText(
        `📱 ${proxyLabel}: ${pendingProxy.normalized}\n\n❌ Cancelled. Run /init again to start over.`,
        { reply_markup: { inline_keyboard: [] } }
      );
    }

    return true;
  }

  /**
   * Save user to database — outcome replaces the confirmation message in place.
   */
  private async saveUser(
    ctx: Context,
    proxy: { type: string; normalized: string },
    state: ConversationState
  ): Promise<void> {
    const userId = state.context.userId as number;
    const userName = state.context.userName as string;
    const isNew = !(await this.repository.getUser(userId));
    const proxyLabel = proxy.type === 'mobile' ? 'Mobile number' : 'UEN';

    try {
      await this.repository.upsertUser({
        telegramId: userId,
        payeeType: proxy.type as 'mobile' | 'uen',
        payeeValue: proxy.normalized,
        displayName: userName,
        timestamp: new Date().toISOString(),
      });

      // Reset conversation state BEFORE editing the message, so a double-tap
      // races to a non-init state and sees "Session expired" instead of a
      // second upsert.
      await this.setState({
        flow: 'idle',
        step: 0,
        context: {},
        lastActivity: new Date().toISOString(),
      });

      const outcome = isNew ? '✅ Reference saved.' : '✅ Reference updated.';
      await ctx.editMessageText(`📱 ${proxyLabel}: ${proxy.normalized}\n\n${outcome}`, {
        reply_markup: { inline_keyboard: [] },
      });
    } catch (error) {
      console.error('Failed to save user:', error);
      await ctx.editMessageText(
        `📱 ${proxyLabel}: ${proxy.normalized}\n\n❌ Failed to save your reference. Try /init again.`,
        { reply_markup: { inline_keyboard: [] } }
      );
    }
  }

  /**
   * Get conversation state from DO
   */
  private async getState(): Promise<ConversationState | null> {
    const response = await this.conversationDO.fetch(
      new Request('http://localhost/state', { method: 'GET' })
    );
    if (response.status !== 200) return null;
    return (await response.json()) as ConversationState;
  }

  /**
   * Set conversation state in DO
   */
  private async setState(state: ConversationState): Promise<void> {
    const response = await this.conversationDO.fetch(
      new Request('http://localhost/state', {
        method: 'POST',
        body: JSON.stringify(state),
      })
    );
    // Drain the response so cross-isolate streams don't pin DO storage
    await response?.body?.cancel();
  }
}
