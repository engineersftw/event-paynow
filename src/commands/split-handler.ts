import type { Context } from 'grammy';
import { InlineKeyboard, InputFile } from 'grammy';
import { detectProxyType } from '../db/proxy-validation';
import { formatCents, parseAmount } from '../sgqr/amount';
import { buildPayNowPayload, truncateAnsi } from '../sgqr/paynow';
import { renderQrPng } from '../sgqr/qr-render';
import type { ConversationDO, ConversationState } from '../worker/conversation-do';
import { parsePeople, splitEqually } from './split-math';

/** Steps of the `split` flow. */
const TOTAL = 1;
const PEOPLE = 2;
const PAYEE = 3;
const DESCRIPTION = 4;
const CONFIRM = 5; // summary with Confirm / Cancel; the QR is made only after Confirm

const MAX_DESCRIPTION = 25;

export const SPLIT_HELP =
  'Split PayNow Bot splits a bill equally and makes a PayNow QR for one share.\n\n' +
  '/split - total, number of people, payee, optional description\n' +
  '/cancel - stop\n\n' +
  'In a group, reply to my questions and I offer the group size as the number of people. ' +
  'The QR never shows the payee number. In a group the payee number you type stays in the chat ' +
  'unless I may delete messages, so use a private chat if that matters.';

const isGroup = (ctx: Context) => ctx.chat?.type !== 'private';
const topicOf = (ctx: Context) =>
  ctx.message?.message_thread_id ?? ctx.callbackQuery?.message?.message_thread_id ?? 0;

/** Everything entered, for the confirmation step. A group summary hides all but 4 of the payee. */
function summary(c: Record<string, unknown>, group: boolean): string {
  const total = c.totalCents as number;
  const people = c.people as number;
  const { shareCents, collectedCents, overCents } = splitEqually(total, people);
  const value = c.payeeValue as string;
  const lines = [
    'Please check the split:',
    '',
    `Payee: ${c.payeeType === 'uen' ? 'UEN' : 'Mobile'} ${group ? `…${value.slice(-4)}` : value}`,
    `Bill: SGD ${formatCents(total)} between ${people} people`,
    `Each share: SGD ${formatCents(shareCents)} (everyone else pays you this)`,
  ];
  if (overCents > 0) {
    lines.push(
      `Shares add up to SGD ${formatCents(collectedCents)}, SGD ${formatCents(overCents)} over, from rounding up`
    );
  }
  lines.push(`Description: ${(c.description as string | undefined) ?? 'none'}`);
  return lines.join('\n');
}

/**
 * Split_PayNow_Bot conversation: total -> people -> payee -> description -> confirm -> QR.
 * Works in private chats and groups. In a group only the user who started it can answer
 * (the DO records the owner). Nothing is persisted: answers live in the DO until the QR is sent.
 */
export class SplitCommandHandler {
  constructor(private readonly conversationDO: ConversationDO) {}

  async start(ctx: Context): Promise<void> {
    if (!ctx.from) return;
    await this.setState({ flow: 'split', step: TOTAL, context: {} });
    await this.fetch('/owner', { userId: ctx.from.id, topicId: topicOf(ctx) });
    await this.ask(ctx, 'How much is the bill in total, in SGD (e.g. 187.40)?');
  }

  async cancel(ctx: Context): Promise<void> {
    const state = await this.getState();
    if (state.flow !== 'split') {
      await ctx.reply('Nothing to cancel.');
      return;
    }
    if (!this.isOwner(ctx, state)) return; // someone else's split: ignore
    await this.setState({ flow: 'idle', step: 0, context: {} });
    await ctx.reply('Cancelled. Nothing was created.');
  }

