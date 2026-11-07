import type { Context } from 'grammy';
import { InputFile } from 'grammy';
import { generateRef } from '../db/proxy-validation.js';
import type { Payment, Repository, User } from '../db/repository.js';
import { formatCents, parseAmount } from '../sgqr/amount.js';
import { buildPayNowPayload } from '../sgqr/paynow.js';
import { renderQrPng } from '../sgqr/qr-render.js';
import type { ConversationDO, ConversationState } from '../worker/conversation-do.js';

/**
 * /start command handler - creates a payment request with a PayNow QR code
 *
 * Flow (tasks 5.1-5.3):
 * 1. User sends /start
 * 2. Guard (5.1): if the user has no PayNow reference stored (never ran /init),
 *    they are prompted to run /init and no QR is generated
 * 3. Step 1 (5.2): prompt for description — non-empty text
 * 4. Step 2 (5.2): prompt for amount — validated via parseAmount (integer cents,
 *    up to 2 decimals); invalid input re-prompts
 * 5. On completion (5.3): create the payment row (status `pending`, unique
 *    base32 `ref`, payee snapshot from the /init reference), build the SGQR
 *    payload via the 2.2 builder, render the QR via 2.4, and sendPhoto with
 *    caption `description / SGD amount / ref / "Forward this message to share"`
 * 6. `/cancel` (text 'cancel' or '/cancel' mid-flow) and 10-min alarm expiry
 *    create no record (5.2)
 *
 * Payee snapshot immutability (5.4): payeeType/payeeValue/displayName are copied
 * into the conversation at /start time and written into the payment row and the
 * embedded qr_payload. A later /init that rewrites the users row cannot touch
 * already-created payments — the repository never re-derives them from users.
 *
 * Runtime note: QR bytes come from the pure-JS BMP renderer (src/sgqr/qr-render.ts)
 * which runs inside the Workers isolate; Telegram accepts BMP in sendPhoto.
 */

/** Caption hint telling the payer to forward the message. */
const SHARE_HINT = 'Forward this message to share';

export class StartCommandHandler {
  private conversationDO: ConversationDO;
  private repository: Repository;

  constructor(conversationDO: ConversationDO, repository: Repository) {
    this.conversationDO = conversationDO;
    this.repository = repository;
  }

  /**
   * Handle /start command — guard against unconfigured users, otherwise
   * begin the payment conversation with the payee snapshot in context.
   */
  async start(ctx: Context): Promise<void> {
    const userId = ctx.from!.id;

    try {
      // 5.1 guard: /init must have stored a PayNow reference first
      const user = await this.repository.getUser(userId);
      if (!user) {
        await ctx.reply(
          '❓ You haven\u2019t set up your PayNow reference yet.\n\n' +
            'Please run /init first to configure your mobile number or UEN, then come back to /start.'
        );
        return;
      }

      // Snapshot the payee for this payment (immutable from here on — task 5.4)
      await this.setState({
        flow: 'start',
        step: 1, // waiting for description
        context: {
          payeeType: user.payeeType,
          payeeValue: user.payeeValue,
          displayName: user.displayName,
        },
        lastActivity: new Date().toISOString(),
      });

      await ctx.reply(
        '🧾 New payment request.\n\n' +
          `Payee: ${user.displayName} (${user.payeeValue})\n\n` +
          'Enter a short description for this payment:'
      );
    } catch (error) {
      console.error('Failed to start payment flow:', error);
      await ctx.reply('❌ Failed to start the payment flow. Please try again.');
    }
  }

  /**
   * Handle user input during the /start flow.
   * Returns true if the message was consumed by the flow.
   */
  async handleInput(ctx: Context): Promise<boolean> {
    const state = await this.getState();

    if (state?.flow !== 'start') {
      return false; // Not in start flow (also covers alarm expiry clearing state)
    }

    const text = ctx.message?.text?.trim();
    if (!text) {
      return true; // Still in start flow
    }

    // 5.2: /cancel mid-flow creates no record
    if (text.toLowerCase() === 'cancel' || text.toLowerCase() === '/cancel') {
      await this.resetState();
      await ctx.reply('❌ Start cancelled. No payment was created.');
      return true;
    }

    switch (state.step) {
      case 1:
        await this.handleDescriptionInput(ctx, text, state);
        break;
      case 2:
        await this.handleAmountInput(ctx, text, state);
        break;
    }

    return true;
  }

