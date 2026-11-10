import type { Api, Context } from 'grammy';
import { InlineKeyboard, InputFile } from 'grammy';
import type { Message } from 'grammy/types';
import { detectProxyType } from '../db/proxy-validation';
import type { SplitDirectory } from '../db/split-repository';
import { type ReceiptReader, ReceiptReaderError } from '../receipt-reader';
import { formatCents, parseAmount } from '../sgqr/amount';
import { buildPayNowPayload, truncateAnsi } from '../sgqr/paynow';
import { renderQrPng } from '../sgqr/qr-render';
import type { ConversationDO, ConversationState } from '../worker/conversation-do';
import {
  type AssignedOk,
  applyUnassigned,
  parseAssignments,
  parseScan,
  type Receipt,
  shareReceipt,
  toEntries,
} from './receipt';
import { directMessage, newExpiry, newToken, postWaiting } from './split-claim';
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
const CONFIRM = 8; // summary with Confirm / Amend / Cancel; the QR is made only after Confirm
const AMEND = 9; // the Amend menu is open on the summary message
const RECEIPT = 10; // waiting for a receipt photo
const REVIEW = 11; // the scan is shown: Use this / Send another photo / Type the total instead
const ASSIGN = 12; // waiting for who had which item
const UNASSIGNED = 13; // items nobody was given: split evenly or the organiser covers them
const PAYEE_ME = 14; // is the payee the organiser? if not, the organiser pays their own share too

const MAX_DESCRIPTION = 25;

type Ctx = Record<string, unknown>;
type Field = 'total' | 'people' | 'list' | 'assign' | 'payee' | 'description';
const FIELD_OF_STEP: Record<number, Field> = {
  [TOTAL]: 'total',
  [PEOPLE]: 'people',
  [LIST]: 'list',
  [ASSIGN]: 'assign',
  [PAYEE]: 'payee',
  [DESCRIPTION]: 'description',
};
const STEP_OF_FIELD: Record<Field, number> = {
  total: TOTAL,
  people: PEOPLE,
  list: LIST,
  assign: ASSIGN,
  payee: PAYEE,
  description: DESCRIPTION,
};

export const SPLIT_HELP =
  'Split PayNow Bot splits a bill equally and makes a PayNow QR for one share.\n\n' +
  '/split - total, then equal or custom amounts, payee, optional description\n' +
  '/split_custom - same, straight to custom amounts (one line per person: name and amount; @mention someone to send them their QR directly)\n' +
  '/split_receipt - same, but start from a photo of the receipt (I read the items, GST and service charge)\n' +
  'After the payee I ask whether the payee is you; if someone else paid, you get a QR for your own share too.\n' +
  '/forget - delete what I remember about you (your username, kept when you /start me)\n' +
  '/cancel - stop\n\n' +
  'On the summary, tap Amend to change an answer, or edit the message you sent. ' +
  'In a group, reply to my questions and I offer the group size as the number of people. ' +
  'The QR never shows the payee number. In a group the payee number you type stays in the chat ' +
  'unless I may delete messages, so use a private chat if that matters.';

const isGroup = (ctx: Context) => ctx.chat?.type !== 'private';
const topicOf = (ctx: Context) =>
  ctx.message?.message_thread_id ??
  ctx.editedMessage?.message_thread_id ??
  ctx.callbackQuery?.message?.message_thread_id ??
  0;

const sgd = (cents: number) => `SGD ${formatCents(cents)}`;

/** Text mentions (people picked from the member list) in a message: displayed text to user id. */
function textMentionsOf(message: Message | undefined): Map<string, number> {
  const found = new Map<string, number>();
  for (const e of message?.entities ?? []) {
    if (e.type === 'text_mention' && message?.text) {
      found.set(message.text.slice(e.offset, e.offset + e.length), e.user.id);
    }
  }
  return found;
}

type Answer = { ok: true; patch: Ctx } | { ok: false; error: string };

