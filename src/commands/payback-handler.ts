import type { Context } from 'grammy';
import { InlineKeyboard, InputFile } from 'grammy';
import { detectProxyType, generateRef } from '../db/proxy-validation.js';
import type { PayeeType, Payment, Repository } from '../db/repository.js';
import { formatCents, parseAmount } from '../sgqr/amount.js';
import { buildPayNowPayload } from '../sgqr/paynow.js';
import { renderQrPng } from '../sgqr/qr-render.js';
import type { ConversationDO, ConversationState } from '../worker/conversation-do.js';
import { captionPart, payerLabel, plainPayerLabel, recipientName } from './payer-label.js';

/**
 * /payback command handler - initiates payback flow for a payment
 *
 * Flow:
 * 1. User sends /payback <ref>
 * 2. Bot verifies payment exists and belongs to user
 * 3. Bot prompts for payer's PayNow reference (mobile/UEN)
 * 4. User provides payer reference
 * 5. Bot validates and echoes for confirmation
 * 6. User confirms
 * 7. Bot prompts for payback amount (bounded by remaining payable)
 * 8. User provides amount
 * 9. Bot validates amount and confirms
 * 10. User confirms -> payback row created via the bounded D1 transaction (task 7.2)
 *     with the payer-encoded SGQR payload, QR rendered in the isolate and uploaded
 *     via sendPhoto (task 7.3)
 *
 * Payback bounds (task 7.2): the amount step pre-checks against
 * `payment.amount_cents - SUM(paybacks)`, but the authoritative enforcement is
 * `repository.createPaybackBounded()`, which re-checks the sum inside the same D1 batch
 * as the insert. A concurrent payback that lands between steps is caught there and the
 * row is refused, so the total never exceeds the original amount. Both pending and sent
 * paybacks count toward the bound; `sent` only marks delivery.
 */

export class PaybackCommandHandler {
  private conversationDO: ConversationDO;
  private repository: Repository;

  constructor(conversationDO: ConversationDO, repository: Repository) {
    this.conversationDO = conversationDO;
    this.repository = repository;
  }

  /**
   * Handle /payback command with payment reference
   */
  async start(ctx: Context, paymentRef?: string): Promise<void> {
    const userId = ctx.from!.id;

    if (!paymentRef) {
      await ctx.reply(
        '❌ Please provide a payment reference.\n\nUsage: /payback <ref>\n\nUse /payments to see your payment references.'
      );
      return;
    }

    try {
      // Verify payment exists and belongs to user
      const payment = await this.repository.getPaymentByRef(paymentRef);

      if (!payment) {
        await ctx.reply(`❌ Payment with reference \`${paymentRef}\` not found.`, {
          parse_mode: 'Markdown',
        });
        return;
      }

      if (payment.userId !== userId) {
        await ctx.reply('❌ You do not own this payment.');
        return;
      }

      if (payment.status !== 'received') {
        await ctx.reply('⚠️ You can only create paybacks for received payments.');
        return;
      }

      await this.beginFlow(ctx, payment);
    } catch (error) {
      console.error('Failed to start payback:', error);
      await ctx.reply('❌ Failed to start payback flow. Please try again.');
    }
  }

  /**
   * Seed the payback conversation for an already-validated payment and send the first
   * prompt. Shared by `/payback <ref>` and the QR-photo Payback button so both leave
   * identical state behind.
   *
   * With a stored payer, the payer is proposed for confirmation (Confirm / Change
   * recipient); a changed recipient applies to this payback only. Without one (legacy
   * payments) the payer reference is requested.
   */
  async beginFlow(ctx: Context, payment: Payment): Promise<void> {
    const context: Record<string, unknown> = {
      paymentRef: payment.ref,
      paymentId: payment.id,
      paymentAmount: payment.amountCents,
      paymentDescription: payment.description,
    };
    const header =
      `💸 *Payback for Payment*\n\n` +
      `Reference: \`${payment.ref}\`\n` +
      `Amount: $${formatCents(payment.amountCents)}\n` +
      `Description: ${payment.description}\n\n`;

    if (payment.payerType && payment.payerValue) {
      await this.setState({
        flow: 'payback',
        step: 2, // confirm the proposed recipient
        context: {
          ...context,
          pendingPayer: { type: payment.payerType, normalized: payment.payerValue },
          // Kept across "Change recipient" so only the stored payer resolves to a name
          storedPayerValue: payment.payerValue,
          storedPayerName: payment.payerName ?? null,
        },
        lastActivity: new Date().toISOString(),
      });

      const keyboard = new InlineKeyboard()
        .text('✅ Confirm', `payback_confirm_payer:${payment.ref}`)
        .text('✏️ Change recipient', `payback_change_payer:${payment.ref}`)
        .row()
        .text('❌ Cancel', `payback_cancel:${payment.ref}`);
      await ctx.reply(
        `${header}Pay back to ${payerLabel(payment.payerName, payment.payerValue)}?`,
        {
          parse_mode: 'Markdown',
          reply_markup: keyboard,
        }
      );
      return;
    }

    await this.setState({
      flow: 'payback',
      step: 1, // waiting for payer reference
      context,
      lastActivity: new Date().toISOString(),
    });
    await ctx.reply(`${header}Please enter the payer's PayNow reference (mobile number or UEN):`, {
      parse_mode: 'Markdown',
    });
  }

