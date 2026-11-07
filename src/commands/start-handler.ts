import type { Context } from 'grammy';
import { InlineKeyboard, InputFile } from 'grammy';
import { detectProxyType, generateRef } from '../db/proxy-validation.js';
import type { EventRepository, PayeeType, Payment, Repository } from '../db/repository.js';
import { formatCents, parseAmount } from '../sgqr/amount.js';
import { buildPayNowPayload } from '../sgqr/paynow.js';
import { renderQrPng } from '../sgqr/qr-render.js';
import type { ConversationDO, ConversationState } from '../worker/conversation-do.js';

const SHARE_HINT = 'Forward this message to share';
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
      reply_markup: { inline_keyboard: [] },
    });
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

    await ctx.reply(amountPrompt(`${text} (${state.context.payerValue as string})`));
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

    await this.createPaymentAndSendQr(ctx, state, amountCents);
  }

  private async createPaymentAndSendQr(
    ctx: Context,
    state: ConversationState,
    amountCents: number
  ): Promise<void> {
    const eventRef = state.context.eventRef as string;
    const _eventName = state.context.eventName as string;
    const userId = ctx.from!.id;

    try {
      const event = await this.eventRepository.getEventByRef(eventRef);
      if (event?.status !== 'open') {
        await ctx.reply('❌ This event is closed. Run /init to open a new one.');
        await this.resetState();
        return;
      }

      // Verify event exists in DB
      const verifyEvent = await this.eventRepository.getEventByRef(event.ref);
      console.log('createPaymentAndSendQr: event.id =', event.id, 'verify.id =', verifyEvent?.id);

      const ref = generateRef();
      const qrPayload = buildPayNowPayload({
        proxyType: event.payeeType,
        proxyValue: event.payeeValue,
        amountCents,
        merchantName: event.name,
        reference: ref,
        description: event.name,
      });

      const payment: Payment = await this.repository.createPayment({
        ref,
        userId,
        eventId: event.id,
        description: event.name,
        amountCents,
        payeeType: event.payeeType,
        payeeValue: event.payeeValue,
        payerType: state.context.payerType as PayeeType,
        payerValue: state.context.payerValue as string,
        payerName: (state.context.payerName as string | undefined) ?? null,
        status: 'pending',
        source: 'manual',
        qrPayload,
        timestamp: new Date().toISOString(),
      });

      const bmpBytes = await renderQrPng(qrPayload);
      const caption = `${payment.description} / SGD ${formatCents(payment.amountCents)} / ${payment.ref} / ${SHARE_HINT}`;

      const keyboard = new InlineKeyboard()
        .text('✓ Received', `mark_received:${payment.ref}`)
        .text('Payback', `payback:${payment.ref}`);

      await ctx.replyWithPhoto(new InputFile(bmpBytes, 'paynow-qr.bmp'), {
        caption,
        reply_markup: keyboard,
      });

      await this.resetState();
    } catch (error) {
      console.error('Failed to create payment:', error);
      await ctx.reply('❌ Failed to create the payment. Please try again with a new amount:');
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