  /** Free text; false when it is not part of this chat's split or not from its owner. */
  async handleText(ctx: Context): Promise<boolean> {
    const text = ctx.message?.text?.trim() ?? '';
    const state = await this.getState();
    if (state.flow !== 'split' || !this.isOwner(ctx, state)) return false;

    if (state.step === TOTAL) {
      const total = parseAmount(text);
      if (total === null) {
        await ctx.reply('Send a positive amount with up to 2 decimals, e.g. 187.40.');
        return true;
      }
      await this.askPeople(ctx, state, total);
      return true;
    }

    if (state.step === PEOPLE) {
      const people = parsePeople(text, state.context.totalCents as number);
      if (people === null) {
        await ctx.reply('Send a whole number of people from 2 to 100.');
        return true;
      }
      await this.askPayee(ctx, state, people);
      return true;
    }

    if (state.step === PAYEE) {
      const payee = detectProxyType(text);
      if (!payee) {
        await ctx.reply(
          'That is not a valid payee. Send a Singapore mobile number (e.g. 91234567 or +6591234567) or a UEN (9 to 13 letters and digits).'
        );
        return true;
      }
      // The number was typed into the chat: remove it from a group if we may (best effort)
      if (isGroup(ctx)) await ctx.deleteMessage().catch(() => undefined);
      await this.setState({
        flow: 'split',
        step: DESCRIPTION,
        context: { ...state.context, payeeType: payee.type, payeeValue: payee.normalized },
      });
      await this.ask(
        ctx,
        `Add a short description (up to ${MAX_DESCRIPTION} characters), or tap Skip.`,
        new InlineKeyboard().text('Skip', 'split_skip_description')
      );
      return true;
    }

    if (state.step === DESCRIPTION) {
      const description = truncateAnsi(text, 1000); // what the QR can actually carry
      if (!description) {
        await ctx.reply('Send a short description using letters, numbers or common symbols.');
        return true;
      }
      if (description.length > MAX_DESCRIPTION) {
        await ctx.reply(`Keep the description to ${MAX_DESCRIPTION} characters or fewer.`);
        return true;
      }
      await this.askConfirm(ctx, state, description);
      return true;
    }

    if (state.step === CONFIRM) {
      await ctx.reply('Please tap Confirm or Cancel on the summary above.');
      return true;
    }
    return false;
  }

  /** Button taps; false when the data is not ours. */
  async handleCallback(ctx: Context, data: string): Promise<boolean> {
    if (!data.startsWith('split_')) return false;
    const state = await this.getState();
    if (state.flow === 'split' && !this.isOwner(ctx, state)) {
      await ctx.answerCallbackQuery({ text: 'This split is not yours.' });
      return true;
    }
    const step = state.flow === 'split' ? state.step : 0;
    const expected = data.startsWith('split_people:')
      ? PEOPLE
      : data === 'split_skip_description'
        ? DESCRIPTION
        : data === 'split_confirm' || data === 'split_cancel'
          ? CONFIRM
          : -1;
    if (step !== expected) {
      await ctx.answerCallbackQuery({ text: 'That step is over.' });
      return true;
    }
    await ctx.answerCallbackQuery();

    if (data.startsWith('split_people:')) {
      const n = Number(data.slice('split_people:'.length));
      // Only the number we offered (a stale or odd tap changes nothing)
      if (n === state.context.suggested) await this.askPayee(ctx, state, n);
    } else if (data === 'split_skip_description') {
      await this.askConfirm(ctx, state, undefined);
    } else if (data === 'split_confirm') {
      await this.finish(ctx);
    } else {
      await this.setState({ flow: 'idle', step: 0, context: {} });
      await this.dropButtons(ctx);
      await ctx.reply('Cancelled. Nothing was created. Send /split to begin again.');
    }
    return true;
  }

  /** Ask a text question. In a group a force-reply prompt reaches the bot even with privacy mode on. */
  private async ask(ctx: Context, text: string, buttons?: InlineKeyboard): Promise<void> {
    if (buttons) {
      await ctx.reply(isGroup(ctx) ? `${text} (reply to this message)` : text, {
        reply_markup: buttons,
      });
    } else if (isGroup(ctx)) {
      await ctx.reply(text, { reply_markup: { force_reply: true, selective: true } });
    } else {
      await ctx.reply(text);
    }
  }

