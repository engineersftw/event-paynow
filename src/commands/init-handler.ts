import type { Context } from 'grammy';
import { InlineKeyboard } from 'grammy';
import { detectProxyType, generateRef } from '../db/proxy-validation.js';
import type { EventRepository, Repository } from '../db/repository.js';
import { formatCents, parseAmount } from '../sgqr/amount.js';
import type { ConversationDO, ConversationState } from '../worker/conversation-do.js';
import { escapeMarkdown } from './payer-label.js';
import { normalizeWebsiteUrl } from './website-url.js';

/**
 * /init command handler — creates an Event.
 *
 * Flow (new event model):
 * 1. User sends /init
 * 2. Step 1: collect event name (non-empty, ≤ 50 chars)
 * 3. Step 2: collect mobile number or UEN (payee for this event)
 * 4. Step 3: optional default amount to collect (text, or a Skip button)
 * 5. Step 4: optional event website (text, or a Skip button); only http/https addresses are accepted
 *    (see normalizeWebsiteUrl) and the stored form is the normalised URL
 * 6. Step 5: echo name + payee (+ amount, website) for confirmation via inline Confirm/Cancel buttons
 * 7. On Confirm: create events row, reply with ref + summary
 * 8. On Cancel: reset state without creating the event
 *
 * The event name becomes the fixed description for every payment in the event. Each optional step
 * (amount, website) has its own Skip button (`init_skip_amount:` / `init_skip_website:`); every
 * button and text input is checked against the current step, so a stale tap reads as expired.
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
        await this.handleWebsiteInput(ctx, text, state);
        break;
      case 5:
        // Step 5 is button-driven; text input gets a nudge
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

    await this.setState({
      flow: 'init',
      step: 4, // waiting for the optional website
      context: { ...state.context, defaultAmountCents: cents },
      lastActivity: new Date().toISOString(),
    });

    await ctx.reply(WEBSITE_PROMPT, {
      reply_markup: skipWebsiteKeyboard(state.context.userId as number),
    });
  }

  /**
   * Step 4: optional event website typed as text (http/https only, see normalizeWebsiteUrl).
   */
  private async handleWebsiteInput(
    ctx: Context,
    input: string,
    state: ConversationState
  ): Promise<void> {
    const url = normalizeWebsiteUrl(input);
    if (url === null) {
      await ctx.reply(
        '❌ That is not a valid web address. Send a link starting with http:// or https:// (or just example.com/page), up to 200 characters, or tap Skip.'
      );
      return;
    }

    const context = { ...state.context, websiteUrl: url };
    await this.setState({
      flow: 'init',
      step: 5,
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
        !data.startsWith('init_skip_amount:') &&
        !data.startsWith('init_skip_website:'))
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
      await ctx.editMessageText(WEBSITE_PROMPT, {
        reply_markup: skipWebsiteKeyboard(state.context.userId as number),
      });
      return true;
    }

    if (data.startsWith('init_skip_website:')) {
      if (state?.flow !== 'init' || state.step !== 4) {
        await ctx.editMessageText('❌ Session expired. Run /init again.', {
          reply_markup: { inline_keyboard: [] },
        });
        return true;
      }
      await this.setState({
        flow: 'init',
        step: 5,
        context: state.context,
        lastActivity: new Date().toISOString(),
      });
      await ctx.editMessageText(`${summary(state.context)}\n\nTap a button to confirm or cancel:`, {
        reply_markup: confirmKeyboard(state.context.userId as number),
      });
      return true;
    }

    if (state?.flow !== 'init' || state.step !== 5) {
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
        websiteUrl: (state.context.websiteUrl as string | undefined) ?? null,
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
          (event.websiteUrl ? `🌐 Website: ${escapeMarkdown(event.websiteUrl)}\n` : '') +
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

const WEBSITE_PROMPT =
  '🌐 Event website (optional).\n\n' +
  "Send the link to the event's own page (e.g. https://example.com/dinner) and it will be shown on " +
  'the web pages, or skip:';

const skipWebsiteKeyboard = (userId: number) =>
  new InlineKeyboard().text('Skip', `init_skip_website:${userId}`);

const confirmKeyboard = (userId: number) =>
  new InlineKeyboard()
    .text('✅ Confirm', `init_confirm:${userId}`)
    .text('❌ Cancel', `init_cancel:${userId}`);

/** Event / payee / optional default amount / optional website lines shown on the confirmation and cancel messages. */
function summary(context: Record<string, unknown>): string {
  const proxy = context.pendingProxy as { type: string; normalized: string };
  const cents = context.defaultAmountCents as number | undefined;
  const website = context.websiteUrl as string | undefined;
  return (
    `📋 Event: ${context.eventName}\n` +
    `📱 ${proxy.type === 'mobile' ? 'Mobile number' : 'UEN'}: ${proxy.normalized}` +
    (cents === undefined ? '' : `\n💰 Default amount: SGD ${formatCents(cents)}`) +
    (website === undefined ? '' : `\n🌐 Website: ${website}`)
  );
}