  /**
   * Handle user input during payback flow
   */
  async handleInput(ctx: Context): Promise<boolean> {
    const state = await this.getState();

    if (state?.flow !== 'payback') {
      return false; // Not in payback flow
    }

    const text = ctx.message?.text?.trim();
    if (!text) {
      return true; // Still in payback flow
    }

    switch (state.step) {
      case 1:
        await this.handlePayerReferenceInput(ctx, text, state);
        break;
      case 2:
      case 4:
        // Steps 2 and 4 now wait for button taps, not text input.
        // If user types here, nudge them to use the buttons.
        await ctx.reply('⏳ Waiting for confirmation. Please tap a button above.');
        break;
      case 3:
        await this.handleAmountInput(ctx, text, state);
        break;
    }

    return true; // Still in payback flow
  }

  /**
   * Step 1: Validate payer reference and echo for confirmation
   */
  private async handlePayerReferenceInput(
    ctx: Context,
    input: string,
    state: ConversationState
  ): Promise<void> {
    const normalized = detectProxyType(input);

    if (!normalized) {
      await ctx.reply(
        '❌ Invalid PayNow reference. Please enter:\n• Mobile number (8 digits, starting with 6/8/9)\n• UEN (9-13 characters)\n\nTry again:'
      );
      return;
    }

    // Store normalized payer reference for confirmation
    await this.setState({
      flow: 'payback',
      step: 2,
      context: {
        ...state.context,
        pendingPayer: normalized,
      },
      lastActivity: new Date().toISOString(),
    });

    const typeLabel = normalized.type === 'mobile' ? 'Mobile number' : 'UEN';
    const keyboard = new InlineKeyboard()
      .text('✅ Confirm', `payback_confirm_payer:${state.context.paymentRef as string}`)
      .text('❌ Cancel', `payback_cancel:${state.context.paymentRef as string}`);

    await ctx.reply(
      `📱 Payer ${typeLabel}: ${normalized.normalized}\n\nTap a button to confirm or cancel:`,
      { reply_markup: keyboard }
    );
  }

  /**
   * Step 2: Handle payer confirmation (via inline button callback)
   */
  async handleCallback(ctx: Context): Promise<boolean> {
    const data = ctx.callbackQuery?.data;
    if (
      !data ||
      (!data.startsWith('payback_confirm_payer:') &&
        !data.startsWith('payback_change_payer:') &&
        !data.startsWith('payback_cancel:') &&
        !data.startsWith('payback_confirm_amount:') &&
        !data.startsWith('payback_cancel_amount:'))
    ) {
      return false; // Not ours — let the next dispatcher try
    }

    const state = await this.getState();
    if (state?.flow !== 'payback') {
      await ctx.answerCallbackQuery({ text: '❌ Session expired. Run /payback <ref> again.' });
      return true;
    }

    // Handle payer confirmation
    if (data.startsWith('payback_confirm_payer:')) {
      if (state.step !== 2) {
        await ctx.answerCallbackQuery({ text: '❌ Session expired. Run /payback <ref> again.' });
        return true;
      }
      await this.proceedToAmountStep(ctx, state);
      return true;
    }

    // Change recipient: back to the payer prompt, for this payback only
    if (data.startsWith('payback_change_payer:')) {
      if (state.step !== 2) {
        await ctx.answerCallbackQuery({ text: '❌ Session expired. Run /payback <ref> again.' });
        return true;
      }
      const { pendingPayer: _discarded, ...rest } = state.context;
      await this.setState({
        flow: 'payback',
        step: 1,
        context: rest,
        lastActivity: new Date().toISOString(),
      });
      await ctx.answerCallbackQuery();
      await ctx.editMessageText(
        "Please enter the new recipient's PayNow reference (mobile number or UEN):",
        { reply_markup: { inline_keyboard: [] } }
      );
      return true;
    }

    if (data.startsWith('payback_cancel:') || data.startsWith('payback_cancel_amount:')) {
      await this.resetState();
      await ctx.editMessageText('❌ Payback cancelled.', { reply_markup: { inline_keyboard: [] } });
      return true;
    }

    // Handle amount confirmation
    if (data.startsWith('payback_confirm_amount:')) {
      if (state.step !== 4) {
        await ctx.answerCallbackQuery({ text: '❌ Session expired. Run /payback <ref> again.' });
        return true;
      }
      await this.createPaybackRecord(ctx, state);
      return true;
    }

    return false;
  }

