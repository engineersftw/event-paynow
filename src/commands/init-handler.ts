import type { Context } from 'grammy';
import { InlineKeyboard } from 'grammy';
import { detectProxyType, generateRef } from '../db/proxy-validation.js';
import type { EventRepository, Repository } from '../db/repository.js';
import { formatCents, parseAmount } from '../sgqr/amount.js';
import type { ConversationDO, ConversationState } from '../worker/conversation-do.js';

/**
 * /init command handler — creates an Event.
 *
 * Flow (new event model):
 * 1. User sends /init
 * 2. Step 1: collect event name (non-empty, ≤ 50 chars)
 * 3. Step 2: collect mobile number or UEN (payee for this event)
 * 4. Step 3: optional default amount to collect (text, or a Skip button)
 * 5. Step 4: echo name + payee (+ amount) for confirmation via inline Confirm/Cancel buttons
 * 6. On Confirm: create events row, reply with ref + summary
 * 7. On Cancel: reset state without creating the event
 *
 * The event name becomes the fixed description for every payment in the event.
 */

export class InitCommandHandler {
  private conversationDO: ConversationDO;
  private eventRepository: EventRepository;

  constructor(
    conversationDO: ConversationDO,
    _repository: Repository,
    eventRepository: EventRepository
  ) {
    this.conversationDO = conversationDO;
    this.eventRepository = eventRepository;
  }