/** Check one typed answer against the rest of the split; on success, the context fields it sets. */
function readAnswer(
  field: Field,
  text: string,
  c: Ctx,
  textMentions?: Map<string, number>
): Answer {
  const total = c.totalCents as number | undefined;
  if (field === 'total') {
    const cents = parseAmount(text);
    return cents === null
      ? { ok: false, error: 'Send a positive amount with up to 2 decimals, e.g. 187.40.' }
      : { ok: true, patch: { totalCents: cents } };
  }
  if (field === 'people') {
    const people = parsePeople(text, total ?? 0);
    return people === null
      ? { ok: false, error: 'Send a whole number of people from 2 to 100.' }
      : { ok: true, patch: { people } };
  }
  if (field === 'list') {
    const list = parseCustomList(text, textMentions);
    if (!list.ok) {
      return { ok: false, error: `${list.error} Send the whole list again, one person per line.` };
    }
    const sum = sumCents(list.entries);
    if (total !== undefined && sum > total) {
      return {
        ok: false,
        error: `That list adds up to ${sgd(sum)}, which is ${sgd(sum - total)} over the bill of ${sgd(total)}. Send the whole list again.`,
      };
    }
    // An exact list needs no leftover choice; a stale one would only confuse
    return {
      ok: true,
      patch: { entries: list.entries, ...(sum === total ? { leftover: undefined } : {}) },
    };
  }
  if (field === 'assign') {
    const receipt = c.receipt as Receipt | undefined;
    if (!receipt) return { ok: false, error: 'There is no receipt to share out.' };
    const a = parseAssignments(text, receipt.items.length, textMentions);
    if (!a.ok) return { ok: false, error: `${a.error} Send the whole message again.` };
    const nobody = {
      ok: false as const,
      error: 'Nobody else owes anything. Name at least one other person.',
    };
    if (a.people.every((p) => p.isMe)) return nobody;
    const share = (done: AssignedOk) =>
      toEntries(shareReceipt(receipt.items, done, receipt.totalCents).shares);

    if (a.unassigned.length === 0) {
      // Everything has an owner: the receipt total minus the others' shares is the organiser's own
      const entries = share(a);
      if (entries.length === 0) return nobody;
      return {
        ok: true,
        patch: {
          entries,
          leftover: 'omit',
          partial: undefined,
          gap: undefined,
          unassignedChoice: undefined,
        },
      };
    }
    // Some items belong to nobody. Keep an earlier choice only for the very same gap; otherwise
    // the organiser is asked again.
    const choice = c.unassignedChoice as 'me' | 'even' | undefined;
    const sameGap = JSON.stringify(c.gap) === JSON.stringify(a.unassigned);
    if (choice && sameGap) {
      const entries = share(applyUnassigned(a, choice));
      if (entries.length === 0) return nobody;
      return {
        ok: true,
        patch: {
          entries,
          leftover: 'omit',
          partial: a,
          gap: a.unassigned,
          unassignedChoice: choice,
        },
      };
    }
    return {
      ok: true,
      patch: {
        entries: undefined,
        partial: a,
        gap: a.unassigned,
        unassignedChoice: undefined,
      },
    };
  }
  if (field === 'payee') {
    const payee = detectProxyType(text);
    return payee
      ? {
          ok: true,
          // A new payee means asking again whether it is the organiser
          patch: { payeeType: payee.type, payeeValue: payee.normalized, payeeIsMe: undefined },
        }
      : {
          ok: false,
          error:
            'That is not a valid payee. Send a Singapore mobile number (e.g. 91234567 or +6591234567) or a UEN (9 to 13 letters and digits).',
        };
  }
  const description = truncateAnsi(text, 1000); // what the QR can actually carry
  if (!description) {
    return {
      ok: false,
      error: 'Send a short description using letters, numbers or common symbols.',
    };
  }
  if (description.length > MAX_DESCRIPTION) {
    return { ok: false, error: `Keep the description to ${MAX_DESCRIPTION} characters or fewer.` };
  }
  return { ok: true, patch: { description, described: true } };
}

