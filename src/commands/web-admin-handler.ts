import type { Context } from 'grammy';
import { InlineKeyboard } from 'grammy';
import type { EventRepository } from '../db/repository.js';

/**
 * /web_admin — link buttons to the read-only event page (Cloudflare Pages). The links carry no
 * secret: the page itself requires Telegram sign-in and a chat-admin check.
 */
export class WebAdminCommandHandler {
  constructor(
    private eventRepository: EventRepository,
    private baseUrl: string | undefined
  ) {}

  async handle(ctx: Context): Promise<void> {
    if (!this.baseUrl) {
      await ctx.reply('⚠️ The web admin page is not configured yet.');
      return;
    }

    const chatId = ctx.chat?.id ?? ctx.from!.id;
    const topicId = ctx.message?.message_thread_id ?? 0;
    const events = await this.eventRepository.listAllEventsByChat(chatId, topicId);
    if (events.length === 0) {
      await ctx.reply('📭 No events yet.\n\nUse /init to create your first event!');
      return;
    }

    const base = this.baseUrl.replace(/\/+$/, '');
    const keyboard = new InlineKeyboard();
    for (const event of events.slice(0, 20)) {
      keyboard
        .url(
          `${event.status === 'open' ? '🟢' : '🔴'} ${event.name}`,
          `${base}/events/${event.ref}`
        )
        .row();
    }
    await ctx.reply('🌐 Open an event page (chat admins only, sign in with Telegram):', {
      reply_markup: keyboard,
    });
  }
}
