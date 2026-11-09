import type { Context } from 'grammy';
import { InlineKeyboard } from 'grammy';
import { detectProxyType } from '../db/proxy-validation.js';
import type { Event, EventPatch, EventRepository } from '../db/repository.js';
import { formatCents, parseAmount } from '../sgqr/amount.js';
import type { ConversationDO, ConversationState } from '../worker/conversation-do.js';
import { normalizeWebsiteUrl } from './website-url.js';

/**
 * /edit_event — change the name, payee, default amount or website link of an open event.
 *
 * Flow `edit`: step 1 pick event, step 2 pick field, step 3 type the new value. One field per
 * run, saved at once; the reply lists every final value. Chat administrators only, checked at the
 * start and again right before the write. Payments already issued keep their own snapshot.
 */

type Field = 'name' | 'payee' | 'amount' | 'website';
const FIELDS: Field[] = ['name', 'payee', 'amount', 'website'];

export type AdminCheck = (chatId: number, userId: number) => Promise<boolean>;

const NOT_ADMIN = '🔒 Only chat administrators can edit an event.';

export class EditEventHandler {
  constructor(
    private conversationDO: ConversationDO,
    private eventRepository: EventRepository,
    private isAdmin: AdminCheck
  ) {}

  async start(ctx: Context): Promise<void> {
    const chatId = ctx.chat!.id;
    const userId = ctx.from!.id;
    const topicId = ctx.message?.message_thread_id ?? 0;

    if (!(await this.isAdmin(chatId, userId))) {
      await ctx.reply(NOT_ADMIN);
      return;
    }

    const events = await this.eventRepository.listOpenEventsByChat(chatId, topicId);
    if (events.length === 0) {
      await ctx.reply('❓ No open events to edit.');
      return;
    }

    await this.setState(1, { chatId, topicId, userId });

    if (events.length === 1) {
      await this.askField(ctx, events[0]!, false);
      return;
    }
    const keyboard = new InlineKeyboard();
    for (const event of events) keyboard.text(event.name, `edit_pick:${event.ref}`).row();
    keyboard.text('❌ Cancel', 'edit_cancel');
    await ctx.reply('✏️ Edit an event.\n\nWhich event?', { reply_markup: keyboard });
  }

  async handleInput(ctx: Context): Promise<boolean> {
    const state = await this.getState();
    if (state?.flow !== 'edit') return false;

    const text = ctx.message?.text?.trim();
    if (!text) return true;

    if (state.step !== 3) {
      await ctx.reply('⏳ Please tap a button above (or /cancel).');
      return true;
    }
    await this.applyValue(ctx, text, state);
    return true;
  }

  async handleCallback(ctx: Context): Promise<boolean> {
    const data = ctx.callbackQuery?.data;
    if (!data?.startsWith('edit_')) return false;

    const state = await this.getState();
    if (state?.flow !== 'edit') {
      await ctx.editMessageText('❌ Session expired. Run /edit_event again.', {
        reply_markup: { inline_keyboard: [] },
      });
      return true;
    }
    // Only the person who started the flow may drive it
    if (state.context.userId !== ctx.from?.id) {
      await ctx.answerCallbackQuery({ text: 'This is not your conversation.' });
      return true;
    }

    if (data === 'edit_cancel') {
      await this.reset();
      await ctx.editMessageText('❌ Cancelled. The event was not changed.', {
        reply_markup: { inline_keyboard: [] },
      });
      return true;
    }

    const eventRef = data.startsWith('edit_pick:')
      ? data.slice('edit_pick:'.length)
      : (state.context.eventRef as string);
    const event = eventRef ? await this.eventRepository.getEventByRef(eventRef) : null;
    // Another chat's event, or one closed meanwhile, reads as gone
    if (event?.status !== 'open' || event.chatId !== ctx.chat?.id) {
      await this.reset();
      await ctx.editMessageText('❌ Event not found or already closed.', {
        reply_markup: { inline_keyboard: [] },
      });
      return true;
    }

    if (data.startsWith('edit_pick:')) {
      await this.askField(ctx, event, true);
    } else if (data === 'edit_clear_amount') {
      await this.save(ctx, event, { defaultAmountCents: null }, 'amount', state);
    } else if (data === 'edit_clear_website') {
      await this.save(ctx, event, { websiteUrl: null }, 'website', state);
    } else if (data.startsWith('edit_field:')) {
      const field = data.slice('edit_field:'.length) as Field;
      if (FIELDS.includes(field)) await this.askValue(ctx, event, field, state);
    }
    return true;
  }

  private async askField(ctx: Context, event: Event, edit: boolean): Promise<void> {
    const state = await this.getState();
    await this.setState(2, { ...state?.context, eventRef: event.ref });
    const keyboard = new InlineKeyboard()
      .text('Name', 'edit_field:name')
      .text('Payee', 'edit_field:payee')
      .text('Default amount', 'edit_field:amount')
      .text('Website', 'edit_field:website')
      .row()
      .text('❌ Cancel', 'edit_cancel');
    const text = `✏️ Editing:\n${details(event)}\n\nWhat do you want to change?`;
    if (edit) await ctx.editMessageText(text, { reply_markup: keyboard });
    else await ctx.reply(text, { reply_markup: keyboard });
  }

