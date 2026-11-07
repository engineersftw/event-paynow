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

  /** Max payments shown per list page — keeps the keyboard bounded. */
  private readonly pageSize = 5;

  /**
   * Handle /payments command (optionally with a page number for pagination).
   */
  async handle(ctx: Context, pageArg?: string): Promise<void> {
    const userId = ctx.from!.id;
    const page = Math.max(1, parseInt(pageArg ?? '1', 10) || 1);

    try {
      const user = await this.repository.getUser(userId);
      if (!user) {
        await ctx.reply(
          "❓ You haven't set up your PayNow reference yet.\n\nPlease run /init first to configure your account."
        );
        return;
      }

      // Get all payments for this user, newest first
      const payments = (await this.repository.listPaymentsByUser(userId)).sort(
        (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
      );

      if (payments.length === 0) {
        await ctx.reply(
          "📭 You don't have any payments yet.\n\nUse /start to create your first payment request!"
        );
        return;
      }

      const total = payments.length;
      const offset = (page - 1) * this.pageSize;
      const pagePayments = payments.slice(offset, offset + this.pageSize);
      const { message, buttons } = this.formatPaymentsPage(pagePayments, page, total);
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
   * Render one page of payments with per-row action buttons and Prev/Next nav.
   */
  private formatPaymentsPage(
    payments: Payment[],
    page: number,
    total: number
  ): { message: string; buttons: InlineKeyboard } {
    const lines: string[] = [
      '💰 *Your Payments*',
      `Page ${page} of ${this.totalPages(total)} (${total} total)`,
      '',
    ];

    const keyboard = new InlineKeyboard();

    for (const payment of payments) {
      const statusIcon = payment.status === 'pending' ? '⏳' : '✅';
      const amount = this.formatAmount(payment.amountCents);
      const date = this.formatDate(payment.createdAt);
      const status = payment.status === 'pending' ? 'Pending' : 'Received';

      lines.push(`${statusIcon} *${amount}* - ${payment.description}`);
      lines.push(`   Ref: \`${payment.ref}\` | ${status} | ${date}`);
      lines.push('');

      // One row of action buttons per payment
      keyboard.add({ text: 'View', callback_data: `view:${payment.ref}` });
      if (payment.status === 'pending') {
        keyboard.add({ text: '✓ Received', callback_data: `mark_received:${payment.ref}` });
      }
      keyboard.add({ text: 'Payback', callback_data: `payback:${payment.ref}` });
      keyboard.row();
    }

    // Pagination row at the bottom
    const totalPages = this.totalPages(total);
    if (totalPages > 1) {
      if (page > 1) {
        keyboard.add({ text: '« Prev', callback_data: `payments:${page - 1}` });
      }
      if (page < totalPages) {
        keyboard.add({ text: 'Next »', callback_data: `payments:${page + 1}` });
      }
      keyboard.row();
    }

    lines.push('Tap a button to manage a payment.');
    return { message: lines.join('\n'), buttons: keyboard };
  }

  private totalPages(total: number): number {
    return Math.max(1, Math.ceil(total / this.pageSize));
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
