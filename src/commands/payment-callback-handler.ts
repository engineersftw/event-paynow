import type { Context } from 'grammy';
import { InlineKeyboard } from 'grammy';
import type { Payback, Payment, Repository } from '../db/repository.js';
import { formatCents } from '../sgqr/amount.js';
import type { ConversationDO } from '../worker/conversation-do.js';
import { PaybackCommandHandler } from './payback-handler.js';
import { captionPart, escapeMarkdown, payerLabel, recipientName } from './payer-label.js';

/**
 * Callback query handler for payment actions
 * Handles inline button callbacks for:
 * - View (payment detail with payback history + mark-sent buttons)
 * - Mark as received
 * - Payback
 * - Mark payback as sent (task 7.4)
 */

export class PaymentCallbackHandler {
  private conversationDO: ConversationDO;
  private repository: Repository;

  constructor(conversationDO: ConversationDO, repository: Repository) {
    this.conversationDO = conversationDO;
    this.repository = repository;
  }

  /**
   * Handle callback queries from inline buttons.
   * Data formats: `<action>:<paymentRef>` and `pb_sent:<paymentRef>:<paybackRef>`.
   */
  async handleCallback(ctx: Context): Promise<void> {
    if (!ctx.callbackQuery?.data) {
      return;
    }

    const userId = ctx.from!.id;
    const callbackData = ctx.callbackQuery.data;

    try {
      const parts = callbackData.split(':');
      const action = parts[0];
      const ref = parts[1];

      if (!action || !ref) {
        await ctx.answerCallbackQuery({ text: '❌ Invalid callback data' });
        return;
      }

      // All payment actions carry the owning payment's ref as the first
      // parameter — resolve it once and verify ownership centrally.
      const payment = await this.repository.getPaymentByRef(ref);
      if (!payment) {
        await ctx.answerCallbackQuery({ text: '❌ Payment not found' });
        return;
      }

      if (payment.userId !== userId) {
        await ctx.answerCallbackQuery({ text: '❌ You do not own this payment' });
        return;
      }

      switch (action) {
        case 'view':
          await this.handleViewPayment(ctx, payment);
          break;
        case 'mark_received':
          await this.handleMarkReceived(ctx, payment);
          break;
        case 'payback':
          await this.handlePayback(ctx, payment);
          break;
        case 'void':
          await this.handleVoid(ctx, payment);
          break;
        case 'pb_sent':
        case 'pb_cancel': {
          const paybackRef = parts[2];
          if (!paybackRef) {
            await ctx.answerCallbackQuery({ text: '❌ Invalid callback data' });
            return;
          }
          await this.handlePaybackTransition(
            ctx,
            payment,
            paybackRef,
            action === 'pb_sent' ? 'sent' : 'cancelled'
          );
          break;
        }
        default:
          await ctx.answerCallbackQuery({ text: '❌ Unknown action' });
      }
    } catch (error) {
      console.error('Callback handler error:', error);
      await ctx.answerCallbackQuery({ text: '❌ An error occurred' });
    }
  }

  /**
   * Handle "View" callback - show payment details with payback history.
   */
  private async handleViewPayment(ctx: Context, payment: Payment): Promise<void> {
    try {
      await ctx.answerCallbackQuery({ text: '📋 Payment details loaded' });
      await this.renderDetails(ctx, payment);
    } catch (error) {
      console.error('Failed to load payment details:', error);
      await ctx.answerCallbackQuery({ text: '❌ Failed to load payment details' });
    }
  }

  /**
   * Re-render the payment detail message (fresh payback history, updated
   * remaining total, mark-sent buttons for pending paybacks).
   */
  private async renderDetails(ctx: Context, payment: Payment): Promise<void> {
    const paybacks = await this.repository.listPaybacksByPayment(payment.id);
    const { text, keyboard } = this.renderPaymentDetail(payment, paybacks);

    await ctx.editMessageText(text, {
      parse_mode: 'Markdown',
      // Always send a keyboard (possibly empty) so stale buttons from the
      // payments list or a previous render are cleared from this message.
      reply_markup: keyboard ?? new InlineKeyboard(),
    });
  }