  private async askValue(
    ctx: Context,
    event: Event,
    field: Field,
    state: ConversationState
  ): Promise<void> {
    await this.setState(3, { ...state.context, field });
    const keyboard = new InlineKeyboard();
    if (field === 'amount' && event.defaultAmountCents !== null) {
      keyboard.text('🗑 Clear', 'edit_clear_amount');
    }
    if (field === 'website' && event.websiteUrl) {
      keyboard.text('🗑 Clear', 'edit_clear_website');
    }
    keyboard.text('❌ Cancel', 'edit_cancel');
    const prompt = {
      name: 'Send the new event name (1–50 characters):',
      payee: 'Send the new PayNow payee — mobile number (e.g. 91234567) or UEN (e.g. 201234567A):',
      amount: 'Send the new default amount in SGD (e.g. 21 or 12.50):',
      website:
        "Send the link to the event's own page (e.g. https://example.com/dinner), up to 200 characters:",
    }[field];
    await ctx.editMessageText(prompt, { reply_markup: keyboard });
  }

  private async applyValue(ctx: Context, input: string, state: ConversationState): Promise<void> {
    const field = state.context.field as Field;
    let patch: EventPatch;
    if (field === 'name') {
      if (input.length > 50) {
        await ctx.reply('❌ Event name must be between 1 and 50 characters. Please try again:');
        return;
      }
      patch = { name: input };
    } else if (field === 'payee') {
      const proxy = detectProxyType(input);
      if (!proxy) {
        await ctx.reply(
          '❌ Invalid reference. Please enter:\n• Mobile number (8 digits, starting with 6/8/9)\n• UEN (9-13 characters)\n\nTry again:'
        );
        return;
      }
      patch = { payeeType: proxy.type, payeeValue: proxy.normalized };
    } else if (field === 'website') {
      const url = normalizeWebsiteUrl(input);
      if (url === null) {
        await ctx.reply(
          '❌ That is not a valid web address. Send a link starting with http:// or https:// (or just example.com/page), up to 200 characters.'
        );
        return;
      }
      patch = { websiteUrl: url };
    } else {
      const cents = parseAmount(input);
      if (cents === null) {
        await ctx.reply(
          '❌ Invalid amount. Enter a positive number with up to 2 decimals (e.g. 21 or 12.50).'
        );
        return;
      }
      patch = { defaultAmountCents: cents };
    }

    const event = await this.eventRepository.getEventByRef(state.context.eventRef as string);
    if (event?.status !== 'open') {
      await this.reset();
      await ctx.reply('❌ Event not found or already closed.');
      return;
    }
    await this.save(ctx, event, patch, field, state);
  }

  /** Re-check admin rights, write, then show every final value. */
  private async save(
    ctx: Context,
    event: Event,
    patch: EventPatch,
    field: Field,
    state: ConversationState
  ): Promise<void> {
    const reply = (text: string) =>
      ctx.callbackQuery
        ? ctx.editMessageText(text, { reply_markup: { inline_keyboard: [] } })
        : ctx.reply(text);

    if (!(await this.isAdmin(state.context.chatId as number, ctx.from!.id))) {
      await this.reset();
      await reply(NOT_ADMIN);
      return;
    }
    const updated = await this.eventRepository.updateEvent(event.ref, patch);
    await this.reset();
    if (!updated) {
      await reply('❌ Event not found or already closed.');
      return;
    }
    await reply(
      `✅ Event updated\n${details(updated, field)}\n\n` +
        'Payments already created keep their original name and payee.'
    );
  }

  private async getState(): Promise<ConversationState | null> {
    const response = await this.conversationDO.fetch(
      new Request('http://localhost/state', { method: 'GET' })
    );
    if (response.status !== 200) return null;
    return (await response.json()) as ConversationState;
  }

  private async setState(step: number, context: Record<string, unknown>): Promise<void> {
    const response = await this.conversationDO.fetch(
      new Request('http://localhost/state', {
        method: 'POST',
        body: JSON.stringify({
          flow: 'edit',
          step,
          context,
          lastActivity: new Date().toISOString(),
        }),
      })
    );
    await response?.body?.cancel();
  }

  private async reset(): Promise<void> {
    const response = await this.conversationDO.fetch(
      new Request('http://localhost/state', {
        method: 'POST',
        body: JSON.stringify({
          flow: 'idle',
          step: 0,
          context: {},
          lastActivity: new Date().toISOString(),
        }),
      })
    );
    await response?.body?.cancel();
  }
}

/** Name / payee / default amount / website lines; the field just changed is marked. */
function details(event: Event, changed?: Field): string {
  const mark = (f: Field) => (changed === f ? ' ✏️' : '');
  return (
    `📋 Name: ${event.name}${mark('name')}\n` +
    `📱 ${event.payeeType === 'mobile' ? 'Mobile number' : 'UEN'}: ${event.payeeValue}${mark('payee')}\n` +
    `💰 Default amount: ${event.defaultAmountCents === null ? 'none' : `SGD ${formatCents(event.defaultAmountCents)}`}${mark('amount')}\n` +
    `🌐 Website: ${event.websiteUrl ?? 'none'}${mark('website')}`
  );
}
