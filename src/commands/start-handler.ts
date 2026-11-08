import type { Context } from 'grammy';
import { InlineKeyboard, InputFile } from 'grammy';
import { detectProxyType } from '../db/proxy-validation.js';
import type { EventRepository, PayeeType, Payment, Repository } from '../db/repository.js';
import {
  createPaymentRequest,
  paymentCaption,
  paymentImageLines,
} from '../payments/payment-request.js';
import { formatCents, parseAmount } from '../sgqr/amount.js';
import { renderQrPng } from '../sgqr/qr-render.js';
import type { ConversationDO, ConversationState } from '../worker/conversation-do.js';
import { plainPayerLabel } from './payer-label.js';

const MAX_PAYER_NAME = 40;

function payerPrompt(eventName: string, payeeValue: string): string {
  return (
    `🧾 New payment for "${eventName}".\n\n` +
    `Payee: ${payeeValue}\n\n` +
    "👤 Enter the payer's PayNow mobile number or UEN (used later for paybacks)."
  );
}

function amountPrompt(payerLabel: string): string {
  return (
    `Payer: ${payerLabel}\n\n` +
    '💵 Enter the amount in dollars (e.g. 12.50).\n\n' +
    'Up to 2 decimals; the QR will be locked to this amount.'
  );
}

/** Plain-text confirmation summary for step 5 (nothing is persisted until Confirm). */
function summaryText(context: Record<string, unknown>): string {
  const payer = plainPayerLabel(
    context.payerName as string | undefined,
    context.payerValue as string
  );
  return (
    '🧾 Confirm payment request\n\n' +
    `Event: ${context.eventName as string}\n` +
    `Payer: ${payer}\n` +
    `Pay to: ${context.payeeValue as string}\n` +
    `Amount: SGD ${formatCents(context.amountCents as number)}`
  );
}

export class StartCommandHandler {
  private conversationDO: ConversationDO;
  private repository: Repository;
  private eventRepository: EventRepository;

  constructor(
    conversationDO: ConversationDO,
    repository: Repository,
    eventRepository: EventRepository
  ) {
    this.conversationDO = conversationDO;
    this.repository = repository;
    this.eventRepository = eventRepository;
  }

  async start(ctx: Context): Promise<void> {
    const chatId = ctx.chat!.id;
    const topicId = ctx.message?.message_thread_id ?? 0;
    const userId = ctx.from!.id;

    try {
      // Fetch open events for this chat+topic
      const events = await this.eventRepository.listOpenEventsByChat(chatId, topicId);

      if (events.length === 0) {
        await ctx.reply('❓ No open events.\n\nRun /init to create one first.');
        return;
      }

      // Initialize conversation state
      await this.setState({
        flow: 'start',
        step: 1, // pick event (or auto-advance if 1)
        context: { userId, chatId, topicId, events: events.map((e) => e.ref) },
        lastActivity: new Date().toISOString(),
      });

      if (events.length === 1) {
        // Auto-advance to payer step
        const event = events[0]!;
        await this.setState({
          flow: 'start',
          step: 2, // payer proxy
          context: { userId, chatId, topicId, eventRef: event.ref, eventName: event.name },
          lastActivity: new Date().toISOString(),
        });

        await ctx.reply(payerPrompt(event.name, event.payeeValue));
      } else {
        // Show event picker
        const keyboard = new InlineKeyboard();
        for (const event of events) {
          keyboard.text(`${event.name} (${event.payeeValue})`, `start_pick:${event.ref}`).row();
        }

        await ctx.reply('🧾 New payment request.\n\n' + 'Which event is this payment for?', {
          reply_markup: keyboard,
        });
      }
    } catch (error) {
      console.error('Failed to start payment flow:', error);
      await ctx.reply('❌ Failed to start the payment flow. Please try again.');
    }
  }