/** The first thing still missing or invalid, in question order; CONFIRM when everything is in. */
function nextNeed(c: Ctx): { step: number; note?: string } {
  const total = c.totalCents as number | undefined;
  if (total === undefined) return { step: TOTAL };
  if (!c.mode) return { step: MODE };
  if (c.mode === 'equal') {
    const people = c.people as number | undefined;
    if (people === undefined || parsePeople(String(people), total) === null) {
      return { step: PEOPLE };
    }
  } else {
    const entries = c.entries as SplitEntry[] | undefined;
    if (!entries) {
      if (!c.receipt) return { step: LIST };
      return { step: c.partial && !c.unassignedChoice ? UNASSIGNED : ASSIGN };
    }
    const sum = sumCents(entries);
    if (sum > total) {
      return {
        step: LIST,
        note: `The list adds up to ${sgd(sum)}, which is ${sgd(sum - total)} over the bill of ${sgd(total)}. Send the whole list again.`,
      };
    }
    if (sum < total && !c.leftover) return { step: LEFTOVER };
  }
  if (!c.payeeValue) return { step: PAYEE };
  if (c.payeeIsMe === undefined) return { step: PAYEE_ME };
  if (!c.described) return { step: DESCRIPTION };
  return { step: CONFIRM };
}

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
    for (const e of r.entries) {
      const direct = e.username || e.userId ? ' (by direct message)' : '';
      lines.push(`${e.name}: ${sgd(e.cents)}${direct}`);
    }
    const paid = c.payeeIsMe === false; // someone else is paid, so the organiser pays too
    if (r.leftoverCents > 0 && c.receipt) {
      lines.push(
        paid
          ? `Your own share, which you pay the payee: ${sgd(r.leftoverCents)} (you get a QR)`
          : `Your own share, not collected: ${sgd(r.leftoverCents)}`
      );
    } else if (r.leftoverCents > 0) {
      lines.push(
        r.extraCents > 0
          ? `Leftover ${sgd(r.leftoverCents)} split evenly (${sgd(r.extraCents)} each)`
          : paid
            ? `Leftover ${sgd(r.leftoverCents)} is yours to pay: you get a QR`
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
      c.payeeIsMe === false
        ? `Each share: ${sgd(shareCents)} (all ${people} people pay the payee this)`
        : `Each share: ${sgd(shareCents)} (everyone else pays you this)`
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

/** What was read from the receipt, numbered so the user can say who had what. */
function reviewText(r: Receipt, warnings: string[]): string {
  const lines = ['I read this receipt:', ...(r.merchant ? [r.merchant] : [])];
  for (const [i, it] of r.items.entries()) lines.push(`${i + 1}. ${it.name}: ${sgd(it.cents)}`);
  if (r.serviceCents) lines.push(`Service charge: ${sgd(r.serviceCents)}`);
  if (r.gstCents) lines.push(`GST: ${sgd(r.gstCents)}`);
  if (r.discountCents) lines.push(`Discount: -${sgd(r.discountCents)}`);
  lines.push(`Total: ${sgd(r.totalCents)}`);
  for (const w of warnings) lines.push('', `⚠️ ${w}`);
  lines.push('', 'Is this right? Prices from a photo can be wrong, so check them.');
  return lines.join('\n');
}

const summaryButtons = () =>
  new InlineKeyboard()
    .text('✅ Confirm', 'split_confirm')
    .text('✏️ Amend', 'split_amend')
    .text('❌ Cancel', 'split_cancel');

const amendMenu = (receipt: boolean) =>
  (receipt
    ? new InlineKeyboard().text('Items', 'split_pick:items')
    : new InlineKeyboard().text('Total', 'split_pick:total').text('Split', 'split_pick:split')
  )
    .row()
    .text('Payee', 'split_pick:payee')
    .text('Description', 'split_pick:description')
    .row()
    .text('Back', 'split_back');

/**
 * Split_PayNow_Bot conversation. Every answer is stored in the Durable Object context and
 * `nextNeed` decides what is still missing, so the first run, an Amend and an edited message all
 * follow the same rules. Works in private chats and groups; in a group only the user who started
 * it can answer (the DO records the owner). Nothing is persisted beyond the conversation.
 */
export class SplitCommandHandler {
  /** `directory` and `botUsername` are needed for mentions; plain splits work without them. */
  constructor(
    private readonly conversationDO: ConversationDO,
    private readonly directory?: SplitDirectory,
    private readonly botUsername?: string,
    /** `reader` turns a photo into receipt data; `download` fetches a Telegram file's bytes. */
    private readonly receipts: {
      reader?: ReceiptReader;
      download?: (api: Api, fileId: string) => Promise<Uint8Array>;
    } = {}
  ) {}

  /** `/split_custom` passes 'custom': after the total it goes straight to the list. */
  async start(ctx: Context, mode?: 'custom' | 'receipt'): Promise<void> {
    if (!ctx.from) return;
    if (mode === 'receipt' && !this.receipts.reader) {
      await ctx.reply('Receipt scanning is not available. Send /split and type the total instead.');
      return;
    }
    const context = mode === 'custom' ? { mode } : {};
    const step = mode === 'receipt' ? RECEIPT : TOTAL;
    await this.setState({ flow: 'split', step, context });
    await this.fetch('/owner', { userId: ctx.from.id, topicId: topicOf(ctx) });
    await this.askStep(ctx, step, context);
  }

  /** A photo: read it as a receipt when the bot is waiting for one (or for the total). */
  async handlePhoto(ctx: Context): Promise<void> {
    const state = await this.getState();
    if (state.flow !== 'split' || !this.isOwner(ctx, state)) return;
    if (state.step !== RECEIPT && state.step !== TOTAL) return;
    const photo = ctx.message?.photo?.at(-1); // the largest size
    const { reader, download } = this.receipts;
    if (!photo) return;
    if (!reader || !download) {
      await ctx.reply('Receipt scanning is not available. Please type the bill total.');
      await this.setState({ flow: 'split', step: TOTAL, context: state.context });
      return;
    }
    const failed = async (why: string) => {
      const buttons =
        state.step === RECEIPT
          ? new InlineKeyboard()
              .text('Send another photo', 'split_scan:again')
              .text('Type the total instead', 'split_scan:manual')
          : undefined;
      await ctx.reply(
        `${why} Send another photo${state.step === RECEIPT ? ', or tap Type the total instead' : ' or type the total'}.`,
        buttons ? { reply_markup: buttons } : undefined
      );
    };
    await ctx.reply('Reading your receipt… this takes a few seconds.');
    // The photo lives in memory for these calls and is never logged. Only the failed step and
    // the error's own message (never receipt data) go to the Worker log, so a failure can be traced.
    const note = (stage: string, error: unknown) =>
      console.error(
        `split receipt ${stage} failed: ${(error instanceof Error ? error.message : String(error)).slice(0, 200)}`
      );
    let bytes: Uint8Array;
    try {
      bytes = await download(ctx.api, photo.file_id);
    } catch (error) {
      note('download', error);
      await failed('I could not download that photo (download).');
      return;
    }
    let raw: unknown;
    try {
      raw = await reader.read(bytes);
    } catch (error) {
      const stage = error instanceof ReceiptReaderError ? error.stage : 'model';
      note(stage, error);
      await failed(
        stage === 'reply'
          ? 'The reader answered, but I could not use its answer (reply).'
          : 'The receipt reader failed (model).'
      );
      return;
    }
    const scan = parseScan(raw);
    if (!scan.ok) {
      await failed(scan.error);
      return;
    }
    const context = { ...state.context, scan: { receipt: scan.receipt, warnings: scan.warnings } };
    await this.setState({ flow: 'split', step: REVIEW, context });
    await ctx.reply(reviewText(scan.receipt, scan.warnings), {
      reply_markup: new InlineKeyboard()
        .text('✅ Use this', 'split_scan:use')
        .row()
        .text('📷 Send another photo', 'split_scan:again')
        .text('Type the total instead', 'split_scan:manual'),
    });
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

    const field = FIELD_OF_STEP[state.step];
    if (!field) {
      await ctx.reply(
        state.step === CONFIRM
          ? 'Please tap Confirm, Amend or Cancel on the summary above.'
          : 'Please tap one of the buttons above (or /cancel).'
      );
      return true;
    }
    const answer = readAnswer(field, text, state.context, textMentionsOf(ctx.message));
    if (!answer.ok) {
      await ctx.reply(answer.error);
      return true;
    }
    // The number was typed into the chat: remove it from a group if we may (best effort)
    if (field === 'payee' && isGroup(ctx)) await ctx.deleteMessage().catch(() => undefined);
    await this.proceed(
      ctx,
      this.withAnswer(state.context, answer.patch, field, ctx.message?.message_id)
    );
    return true;
  }

  /** An edited message: if it was a recorded answer of this split, apply it as a new answer. */
  async handleEdit(ctx: Context): Promise<void> {
    const edited = ctx.editedMessage;
    const text = edited?.text?.trim();
    if (!edited || !text || text.startsWith('/')) return;
    const state = await this.getState();
    if (state.flow !== 'split' || !this.isOwner(ctx, state)) return;
    const field = (state.context.answerMsgs as Record<string, Field> | undefined)?.[
      String(edited.message_id)
    ];
    if (!field) return;

    const answer = readAnswer(field, text, state.context, textMentionsOf(edited));
    if (!answer.ok) {
      await ctx.reply(`That edit was not used: ${answer.error} The earlier answer is kept.`);
      return;
    }
    if (field === 'payee' && isGroup(ctx)) await ctx.deleteMessage().catch(() => undefined);
    const context = this.withAnswer(state.context, answer.patch, field, edited.message_id);
    const need = nextNeed(context);
    if (need.step === state.step && need.step !== CONFIRM && need.step !== UNASSIGNED) {
      // The open question is still the right one: just remember the change
      await this.setState({ flow: 'split', step: state.step, context });
      await ctx.reply('Updated.');
      return;
    }
    await this.proceed(ctx, context);
  }

  /** Button taps; false when the data is not ours. */
  async handleCallback(ctx: Context, data: string): Promise<boolean> {
    if (!data.startsWith('split_')) return false;
    const state = await this.getState();
    if (state.flow === 'split' && !this.isOwner(ctx, state)) {
      await ctx.answerCallbackQuery({ text: 'This split is not yours.' });
      return true;
    }
    const c = state.context;
    const step = state.flow === 'split' ? state.step : 0;
    const onSummary = data === 'split_confirm' || data === 'split_cancel' || data === 'split_amend';
    const onMenu = data.startsWith('split_pick:') || data === 'split_back';
    const expected = data.startsWith('split_payee:')
      ? PAYEE_ME
      : data.startsWith('split_unassigned:')
        ? UNASSIGNED
        : data.startsWith('split_scan:')
          ? step === RECEIPT || step === REVIEW
            ? step
            : -1
          : data.startsWith('split_mode:')
            ? MODE
            : data.startsWith('split_people:')
              ? PEOPLE
              : data.startsWith('split_leftover:')
                ? LEFTOVER
                : data === 'split_skip_description'
                  ? DESCRIPTION
                  : onSummary
                    ? CONFIRM
                    : onMenu
                      ? AMEND
                      : data === 'split_keep' && c.amending
                        ? step
                        : -1;
    // Summary and menu buttons only count on the latest summary message
    const onLatest =
      !(onSummary || onMenu) ||
      c.summaryMsg === undefined ||
      ctx.callbackQuery?.message?.message_id === c.summaryMsg;
    if (step !== expected || !onLatest) {
      await ctx.answerCallbackQuery({ text: 'That step is over.' });
      return true;
    }
    await ctx.answerCallbackQuery();

    if (data.startsWith('split_payee:')) {
      await this.proceed(ctx, { ...c, payeeIsMe: data.endsWith(':me') });
    } else if (data.startsWith('split_unassigned:')) {
      const choice = data.endsWith(':even') ? 'even' : 'me';
      const partial = c.partial as AssignedOk;
      const receipt = c.receipt as Receipt;
      const entries = toEntries(
        shareReceipt(receipt.items, applyUnassigned(partial, choice), receipt.totalCents).shares
      );
      if (entries.length === 0) {
        await ctx.reply('Nobody else owes anything. Name at least one other person.');
        await this.setState({ flow: 'split', step: ASSIGN, context: c });
        return true;
      }
      await this.proceed(ctx, { ...c, entries, leftover: 'omit', unassignedChoice: choice });
    } else if (data.startsWith('split_scan:')) {
      const scan = c.scan as { receipt: Receipt } | undefined;
      const { scan: _scan, ...rest } = c;
      await this.setButtons(ctx, new InlineKeyboard()); // the review is answered
      if (data === 'split_scan:use' && scan) {
        // The receipt total is the bill; what the others owe is worked out from the items
        const { entries, leftover, people, suggested, ...clean } = rest;
        await this.proceed(ctx, {
          ...clean,
          receipt: scan.receipt,
          totalCents: scan.receipt.totalCents,
          mode: 'custom',
        });
      } else if (data === 'split_scan:again') {
        await this.setState({ flow: 'split', step: RECEIPT, context: rest });
        await this.askStep(ctx, RECEIPT, rest);
      } else if (data === 'split_scan:manual') {
        // Type the total instead: a normal split, without the receipt
        const { receipt, mode, ...plain } = rest;
        await this.setState({ flow: 'split', step: TOTAL, context: plain });
        await this.askStep(ctx, TOTAL, plain);
      }
    } else if (data.startsWith('split_mode:')) {
      // A new choice of type starts that type's details afresh
      const { people, entries, leftover, suggested, ...rest } = c;
      await this.proceed(ctx, { ...rest, mode: data.endsWith(':custom') ? 'custom' : 'equal' });
    } else if (data.startsWith('split_leftover:')) {
      await this.proceed(ctx, { ...c, leftover: data.endsWith(':even') ? 'even' : 'omit' });
    } else if (data.startsWith('split_people:')) {
      const n = Number(data.slice('split_people:'.length));
      // Only the number we offered (a stale or odd tap changes nothing)
      if (n === c.suggested) await this.proceed(ctx, { ...c, people: n });
    } else if (data === 'split_skip_description') {
      const { description, ...rest } = c;
      await this.proceed(ctx, { ...rest, described: true });
    } else if (data === 'split_keep') {
      const { amending, ...rest } = c;
      await this.proceed(ctx, rest);
    } else if (data === 'split_amend') {
      await this.setState({ flow: 'split', step: AMEND, context: c });
      await this.setButtons(ctx, amendMenu(c.receipt !== undefined));
    } else if (data === 'split_back') {
      await this.setState({ flow: 'split', step: CONFIRM, context: c });
      await this.setButtons(ctx, summaryButtons());
    } else if (onMenu) {
      const pick = data.slice('split_pick:'.length);
      await this.setButtons(ctx, new InlineKeyboard()); // the menu goes; the question replaces it
      const first =
        pick === 'split' ? MODE : pick === 'items' ? ASSIGN : STEP_OF_FIELD[pick as Field];
      const context = { ...c, amending: pick };
      await this.setState({ flow: 'split', step: first, context });
      await this.askStep(ctx, first, context);
    } else if (data === 'split_confirm') {
      await this.finish(ctx);
    } else {
      await this.setState({ flow: 'idle', step: 0, context: {} });
      await this.dropButtons(ctx);
      await ctx.reply('Cancelled. Nothing was created. Send /split to begin again.');
    }
    return true;
  }

  /** Remember an accepted answer and which message carried it (so an edit of it can be found). */
  private withAnswer(c: Ctx, patch: Ctx, field: Field, messageId: number | undefined): Ctx {
    const answerMsgs = { ...(c.answerMsgs as Record<string, Field> | undefined) };
    if (messageId !== undefined) {
      // One message per field: a newer answer replaces the older message's entry
      for (const [id, f] of Object.entries(answerMsgs)) if (f === field) delete answerMsgs[id];
      answerMsgs[String(messageId)] = field;
    }
    return { ...c, ...patch, answerMsgs };
  }

  /** Save the context, then ask for what is still needed, or show the summary. */
  private async proceed(ctx: Context, c: Ctx): Promise<void> {
    const need = nextNeed(c);
    if (need.step === CONFIRM) {
      const { amending, ...context } = c;
      await this.showSummary(ctx, context);
      return;
    }
    let context = c;
    if (need.step === PEOPLE) context = { ...c, suggested: await this.suggestPeople(ctx, c) };
    await this.setState({ flow: 'split', step: need.step, context });
    await this.askStep(ctx, need.step, context, need.note);
  }

  /** Members minus this bot, only in a group; a suggestion (it also counts other bots and lurkers). */
  private async suggestPeople(ctx: Context, c: Ctx): Promise<number | undefined> {
    if (!isGroup(ctx)) return undefined;
    const count = await ctx.api.getChatMemberCount(ctx.chat!.id).catch(() => null);
    const total = c.totalCents as number;
    return typeof count === 'number' && count - 1 >= 2 && count - 1 <= total
      ? count - 1
      : undefined;
  }

  /** Ask one question. While amending, every prompt also offers Keep as is. */
  private async askStep(ctx: Context, step: number, c: Ctx, note?: string): Promise<void> {
    const total = c.totalCents as number | undefined;
    const keep = (kb?: InlineKeyboard) => {
      if (!c.amending) return kb;
      return (kb ? kb.row() : new InlineKeyboard()).text('Keep as is', 'split_keep');
    };
    if (step === MODE) {
      await ctx.reply(`Bill: ${sgd(total!)}. How do you want to split it?`, {
        reply_markup: keep(
          new InlineKeyboard()
            .text('Equally', 'split_mode:equal')
            .text('Custom amounts', 'split_mode:custom')
        )!,
      });
    } else if (step === LEFTOVER) {
      const sum = sumCents(c.entries as SplitEntry[]);
      await ctx.reply(
        `The list adds up to ${sgd(sum)}, which leaves ${sgd(total! - sum)} of the ${sgd(total!)} bill. What should happen to it?`,
        {
          reply_markup: keep(
            new InlineKeyboard()
              .text('Split it evenly', 'split_leftover:even')
              .text('Leave it out', 'split_leftover:omit')
          )!,
        }
      );
    } else if (step === PEOPLE) {
      const suggested = c.suggested as number | undefined;
      await this.ask(
        ctx,
        `Bill: ${sgd(total!)}. How many people share it (2 to 100)?`,
        keep(
          suggested
            ? new InlineKeyboard().text(`Split by ${suggested}`, `split_people:${suggested}`)
            : undefined
        )
      );
    } else if (step === LIST) {
      await this.ask(
        ctx,
        `${note ? `${note}\n\n` : ''}Bill: ${sgd(total!)}. Send who owes what, one person per line: a name, then an amount. Leave yourself out.\n\nAnn 40\nBob 25.50\n\n(Up to 20 people.)`,
        keep()
      );
    } else if (step === RECEIPT) {
      await this.ask(
        ctx,
        'Send a photo of the receipt. Make sure the whole receipt is in the picture and the numbers are sharp.',
        new InlineKeyboard().text('Type the total instead', 'split_scan:manual')
      );
    } else if (step === UNASSIGNED) {
      const receipt = c.receipt as Receipt;
      const gap = (c.gap as number[]).map((i) => i + 1);
      const cents = gap.reduce((sum, n) => sum + receipt.items[n - 1]!.cents, 0);
      await ctx.reply(
        `${gap.length === 1 ? `Item ${gap[0]}` : `Items ${gap.join(', ')}`} (${sgd(cents)} before charges) ${gap.length === 1 ? 'was' : 'were'} not given to anyone. What should happen to ${gap.length === 1 ? 'it' : 'them'}?`,
        {
          reply_markup: keep(
            new InlineKeyboard()
              .text('Split evenly between those named', 'split_unassigned:even')
              .row()
              .text('Leave them out: I cover them', 'split_unassigned:me')
          )!,
        }
      );
    } else if (step === ASSIGN) {
      const items = (c.receipt as Receipt).items;
      await this.ask(
        ctx,
        `Who had what? Send one line per group of items, then the people:\n\n1,3 Ann\n2 Ann, Bob (shared)\n4 me\n5 all (shared by everyone named)\n\nItems:\n${items.map((it, i) => `${i + 1}. ${it.name} ${sgd(it.cents)}`).join('\n')}\n\nLeave out any item nobody had and I will ask what to do with it. GST and service charge are shared in proportion. "me" is you: your share is not collected.`,
        keep()
      );
    } else if (step === PAYEE_ME) {
      await ctx.reply(
        'Is this payee you?\n\nIf someone else paid the bill, you owe a share too and I will send you your own QR.',
        {
          reply_markup: new InlineKeyboard()
            .text("Yes, it's me", 'split_payee:me')
            .text('No, someone else', 'split_payee:other'),
        }
      );
    } else if (step === PAYEE) {
      await this.ask(ctx, 'Who should be paid? Send a Singapore mobile number or a UEN.', keep());
    } else if (step === DESCRIPTION) {
      await this.ask(
        ctx,
        `Add a short description (up to ${MAX_DESCRIPTION} characters), or tap Skip.`,
        keep(new InlineKeyboard().text('Skip', 'split_skip_description'))
      );
    } else {
      await this.ask(ctx, 'How much is the bill in total, in SGD (e.g. 187.40)?', keep());
    }
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

  /** Show the summary as the one live one: the earlier summary loses its buttons. */
  private async showSummary(ctx: Context, c: Ctx): Promise<void> {
    const old = c.summaryMsg as number | undefined;
    if (old !== undefined && ctx.chat) {
      await ctx.api.editMessageReplyMarkup(ctx.chat.id, old).catch(() => undefined);
    }
    const sent = await ctx.reply(summary(c, isGroup(ctx)), { reply_markup: summaryButtons() });
    await this.setState({
      flow: 'split',
      step: CONFIRM,
      context: { ...c, summaryMsg: sent.message_id },
    });
  }

  /** Replace the buttons under the message that was tapped (best effort). */
  private async setButtons(ctx: Context, markup: InlineKeyboard): Promise<void> {
    await ctx.editMessageReplyMarkup({ reply_markup: markup }).catch(() => undefined);
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

    const total = c.totalCents as number;
    const listed = c.entries as SplitEntry[] | undefined;
    const final = listed
      ? applyLeftover(listed, total, (c.leftover as 'even' | 'omit' | undefined) ?? 'omit').entries
      : undefined;
    const payloadFor = (cents: number) =>
      buildPayNowPayload({
        proxyType: c.payeeType as 'mobile' | 'uen',
        proxyValue: c.payeeValue as string,
        amountCents: cents,
        editable: false,
        ...(description ? { description } : {}),
      });

    // Mentioned people get their own QR by direct message (or a button to collect it);
    // everyone else is served by the shared chat QRs below
    const isMentioned = (e: SplitEntry) =>
      this.directory !== undefined && (e.username !== undefined || e.userId !== undefined);
    const mentioned = (final ?? []).filter(isMentioned);

    // Someone else is paid, so the organiser's own amount (their items, or the remainder left
    // out) is theirs to pay: they get a QR for it like everybody else
    let ownJob: { cents: number; lines: string[] } | undefined;
    const selfId = ctx.from?.id;
    if (listed && c.payeeIsMe === false && c.leftover !== 'even' && selfId !== undefined) {
      const own = applyLeftover(listed, total, 'omit').leftoverCents;
      if (own > 0) {
        if (this.directory) {
          const first = ctx.from?.first_name || 'You';
          mentioned.push({ name: first, cents: own, userId: selfId });
        } else {
          ownJob = { cents: own, lines: [sgd(own), 'Your share'] };
        }
      }
    }
    if (mentioned.length > 0) {
      await this.deliverMentioned(ctx, mentioned, description, payloadFor, selfId);
    }

    // One QR per distinct amount (an equal split has exactly one)
    const jobs = final
      ? [
          ...groupByAmount(final.filter((e) => !isMentioned(e))).map((g) => ({
            cents: g.cents,
            lines: [sgd(g.cents), g.names.join(', ')],
          })),
          ...(ownJob ? [ownJob] : []),
        ]
      : (() => {
          const people = c.people as number;
          const share = splitEqually(total, people).shareCents;
          return [{ cents: share, lines: [`${sgd(share)} each (split ${people} ways)`] }];
        })();

    let sent = 0;
    try {
      for (const job of jobs) {
        const lines = [...(description ? [description] : []), ...job.lines];
        const image = await renderQrPng(payloadFor(job.cents), lines);
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

  /**
   * Send each mentioned person their QR by direct message. Anyone unknown to the bot, or who
   * refuses the message, is put on one waiting message with a Get my QR button instead.
   */
  private async deliverMentioned(
    ctx: Context,
    people: SplitEntry[],
    description: string | undefined,
    payloadFor: (cents: number) => string,
    selfId?: number
  ): Promise<void> {
    const directory = this.directory!;
    const organiser = [ctx.from?.first_name, ctx.from?.last_name].filter(Boolean).join(' ');
    const known = await directory.findContacts(
      people.filter((p) => p.userId === undefined).map((p) => p.username as string)
    );
    const sentTo: string[] = [];
    const waiting: Parameters<typeof postWaiting>[2] = [];
    for (const p of people) {
      const id = p.userId ?? known.get(p.username as string);
      const payload = payloadFor(p.cents);
      // The organiser's own QR says "Your share"; an empty organiser name marks it in a claim
      const own = selfId !== undefined && p.userId === selfId;
      const dm = directMessage(own ? '' : organiser, p.cents, description ?? null);
      try {
        if (id === undefined) throw new Error('unknown');
        const image = await renderQrPng(payload, dm.lines);
        await ctx.api.sendPhoto(id, new InputFile(image, 'paynow-qr.bmp'), {
          caption: dm.caption,
        });
        sentTo.push(own ? 'you' : p.name);
      } catch {
        // Not started the bot, blocked it, or rate limited: they collect it with a button
        waiting.push({
          token: newToken(),
          username: p.username ?? null,
          userId: p.userId ?? null,
          name: p.name,
          amountCents: p.cents,
          description: description ?? null,
          payload,
          organiser: own ? '' : organiser,
          chatId: ctx.chat!.id,
          expiresAt: newExpiry(),
        });
      }
    }
    if (sentTo.length > 0)
      await ctx.reply(`Sent their QR by direct message: ${sentTo.join(', ')}.`);
    await postWaiting(ctx, directory, waiting, this.botUsername);
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
