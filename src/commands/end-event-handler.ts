import type { Context } from 'grammy';
import { InlineKeyboard } from 'grammy';
import type { EventRepository } from '../db/repository.js';
import type { ConversationDO, ConversationState } from '../worker/conversation-do.js';

export class EndEventHandler {
  private conversationDO: ConversationDO;
  private eventRepository: EventRepository;

  constructor(conversationDO: ConversationDO, eventRepository: EventRepository) {
    this.conversationDO = conversationDO;
    this.eventRepository = eventRepository;
  }

  async start(ctx: Context): Promise<void> {
    const chatId = ctx.chat!.id;
    const topicId = ctx.message?.message_thread_id ?? 0;

    try {
      const events = await this.eventRepository.listOpenEventsByChat(chatId, topicId);

      if (events.length === 0) {
        await ctx.reply('❓ No open events to close.');
        return;
      }

      await this.setState({
        flow: 'end',
        step: 1, // pick event
        context: { chatId, topicId, events: events.map((e) => e.ref) },
        lastActivity: new Date().toISOString(),
      });

      if (events.length === 1) {
        const event = events[0]!;
        await this.proceedToConfirm(ctx, event);
      } else {
        const keyboard = new InlineKeyboard();
        for (const event of events) {
          keyboard.text(event.name, `end_pick:${event.ref}`).row();
        }

        await ctx.reply('🔒 Close an event.\n\n' + 'Which event would you like to close?', {
          reply_markup: keyboard,
        });
      }
    } catch (error) {
      console.error('Failed to start end_event flow:', error);
      await ctx.reply('❌ Failed to start. Please try again.');
    }
  }

  async handleInput(ctx: Context): Promise<boolean> {
    const state = await this.getState();

    if (state?.flow !== 'end') {
      return false;
    }

    const text = ctx.message?.text?.trim();
    if (!text) {
      return true;
    }

    if (text.toLowerCase() === 'cancel' || text.toLowerCase() === '/cancel') {
      await this.resetState();
      await ctx.reply('❌ Cancelled. No event was closed.');
      return true;
    }

    // Step 2 (confirm) is button-driven
    await ctx.reply('⏳ Waiting for confirmation. Please tap a button above.');
    return true;
  }

  async handleCallback(ctx: Context): Promise<boolean> {
    const data = ctx.callbackQuery?.data;
    if (
      !data ||
      (!data.startsWith('end_pick:') &&
        !data.startsWith('end_confirm:') &&
        !data.startsWith('end_cancel:'))
    ) {
      return false;
    }

    const state = await this.getState();
    if (state?.flow !== 'end') {
      await ctx.editMessageText('❌ Session expired. Run /end_event again.', {
        reply_markup: { inline_keyboard: [] },
      });
      return true;
    }

    if (data.startsWith('end_pick:')) {
      const eventRef = data.split(':')[1];
      if (!eventRef) return false;

      const event = await this.eventRepository.getEventByRef(eventRef);
      // An event from another chat reads as not found (a forwarded ref must not close it)
      if (event?.status !== 'open' || event.chatId !== ctx.chat?.id) {
        await ctx.answerCallbackQuery({ text: '❌ Event not found or already closed.' });
        return true;
      }

      await this.proceedToConfirm(ctx, event);
      return true;
    }

    if (data.startsWith('end_cancel:')) {
      await this.resetState();
      await ctx.editMessageText('❌ Cancelled. No event was closed.', {
        reply_markup: { inline_keyboard: [] },
      });
      return true;
    }

    if (data.startsWith('end_confirm:')) {
      const eventRef = data.split(':')[1];
      if (!eventRef) return false;

      const event = await this.eventRepository.getEventByRef(eventRef);
      if (event?.status !== 'open' || event.chatId !== ctx.chat?.id) {
        await ctx.editMessageText('❌ Event not found or already closed.', {
          reply_markup: { inline_keyboard: [] },
        });
        await this.resetState();
        return true;
      }

      const stats = await this.eventRepository.getEventStats(event.id);
      const closed = await this.eventRepository.closeEvent(eventRef, new Date().toISOString());

      await this.resetState();

      if (closed) {
        await ctx.editMessageText(
          `🔒 Event "${event.name}" closed.\n\n` +
            `Payments: ${stats.paymentCount}\n` +
            `Collected: $${(stats.collectedCents / 100).toFixed(2)}\n` +
            `Pending: $${(stats.pendingCents / 100).toFixed(2)}\n\n` +
            'No new payments can be created for this event.',
          { reply_markup: { inline_keyboard: [] } }
        );
      } else {
        await ctx.editMessageText('⚠️ Event was already closed.', {
          reply_markup: { inline_keyboard: [] },
        });
      }
      return true;
    }

    return false;
  }

  private async proceedToConfirm(
    ctx: Context,
    event: { ref: string; name: string }
  ): Promise<void> {
    const stats = await this.eventRepository.getEventStats(
      (await this.eventRepository.getEventByRef(event.ref))!.id
    );

    await this.setState({
      flow: 'end',
      step: 2,
      context: { eventRef: event.ref, eventName: event.name },
      lastActivity: new Date().toISOString(),
    });

    const keyboard = new InlineKeyboard()
      .text('✅ Confirm close', `end_confirm:${event.ref}`)
      .text('❌ Cancel', `end_cancel:${event.ref}`);

    await ctx.reply(
      `🔒 Close event "${event.name}"?\n\n` +
        `Payments: ${stats.paymentCount}\n` +
        `Collected: $${(stats.collectedCents / 100).toFixed(2)}\n` +
        `Pending: $${(stats.pendingCents / 100).toFixed(2)}\n\n` +
        'This will prevent new payments. Existing payments remain tracked.',
      { reply_markup: keyboard }
    );
  }

  private async getState(): Promise<ConversationState | null> {
    const response = await this.conversationDO.fetch(
      new Request('http://localhost/state', { method: 'GET' })
    );
    if (response.status !== 200) return null;
    return (await response.json()) as ConversationState;
  }

  private async setState(state: ConversationState): Promise<void> {
    const response = await this.conversationDO.fetch(
      new Request('http://localhost/state', {
        method: 'POST',
        body: JSON.stringify(state),
      })
    );
    await response?.body?.cancel();
  }

  private async resetState(): Promise<void> {
    await this.setState({
      flow: 'idle',
      step: 0,
      context: {},
      lastActivity: new Date().toISOString(),
    });
  }

  async cancel(ctx: Context): Promise<void> {
    const state = await this.getState();
    if (state && state.flow === 'end') {
      await this.resetState();
      await ctx.reply('❌ Cancelled. No event was closed.');
    } else {
      await ctx.reply('Nothing to cancel.');
    }
  }
}