  /**
   * Explicit /cancel entry point for bot wiring (task 5.2).
   */
  async cancel(ctx: Context): Promise<void> {
    const state = await this.getState();
    if (state && state.flow === 'start') {
      await this.resetState();
      await ctx.reply('❌ Start cancelled. No payment was created.');
    } else {
      await ctx.reply('Nothing to cancel.');
    }
  }

  /**
   * Step 1: Collect the payment description.
   */
  private async handleDescriptionInput(
    ctx: Context,
    text: string,
    state: ConversationState
  ): Promise<void> {
    if (!text.trim()) {
      await ctx.reply('❌ Description cannot be empty. Please enter a short description:');
      return;
    }

    await this.setState({
      flow: 'start',
      step: 2, // waiting for amount
      context: { ...state.context, description: text },
      lastActivity: new Date().toISOString(),
    });

    await ctx.reply(
      '💵 Enter the amount in dollars (e.g. 12.50).\n\n' +
        'Up to 2 decimals; the QR will be locked to this amount.'
    );
  }

  /**
   * Step 2: Validate amount, then create the payment record and send the QR (5.3).
   */
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

  /**
   * Task 5.3: create payment row → build payload → render QR → sendPhoto.
   */
  private async createPaymentAndSendQr(
    ctx: Context,
    state: ConversationState,
    amountCents: number
  ): Promise<void> {
    const payeeType = state.context.payeeType as User['payeeType'];
    const payeeValue = state.context.payeeValue as string;
    const displayName = state.context.displayName as string;
    const description = state.context.description as string;
    const userId = ctx.from!.id;

    const ref = generateRef();

    // SGQR payload per design §3 with the payee snapshot and embedded ref
    const qrPayload = buildPayNowPayload({
      proxyType: payeeType,
      proxyValue: payeeValue,
      amountCents,
      merchantName: displayName,
      reference: ref,
      description,
    });

    try {
      // Pending payment record; payee snapshot is written here and never re-derived (5.4)
      const payment: Payment = await this.repository.createPayment({
        ref,
        userId,
        description,
        amountCents,
        payeeType,
        payeeValue,
        status: 'pending',
        source: 'manual',
        qrPayload,
        timestamp: new Date().toISOString(),
      });

      const bmpBytes = await renderQrPng(qrPayload);
      const caption = this.buildCaption(payment);

      await ctx.replyWithPhoto(new InputFile(bmpBytes, 'paynow-qr.bmp'), { caption });

      await this.resetState();

      await ctx.reply(
        `🧾 Payment \`${ref}\` is pending.\n\n` +
          'Scan the QR to pay, or forward the message to the payer.\n' +
          'Use /payments to track it.',
        { parse_mode: 'Markdown' }
      );
    } catch (error) {
      console.error('Failed to create payment:', error);
      // Stay in the flow so the user can retry with a new amount
      await ctx.reply('❌ Failed to create the payment. Please try again with a new amount:');
    }
  }

  /**
   * Caption per task 5.3: description / SGD amount / ref / share hint.
   */
  private buildCaption(payment: Payment): string {
    const description =
      payment.description.length > 100
        ? `${payment.description.slice(0, 99)}…`
        : payment.description;
    return `${description} / SGD ${formatCents(payment.amountCents)} / ${payment.ref} / ${SHARE_HINT}`;
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
    // (required for vitest-pool-workers storage isolation and good hygiene
    // for real DO stub calls).
    await response?.body?.cancel();
  }

  /**
   * Reset the conversation back to idle (no payment record is written by doing so).
   */
  private async resetState(): Promise<void> {
    await this.setState({
      flow: 'idle',
      step: 0,
      context: {},
      lastActivity: new Date().toISOString(),
    });
  }
}
