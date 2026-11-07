import type { Context } from 'grammy';
import { InlineKeyboard } from 'grammy';
import type { Payback, Payment, Repository } from '../db/repository.js';
import { formatCents } from '../sgqr/amount.js';
import type { ConversationDO } from '../worker/conversation-do.js';
import { PaybackCommandHandler } from './payback-handler.js';
import { payerLabel } from './payer-label.js';

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
        case 'pb_sent': {
          const paybackRef = parts[2];
          if (!paybackRef) {
            await ctx.answerCallbackQuery({ text: '❌ Invalid callback data' });
            return;
          }
          await this.handleMarkPaybackSent(ctx, payment, paybackRef);
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
      `*Description:* ${payment.description}`,
      ...(payment.payerValue
        ? [`*Payer:* ${payerLabel(payment.payerName, payment.payerValue)}`]
        : []),
      `*Status:* ${payment.status === 'pending' ? '⏳ Pending' : '✅ Received'}`,
      `*Created:* ${this.formatDate(payment.createdAt)}`,
    ];

    if (payment.receivedAt) {
      lines.push(`*Received:* ${this.formatDate(payment.receivedAt)}`);
      lines.push(`*Source:* ${payment.source === 'manual' ? 'Manual' : 'Notification'}`);
    }

    if (paybacks.length > 0) {
      lines.push('');
      lines.push('💸 *Paybacks:*');

      const totalPayback = paybacks.reduce((sum, pb) => sum + pb.amountCents, 0);
      const remaining = payment.amountCents - totalPayback;

      for (const payback of paybacks) {
        const icon = payback.status === 'pending' ? '⏳' : '✅';
        let line = `${icon} $${formatCents(payback.amountCents)} to ${payback.payerValue} — \`${payback.ref}\``;
        if (payback.status === 'sent' && payback.sentAt) {
          line += ` (sent ${this.formatDate(payback.sentAt)})`;
        }
        lines.push(line);
      }

      lines.push('');
      lines.push(`*Total Payback:* $${formatCents(totalPayback)}`);
      lines.push(`*Remaining:* $${formatCents(Math.max(0, remaining))}`);
    } else {
      lines.push('');
      lines.push('💸 *Paybacks:* None');
    }

    // Mark-sent buttons for each pending payback
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

    // Update payment status
    const timestamp = new Date().toISOString();
    const updatedPayment = await this.repository.updatePaymentStatus(
      payment.ref,
      'received',
      'manual',
      timestamp
    );

    if (!updatedPayment) {
      await ctx.answerCallbackQuery({ text: '❌ Failed to update payment status' });
      return;
    }

    await ctx.answerCallbackQuery({ text: '✅ Payment marked as received!' });

    // Replace the QR photo with a text message showing the payment summary
    if (ctx.callbackQuery?.message && 'message_id' in ctx.callbackQuery.message) {
      const receivedAt = this.formatDate(timestamp);
      const summary = `${payment.description} / SGD ${formatCents(payment.amountCents)} / ${payment.ref} / ✅ Received ${receivedAt}`;
      const chatId = ctx.callbackQuery.message.chat.id;
      const msgId = ctx.callbackQuery.message.message_id;

      // Send new text message
      await ctx.reply(summary);

      // Delete the original QR photo message
      await ctx.api.deleteMessage(chatId, msgId);
    }
  }

  /**
   * Handle "Mark payback as sent" callback (task 7.4).
   * The repository transition is compare-and-set, so duplicate or concurrent
   * taps resolve to exactly one winner; the loser sees "already marked".
   */
  private async handleMarkPaybackSent(
    ctx: Context,
    payment: Payment,
    paybackRef: string
  ): Promise<void> {
    const payback = await this.repository.getPaybackByRef(paybackRef);
    if (!payback || payback.paymentId !== payment.id) {
      await ctx.answerCallbackQuery({ text: '❌ Payback not found' });
      return;
    }

    if (payback.status === 'sent') {
      await ctx.answerCallbackQuery({ text: '⚠️ Payback already marked as sent' });
      return;
    }

    const timestamp = new Date().toISOString();
    const updated = await this.repository.updatePaybackStatus(paybackRef, 'sent', timestamp);

    if (!updated) {
      // Lost the race against a concurrent tap — distinguish the states.
      const current = await this.repository.getPaybackByRef(paybackRef);
      if (current?.status === 'sent') {
        await ctx.answerCallbackQuery({ text: '⚠️ Payback already marked as sent' });
      } else {
        await ctx.answerCallbackQuery({ text: '❌ Failed to update payback status' });
      }
      return;
    }

    await ctx.answerCallbackQuery({ text: '✅ Payback marked as sent' });

    // Re-render the detail: button removed, sent timestamp shown, totals fresh
    await this.renderDetails(ctx, payment);
  }

  /**
   * Handle "Payback" callback
   */
  private async handlePayback(ctx: Context, payment: Payment): Promise<void> {
    await ctx.answerCallbackQuery({ text: '🔄 Starting payback flow...' });
    // Same seeding and prompts as /payback <ref> (stored payer → confirm / change)
    await new PaybackCommandHandler(this.conversationDO, this.repository).beginFlow(ctx, payment);
  }
}