  async handleInput(ctx: Context): Promise<boolean> {
    const state = await this.getState();

    if (state?.flow !== 'start') {
      return false;
    }

    const text = ctx.message?.text?.trim();
    if (!text) {
      return true;
    }

    // Cancel mid-flow
    if (text.toLowerCase() === 'cancel' || text.toLowerCase() === '/cancel') {
      await this.resetState();
      await ctx.reply('❌ Start cancelled. No payment was created.');
      return true;
    }

    switch (state.step) {
      case 2:
        await this.handlePayerInput(ctx, text, state);
        break;
      case 3:
        await this.handleNameInput(ctx, text, state);
        break;
      case 4:
        await this.handleAmountInput(ctx, text, state);
        break;
      case 5:
        // Confirmation is button-driven; text input gets a nudge
        await ctx.reply('⏳ Please tap Confirm or Cancel on the summary above.');
        break;
      default:
        // Step 1 (pick event) is button-driven; text input gets a nudge
        await ctx.reply('⏳ Waiting for event selection. Please tap a button above.');
        break;
    }

    return true;
  }

  async handleCallback(ctx: Context): Promise<boolean> {
    const data = ctx.callbackQuery?.data;
    if (data === 'start_skip_name') {
      return this.handleSkipName(ctx);
    }
    if (data === 'start_use_default') {
      return this.handleUseDefault(ctx);
    }
    if (data === 'start_confirm') {
      return this.handleConfirm(ctx);
    }
    if (data === 'start_cancel') {
      return this.handleCancelButton(ctx);
    }
    if (!data?.startsWith('start_pick:')) {
      return false;
    }

    const eventRef = data.split(':')[1];
    if (!eventRef) return false;

    const state = await this.getState();
    if (state?.flow !== 'start' || state.step !== 1) {
      await ctx.answerCallbackQuery({ text: '❌ Session expired. Run /start again.' });
      return true;
    }

    // Verify event is still open
    const event = await this.eventRepository.getEventByRef(eventRef);
    if (event?.status !== 'open') {
      await ctx.answerCallbackQuery({
        text: '❌ This event is closed. Run /init to open a new one.',
      });
      return true;
    }

    // Transition to payer step
    await this.setState({
      flow: 'start',
      step: 2,
      context: {
        ...state.context,
        eventRef: event.ref,
        eventName: event.name,
      },
      lastActivity: new Date().toISOString(),
    });

    await ctx.answerCallbackQuery({ text: `Selected: ${event.name}` });
    await ctx.editMessageText(payerPrompt(event.name, event.payeeValue), {
      reply_markup: { inline_keyboard: [] },
    });

    return true;
  }

  private async handleSkipName(ctx: Context): Promise<boolean> {
    const state = await this.getState();
    if (state?.flow !== 'start' || state.step !== 3) {
      await ctx.answerCallbackQuery({ text: '❌ Session expired. Run /start again.' });
      return true;
    }
    await this.setState({
      ...state,
      step: 4,
      lastActivity: new Date().toISOString(),
    });
    await ctx.answerCallbackQuery({ text: 'Skipped' });
    await ctx.editMessageText(amountPrompt(state.context.payerValue as string), {
      reply_markup: (await this.defaultAmountKeyboard(state.context.eventRef as string)) ?? {
        inline_keyboard: [],
      },
    });
    return true;
  }

  /** "Use SGD x.xx" button when the (open) event has a default amount. */
  private async defaultAmountKeyboard(eventRef: string): Promise<InlineKeyboard | undefined> {
    const event = await this.eventRepository.getEventByRef(eventRef);
    if (event?.status !== 'open' || !event.defaultAmountCents) return undefined;
    return new InlineKeyboard().text(
      `Use SGD ${formatCents(event.defaultAmountCents)}`,
      'start_use_default'
    );
  }

