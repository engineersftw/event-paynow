import type { Context } from 'grammy';
import { InlineKeyboard } from 'grammy';
import type { EventRepository, Repository } from '../db/repository.js';
import { formatCents } from '../sgqr/amount.js';

export class PaymentsCommandHandler {
  private repository: Repository;
  private eventRepository: EventRepository;

  constructor(repository: Repository, eventRepository: EventRepository) {
    this.repository = repository;
    this.eventRepository = eventRepository;
  }

  /**
   * Handle /payments command.
   * Top-level: list events. If an eventRef is provided (via callback), drill into that event's payments.
   */
  async handle(ctx: Context, eventRef?: string): Promise<void> {
    const userId = ctx.from!.id;

    try {
      // If an event ref is provided, drill into that event's payments
      if (eventRef && eventRef !== 'list') {
        await this.showEventPayments(ctx, eventRef, userId);
        return;
      }

      // Top-level: list events for this chat+topic
      const chatId = ctx.chat?.id ?? userId;
      const topicId = ctx.message?.message_thread_id ?? 0;

      const events = await this.eventRepository.listAllEventsByChat(chatId, topicId);

      if (events.length === 0) {
        await ctx.reply(
          "📭 You don't have any events yet.\n\nUse /init to create your first event!"
        );
        return;
      }

      // Sort by created_at DESC, limit to 10
      const sorted = [...events].sort(
        (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
      );
      const topEvents = sorted.slice(0, 10);

      const lines: string[] = ['💰 *Your Events*', ''];
      const keyboard = new InlineKeyboard();

      for (const event of topEvents) {
        const stats = await this.eventRepository.getEventStats(event.id);
        const statusIcon = event.status === 'open' ? '🟢' : '🔴';
        const statusLabel = event.status === 'open' ? 'Open' : 'Closed';

        lines.push(`${statusIcon} *${event.name}* (${statusLabel})`);
        lines.push(
          `   Payee: ${event.payeeValue} | ${stats.paymentCount} payments | $${formatCents(stats.collectedCents)} collected | $${formatCents(stats.pendingCents)} pending`
        );
        lines.push('');

        keyboard.text(`View ${event.name}`, `event_view:${event.ref}`).row();
      }

      lines.push('Tap an event to see its payments.');

      await ctx.reply(lines.join('\n'), {
        parse_mode: 'Markdown',
        reply_markup: keyboard,
      });
    } catch (error) {
      console.error('Failed to list payments:', error);
      await ctx.reply('❌ Failed to fetch your payments. Please try again later.');
    }
  }

  /**
   * Show payments for a specific event.
   */
  private async showEventPayments(ctx: Context, eventRef: string, userId: number): Promise<void> {
    const event = await this.eventRepository.getEventByRef(eventRef);
    if (!event) {
      await ctx.reply('❌ Event not found.');
      return;
    }

    // Get all payments for this user, filter by event
    const allPayments = await this.repository.listPaymentsByUser(userId);
    const eventPayments = allPayments.filter((p) => p.eventId === event.id);

    if (eventPayments.length === 0) {
      await ctx.reply(`📭 No payments for event "${event.name}" yet.\n\nUse /start to create one!`);
      return;
    }

    // Sort by creation date (newest first)
    const sorted = [...eventPayments].sort(
      (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
    );

    const lines: string[] = [`💰 *${event.name}*\n`];
    const keyboard = new InlineKeyboard();

    for (const payment of sorted) {
      const statusIcon = payment.status === 'pending' ? '⏳' : '✅';
      const amount = `$${formatCents(payment.amountCents)}`;
      const date = this.formatDate(payment.createdAt);
      const status = payment.status === 'pending' ? 'Pending' : 'Received';

      lines.push(`${statusIcon} *${amount}* - ${payment.description}`);
      lines.push(`   Ref: \`${payment.ref}\` | ${status} | ${date}`);
      lines.push('');

      keyboard.add({ text: 'View', callback_data: `view:${payment.ref}` });
      if (payment.status === 'pending') {
        keyboard.add({ text: '✓ Received', callback_data: `mark_received:${payment.ref}` });
      }
      keyboard.add({ text: 'Payback', callback_data: `payback:${payment.ref}` });
      keyboard.row();
    }

    lines.push('Tap a button to manage a payment.');

    await ctx.reply(lines.join('\n'), {
      parse_mode: 'Markdown',
      reply_markup: keyboard,
    });
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