  /**
   * Build the detail text + inline keyboard. Pending paybacks get a
   * "Mark sent" button (task 7.4); sent paybacks show their timestamp.
   */
  private renderPaymentDetail(
    payment: Payment,
    paybacks: Payback[]
  ): { text: string; keyboard: InlineKeyboard | undefined } {
    const lines: string[] = [
      '💳 *Payment Details*',
      '',
      `*Reference:* \`${payment.ref}\``,
      `*Amount:* $${formatCents(payment.amountCents)}`,
      `*Description:* ${escapeMarkdown(payment.description)}`,
      ...(payment.payerValue
        ? [`*Payer:* ${payerLabel(payment.payerName, payment.payerValue)}`]
        : []),
      `*Status:* ${{ pending: '⏳ Pending', received: '✅ Received', voided: '🚫 Voided' }[payment.status]}`,
      `*Created:* ${this.formatDate(payment.createdAt)}`,
    ];

    if (payment.receivedAt) {
      lines.push(`*Received:* ${this.formatDate(payment.receivedAt)}`);
      lines.push(`*Source:* ${payment.source === 'manual' ? 'Manual' : 'Notification'}`);
    }

    if (paybacks.length > 0) {
      lines.push('');
      lines.push('💸 *Paybacks:*');

      // Cancelled paybacks are history only. The net amount counts SENT paybacks; the
      // payable-back room ("Remaining") also counts pending ones.
      const total = (status: Payback['status']) =>
        paybacks.filter((pb) => pb.status === status).reduce((t, pb) => t + pb.amountCents, 0);
      const paidBack = total('sent');
      const pendingPaybacks = total('pending');
      const remaining = payment.amountCents - paidBack - pendingPaybacks;

      for (const payback of paybacks) {
        const icon = { pending: '⏳', sent: '✅', cancelled: '❌' }[payback.status];
        const to = payerLabel(
          recipientName(payment.payerValue, payment.payerName, payback.payerValue),
          payback.payerValue
        );
        let line = `${icon} $${formatCents(payback.amountCents)} to ${to} — \`${payback.ref}\``;
        if (payback.status === 'sent' && payback.sentAt) {
          line += ` (sent ${this.formatDate(payback.sentAt)})`;
        } else if (payback.status === 'cancelled') {
          line += ' (cancelled)';
        }
        lines.push(line);
      }

      lines.push('');
      lines.push(`*Paid back:* $${formatCents(paidBack)}`);
      lines.push(`*Net:* $${formatCents(payment.amountCents - paidBack)}`);
      if (pendingPaybacks > 0) lines.push(`*Pending paybacks:* $${formatCents(pendingPaybacks)}`);
      lines.push(`*Remaining:* $${formatCents(Math.max(0, remaining))}`);
    } else {
      lines.push('');
      lines.push('💸 *Paybacks:* None');
    }

    // Mark-sent / Cancel buttons for each pending payback
    const pendingPaybacks = paybacks.filter((pb) => pb.status === 'pending');
    let keyboard: InlineKeyboard | undefined;
    if (pendingPaybacks.length > 0) {
      keyboard = new InlineKeyboard();
      for (const payback of pendingPaybacks) {
        keyboard
          .text(
            `✅ Mark sent: $${formatCents(payback.amountCents)}`,
            `pb_sent:${payment.ref}:${payback.ref}`
          )
          .text(
            `✖ Cancel: $${formatCents(payback.amountCents)}`,
            `pb_cancel:${payment.ref}:${payback.ref}`
          )
          .row();
      }
    }

    return { text: lines.join('\n'), keyboard };
  }

