import type { Context } from 'grammy';
import { InlineKeyboard, InputFile } from 'grammy';
import { detectProxyType } from '../db/proxy-validation';
import { formatCents, parseAmount } from '../sgqr/amount';
import { buildPayNowPayload, truncateAnsi } from '../sgqr/paynow';
import { renderQrPng } from '../sgqr/qr-render';
import type { ConversationDO, ConversationState } from '../worker/conversation-do';
import {
  applyLeftover,
  groupByAmount,
  parseCustomList,
  parsePeople,
  type SplitEntry,
  splitEqually,
  sumCents,
} from './split-math';

/** Steps of the `split` flow. */
const TOTAL = 1;
const MODE = 2; // Equally or Custom amounts (skipped by /split_custom)
const PEOPLE = 3; // equal split only
const LIST = 4; // custom split only: names and amounts
const LEFTOVER = 5; // custom split only, when the list is short of the bill
const PAYEE = 6;
const DESCRIPTION = 7;
const CONFIRM = 8; // summary with Confirm / Cancel; the QR is made only after Confirm

const MAX_DESCRIPTION = 25;

export const SPLIT_HELP =
  'Split PayNow Bot splits a bill equally and makes a PayNow QR for one share.\n\n' +
  '/split - total, then equal or custom amounts, payee, optional description\n' +
  '/split_custom - same, straight to custom amounts (one line per person: name and amount)\n' +
  '/cancel - stop\n\n' +
  'In a group, reply to my questions and I offer the group size as the number of people. ' +
  'The QR never shows the payee number. In a group the payee number you type stays in the chat ' +
  'unless I may delete messages, so use a private chat if that matters.';

const isGroup = (ctx: Context) => ctx.chat?.type !== 'private';
const topicOf = (ctx: Context) =>
  ctx.message?.message_thread_id ?? ctx.callbackQuery?.message?.message_thread_id ?? 0;

const sgd = (cents: number) => `SGD ${formatCents(cents)}`;

