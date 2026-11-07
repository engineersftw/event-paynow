import type { Context } from 'grammy';
import { InputFile } from 'grammy';
import { detectProxyType, generateRef } from '../db/proxy-validation.js';
import type { PayeeType, Repository } from '../db/repository.js';
import { formatCents, parseAmount } from '../sgqr/amount.js';
import { buildPayNowPayload } from '../sgqr/paynow.js';
import { renderQrPng } from '../sgqr/qr-render.js';
import type { ConversationDO, ConversationState } from '../worker/conversation-do.js';

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

      // Initialize conversation state for payback flow
      await this.setState({
        flow: 'payback',
        step: 1, // waiting for payer reference
        context: {
          paymentRef,
          paymentId: payment.id,
          paymentAmount: payment.amountCents,
          paymentDescription: payment.description,
        },
        lastActivity: new Date().toISOString(),
      });

      await ctx.reply(
        `💸 *Payback for Payment*\n\n` +
          `Reference: \`${paymentRef}\`\n` +
          `Amount: $${formatCents(payment.amountCents)}\n` +
          `Description: ${payment.description}\n\n` +
          `Please enter the payer's PayNow reference (mobile number or UEN):`,
        { parse_mode: 'Markdown' }
      );
    } catch (error) {
      console.error('Failed to start payback:', error);
      await ctx.reply('❌ Failed to start payback flow. Please try again.');
    }
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
        await this.handlePayerConfirmation(ctx, text, state);
        break;
      case 3:
        await this.handleAmountInput(ctx, text, state);
        break;
      case 4:
        await this.handleAmountConfirmation(ctx, text, state);
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
    await ctx.reply(
      `📱 Payer ${typeLabel}: ${normalized.normalized}\n\nType "confirm" to continue, or "cancel" to abort:`
    );
  }

  /**
   * Step 2: Handle payer confirmation
   */
  private async handlePayerConfirmation(
    ctx: Context,
    input: string,
    state: ConversationState
  ): Promise<void> {
    if (input.toLowerCase() === 'confirm') {
      const paymentId = state.context.paymentId as number | undefined;
      const paymentAmount = state.context.paymentAmount as number;

      if (!paymentId || !paymentAmount) {
        await this.resetState();
        await ctx.reply('❌ Payback session expired. Please start over with /payback <ref>.');
        return;
      }

      // Pre-check: show the current remaining bound. The authoritative re-check runs
      // inside the D1 transaction at final confirmation (createPaybackBounded).
      // Both pending and sent paybacks count — sent only marks delivery.
      const paidBack = await this.repository.sumPaybacks(paymentId);
      const remaining = paymentAmount - paidBack;

      if (remaining <= 0) {
        await this.resetState();
        await ctx.reply(
          '⚠️ This payment has already been fully paid back. There is nothing left to pay.'
        );
        return;
      }

      await this.setState({
        flow: 'payback',
        step: 3,
        context: { ...state.context, remainingCents: remaining },
        lastActivity: new Date().toISOString(),
      });

      await ctx.reply(
        `💵 Enter payback amount (in dollars):\n\n` +
          `Original payment: $${formatCents(paymentAmount)}\n` +
          `Already paid back: $${formatCents(paidBack)}\n` +
          `Maximum payback: $${formatCents(remaining)}\n\n` +
          `You can enter a partial amount or the full remaining amount.`,
        { parse_mode: 'Markdown' }
      );
    } else if (input.toLowerCase() === 'cancel') {
      await this.resetState();
      await ctx.reply('❌ Payback cancelled.');
    } else {
      await ctx.reply('Please type "confirm" to continue or "cancel" to abort:');
    }
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

    await ctx.reply(
      `💰 Payback amount: $${formatCents(amountCents)}\n\n` +
        `Type "confirm" to record the payback, or "cancel" to abort:`
    );
  }

  /**
   * Step 4: Handle amount confirmation and create the bounded payback record
   */
  private async handleAmountConfirmation(
    ctx: Context,
    input: string,
    state: ConversationState
  ): Promise<void> {
    if (input.toLowerCase() === 'confirm') {
      await this.createPaybackRecord(ctx, state);
    } else if (input.toLowerCase() === 'cancel') {
      await this.resetState();
      await ctx.reply('❌ Payback cancelled.');
    } else {
      await ctx.reply('Please type "confirm" to record the payback or "cancel" to abort:');
    }
  }

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
        caption:
          `Payback for ${paymentRef} / SGD ${formatCents(result.payback.amountCents)} / ` +
          `${result.payback.ref} / Scan to send the money back`,
      });

      await this.resetState();
      await ctx.reply(
        `✅ *Payback Recorded!*\n\n` +
          `Payback reference: \`${result.payback.ref}\`\n` +
          `Amount: $${formatCents(result.payback.amountCents)}\n` +
          `Payer (now payee): ${payerProxy.normalized}\n` +
          `Remaining payable: $${formatCents(result.remainingCents)}\n\n` +
          'Use /payments to track it.',
        { parse_mode: 'Markdown' }
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