  /**
   * Format ISO date to readable format
   */
  private formatDate(isoString: string): string {
    const date = new Date(isoString);
    const day = date.getDate().toString().padStart(2, '0');
    const month = (date.getMonth() + 1).toString().padStart(2, '0');
    const year = date.getFullYear();
    const hours = date.getHours().toString().padStart(2, '0');
    const minutes = date.getMinutes().toString().padStart(2, '0');
    return `${day}/${month}/${year} ${hours}:${minutes}`;
  }

  /**
   * Handle "Mark as received" callback
   */
  private async handleMarkReceived(ctx: Context, payment: Payment): Promise<void> {
    // Check if already received
    if (payment.status === 'received') {
      await ctx.answerCallbackQuery({ text: '⚠️ Payment already marked as received' });
      return;
    }
    if (payment.status === 'voided') {
      await ctx.answerCallbackQuery({ text: '⚠️ Payment was voided' });
      return;
    }

    // Update payment status
    const timestamp = new Date().toISOString();
    const updatedPayment = await this.repository.updatePaymentStatus(
      payment.ref,
      'received',
      'manual',
      timestamp
    );

    if (!updatedPayment) {
      // Lost a race against a concurrent Received/Void tap — report the state that won.
      const current = await this.repository.getPaymentByRef(payment.ref);
      await ctx.answerCallbackQuery({
        text:
          current?.status === 'voided'
            ? '⚠️ Payment was voided'
            : current?.status === 'received'
              ? '⚠️ Payment already marked as received'
              : '❌ Failed to update payment status',
      });
      return;
    }

    await ctx.answerCallbackQuery({ text: '✅ Payment marked as received!' });

    // Replace the QR photo with a text message showing the payment summary
    if (ctx.callbackQuery?.message && 'message_id' in ctx.callbackQuery.message) {
      const receivedAt = this.formatDate(timestamp);
      const summary = [
        payment.description,
        `SGD ${formatCents(payment.amountCents)}`,
        payment.ref,
        ...captionPart('Payer', payment.payerName),
        `✅ Received ${receivedAt}`,
      ].join(' / ');
      const chatId = ctx.callbackQuery.message.chat.id;
      const msgId = ctx.callbackQuery.message.message_id;

      // Send new text message
      await ctx.reply(summary);

      // Delete the original QR photo message
      await ctx.api.deleteMessage(chatId, msgId);
    }
  }

  /**
   * Mark a payback sent or cancel it (task 7.4 + cancel). The repository transition is
   * compare-and-set from `pending`, so duplicate or concurrent taps (including Sent vs
   * Cancel) resolve to exactly one winner; the loser sees the state that won.
   *
   * Tapped on the payback QR photo, the photo is replaced by a text status line (like
   * ✓ Received on a payment); tapped in the detail view, the view re-renders in place.
   */
  private async handlePaybackTransition(
    ctx: Context,
    payment: Payment,
    paybackRef: string,
    target: 'sent' | 'cancelled'
  ): Promise<void> {
    const payback = await this.repository.getPaybackByRef(paybackRef);
    if (!payback || payback.paymentId !== payment.id) {
      await ctx.answerCallbackQuery({ text: '❌ Payback not found' });
      return;
    }

    if (payback.status !== 'pending') {
      await ctx.answerCallbackQuery({ text: this.alreadyText(payback.status, target) });
      return;
    }

    const timestamp = new Date().toISOString();
    const updated = await this.repository.updatePaybackStatus(paybackRef, target, timestamp);

    if (!updated) {
      // Lost the race against a concurrent tap — distinguish the states.
      const current = await this.repository.getPaybackByRef(paybackRef);
      await ctx.answerCallbackQuery({
        text:
          current && current.status !== 'pending'
            ? this.alreadyText(current.status, target)
            : '❌ Failed to update payback status',
      });
      return;
    }

    await ctx.answerCallbackQuery({
      text: target === 'sent' ? '✅ Payback marked as sent' : '❌ Payback cancelled',
    });

    const message = ctx.callbackQuery?.message;
    if (message && 'photo' in message) {
      const label = target === 'sent' ? `✅ Sent ${this.formatDate(timestamp)}` : '❌ Cancelled';
      const to = recipientName(payment.payerValue, payment.payerName, payback.payerValue);
      await ctx.reply(
        [
          `Payback for ${payment.ref}`,
          `SGD ${formatCents(payback.amountCents)}`,
          payback.ref,
          ...captionPart('To', to),
          label,
        ].join(' / ')
      );
      try {
        await ctx.api.deleteMessage(message.chat.id, message.message_id);
      } catch (error) {
        // The transition and summary are already committed; a stale QR photo is harmless.
        console.error('Failed to delete payback QR message:', error);
      }
      return;
    }

    // Re-render the detail: buttons removed, status shown, totals fresh
    await this.renderDetails(ctx, payment);
  }

