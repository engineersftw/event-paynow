import type { Context } from 'grammy';
import { ConversationDO, type ConversationState } from '../worker/conversation-do.js';
import type { Repository, Payment, ReceiptSource } from '../db/repository.js';

/**
 * Callback query handler for payment actions
 * Handles inline button callbacks for:
 * - Mark as received
 * - Payback
 */

export class PaymentCallbackHandler {
  private conversationDO: ConversationDO;
  private repository: Repository;

  constructor(conversationDO: ConversationDO, repository: Repository) {
    this.conversationDO = conversationDO;
    this.repository = repository;
  }

  /**
   * Handle callback queries from inline buttons
   */
  async handleCallback(ctx: Context): Promise<void> {
    if (!ctx.callbackQuery?.data) {
      return;
    }

    const userId = ctx.from!.id;
    const callbackData = ctx.callbackQuery.data;

    try {
      // Parse callback data (format: "action:ref")
      const [action, ref] = callbackData.split(':');

      if (!action || !ref) {
        await ctx.answerCallbackQuery({ text: '❌ Invalid callback data' });
        return;
      }

      // Get payment to verify ownership
      const payment = await this.repository.getPaymentByRef(ref);
      if (!payment) {
        await ctx.answerCallbackQuery({ text: '❌ Payment not found' });
        return;
      }

      // Verify ownership
      if (payment.userId !== userId) {
        await ctx.answerCallbackQuery({ text: '❌ You do not own this payment' });
        return;
      }

      // Route to appropriate handler
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
        default:
          await ctx.answerCallbackQuery({ text: '❌ Unknown action' });
      }

    } catch (error) {
      console.error('Callback handler error:', error);
      await ctx.answerCallbackQuery({ text: '❌ An error occurred' });
    }
  }

  /**
   * Handle "View" callback - show payment details
   */
  private async handleViewPayment(ctx: Context, payment: Payment): Promise<void> {
    try {
      // Get paybacks for this payment
      const paybacks = await this.repository.listPaybacksByPayment(payment.id);
      
      // Format payment details
      const lines: string[] = [
        '💳 *Payment Details*',
        '',
        `*Reference:* \`${payment.ref}\``,
        `*Amount:* $${(payment.amountCents / 100).toFixed(2)}`,
        `*Description:* ${payment.description}`,
        `*Status:* ${payment.status === 'pending' ? '⏳ Pending' : '✅ Received'}`,
        `*Created:* ${this.formatDate(payment.createdAt)}`,
      ];

      if (payment.receivedAt) {
        lines.push(`*Received:* ${this.formatDate(payment.receivedAt)}`);
        lines.push(`*Source:* ${payment.source === 'manual' ? 'Manual' : 'Notification'}`);
      }

      // Add payback summary if any
      if (paybacks.length > 0) {
        lines.push('');
        lines.push('💸 *Paybacks:*');
        
        const totalPayback = paybacks.reduce((sum, pb) => sum + pb.amountCents, 0);
        const remaining = payment.amountCents - totalPayback;
        
        for (const payback of paybacks) {
          const status = payback.status === 'pending' ? '⏳' : '✅';
          lines.push(`${status} $${(payback.amountCents / 100).toFixed(2)} to ${payback.payerValue} (${payback.status})`);
        }
        
        lines.push('');
        lines.push(`*Total Payback:* $${(totalPayback / 100).toFixed(2)}`);
        lines.push(`*Remaining:* $${(remaining / 100).toFixed(2)}`);
      } else {
        lines.push('');
        lines.push('💸 *Paybacks:* None');
      }

      const message = lines.join('\n');
      await ctx.answerCallbackQuery({ text: '📋 Payment details loaded' });
      await ctx.editMessageText(message, { parse_mode: 'Markdown' });
      
    } catch (error) {
      console.error('Failed to load payment details:', error);
      await ctx.answerCallbackQuery({ text: '❌ Failed to load payment details' });
    }
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
    
    // Optionally update the message to reflect new status
    if (ctx.callbackQuery?.message) {
      await ctx.editMessageText(
        `✅ Payment received!\n\nRef: \`${payment.ref}\`\nAmount: $${(payment.amountCents / 100).toFixed(2)}`,
        { parse_mode: 'Markdown' }
      );
    }
  }

  /**
   * Handle "Payback" callback
   */
  private async handlePayback(ctx: Context, payment: Payment): Promise<void> {
    // Start payback conversation flow
    await this.conversationDO.fetch(new Request('http://localhost/state', {
      method: 'POST',
      body: JSON.stringify({
        flow: 'payback',
        step: 1,
        context: { paymentRef: payment.ref },
        lastActivity: new Date().toISOString()
      })
    }));

    await ctx.answerCallbackQuery({ text: '🔄 Starting payback flow...' });
    
    await ctx.reply(
      `💸 Payback for payment \`${payment.ref}\`\nAmount: $${(payment.amountCents / 100).toFixed(2)}\n\nPlease enter the payer's PayNow reference (mobile or UEN):`,
      { parse_mode: 'Markdown' }
    );
  }
}