  /**
   * Step 2 → 3: Payer confirmed, proceed to amount entry
   */
  private async proceedToAmountStep(ctx: Context, state: ConversationState): Promise<void> {
    const paymentId = state.context.paymentId as number | undefined;
    const paymentAmount = state.context.paymentAmount as number;

    if (!paymentId || !paymentAmount) {
      await this.resetState();
      await ctx.editMessageText('❌ Payback session expired. Run /payback <ref> to start over.', {
        reply_markup: { inline_keyboard: [] },
      });
      return;
    }

    // Pre-check: show the current remaining bound. The authoritative re-check runs
    // inside the D1 transaction at final confirmation (createPaybackBounded).
    // Both pending and sent paybacks count — sent only marks delivery.
    const paidBack = await this.repository.sumPaybacks(paymentId);
    const remaining = paymentAmount - paidBack;

    if (remaining <= 0) {
      await this.resetState();
      await ctx.editMessageText(
        '⚠️ This payment has already been fully paid back. There is nothing left to pay.',
        { reply_markup: { inline_keyboard: [] } }
      );
      return;
    }

    await this.setState({
      flow: 'payback',
      step: 3,
      context: { ...state.context, remainingCents: remaining },
      lastActivity: new Date().toISOString(),
    });

    await ctx.editMessageText(
      `💵 Enter payback amount (in dollars):\n\n` +
        `Recipient: ${this.recipientText(state)}\n` +
        `Original payment: $${formatCents(paymentAmount)}\n` +
        `Already paid back: $${formatCents(paidBack)}\n` +
        `Maximum payback: $${formatCents(remaining)}\n\n` +
        `You can enter a partial amount or the full remaining amount.`,
      { reply_markup: { inline_keyboard: [] } }
    );
  }

  /**
   * Step 3: Validate amount and echo for confirmation
   */
  private async handleAmountInput(
    ctx: Context,
    input: string,
    state: ConversationState
  ): Promise<void> {
    const paymentId = state.context.paymentId as number | undefined;
    const paymentAmount = state.context.paymentAmount as number;

    if (!paymentId || !paymentAmount) {
      await this.resetState();
      await ctx.reply('❌ Payback session expired. Please start over with /payback <ref>.');
      return;
    }

    const amountCents = parseAmount(input);

    if (amountCents === null) {
      await ctx.reply(
        '❌ Invalid amount. Enter a positive number with up to 2 decimals (e.g. 5 or 12.50).\n\nTry again:'
      );
      return;
    }

    // Pre-check against the freshest remaining bound; createPaybackBounded re-checks
    // it in-transaction on confirmation.
    const paidBack = await this.repository.sumPaybacks(paymentId);
    const remaining = paymentAmount - paidBack;

    if (remaining <= 0) {
      await this.resetState();
      await ctx.reply('⚠️ This payment has been fully paid back. Payback blocked.');
      return;
    }

    if (amountCents > remaining) {
      await ctx.reply(
        `❌ Payback amount ($${formatCents(amountCents)}) exceeds the remaining payable amount ($${formatCents(remaining)}).\n\n` +
          `Please enter a smaller amount:`
      );
      return;
    }

    // Store amount for confirmation
    await this.setState({
      flow: 'payback',
      step: 4,
      context: {
        ...state.context,
        remainingCents: remaining,
        paybackAmount: amountCents,
      },
      lastActivity: new Date().toISOString(),
    });

    const keyboard = new InlineKeyboard()
      .text('✅ Confirm', `payback_confirm_amount:${state.context.paymentRef as string}`)
      .text('❌ Cancel', `payback_cancel_amount:${state.context.paymentRef as string}`);

    await ctx.reply(
      `💰 Payback amount: $${formatCents(amountCents)}\n` +
        `Recipient: ${this.recipientText(state)}\n\nTap a button to confirm or cancel:`,
      { reply_markup: keyboard }
    );
  }

  /** Name (when the recipient is the stored payer) for the current conversation state. */
  private recipientNameFor(state: ConversationState): string | null {
    const proxy = state.context.pendingPayer as { normalized: string } | undefined;
    if (!proxy) return null;
    return recipientName(
      state.context.storedPayerValue as string | undefined,
      state.context.storedPayerName as string | null | undefined,
      proxy.normalized
    );
  }