/** Everything entered, for the confirmation step. A group summary hides all but 4 of the payee. */
function summary(c: Record<string, unknown>, group: boolean): string {
  const total = c.totalCents as number;
  const value = c.payeeValue as string;
  const lines = [
    'Please check the split:',
    '',
    `Payee: ${c.payeeType === 'uen' ? 'UEN' : 'Mobile'} ${group ? `…${value.slice(-4)}` : value}`,
  ];
  const listed = c.entries as SplitEntry[] | undefined;
  if (listed) {
    const r = applyLeftover(listed, total, (c.leftover as 'even' | 'omit' | undefined) ?? 'omit');
    lines.push(`Bill: ${sgd(total)} shared by ${listed.length} people`);
    for (const e of r.entries) lines.push(`${e.name}: ${sgd(e.cents)}`);
    if (r.leftoverCents > 0) {
      lines.push(
        r.extraCents > 0
          ? `Leftover ${sgd(r.leftoverCents)} split evenly (${sgd(r.extraCents)} each)`
          : `Leftover ${sgd(r.leftoverCents)} left out: you cover it`
      );
    }
    if (r.overCents > 0) {
      lines.push(
        `Amounts add up to ${sgd(total + r.overCents)}, ${sgd(r.overCents)} over, from rounding up`
      );
    }
  } else {
    const people = c.people as number;
    const { shareCents, collectedCents, overCents } = splitEqually(total, people);
    lines.push(
      `Bill: ${sgd(total)} between ${people} people`,
      `Each share: ${sgd(shareCents)} (everyone else pays you this)`
    );
    if (overCents > 0) {
      lines.push(
        `Shares add up to ${sgd(collectedCents)}, ${sgd(overCents)} over, from rounding up`
      );
    }
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

  /** `/split_custom` passes 'custom': after the total it goes straight to the list. */
  async start(ctx: Context, mode?: 'custom'): Promise<void> {
    if (!ctx.from) return;
    await this.setState({ flow: 'split', step: TOTAL, context: mode ? { mode } : {} });
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
      if (state.context.mode === 'custom') await this.askList(ctx, state, total);
      else await this.askMode(ctx, state, total);
      return true;
    }

    if (state.step === MODE || state.step === LEFTOVER) {
      await ctx.reply('Please tap one of the buttons above (or /cancel).');
      return true;
    }

    if (state.step === LIST) {
      const list = parseCustomList(text);
      if (!list.ok) {
        await ctx.reply(`${list.error} Send the whole list again, one person per line.`);
        return true;
      }
      const total = state.context.totalCents as number;
      const sum = sumCents(list.entries);
      if (sum > total) {
        await ctx.reply(
          `That list adds up to ${sgd(sum)}, which is ${sgd(sum - total)} over the bill of ${sgd(total)}. Send the whole list again.`
        );
        return true;
      }
      if (sum === total) {
        await this.askPayee(ctx, state, { entries: list.entries });
        return true;
      }
      await this.setState({
        flow: 'split',
        step: LEFTOVER,
        context: { ...state.context, entries: list.entries },
      });
      await ctx.reply(
        `The list adds up to ${sgd(sum)}, which leaves ${sgd(total - sum)} of the ${sgd(total)} bill. What should happen to it?`,
        {
          reply_markup: new InlineKeyboard()
            .text('Split it evenly', 'split_leftover:even')
            .text('Leave it out', 'split_leftover:omit'),
        }
      );
      return true;
    }

    if (state.step === PEOPLE) {
      const people = parsePeople(text, state.context.totalCents as number);
      if (people === null) {
        await ctx.reply('Send a whole number of people from 2 to 100.');
        return true;
      }
      await this.askPayee(ctx, state, { people });
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
    const expected = data.startsWith('split_mode:')
      ? MODE
      : data.startsWith('split_people:')
        ? PEOPLE
        : data.startsWith('split_leftover:')
          ? LEFTOVER
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

    if (data.startsWith('split_mode:')) {
      const total = state.context.totalCents as number;
      if (data === 'split_mode:custom') await this.askList(ctx, state, total);
      else await this.askPeople(ctx, state, total);
    } else if (data.startsWith('split_leftover:')) {
      await this.askPayee(ctx, state, { leftover: data.endsWith(':even') ? 'even' : 'omit' });
    } else if (data.startsWith('split_people:')) {
      const n = Number(data.slice('split_people:'.length));
      // Only the number we offered (a stale or odd tap changes nothing)
      if (n === state.context.suggested) await this.askPayee(ctx, state, { people: n });
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

  private async askMode(ctx: Context, state: ConversationState, totalCents: number) {
    await this.setState({ flow: 'split', step: MODE, context: { ...state.context, totalCents } });
    await ctx.reply(`Bill: ${sgd(totalCents)}. How do you want to split it?`, {
      reply_markup: new InlineKeyboard()
        .text('Equally', 'split_mode:equal')
        .text('Custom amounts', 'split_mode:custom'),
    });
  }

  private async askList(ctx: Context, state: ConversationState, totalCents: number) {
    await this.setState({ flow: 'split', step: LIST, context: { ...state.context, totalCents } });
    await this.ask(
      ctx,
      `Bill: ${sgd(totalCents)}. Send who owes what, one person per line: a name, then an amount. Leave yourself out.\n\nAnn 40\nBob 25.50\n\n(Up to 20 people.)`
    );
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

  private async askPayee(ctx: Context, state: ConversationState, extra: Record<string, unknown>) {
    await this.setState({
      flow: 'split',
      step: PAYEE,
      context: { ...state.context, ...extra },
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
    const caution = 'Scan with your banking app. Check the payee name before you pay.';

    // One QR per distinct amount (an equal split has exactly one)
    const total = c.totalCents as number;
    const listed = c.entries as SplitEntry[] | undefined;
    const jobs = listed
      ? groupByAmount(
          applyLeftover(listed, total, (c.leftover as 'even' | 'omit' | undefined) ?? 'omit')
            .entries
        ).map((g) => ({ cents: g.cents, lines: [sgd(g.cents), g.names.join(', ')] }))
      : (() => {
          const people = c.people as number;
          const share = splitEqually(total, people).shareCents;
          return [{ cents: share, lines: [`${sgd(share)} each (split ${people} ways)`] }];
        })();

    let sent = 0;
    try {
      for (const job of jobs) {
        const payload = buildPayNowPayload({
          proxyType: c.payeeType as 'mobile' | 'uen',
          proxyValue: c.payeeValue as string,
          amountCents: job.cents,
          editable: false,
          ...(description ? { description } : {}),
        });
        const lines = [...(description ? [description] : []), ...job.lines];
        const image = await renderQrPng(payload, lines);
        await ctx.replyWithPhoto(new InputFile(image, 'paynow-qr.bmp'), {
          caption: `${lines.join('\n')}\n\n${caution} Send /split for another.`,
        });
        sent++;
      }
    } catch {
      // No console logging: the answers include a payee number
      await ctx.reply(
        jobs.length === 1
          ? 'Could not make the QR. Please send /split to try again.'
          : `Sent ${sent} of ${jobs.length} QRs; the other ${jobs.length - sent} could not be sent. Please send /split to try again.`
      );
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