  private async askPeople(ctx: Context, state: ConversationState, totalCents: number) {
    // Members minus this bot; only a suggestion (it also counts other bots and quiet members)
    let suggested: number | undefined;
    if (isGroup(ctx)) {
      const count = await ctx.api.getChatMemberCount(ctx.chat!.id).catch(() => null);
      if (typeof count === 'number' && count - 1 >= 2 && count - 1 <= totalCents) {
        suggested = count - 1;
      }
    }
    await this.setState({
      flow: 'split',
      step: PEOPLE,
      context: { ...state.context, totalCents, ...(suggested ? { suggested } : {}) },
    });
    const text = `Bill: SGD ${formatCents(totalCents)}. How many people share it (2 to 100)?`;
    await this.ask(
      ctx,
      text,
      suggested
        ? new InlineKeyboard().text(`Split by ${suggested}`, `split_people:${suggested}`)
        : undefined
    );
  }

  private async askPayee(ctx: Context, state: ConversationState, people: number) {
    await this.setState({
      flow: 'split',
      step: PAYEE,
      context: { ...state.context, people },
    });
    await this.ask(ctx, 'Who should be paid? Send a Singapore mobile number or a UEN.');
  }

  /** Store the description (if any) and show everything entered, for the user to confirm. */
  private async askConfirm(
    ctx: Context,
    state: ConversationState,
    description: string | undefined
  ) {
    const context = { ...state.context, ...(description ? { description } : {}) };
    await this.setState({ flow: 'split', step: CONFIRM, context });
    await ctx.reply(summary(context, isGroup(ctx)), {
      reply_markup: new InlineKeyboard()
        .text('✅ Confirm', 'split_confirm')
        .text('❌ Cancel', 'split_cancel'),
    });
  }

  /** Take the buttons off the summary once it has been answered (best effort). */
  private async dropButtons(ctx: Context): Promise<void> {
    await ctx.editMessageReplyMarkup().catch(() => undefined);
  }

  /** Claim the conversation (exactly once, and the state is wiped), then build and send the QR. */
  private async finish(ctx: Context): Promise<void> {
    const claimed = await this.conversationDO.fetch(
      new Request('http://localhost/claim', {
        method: 'POST',
        body: JSON.stringify({ flow: 'split', step: CONFIRM }),
      })
    );
    if (claimed.status !== 200) {
      await claimed.body?.cancel();
      return; // a double tap: the other tap is already sending the QR
    }
    const state = (await claimed.json()) as ConversationState;
    await this.dropButtons(ctx);
    const c = state.context;
    const description = c.description as string | undefined;
    const people = c.people as number;
    const { shareCents } = splitEqually(c.totalCents as number, people);

    try {
      const payload = buildPayNowPayload({
        proxyType: c.payeeType as 'mobile' | 'uen',
        proxyValue: c.payeeValue as string,
        amountCents: shareCents,
        editable: false,
        ...(description ? { description } : {}),
      });
      const lines = [
        ...(description ? [description] : []),
        `SGD ${formatCents(shareCents)} each (split ${people} ways)`,
      ];
      const image = await renderQrPng(payload, lines);
      await ctx.replyWithPhoto(new InputFile(image, 'paynow-qr.bmp'), {
        caption: `${lines.join('\n')}\n\nScan with your banking app. Check the payee name before you pay. Send /split for another.`,
      });
    } catch {
      // No console logging: the answers include a payee number
      await ctx.reply('Could not make the QR. Please send /split to try again.');
    }
  }

  /** Private chats have one user; in a group only the user and topic that started it. */
  private isOwner(ctx: Context, state: ConversationState): boolean {
    if (!isGroup(ctx)) return true;
    const o = state.owner;
    return !o || (o.userId === ctx.from?.id && o.topicId === topicOf(ctx));
  }

  private async getState(): Promise<ConversationState> {
    const response = await this.conversationDO.fetch(new Request('http://localhost/state'));
    return (await response.json()) as ConversationState;
  }

  private async setState(state: Pick<ConversationState, 'flow' | 'step' | 'context'>) {
    await this.fetch('/state', state);
  }

  private async fetch(path: string, body: unknown) {
    const response = await this.conversationDO.fetch(
      new Request(`http://localhost${path}`, { method: 'POST', body: JSON.stringify(body) })
    );
    await response.body?.cancel();
  }
}