  private alreadyText(current: Payback['status'], target: 'sent' | 'cancelled'): string {
    if (current === target) {
      return target === 'sent' ? '⚠️ Payback already marked as sent' : '⚠️ Payback already cancelled';
    }
    return current === 'sent'
      ? '⚠️ Payback was already sent — it can’t be cancelled'
      : '⚠️ Payback was cancelled';
  }

  /**
   * Handle "Void" callback: pending-only compare-and-set (races cleanly against ✓ Received).
   * On the QR photo it is replaced by a status line like ✓ Received does; in the detail
   * view the view re-renders in place.
   */
  private async handleVoid(ctx: Context, payment: Payment): Promise<void> {
    if (payment.status === 'voided') {
      await ctx.answerCallbackQuery({ text: '⚠️ Payment already voided' });
      return;
    }
    if (payment.status === 'received') {
      await ctx.answerCallbackQuery({
        text: '⚠️ Payment was already received — it can’t be voided',
      });
      return;
    }
    if ((await this.repository.sumPaybacks(payment.id)) > 0) {
      await ctx.answerCallbackQuery({ text: '⚠️ This payment has paybacks and can’t be voided' });
      return;
    }

    const voided = await this.repository.voidPayment(payment.ref);
    if (!voided) {
      // Lost the race against ✓ Received (or another Void)
      const current = await this.repository.getPaymentByRef(payment.ref);
      await ctx.answerCallbackQuery({
        text:
          current?.status === 'received'
            ? '⚠️ Payment was already received — it can’t be voided'
            : current?.status === 'voided'
              ? '⚠️ Payment already voided'
              : '❌ Failed to void the payment',
      });
      return;
    }

    await ctx.answerCallbackQuery({ text: '🚫 Payment voided' });

    const message = ctx.callbackQuery?.message;
    if (message && 'photo' in message) {
      await ctx.reply(
        [
          payment.description,
          `SGD ${formatCents(payment.amountCents)}`,
          payment.ref,
          ...captionPart('Payer', payment.payerName),
          `🚫 Voided ${this.formatDate(new Date().toISOString())}`,
        ].join(' / ')
      );
      try {
        await ctx.api.deleteMessage(message.chat.id, message.message_id);
      } catch (error) {
        // The void and status line are already committed; a stale QR photo is harmless.
        console.error('Failed to delete voided payment QR message:', error);
      }
      return;
    }

    await this.renderDetails(ctx, voided);
  }

  /**
   * Handle "Payback" callback
   */
  private async handlePayback(ctx: Context, payment: Payment): Promise<void> {
    // Same rule as /payback <ref>; also neutralises stale Payback buttons on old messages
    if (payment.status !== 'received') {
      await ctx.answerCallbackQuery({
        text: '⚠️ You can only create paybacks for received payments.',
      });
      return;
    }

    await ctx.answerCallbackQuery({ text: '🔄 Starting payback flow...' });
    // Same seeding and prompts as /payback <ref> (stored payer → confirm / change)
    await new PaybackCommandHandler(this.conversationDO, this.repository).beginFlow(ctx, payment);
  }
}