  async start(ctx: Context): Promise<void> {
    const chatId = ctx.chat!.id;
    const userId = ctx.from!.id;
    const topicId = ctx.message?.message_thread_id ?? 0;
    const userName = ctx.from?.first_name || 'User';

    await this.setState({
      flow: 'init',
      step: 1, // waiting for event name
      context: { userId, chatId, topicId, userName },
      lastActivity: new Date().toISOString(),
    });

    await ctx.reply(
      "👋 Let's create a new event.\n\n" +
        'What\'s the event name? (e.g. "Dinner split", "Birthday party")\n\n' +
        'This will be used as the description on all payment QRs for this event.'
    );
  }

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
        await this.handleEventNameInput(ctx, text, state);
        break;
      case 2:
        await this.handlePayeeInput(ctx, text, state);
        break;
      case 3:
        await this.handleDefaultAmountInput(ctx, text, state);
        break;
      case 4:
        // Step 4 is button-driven; text input gets a nudge
        await ctx.reply('⏳ Waiting for confirmation. Please tap a button above.');
        break;
    }

    return true; // Still in init flow
  }

  /**
   * Step 1: Collect event name.
   */
  private async handleEventNameInput(
    ctx: Context,
    input: string,
    state: ConversationState
  ): Promise<void> {
    const name = input.trim();
    if (!name || name.length > 50) {
      await ctx.reply('❌ Event name must be between 1 and 50 characters. Please try again:');
      return;
    }

    await this.setState({
      flow: 'init',
      step: 2, // waiting for payee proxy
      context: { ...state.context, eventName: name },
      lastActivity: new Date().toISOString(),
    });

    await ctx.reply(
      `📋 Event: ${name}\n\n` +
        'Now enter the PayNow payee for this event — mobile number (e.g., 91234567) or UEN (e.g., 201234567A):'
    );
  }

  /**
   * Step 2: Validate payee proxy and echo for confirmation with buttons.
   */
  private async handlePayeeInput(
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

    await this.setState({
      flow: 'init',
      step: 3, // waiting for the optional default amount
      context: {
        ...state.context,
        pendingProxy: normalized,
      },
      lastActivity: new Date().toISOString(),
    });

    await ctx.reply(
      '💰 Default amount to collect (optional).\n\n' +
        'Enter an amount in SGD (e.g. 21 or 12.50) and /start will offer it for every payment ' +
        'in this event, or skip:',
      {
        reply_markup: new InlineKeyboard().text(
          'Skip',
          `init_skip_amount:${state.context.userId as number}`
        ),
      }
    );
  }

  /**
   * Step 3: optional default amount typed as text.
   */
  private async handleDefaultAmountInput(
    ctx: Context,
    input: string,
    state: ConversationState
  ): Promise<void> {
    const cents = parseAmount(input);
    if (cents === null) {
      await ctx.reply(
        '❌ Invalid amount. Enter a positive number with up to 2 decimals (e.g. 21 or 12.50), or tap Skip.'
      );
      return;
    }

    const context = { ...state.context, defaultAmountCents: cents };
    await this.setState({
      flow: 'init',
      step: 4,
      context,
      lastActivity: new Date().toISOString(),
    });

    await ctx.reply(`${summary(context)}\n\nTap a button to confirm or cancel:`, {
      reply_markup: confirmKeyboard(state.context.userId as number),
    });
  }

  /**
   * Handle Confirm / Cancel inline-button taps.
   */
  async handleCallback(ctx: Context): Promise<boolean> {
    const data = ctx.callbackQuery?.data;
    if (
      !data ||
      (!data.startsWith('init_confirm:') &&
        !data.startsWith('init_cancel:') &&
        !data.startsWith('init_skip_amount:'))
    ) {
      return false;
    }

    const state = await this.getState();

    if (data.startsWith('init_skip_amount:')) {
      if (state?.flow !== 'init' || state.step !== 3) {
        await ctx.editMessageText('❌ Session expired. Run /init again.', {
          reply_markup: { inline_keyboard: [] },
        });
        return true;
      }
      await this.setState({
        flow: 'init',
        step: 4,
        context: state.context,
        lastActivity: new Date().toISOString(),
      });
      await ctx.editMessageText(`${summary(state.context)}\n\nTap a button to confirm or cancel:`, {
        reply_markup: confirmKeyboard(state.context.userId as number),
      });
      return true;
    }

    if (state?.flow !== 'init' || state.step !== 4) {
      await ctx.editMessageText('❌ Session expired. Run /init again.', {
        reply_markup: { inline_keyboard: [] },
      });
      return true;
    }

    const pendingProxy = state.context.pendingProxy as { type: string; normalized: string };
    const confirmed = data.startsWith('init_confirm:');

    if (confirmed) {
      await this.createEvent(ctx, pendingProxy, state);
    } else {
      await this.setState({
        flow: 'idle',
        step: 0,
        context: {},
        lastActivity: new Date().toISOString(),
      });
      await ctx.editMessageText(
        `${summary(state.context)}\n\n❌ Cancelled. Run /init again to start over.`,
        { reply_markup: { inline_keyboard: [] } }
      );
    }

    return true;
  }

  /**
   * Create the event in D1.
   */
  private async createEvent(
    ctx: Context,
    proxy: { type: string; normalized: string },
    state: ConversationState
  ): Promise<void> {
    const _userId = state.context.userId as number;
    const chatId = state.context.chatId as number;
    const topicId = state.context.topicId as number;
    const eventName = state.context.eventName as string;
    const _userName = state.context.userName as string;
    const ref = generateRef();

    try {
      const event = await this.eventRepository.createEvent({
        ref,
        chatId,
        topicId,
        name: eventName,
        payeeType: proxy.type as 'mobile' | 'uen',
        payeeValue: proxy.normalized,
        status: 'open',
        defaultAmountCents: (state.context.defaultAmountCents as number | undefined) ?? null,
        timestamp: new Date().toISOString(),
      });

      await this.setState({
        flow: 'idle',
        step: 0,
        context: {},
        lastActivity: new Date().toISOString(),
      });

      await ctx.editMessageText(
        `✅ Event created!\n\n` +
          `📋 Name: ${event.name}\n` +
          `📱 Payee: ${proxy.normalized}\n` +
          (event.defaultAmountCents === null
            ? ''
            : `💰 Default amount: SGD ${formatCents(event.defaultAmountCents)}\n`) +
          `🔗 Ref: \`${event.ref}\`\n\n` +
          'Use /start to create payments for this event.',
        { parse_mode: 'Markdown', reply_markup: { inline_keyboard: [] } }
      );
    } catch (error) {
      console.error('Failed to create event:', error);
      await ctx.editMessageText(`❌ Failed to create event. Please try again with /init.`, {
        reply_markup: { inline_keyboard: [] },
      });
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
    await response?.body?.cancel();
  }
}

const confirmKeyboard = (userId: number) =>
  new InlineKeyboard()
    .text('✅ Confirm', `init_confirm:${userId}`)
    .text('❌ Cancel', `init_cancel:${userId}`);

/** Event / payee / optional default amount lines shown on the confirmation and cancel messages. */
function summary(context: Record<string, unknown>): string {
  const proxy = context.pendingProxy as { type: string; normalized: string };
  const cents = context.defaultAmountCents as number | undefined;
  return (
    `📋 Event: ${context.eventName}\n` +
    `📱 ${proxy.type === 'mobile' ? 'Mobile number' : 'UEN'}: ${proxy.normalized}` +
    (cents === undefined ? '' : `\n💰 Default amount: SGD ${formatCents(cents)}`)
  );
}
