import type { Context } from 'grammy';
import { InlineKeyboard } from 'grammy';
import type { Payment, Repository } from '../db/repository.js';

/**
 * /payments command handler - lists user's payments
 *
 * Flow:
 * 1. User sends /payments
 * 2. Bot checks if user exists (has run /init)
 * 3. Bot fetches all payments for the user
 * 4. Bot displays formatted list of payments
 */

export class PaymentsCommandHandler {
  private repository: Repository;

  constructor(repository: Repository) {
    this.repository = repository;
  }

  /**
   * Handle /payments command
   */
  async handle(ctx: Context): Promise<void> {
    const userId = ctx.from!.id;

    try {
      // Check if user exists
      const user = await this.repository.getUser(userId);
      if (!user) {
        await ctx.reply(
          "❓ You haven't set up your PayNow reference yet.\n\nPlease run /init first to configure your account."
        );
        return;
      }

      // Get all payments for this user
      const payments = await this.repository.listPaymentsByUser(userId);

      if (payments.length === 0) {
        await ctx.reply(
          "📭 You don't have any payments yet.\n\nUse /start to create your first payment request!"
        );
        return;
      }

      // Format and display payments with inline buttons
      const { message, buttons } = this.formatPaymentsList(payments);
      await ctx.reply(message, {
        parse_mode: 'Markdown',
        reply_markup: buttons,
      });
    } catch (error) {
      console.error('Failed to list payments:', error);
      await ctx.reply('❌ Failed to fetch your payments. Please try again later.');
    }
  }

  /**
   * Format payments list for display with inline buttons
   */
  private formatPaymentsList(payments: Payment[]): { message: string; buttons: InlineKeyboard } {
    const lines: string[] = ['💰 *Your Payments*', ''];

    const keyboard = new InlineKeyboard();

    // Sort by creation date (newest first)
    const sorted = [...payments].sort(
      (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
    );

    for (const payment of sorted) {
      const statusIcon = payment.status === 'pending' ? '⏳' : '✅';
      const amount = this.formatAmount(payment.amountCents);
      const date = this.formatDate(payment.createdAt);
      const status = payment.status === 'pending' ? 'Pending' : 'Received';

      lines.push(`${statusIcon} *${amount}* - ${payment.description}`);
      lines.push(`   Ref: \`${payment.ref}\` | ${status} | ${date}`);
      lines.push('');

      // Add buttons for each payment
      keyboard.add({ text: `View`, callback_data: `view:${payment.ref}` });
      if (payment.status === 'pending') {
        keyboard.add({ text: `Mark as Received`, callback_data: `mark_received:${payment.ref}` });
      }
      keyboard.add({ text: `Payback`, callback_data: `payback:${payment.ref}` });
      keyboard.row();
    }

    lines.push('Use the buttons above to manage your payments.');

    return { message: lines.join('\n'), buttons: keyboard };
  }

  /**
   * Format amount in cents to dollars with 2 decimal places
   */
  private formatAmount(cents: number): string {
    const dollars = cents / 100;
    return `$${dollars.toFixed(2)}`;
  }

  /**
   * Format ISO date string to readable format
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
}