  /** Plain-text "Name (proxy)" / bare proxy for the pending recipient. */
  private recipientText(state: ConversationState): string {
    const proxy = (state.context.pendingPayer as { normalized: string } | undefined)?.normalized;
    return proxy ? plainPayerLabel(this.recipientNameFor(state), proxy) : 'unknown';
  }

  /**
   * Step 4: Handle amount confirmation via inline button callback
   * (Routed through handleCallback)
   */

  /**
   * Tasks 7.2 + 7.3: build the payback SGQR payload (PAYER as payee proxy),
   * create the payback row inside the bounded D1 transaction, render the QR in
   * the isolate, and upload it via sendPhoto.
   */
  private async createPaybackRecord(ctx: Context, state: ConversationState): Promise<void> {
    try {
      const paymentRef = state.context.paymentRef as string;
      const paymentId = state.context.paymentId as number | undefined;
      const payerProxy = state.context.pendingPayer as { type: PayeeType; normalized: string };
      const paybackAmount = state.context.paybackAmount as number;

      if (!paymentId) {
        await this.resetState();
        await ctx.reply('❌ Payback session expired. Please start over with /payback <ref>.');
        return;
      }

      const paybackRef = generateRef();
      const recipient = this.recipientNameFor(state);

      // Payback QR encodes the PAYER as the payee proxy (spec: the collecting
      // user scans this in their own bank app and sends the money back)
      const qrPayload = buildPayNowPayload({
        proxyType: payerProxy.type,
        proxyValue: payerProxy.normalized,
        amountCents: paybackAmount,
        reference: paybackRef,
        description: `Refund ${paymentRef}`,
      });

      const result = await this.repository.createPaybackBounded({
        ref: paybackRef,
        paymentId,
        payerType: payerProxy.type,
        payerValue: payerProxy.normalized,
        amountCents: paybackAmount,
        status: 'pending',
        qrPayload,
        timestamp: new Date().toISOString(),
      });

      if (!result.ok) {
        if (result.reason === 'payment_not_found') {
          await this.resetState();
          await ctx.reply(`❌ Payment \`${paymentRef}\` no longer exists. Payback aborted.`, {
            parse_mode: 'Markdown',
          });
          return;
        }

        // The bound moved under the conversation (e.g. a concurrent payback committed
        // first). Nothing was written.
        if (result.remainingCents <= 0) {
          await this.resetState();
          await ctx.reply(
            `⚠️ This payment has been fully paid back ($${formatCents(result.paidBackCents)} paid back). Payback blocked.`
          );
        } else {
          // Send the user back to the amount step with the fresh bound.
          const { paybackAmount: staleAmount, remainingCents: _stale, ...carry } = state.context;
          await this.setState({
            flow: 'payback',
            step: 3,
            context: carry,
            lastActivity: new Date().toISOString(),
          });
          await ctx.reply(
            `❌ Payback of $${formatCents(staleAmount)} exceeds the remaining payable amount ($${formatCents(result.remainingCents)}). ` +
              `Another payback may have landed just now.\n\nPlease enter a new amount:`
          );
        }
        return;
      }

      // Success: row recorded inside the transaction — deliver the QR image
      const qrBytes = await renderQrPng(result.payback.qrPayload);
      await ctx.replyWithPhoto(new InputFile(qrBytes, 'payback-qr.bmp'), {
        // Name only (no number), segment omitted when the recipient has no known name
        caption: [
          `Payback for ${paymentRef}`,
          `SGD ${formatCents(result.payback.amountCents)}`,
          result.payback.ref,
          ...captionPart('To', recipient),
          'Scan to send the money back',
        ].join(' / '),
        reply_markup: new InlineKeyboard()
          .text('✓ Sent', `pb_sent:${paymentRef}:${result.payback.ref}`)
          .text('✖ Cancel', `pb_cancel:${paymentRef}:${result.payback.ref}`),
      });

      await this.resetState();
      await ctx.editMessageText(
        `✅ *Payback Recorded!*\n\n` +
          `Payback reference: \`${result.payback.ref}\`\n` +
          `Amount: $${formatCents(result.payback.amountCents)}\n` +
          `Recipient: ${payerLabel(recipient, payerProxy.normalized)}\n` +
          `Remaining payable: $${formatCents(result.remainingCents)}\n\n` +
          'Use /payments to track it.',
        { parse_mode: 'Markdown', reply_markup: { inline_keyboard: [] } }
      );
    } catch (error) {
      console.error('Failed to create payback record:', error);
      await ctx.reply('❌ Failed to record the payback. Please try again.');
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

  /**
   * Reset the conversation back to idle (context discarded, existing data untouched).
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