  /** Tap on the default amount button: same path as typing that amount. */
  private async handleUseDefault(ctx: Context): Promise<boolean> {
    const state = await this.getState();
    if (state?.flow !== 'start' || state.step !== 4) {
      await ctx.answerCallbackQuery({ text: '❌ Session expired. Run /start again.' });
      return true;
    }
    const event = await this.eventRepository.getEventByRef(state.context.eventRef as string);
    if (event?.status !== 'open') {
      await ctx.answerCallbackQuery({
        text: '❌ This event is closed. Run /init to open a new one.',
      });
      await this.resetState();
      return true;
    }
    if (!event.defaultAmountCents) {
      await ctx.answerCallbackQuery({ text: '❌ This event has no default amount.' });
      return true;
    }

    await ctx.answerCallbackQuery({ text: `SGD ${formatCents(event.defaultAmountCents)}` });
    await ctx.editMessageText(
      `💵 Amount: SGD ${formatCents(event.defaultAmountCents)} (event default)`,
      {
        reply_markup: { inline_keyboard: [] },
      }
    );
    await this.proceedWithAmount(ctx, event.defaultAmountCents, state);
    return true;
  }

  private async handlePayerInput(
    ctx: Context,
    text: string,
    state: ConversationState
  ): Promise<void> {
    const payer = detectProxyType(text);
    if (!payer) {
      await ctx.reply(
        '❌ Invalid PayNow reference. Please enter:\n• Mobile number (8 digits, starting with 6/8/9)\n• UEN (9-13 characters)\n\nTry again:'
      );
      return;
    }

    await this.setState({
      flow: 'start',
      step: 3,
      context: { ...state.context, payerType: payer.type, payerValue: payer.normalized },
      lastActivity: new Date().toISOString(),
    });

    await ctx.reply(
      `👤 Payer: ${payer.normalized}\n\nEnter the payer's name (optional), or skip:`,
      {
        reply_markup: new InlineKeyboard().text('Skip', 'start_skip_name'),
      }
    );
  }

  private async handleNameInput(
    ctx: Context,
    text: string,
    state: ConversationState
  ): Promise<void> {
    if (text.length > MAX_PAYER_NAME) {
      await ctx.reply(`❌ Name is too long (max ${MAX_PAYER_NAME} characters). Try again:`);
      return;
    }

    await this.setState({
      flow: 'start',
      step: 4,
      context: { ...state.context, payerName: text },
      lastActivity: new Date().toISOString(),
    });

    const prompt = amountPrompt(`${text} (${state.context.payerValue as string})`);
    const keyboard = await this.defaultAmountKeyboard(state.context.eventRef as string);
    if (keyboard) await ctx.reply(prompt, { reply_markup: keyboard });
    else await ctx.reply(prompt);
  }

  private async handleAmountInput(
    ctx: Context,
    text: string,
    state: ConversationState
  ): Promise<void> {
    const amountCents = parseAmount(text);
    if (amountCents === null) {
      await ctx.reply(
        '❌ Invalid amount. Enter a positive number with up to 2 decimals (e.g. 5 or 12.50).\n\nTry again:'
      );
      return;
    }

    await this.proceedWithAmount(ctx, amountCents, state);
  }

  /** A valid amount (typed, or the event's default): move to the confirmation summary. */
  private async proceedWithAmount(
    ctx: Context,
    amountCents: number,
    state: ConversationState
  ): Promise<void> {
    try {
      const event = await this.eventRepository.getEventByRef(state.context.eventRef as string);
      if (event?.status !== 'open') {
        await ctx.reply('❌ This event is closed. Run /init to open a new one.');
        await this.resetState();
        return;
      }

      const context = { ...state.context, amountCents, payeeValue: event.payeeValue };
      await this.setState({
        flow: 'start',
        step: 5, // confirm
        context,
        lastActivity: new Date().toISOString(),
      });

      await ctx.reply(summaryText(context), {
        reply_markup: new InlineKeyboard()
          .text('✅ Confirm', 'start_confirm')
          .text('❌ Cancel', 'start_cancel'),
      });
    } catch (error) {
      console.error('Failed to prepare payment confirmation:', error);
      await ctx.reply('❌ Something went wrong. Please enter the amount again:');
    }
  }

  /** Confirm: claim the conversation atomically (one winner), then create the payment + QR. */
  private async handleConfirm(ctx: Context): Promise<boolean> {
    const claimed = await this.claimConfirmStep();
    if (!claimed) {
      await ctx.answerCallbackQuery({
        text: '⚠️ Already processed or expired. Run /start again.',
      });
      return true;
    }

    await ctx.answerCallbackQuery({ text: 'Confirmed' });
    await ctx.editMessageText(`${summaryText(claimed.context)}\n\n✅ Confirmed`, {
      reply_markup: { inline_keyboard: [] },
    });
    await this.createPaymentAndSendQr(ctx, claimed, claimed.context.amountCents as number);
    return true;
  }

  private async handleCancelButton(ctx: Context): Promise<boolean> {
    const claimed = await this.claimConfirmStep();
    if (!claimed) {
      await ctx.answerCallbackQuery({ text: '⚠️ Already processed or expired.' });
      return true;
    }

    await ctx.answerCallbackQuery({ text: 'Cancelled' });
    await ctx.editMessageText('❌ Start cancelled. No payment was created.', {
      reply_markup: { inline_keyboard: [] },
    });
    return true;
  }

  /** Atomically take the step-5 conversation (resets it to idle); null if someone else did. */
  private async claimConfirmStep(): Promise<ConversationState | null> {
    const response = await this.conversationDO.fetch(
      new Request('http://localhost/claim', {
        method: 'POST',
        body: JSON.stringify({ flow: 'start', step: 5 }),
      })
    );
    if (response.status !== 200) {
      await response.body?.cancel();
      return null;
    }
    return (await response.json()) as ConversationState;
  }

  private async createPaymentAndSendQr(
    ctx: Context,
    state: ConversationState,
    amountCents: number
  ): Promise<void> {
    const eventRef = state.context.eventRef as string;
    const _eventName = state.context.eventName as string;
    const userId = ctx.from!.id;
    let createdRef: string | undefined;

    try {
      const event = await this.eventRepository.getEventByRef(eventRef);
      if (event?.status !== 'open') {
        // State was already reset by the Confirm claim
        await ctx.reply('❌ This event is closed. Run /init to open a new one.');
        return;
      }

      const payment: Payment = await createPaymentRequest(this.repository, event, {
        payerType: state.context.payerType as PayeeType,
        payerValue: state.context.payerValue as string,
        payerName: (state.context.payerName as string | undefined) ?? null,
        amountCents,
        userId,
      });
      createdRef = payment.ref;

      // Same name-only rule as the caption: the image is forwarded too
      const bmpBytes = await renderQrPng(payment.qrPayload, paymentImageLines(event, payment));
      const caption = paymentCaption(payment);

      const keyboard = new InlineKeyboard()
        .text('✓ Received', `mark_received:${payment.ref}`)
        .text('✖ Void', `void:${payment.ref}`);

      await ctx.replyWithPhoto(new InputFile(bmpBytes, 'paynow-qr.bmp'), {
        caption,
        reply_markup: keyboard,
      });
    } catch (error) {
      console.error('Failed to create payment:', error);
      // No QR reached the user, so don't leave a pending payment padding event totals
      if (createdRef) await this.repository.voidPayment(createdRef).catch(() => null);
      // The Confirm claim already ended the conversation, so a retry means a fresh /start
      await ctx.reply('❌ Failed to create the payment. Please run /start again.');
    }
  }

  private async getState(): Promise<ConversationState | null> {
    const response = await this.conversationDO.fetch(
      new Request('http://localhost/state', { method: 'GET' })
    );
    if (response.status !== 200) return null;
    return (await response.json()) as ConversationState;
  }

  private async setState(state: ConversationState): Promise<void> {
    const response = await this.conversationDO.fetch(
      new Request('http://localhost/state', {
        method: 'POST',
        body: JSON.stringify(state),
      })
    );
    await response?.body?.cancel();
  }

  private async resetState(): Promise<void> {
    await this.setState({
      flow: 'idle',
      step: 0,
      context: {},
      lastActivity: new Date().toISOString(),
    });
  }

  async cancel(ctx: Context): Promise<void> {
    const state = await this.getState();
    if (state && state.flow === 'start') {
      await this.resetState();
      await ctx.reply('❌ Start cancelled. No payment was created.');
    } else {
      await ctx.reply('Nothing to cancel.');
    }
  }
}
