import type { Api, Context } from 'grammy';
import { InlineKeyboard } from 'grammy';
import type { Message } from 'grammy/types';
import { detectProxyType } from '../db/proxy-validation';
import {
  countAll,
  SPLIT_CONFIRMED,
  SPLIT_PLACE_GROUP,
  SPLIT_PLACE_PRIVATE,
  SPLIT_QR_CHAT,
  SPLIT_SCAN_FAILED,
  SPLIT_SCAN_OK,
  SPLIT_TYPE_CUSTOM,
  SPLIT_TYPE_EQUAL,
  SPLIT_TYPE_RECEIPT,
  type UsageCounter,
} from '../db/usage-repository';
import type { ReceiptReader } from '../receipt-reader';
import { formatCents, parseAmount } from '../sgqr/amount';
import { buildPayNowPayload, truncateAnsi } from '../sgqr/paynow';
import {
  type AiJobResult,
  failureResult,
  readScan,
  readVoice,
  type SplitAiParams,
} from '../split-ai-job';
import { queueSplitQrs, type SplitQrMessage } from '../split-qr-queue';
import type { VoiceReader } from '../voice-reader';
import type { ConversationDO, ConversationState } from '../worker/conversation-do';
import { qrPhoto } from './qr-photo';
import {
  type AssignedOk,
  applyUnassigned,
  assignmentFromClaims,
  type Claimer,
  memberAmount,
  missingCents,
  type PersonShare,
  parseAddedItems,
  parseAssignments,
  type Receipt,
  type ReceiptItem,
  receiptWarnings,
  shareReceipt,
  toEntries,
} from './receipt';
import {
  appLink,
  applyClaim,
  CLAIM,
  CLAIM_IDLE_MS,
  type ClaimResult,
  type Ctx,
  claimButtons,
  claimersOf,
  claimsOf,
  claimText,
  lockedPeople,
  mutateClaimsOn,
  servedOf,
  waysOf,
} from './split-claims';
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
const ADD_ITEM = 15; // the user is adding an item the scan missed
const HOW = 16; // type who had what, say it with a voice note, or (group) let everyone claim

const MAX_DESCRIPTION = 25;
/** Stop starting new QR sends after this long, so a slow Confirm says what is missing. */
const SEND_BUDGET_MS = 20_000;

const VOICE_MAX_SECONDS = 60; // a longer voice note is refused before any download or AI call
const VOICE_MAX_BYTES = 1_000_000;
const IDLE_MS = 10 * 60 * 1000;

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
  '/split - payee first, then the total, an optional description, and equal or custom amounts\n' +
  '/split_custom - same, straight to custom amounts (one line per person: name and amount)\n' +
  '/split_receipt - same, but start from a photo of the receipt (I read the items, GST and service charge). In a group everyone can tap the items they had instead of you typing who had what; you can also answer that question with a voice note (there is a button for it).\n' +
  'Every QR is posted in the chat, with the names it is for. You get a QR for your own share too.\n' +
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

/** The organiser's own share of a receipt (never collected from them, but paid to the payee when someone else is). */
type OwnShare = { cents: number; exact?: string };

/** An amount for the summary; a receipt share that was rounded up says what it was rounded up from. */
const amountText = (a: { cents: number; exact?: string }) =>
  a.exact ? `${sgd(a.cents)} (rounded up from SGD ${a.exact})` : sgd(a.cents);

const ownOf = (shares: PersonShare[]): OwnShare | undefined => {
  const me = shares.find((s) => s.person.isMe);
  return me && me.cents > 0
    ? { cents: me.cents, ...(me.exact !== undefined ? { exact: me.exact } : {}) }
    : undefined;
};

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
    return assignmentPatch(a, c, receipt);
  }
  if (field === 'payee') {
    const payee = detectProxyType(text);
    return payee
      ? {
          ok: true,
          patch: { payeeType: payee.type, payeeValue: payee.normalized },
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

/**
 * What an assignment (typed or claimed) sets in the context: the entries when every item has an
 * owner or an earlier choice still fits, otherwise the partial assignment for the organiser's
 * choice about the unassigned items.
 */
function assignmentPatch(
  a: AssignedOk,
  c: Ctx,
  receipt: Receipt,
  lines?: ReceiptItem[],
  locked?: ReadonlySet<number>
): Answer {
  const result = assignmentPatchOf(a, c, receipt, locked);
  // N-way items are shared out as lines; remember them for the unassigned prompt and its choice
  return result.ok ? { ok: true, patch: { ...result.patch, shareItems: lines } } : result;
}

function assignmentPatchOf(
  a: AssignedOk,
  c: Ctx,
  receipt: Receipt,
  locked: ReadonlySet<number> = new Set()
): Answer {
  const nobody = {
    ok: false as const,
    error: 'Nobody else owes anything. Name at least one other person.',
  };
  if (a.people.every((p) => p.isMe)) return nobody;
  const share = (done: AssignedOk) => {
    const { shares } = shareReceipt(receipt.items, done, receipt.totalCents);
    return { entries: toEntries(shares, locked), own: ownOf(shares) };
  };

  if (a.unassigned.length === 0) {
    // Everything has an owner: each person, the organiser included, owes their own share
    const { entries, own } = share(a);
    if (entries.length === 0) return nobody;
    return {
      ok: true,
      patch: {
        entries,
        own,
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
    const { entries, own } = share(applyUnassigned(a, choice, locked));
    if (entries.length === 0) return nobody;
    return {
      ok: true,
      patch: {
        entries,
        own,
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
      own: undefined,
      partial: a,
      gap: a.unassigned,
      unassignedChoice: undefined,
    },
  };
}

/** The first thing still missing or invalid, in question order; CONFIRM when everything is in. */
function nextNeed(c: Ctx): { step: number; note?: string } {
  // The payee comes first: it is known before the bill, and it is the one answer that must be exact
  if (!c.payeeValue) return { step: PAYEE };
  const total = c.totalCents as number | undefined;
  if (total === undefined) return { step: c.entry === 'receipt' ? RECEIPT : TOTAL };
  // Right after the total (a typed one, or the accepted scan), so every QR carries it, early ones too
  if (!c.described) return { step: DESCRIPTION };
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
      if (c.partial && !c.unassignedChoice) return { step: UNASSIGNED };
      // The menu shows in a group (claiming) and wherever voice is available; `group` covers a
      // split that began before `askHow` existed
      if ((c.askHow ?? c.group) && !c.assignHow) return { step: HOW };
      return { step: c.assignHow === 'claim' ? CLAIM : ASSIGN };
    }
    const sum = sumCents(entries);
    // A receipt's shares are each rounded up, so they may add up to a few cents over the bill
    if (sum > total && !c.receipt) {
      return {
        step: LIST,
        note: `The list adds up to ${sgd(sum)}, which is ${sgd(sum - total)} over the bill of ${sgd(total)}. Send the whole list again.`,
      };
    }
    if (sum < total && !c.leftover) return { step: LEFTOVER };
  }
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
    // A receipt gives the organiser their own share, rounded up like everybody's; any other list
    // leaves them the remainder
    const own = c.receipt ? (c.own as OwnShare | undefined) : undefined;
    // The organiser counts when an amount for them is shown (own share, or a leftover they carry)
    const people =
      listed.length +
      (c.receipt ? (own ? 1 : 0) : r.leftoverCents > 0 && r.extraCents === 0 ? 1 : 0);
    lines.push(`Bill: ${sgd(total)} shared by ${people} people`);
    for (const e of r.entries) {
      lines.push(`${e.name}: ${amountText(e)}${e.sent ? ' (QR already sent)' : ''}`);
    }
    if (c.receipt) {
      if (own) lines.push(`Your own share: ${amountText(own)} (you get a QR)`);
    } else if (r.leftoverCents > 0) {
      lines.push(
        r.extraCents > 0
          ? `Leftover ${sgd(r.leftoverCents)} split evenly (${sgd(r.extraCents)} each)`
          : `Leftover ${sgd(r.leftoverCents)} left out: your own share (you get a QR)`
      );
    }
    const over = c.receipt
      ? listed.reduce((t, e) => t + e.cents, 0) + (own?.cents ?? 0) - total
      : r.overCents;
    if (over > 0) {
      lines.push(`Amounts add up to ${sgd(total + over)}, ${sgd(over)} over, from rounding up`);
    }
  } else {
    const people = c.people as number;
    const { shareCents, collectedCents, overCents } = splitEqually(total, people);
    lines.push(
      `Bill: ${sgd(total)} between ${people} people`,
      `Each share: ${sgd(shareCents)} (everyone pays this)`
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

/** The receipt's merchant as a description (cut to what a QR can carry), when a receipt gave one. */
function receiptDescription(c: Ctx): string | undefined {
  const merchant = (c.receipt as Receipt | undefined)?.merchant;
  return merchant ? truncateAnsi(merchant, MAX_DESCRIPTION) || undefined : undefined;
}

/** The review's buttons; adding a missing item is offered only when the numbers show a gap. */
function reviewButtons(r: Receipt): InlineKeyboard {
  const kb = new InlineKeyboard();
  if (missingCents(r) > 0) kb.text('➕ Add a missing item', 'split_scan:add').row();
  return kb
    .text('✅ Use this', 'split_scan:use')
    .row()
    .text('📷 Send another photo', 'split_scan:again')
    .row()
    .text('Type the total instead', 'split_scan:manual');
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
  constructor(
    private readonly conversationDO: ConversationDO,
    /** `reader` turns a photo into receipt data; `download` fetches a Telegram file's bytes. */
    private readonly receipts: {
      reader?: ReceiptReader;
      /** Turns a voice note into assignment lines; voice is off without it. */
      voice?: VoiceReader;
      download?: (api: Api, fileId: string) => Promise<Uint8Array>;
    } = {},
    /** Anonymous daily counts for the owner's /stats; absent in tests that do not need it. */
    private readonly counter?: UsageCounter,
    /** Posts each QR in its own run, with retries; without it QRs are sent directly. */
    private readonly qrQueue?: Queue<SplitQrMessage>,
    /** Reads photos and voice notes in the background; without it the update reads them itself. */
    private readonly aiWorkflow?: Workflow<SplitAiParams>,
    /** The Mini App (bot username and app short name) behind the claim message's Edit in app button; off when absent. */
    private readonly app?: { bot: string; name: string }
  ) {}

  /** The link that opens the Mini App for this chat and topic, when it is configured. */
  private appUrl(ctx: Context): string | undefined {
    return this.app && ctx.chat
      ? appLink(this.app.bot, this.app.name, ctx.chat.id, topicOf(ctx))
      : undefined;
  }

  /**
   * Hand a photo or voice note to the Workflow. The conversation records the job first, so only the
   * job it still waits for can be shown. False when there is no Workflow or it could not be started
   * (the caller then reads inline); a job id that already exists is a redelivered update: started.
   */
  private async startJob(
    ctx: Context,
    kind: 'scan' | 'voice',
    fileId: string,
    noticeMsg: number,
    state: ConversationState
  ): Promise<boolean> {
    if (!this.aiWorkflow || !ctx.chat || !ctx.from) return false;
    const jobId = `split-${ctx.update.update_id}`;
    const topic = topicOf(ctx);
    const params: SplitAiParams = {
      kind,
      jobId,
      chatId: ctx.chat.id,
      chatType: ctx.chat.type,
      ...(topic ? { threadId: topic } : {}),
      userId: ctx.from.id,
      fileId,
      noticeMsg,
    };
    const { pendingJob: _old, ...rest } = state.context;
    try {
      await this.setState({
        flow: 'split',
        step: state.step,
        context: { ...rest, pendingJob: { id: jobId, step: state.step, kind } },
      });
      await this.aiWorkflow.create({ id: jobId, params });
      return true;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      if (/already|exists|duplicate/i.test(message)) return true;
      console.error(`split ai workflow failed to start: ${message.slice(0, 200)}`);
      await this.setState({ flow: 'split', step: state.step, context: rest });
      return false;
    }
  }

  /** The background read finished: show it if the conversation still waits for it, else drop it. */
  async deliverJob(ctx: Context, params: SplitAiParams): Promise<void> {
    const response = await this.conversationDO.fetch(
      new Request('http://localhost/job/take', {
        method: 'POST',
        body: JSON.stringify({ jobId: params.jobId }),
      })
    );
    let taken: { result: AiJobResult; state: ConversationState } | undefined;
    if (response.status === 200) taken = await response.json();
    else await response.body?.cancel();
    if (!taken) {
      await ctx.api.deleteMessage(params.chatId, params.noticeMsg).catch(() => undefined);
      return;
    }
    if (taken.result.kind === 'scan') {
      await this.deliverScan(ctx, taken.state, taken.result, params.noticeMsg);
    } else {
      await this.deliverVoice(ctx, taken.state, taken.result, params.noticeMsg);
    }
  }

  /** Put the QRs on the queue; false when there is no queue or it refused them (send directly). */
  private async enqueue(messages: SplitQrMessage[]): Promise<boolean> {
    if (!this.qrQueue || messages.length === 0) return false;
    try {
      await queueSplitQrs(this.qrQueue, messages);
      return true;
    } catch (error) {
      console.error(
        `split qr queue failed: ${(error instanceof Error ? error.message : String(error)).slice(0, 200)}`
      );
      return false;
    }
  }

  /** One queue message for a QR in this chat (and topic). */
  private qrMessage(
    ctx: Context,
    payload: string,
    lines: string[],
    caption: string,
    label: string
  ) {
    const topic = topicOf(ctx);
    return {
      v: 1 as const,
      chatId: ctx.chat!.id,
      ...(topic ? { threadId: topic } : {}),
      payload,
      lines,
      caption,
      label,
    };
  }

  /** `/split_custom` passes 'custom': after the total it goes straight to the list. */
  async start(ctx: Context, mode?: 'custom' | 'receipt'): Promise<void> {
    if (!ctx.from) return;
    if (mode === 'receipt' && !this.receipts.reader) {
      await ctx.reply('Receipt scanning is not available. Send /split and type the total instead.');
      return;
    }
    // Everything starts with the payee; a receipt start is remembered so the photo follows it
    const context = mode === 'custom' ? { mode } : mode === 'receipt' ? { entry: 'receipt' } : {};
    await this.setState({ flow: 'split', step: PAYEE, context });
    await this.fetch('/owner', { userId: ctx.from.id, topicId: topicOf(ctx) });
    await this.askStep(ctx, PAYEE, context);
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
    const reading = await ctx.reply('Reading your receipt… this takes a few seconds.');
    if (await this.startJob(ctx, 'scan', photo.file_id, reading.message_id, state)) return;
    // The photo lives in memory for these calls and is never logged.
    let result: AiJobResult;
    try {
      result = await readScan(reader, download, ctx.api, photo.file_id);
    } catch (error) {
      result = failureResult('scan', error);
    }
    await this.deliverScan(ctx, state, result, reading.message_id);
  }

  /** Show a read receipt, or say why it could not be used. Shared by the inline read and the Workflow. */
  private async deliverScan(
    ctx: Context,
    state: ConversationState,
    result: AiJobResult,
    noticeMsg: number
  ): Promise<void> {
    if (result.kind !== 'scan') return;
    if ('failure' in result) {
      await countAll(this.counter, [SPLIT_SCAN_FAILED]);
      const buttons =
        state.step === RECEIPT
          ? new InlineKeyboard()
              .text('Send another photo', 'split_scan:again')
              .text('Type the total instead', 'split_scan:manual')
          : undefined;
      await ctx.reply(
        `${result.failure} Send another photo${state.step === RECEIPT ? ', or tap Type the total instead' : ' or type the total'}.`,
        buttons ? { reply_markup: buttons } : undefined
      );
      return;
    }
    await countAll(this.counter, [SPLIT_SCAN_OK]);
    // The notice has done its job; a failure keeps it, so the failure message has context
    await ctx.api.deleteMessage(ctx.chat!.id, noticeMsg).catch(() => undefined);
    await this.showReview(ctx, { ...state.context, scan: { receipt: result.receipt } });
  }

  /**
   * A voice note answering "who had what": heard, turned into the typed lines and offered back with
   * a button. Nothing is applied until the organiser taps it. The audio and the heard text are
   * never stored or logged; only the made lines wait in the conversation state.
   */
  async handleVoice(ctx: Context): Promise<void> {
    const note = ctx.message?.voice;
    let state = await this.getState();
    if (!note || state.flow !== 'split' || !this.isOwner(ctx, state)) return;
    const reply = (text: string) => ctx.reply(text);
    if (state.step === HOW && this.receipts.voice) {
      // Answering the menu by speaking is choosing the voice option
      const howMsg = state.context.howMsg as number | undefined;
      if (howMsg !== undefined && ctx.chat) {
        await ctx.api.editMessageReplyMarkup(ctx.chat.id, howMsg).catch(() => undefined);
      }
      const context = { ...state.context, assignHow: 'voice' };
      await this.setState({ flow: 'split', step: ASSIGN, context });
      state = { ...state, step: ASSIGN, context };
    }
    if (state.step !== ASSIGN) {
      // In a group the organiser's chat is mostly for other people: no nagging
      if (!isGroup(ctx))
        await reply(
          'I only take a voice note when I ask who had which item. Please type your answer.'
        );
      return;
    }
    const { voice, download } = this.receipts;
    if (!voice || !download) {
      await reply('Voice notes are not available. Please type who had what.');
      return;
    }
    if (note.duration > VOICE_MAX_SECONDS || (note.file_size ?? 0) > VOICE_MAX_BYTES) {
      await reply(
        `Voice notes can be at most ${VOICE_MAX_SECONDS} seconds. Send a shorter one or type it.`
      );
      return;
    }
    const listening = await ctx.reply('Listening… this takes a few seconds.');
    if (await this.startJob(ctx, 'voice', note.file_id, listening.message_id, state)) return;
    const items = (state.context.receipt as Receipt).items.map((it) => it.name);
    let result: AiJobResult;
    try {
      result = await readVoice(voice, download, ctx.api, note.file_id, items);
    } catch (error) {
      result = failureResult('voice', error);
    }
    await this.deliverVoice(ctx, state, result, listening.message_id);
  }

  /** Show what a voice note said and the lines made from it. Shared by the inline read and the Workflow. */
  private async deliverVoice(
    ctx: Context,
    state: ConversationState,
    result: AiJobResult,
    noticeMsg: number
  ): Promise<void> {
    if (result.kind !== 'voice') return;
    const reply = (text: string) => ctx.reply(text);
    if ('failure' in result) {
      await reply(result.failure);
      return;
    }
    const retry = 'Send another voice note or type it.';
    await ctx.api.deleteMessage(ctx.chat!.id, noticeMsg).catch(() => undefined);
    if (!result.heard) {
      await reply(`I heard nothing. ${retry}`);
      return;
    }
    const heard = `I heard: "${result.heard.slice(0, 400)}"`;
    const receipt = state.context.receipt as Receipt;
    const parsed = result.lines ? parseAssignments(result.lines, receipt.items.length) : undefined;
    if (!parsed?.ok) {
      const why = parsed ? `: ${parsed.error}` : '';
      await reply(`${heard}\n\nI could not turn that into an assignment${why}. ${retry}`);
      return;
    }
    // A newer voice note replaces the older lines; the older button stops working
    const old = (state.context.voice as { msg: number } | undefined)?.msg;
    if (old !== undefined && ctx.chat) {
      await ctx.api.editMessageReplyMarkup(ctx.chat.id, old).catch(() => undefined);
    }
    await reply(heard);
    const sent = await ctx.reply(result.lines, {
      reply_markup: new InlineKeyboard().text('Use these lines', 'split_voice:use'),
    });
    await ctx.reply('Tap Use these lines, or send another voice note or type the lines.');
    await this.setState({
      flow: 'split',
      step: ASSIGN,
      context: { ...state.context, voice: { lines: result.lines, msg: sent.message_id } },
    });
  }

  /** The Use these lines tap: the lines go through the same check as a typed assignment. */
  private async voiceUse(ctx: Context, state: ConversationState): Promise<boolean> {
    const pending = state.context.voice as { lines: string; msg: number } | undefined;
    if (
      state.flow !== 'split' ||
      state.step !== ASSIGN ||
      !pending ||
      ctx.callbackQuery?.message?.message_id !== pending.msg
    ) {
      await ctx.answerCallbackQuery({ text: 'That voice note is no longer waiting.' });
      return true;
    }
    await ctx.answerCallbackQuery();
    const answer = readAnswer('assign', pending.lines, state.context);
    if (!answer.ok) {
      await ctx.reply(answer.error);
      return true;
    }
    if (ctx.chat)
      await ctx.api.editMessageReplyMarkup(ctx.chat.id, pending.msg).catch(() => undefined);
    await this.proceed(ctx, this.withAnswer(state.context, answer.patch, 'assign', undefined));
    return true;
  }

  /** Show the scan for review (warnings worked out afresh) and wait for the user's choice. */
  private async showReview(ctx: Context, context: Ctx): Promise<void> {
    const receipt = (context.scan as { receipt: Receipt }).receipt;
    const warnings = receiptWarnings(receipt);
    await this.setState({
      flow: 'split',
      step: REVIEW,
      context: { ...context, scan: { receipt, warnings } },
    });
    await ctx.reply(reviewText(receipt, warnings), { reply_markup: reviewButtons(receipt) });
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

    if (state.step === ADD_ITEM) {
      const scan = state.context.scan as { receipt: Receipt };
      const added = parseAddedItems(text, scan.receipt.items.length);
      if (!added.ok) {
        await ctx.reply(added.error);
        return true;
      }
      const receipt = { ...scan.receipt, items: [...scan.receipt.items, ...added.items] };
      await this.showReview(ctx, { ...state.context, scan: { receipt } });
      return true;
    }

    if (state.step === CLAIM) return true; // taps only: the organiser's chat is not answered

    const field = FIELD_OF_STEP[state.step];
    if (!field) {
      // In a group the organiser's chat is mostly for other people: no nagging while taps are awaited
      if (isGroup(ctx)) return true;
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
    // Any member of the group may tap an item; everything else is the organiser's
    if (/^split_claim:\d+$/.test(data)) return this.claimTap(ctx, data);
    if (data === 'split_claim:qr') return this.qrTap(ctx);
    const state = await this.getState();
    if (state.flow === 'split' && !this.isOwner(ctx, state)) {
      await ctx.answerCallbackQuery({
        text:
          data.startsWith('split_claim:') || data.startsWith('split_who:')
            ? "That is the organiser's button."
            : 'This split is not yours.',
      });
      return true;
    }
    if (data.startsWith('split_who:')) {
      // A button of a menu posted before the menu was removed
      await ctx.answerCallbackQuery({ text: 'That menu is gone. Use Edit in app.' });
      return true;
    }
    if (data === 'split_voice:use') return this.voiceUse(ctx, state);
    const c = state.context;
    const step = state.flow === 'split' ? state.step : 0;
    const onSummary = data === 'split_confirm' || data === 'split_cancel' || data === 'split_amend';
    const onMenu = data.startsWith('split_pick:') || data === 'split_back';
    const expected =
      data === 'split_how:retype'
        ? ASSIGN
        : data.startsWith('split_how:')
          ? HOW
          : data === 'split_claim:done'
            ? CLAIM
            : data === 'split_claim:keep' || data.startsWith('split_unassigned:')
              ? UNASSIGNED
              : data.startsWith('split_scan:')
                ? data === 'split_scan:add'
                  ? step === REVIEW
                    ? REVIEW
                    : -1
                  : data === 'split_scan:oneline' || data === 'split_scan:back'
                    ? step === ADD_ITEM
                      ? ADD_ITEM
                      : -1
                    : step === RECEIPT || step === REVIEW
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
    if (data === 'split_claim:done') {
      const claimers = (c.claimers as Claimer[] | undefined) ?? [];
      if (!claimers.some((x) => x.id !== ctx.from?.id)) {
        await ctx.answerCallbackQuery({
          text: 'Someone other than you must claim an item first.',
          show_alert: true,
        });
        return true;
      }
    }
    await ctx.answerCallbackQuery();

    if (data.startsWith('split_how:')) {
      const how = data.slice('split_how:'.length);
      const claim = how === 'claim';
      if (how === 'voice' && !this.receipts.voice) {
        await ctx.reply('Voice notes are not available. Please type who had what.');
        return true;
      }
      await ctx
        .editMessageText(
          claim
            ? 'Everyone claims their own items.'
            : how === 'voice'
              ? 'You will say who had what.'
              : 'You will type who had what.'
        )
        .catch(() => undefined);
      const organiserName = [ctx.from?.first_name, ctx.from?.last_name].filter(Boolean).join(' ');
      const context = {
        ...c,
        assignHow: claim ? 'claim' : how === 'voice' ? 'voice' : 'type',
        ...(claim ? { organiserName, organiserId: ctx.from?.id } : {}),
      };
      const next = claim ? CLAIM : ASSIGN;
      await this.setState({ flow: 'split', step: next, context });
      await this.askStep(ctx, next, context);
    } else if (data === 'split_claim:done') {
      const closed = await this.closeClaiming(ctx, c, ctx.from!.id);
      if (!closed.ok) {
        await ctx.reply(closed.reason);
        return true;
      }
    } else if (data === 'split_claim:keep') {
      await this.setButtons(ctx, new InlineKeyboard()); // the question is answered
      const { partial, gap, unassignedChoice, shareItems, ...rest } = c;
      await this.setState({ flow: 'split', step: CLAIM, context: rest });
      await this.askStep(ctx, CLAIM, rest);
    } else if (data.startsWith('split_unassigned:')) {
      const choice = data.endsWith(':even') ? 'even' : 'me';
      const partial = c.partial as AssignedOk;
      const receipt = c.receipt as Receipt;
      const lines = (c.shareItems as ReceiptItem[] | undefined) ?? receipt.items;
      const locked = c.assignHow === 'claim' ? lockedPeople(c) : new Set<number>();
      if (choice === 'even' && partial.people.every((_, i) => locked.has(i))) {
        await ctx.reply('Everyone has their QR already, so I cannot share the rest with them.');
        return true;
      }
      const { shares } = shareReceipt(
        lines,
        applyUnassigned(partial, choice, locked),
        receipt.totalCents
      );
      const entries = toEntries(shares, locked);
      if (entries.length === 0) {
        await ctx.reply('Nobody else owes anything. Name at least one other person.');
        await this.setState({ flow: 'split', step: ASSIGN, context: c });
        return true;
      }
      await this.proceed(ctx, {
        ...c,
        entries,
        own: ownOf(shares),
        leftover: 'omit',
        unassignedChoice: choice,
      });
    } else if (
      data === 'split_scan:add' ||
      data === 'split_scan:oneline' ||
      data === 'split_scan:back'
    ) {
      const scan = c.scan as { receipt: Receipt } | undefined;
      await this.setButtons(ctx, new InlineKeyboard()); // this prompt is answered
      if (!scan) return true;
      if (data === 'split_scan:add') {
        await this.setState({ flow: 'split', step: ADD_ITEM, context: c });
        await this.askStep(ctx, ADD_ITEM, c);
      } else if (data === 'split_scan:oneline') {
        // One "Unread items" line for exactly what looks missing
        const missing = missingCents(scan.receipt);
        const receipt =
          missing > 0
            ? {
                ...scan.receipt,
                items: [...scan.receipt.items, { name: 'Unread items', cents: missing }],
              }
            : scan.receipt;
        await this.showReview(ctx, { ...c, scan: { receipt } });
      } else {
        await this.showReview(ctx, c); // Back: the review again, unchanged
      }
    } else if (data.startsWith('split_scan:')) {
      const scan = c.scan as { receipt: Receipt } | undefined;
      const { scan: _scan, ...rest } = c;
      if (data === 'split_scan:use') {
        // The confirmed review is no longer needed; if it cannot be deleted, just drop its buttons
        await ctx.deleteMessage().catch(() => this.setButtons(ctx, new InlineKeyboard()));
      } else {
        await this.setButtons(ctx, new InlineKeyboard()); // the review is answered
      }
      if (data === 'split_scan:use' && scan) {
        // The receipt total is the bill; what the others owe is worked out from the items
        const {
          entries,
          leftover,
          people,
          suggested,
          assignHow,
          claims,
          claimers,
          claimMsg,
          ways,
          shareItems,
          served,
          organiserName,
          organiserId,
          ...clean
        } = rest;
        await this.proceed(ctx, {
          ...clean,
          receipt: scan.receipt,
          totalCents: scan.receipt.totalCents,
          mode: 'custom',
          group: isGroup(ctx), // a group may let everyone claim the items
          askHow: isGroup(ctx) || this.receipts.voice !== undefined, // type, voice or claim?
        });
      } else if (data === 'split_scan:again') {
        await this.setState({ flow: 'split', step: RECEIPT, context: rest });
        await this.askStep(ctx, RECEIPT, rest);
      } else if (data === 'split_scan:manual') {
        // Type the total instead: a normal split, without the receipt
        const { receipt, mode, entry, ...plain } = rest;
        await this.setState({ flow: 'split', step: TOTAL, context: plain });
        await this.askStep(ctx, TOTAL, plain);
      }
    } else if (data.startsWith('split_mode:')) {
      // A new choice of type starts that type's details afresh
      const { people, entries, leftover, suggested, own, ...rest } = c;
      await this.proceed(ctx, { ...rest, mode: data.endsWith(':custom') ? 'custom' : 'equal' });
    } else if (data.startsWith('split_leftover:')) {
      await this.proceed(ctx, { ...c, leftover: data.endsWith(':even') ? 'even' : 'omit' });
    } else if (data.startsWith('split_people:')) {
      const n = Number(data.slice('split_people:'.length));
      // Only the number we offered (a stale or odd tap changes nothing)
      if (n === c.suggested) await this.proceed(ctx, { ...c, people: n });
    } else if (data === 'split_skip_description') {
      // Skipping takes the receipt's merchant when there is one, otherwise no description
      const { description, ...rest } = c;
      const fallback = receiptDescription(c);
      await this.proceed(ctx, {
        ...rest,
        ...(fallback ? { description: fallback } : {}),
        described: true,
      });
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
        pick === 'split'
          ? MODE
          : pick === 'items'
            ? (c.askHow ?? c.group)
              ? HOW
              : ASSIGN
            : STEP_OF_FIELD[pick as Field];
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
      const { amending, voice, ...context } = c;
      await this.showSummary(ctx, context);
      return;
    }
    const { voice, ...rest } = c; // any accepted answer drops the pending voice lines
    let context: Ctx = rest;
    if (need.step === PEOPLE) context = { ...rest, suggested: await this.suggestPeople(ctx, c) };
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
    } else if (step === ADD_ITEM) {
      const receipt = (c.scan as { receipt: Receipt }).receipt;
      const missing = missingCents(receipt);
      await this.ask(
        ctx,
        `${missing > 0 ? `${sgd(missing)} looks missing. ` : ''}Send the missing item(s), one per line: a name, then a price (for example Sapporo Black 9.50).`,
        new InlineKeyboard()
          .text(
            missing > 0 ? `Add as one line (${sgd(missing)})` : 'Add as one line',
            'split_scan:oneline'
          )
          .row()
          .text('Back', 'split_scan:back')
      );
    } else if (step === UNASSIGNED) {
      const receipt = c.receipt as Receipt;
      const gap = (c.gap as number[]).map((i) => i + 1);
      const claiming = c.assignHow === 'claim';
      const lines = (c.shareItems as ReceiptItem[] | undefined) ?? receipt.items;
      const cents = gap.reduce((sum, n) => sum + lines[n - 1]!.cents, 0);
      const label = c.shareItems
        ? gap.map((n) => `"${lines[n - 1]!.name}"`).join(', ')
        : gap.length === 1
          ? `Item ${gap[0]}`
          : `Items ${gap.join(', ')}`;
      await ctx.reply(
        `${label} (${sgd(cents)} before charges) ${gap.length === 1 ? 'was' : 'were'} not ${claiming ? 'claimed by' : 'given to'} anyone. What should happen to ${gap.length === 1 ? 'it' : 'them'}?`,
        {
          reply_markup: keep(
            (() => {
              // People whose amount is fixed (they hold their QR) are not offered a share
              const locked = claiming ? lockedPeople(c) : new Set<number>();
              const open = (c.partial as AssignedOk).people.some((_, i) => !locked.has(i));
              const kb = new InlineKeyboard();
              if (open) {
                kb.text(
                  claiming
                    ? 'Split evenly between those who claimed'
                    : 'Split evenly between those named',
                  'split_unassigned:even'
                ).row();
              }
              kb.text('Leave them out: I cover them', 'split_unassigned:me');
              return claiming ? kb.row().text('Keep claiming', 'split_claim:keep') : kb;
            })()
          )!,
        }
      );
    } else if (step === HOW) {
      const kb = new InlineKeyboard().text("I'll type who had what", 'split_how:type');
      if (this.receipts.voice) kb.row().text('Say it with a voice note', 'split_how:voice');
      if (c.group) kb.row().text('Let everyone claim their items', 'split_how:claim');
      const sent = await ctx.reply('How do you want to share out the items?', {
        reply_markup: keep(kb)!,
      });
      // So a voice note sent before tapping can take the menu's buttons away
      await this.setState({ flow: 'split', step: HOW, context: { ...c, howMsg: sent.message_id } });
    } else if (step === CLAIM) {
      const sent = await ctx.reply(claimText(c, this.appUrl(ctx)), {
        reply_markup: claimButtons(c, this.appUrl(ctx)),
      });
      await this.setState({
        flow: 'split',
        step: CLAIM,
        context: { ...c, claimMsg: sent.message_id },
      });
    } else if (step === ASSIGN) {
      const items = (c.receipt as Receipt).items;
      // The list gets its own bubble so it can be copied whole, without the instructions
      await ctx.reply(items.map((it, i) => `${i + 1}. ${it.name} ${sgd(it.cents)}`).join('\n'));
      if (c.assignHow === 'voice') {
        const [a, b] = items;
        const example = b ? `${a!.name} is Ann's, ${b.name} is mine` : `${a!.name} is Ann's`;
        await this.ask(
          ctx,
          `Say who had which item in a voice note (hold the microphone), for example: "${example}". I will show you what I heard and the lines I made before using them. You can also type it.`,
          keep(new InlineKeyboard().text('Type instead', 'split_how:retype'))
        );
        return;
      }
      await this.ask(
        ctx,
        'Who had what? Send one line per group of items, then the people:\n\n1,3 Ann\n2 Ann, Bob (shared)\n4 me\n5 all (shared by everyone named)\n\nOr copy the items above, put a name above each group and send it back (a colon after a name is optional):\n\nAnn\n1. …\n\nAll\n2. …\n\nLeave out any item nobody had and I will ask what to do with it. GST and service charge are shared in proportion. "me" is you, and your share gets a QR too.' +
          (this.receipts.voice
            ? '\n\nYou can also send a voice note: say who had which item.'
            : ''),
        keep()
      );
    } else if (step === PAYEE) {
      await this.ask(ctx, 'Who should be paid? Send a Singapore mobile number or a UEN.', keep());
    } else if (step === DESCRIPTION) {
      await this.ask(
        ctx,
        `Add a short description (up to ${MAX_DESCRIPTION} characters), or tap Skip${
          receiptDescription(c) ? ` to use "${receiptDescription(c)}"` : ''
        }.`,
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
    await countAll(this.counter, [
      SPLIT_CONFIRMED,
      c.receipt ? SPLIT_TYPE_RECEIPT : c.entries ? SPLIT_TYPE_CUSTOM : SPLIT_TYPE_EQUAL,
      ctx.chat?.type === 'private' ? SPLIT_PLACE_PRIVATE : SPLIT_PLACE_GROUP,
    ]);
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

    // Everyone's QR goes in the chat, one per distinct amount with the names that owe it. People
    // who took their QR early already have it; the organiser's own share is one more payer.
    const payers = (final ?? []).filter((e) => !e.sent);
    const already = (final ?? []).filter((e) => e.sent);
    const selfId = ctx.from?.id;
    if (
      listed &&
      c.leftover !== 'even' &&
      selfId !== undefined &&
      servedOf(c)[String(selfId)] === undefined
    ) {
      const own = c.receipt
        ? ((c.own as OwnShare | undefined)?.cents ?? 0)
        : applyLeftover(listed, total, 'omit').leftoverCents;
      const name = (c.organiserName as string | undefined) ?? ctx.from?.first_name ?? 'You';
      if (own > 0) payers.push({ name, cents: own });
    }
    if (already.length > 0) {
      await ctx.reply(`Already sent their QR: ${already.map((e) => e.name).join(', ')}.`);
    }

    // One QR per distinct amount (an equal split has exactly one)
    const jobs = final
      ? groupByAmount(payers).map((g) => ({
          cents: g.cents,
          lines: [sgd(g.cents), g.names.join(', ')],
        }))
      : (() => {
          const people = c.people as number;
          const share = splitEqually(total, people).shareCents;
          return [{ cents: share, lines: [`${sgd(share)} each (split ${people} ways)`] }];
        })();

    // The queue posts each QR in its own run (retried on errors), so nothing is lost to the time limit
    const queued = await this.enqueue(
      jobs.map((job) => {
        const lines = [...(description ? [description] : []), ...job.lines];
        return this.qrMessage(
          ctx,
          payloadFor(job.cents),
          lines,
          `${lines.join('\n')}\n\n${caution} Send /split for another.`,
          job.lines.join(' ')
        );
      })
    );
    if (queued) return;

    // Cloudflare stops background work 30 seconds after the update arrived, without a word: stop
    // starting sends in good time, so the chat is told which QRs are missing
    const deadline = Date.now() + SEND_BUDGET_MS;
    let sent = 0;
    try {
      for (const job of jobs) {
        if (Date.now() > deadline) break;
        const lines = [...(description ? [description] : []), ...job.lines];
        await ctx.replyWithPhoto(await qrPhoto(payloadFor(job.cents), lines), {
          caption: `${lines.join('\n')}\n\n${caution} Send /split for another.`,
        });
        sent++;
        await countAll(this.counter, [SPLIT_QR_CHAT]);
      }
    } catch {
      // No console logging: the answers include a payee number
    }
    if (sent < jobs.length) {
      const missing = jobs
        .slice(sent)
        .map((j) => j.lines.join(' '))
        .join('; ');
      await ctx.reply(
        jobs.length === 1
          ? 'Could not make the QR. Please send /split to try again.'
          : `Sent ${sent} of ${jobs.length} QRs; the other ${jobs.length - sent} could not be sent (${missing}). Please send /split to try again.`
      );
    }
  }

  /**
   * Change the claims through a conditional write: read the state, apply the change to it, write
   * only if nobody wrote since, and apply it again on the newer state otherwise. That keeps
   * simultaneous taps all recorded. `expectMsg` names the
   * message the tap must come from (a stale button is refused); typed text passes none.
   */
  private async mutateClaims(
    ctx: Context,
    expectMsg: ((c: Ctx) => number | undefined) | null,
    change: (c: Ctx, state: ConversationState) => ClaimResult
  ) {
    return mutateClaimsOn(
      this.conversationDO,
      change,
      expectMsg ? (c) => ctx.callbackQuery?.message?.message_id === expectMsg(c) : undefined
    );
  }

  /** Show the claims on the claim message (not modified or rate limited: the stored claims win). */
  private async refreshClaims(ctx: Context, c: Ctx): Promise<void> {
    if (!ctx.chat || c.claimMsg === undefined) return;
    await ctx.api
      .editMessageText(ctx.chat.id, c.claimMsg as number, claimText(c, this.appUrl(ctx)), {
        reply_markup: claimButtons(c, this.appUrl(ctx)),
      })
      .catch(() => undefined);
  }

  /**
   * Close the claiming: build the assignment from the claims, close the claim message (its buttons
   * go), then ask about unclaimed items or post the summary. Used by Done in the chat and by Done in
   * the Mini App, so both have the same result. Says why it cannot close instead of posting about it;
   * nothing is changed or posted then.
   */
  private async closeClaiming(
    ctx: Context,
    c: Ctx,
    organiserId: number
  ): Promise<{ ok: true } | { ok: false; reason: string }> {
    const claimers = claimersOf(c);
    if (!claimers.some((x) => x.id !== organiserId)) {
      return { ok: false, reason: 'Someone other than you must claim an item first.' };
    }
    const receipt = c.receipt as Receipt;
    const a = assignmentFromClaims(receipt.items, claimsOf(c), claimers, organiserId, waysOf(c));
    const shared = Object.keys(waysOf(c)).length > 0;
    const result = assignmentPatch(
      a,
      c,
      { ...receipt, items: a.lines },
      shared ? a.lines : undefined,
      lockedPeople(c)
    );
    if (!result.ok) return { ok: false, reason: result.error };
    // Claiming is over for now (Keep claiming opens a fresh message): the buttons go. The message
    // is edited by its id, so this also works when no button was tapped (the Mini App).
    const msg = (c.claimMsg as number | undefined) ?? ctx.callbackQuery?.message?.message_id;
    if (ctx.chat && msg !== undefined) {
      await ctx.api
        .editMessageText(ctx.chat.id, msg, `${claimText(c)}\n\nClaiming is closed.`)
        .catch(() => undefined);
    }
    await this.proceed(ctx, { ...c, ...result.patch });
    return { ok: true };
  }

  /**
   * Done from the Mini App: the same as Done in the chat for the organiser `organiserId`. `over`
   * is set when the claiming is not open (already closed, cancelled or expired).
   */
  async closeClaimingFor(
    ctx: Context,
    organiserId: number
  ): Promise<{ ok: true } | { ok: false; reason: string; over?: true }> {
    const state = await this.getState();
    if (state.flow !== 'split' || state.step !== CLAIM) {
      return { ok: false, reason: 'The claiming is over.', over: true };
    }
    return this.closeClaiming(ctx, state.context, organiserId);
  }

  /** Anyone, the organiser included, taps an item: claim it, or take their claim back. */
  private async claimTap(ctx: Context, data: string): Promise<boolean> {
    const index = Number(data.slice('split_claim:'.length));
    const from = ctx.from;
    if (!from) return true;
    const r = await this.mutateClaims(
      ctx,
      (c) => c.claimMsg as number | undefined,
      (c) =>
        (c.receipt as Receipt).items[index] === undefined
          ? { refuse: '' }
          : applyClaim(c, index, { kind: 'toggle', from })
    );
    if (r.kind === 'stale') await ctx.answerCallbackQuery({ text: 'That step is over.' });
    else if (r.kind === 'busy') await ctx.answerCallbackQuery({ text: 'Busy. Please tap again.' });
    else if (r.kind === 'refused') {
      await ctx.answerCallbackQuery(r.text ? { text: r.text, show_alert: true } : undefined);
    } else {
      await ctx.answerCallbackQuery({ text: r.note });
      await this.refreshClaims(ctx, r.context);
    }
    return true;
  }

  /**
   * A member taps Get my QR: fix their amount (and lock their items) in one conditional write, then
   * post their QR in the chat, with their name and the split's description.
   */
  private async qrTap(ctx: Context): Promise<boolean> {
    const from = ctx.from;
    if (!from) return true;
    const r = await this.mutateClaims(
      ctx,
      (c) => c.claimMsg as number | undefined,
      (c) => {
        const served = servedOf(c);
        if (served[String(from.id)] !== undefined) {
          return { refuse: 'You already took your QR: it is in the chat.' };
        }
        const mine = Object.values(claimsOf(c)).some((ids) => ids.includes(from.id));
        if (!mine) return { refuse: 'Claim an item first.' };
        const receipt = c.receipt as Receipt;
        const { cents } = memberAmount(
          receipt.items,
          claimsOf(c),
          waysOf(c),
          from.id,
          receipt.totalCents
        );
        if (cents <= 0) return { refuse: 'There is nothing to pay for your items.' };
        return {
          context: { ...c, served: { ...served, [String(from.id)]: cents } },
          note: 'Your QR',
        };
      }
    );
    if (r.kind === 'stale') {
      await ctx.answerCallbackQuery({ text: 'That step is over.' });
    } else if (r.kind === 'busy') {
      await ctx.answerCallbackQuery({ text: 'Busy. Please tap again.' });
    } else if (r.kind === 'refused') {
      await ctx.answerCallbackQuery({ text: r.text, show_alert: true });
    } else {
      const cents = servedOf(r.context)[String(from.id)]!;
      const sent = await this.deliverEarly(ctx, from, cents, r.context);
      if (sent === 'failed') {
        // Nothing could be posted: give the member their items back
        await this.mutateClaims(ctx, null, (c) => {
          const { [String(from.id)]: _gone, ...rest } = servedOf(c);
          return { context: { ...c, served: rest }, note: '' };
        });
        await ctx.answerCallbackQuery({
          text: 'I could not post the QR. Please tap again.',
          show_alert: true,
        });
      } else {
        await ctx.answerCallbackQuery({
          text:
            sent === 'queued'
              ? 'Your QR will be posted in the chat in a moment.'
              : 'Your QR is posted in the chat.',
        });
      }
      await this.refreshClaims(ctx, r.context);
    }
    return true;
  }

  /** The QR for a member who took it early, posted in the chat with their name and the description. */
  private async deliverEarly(
    ctx: Context,
    from: { id: number; first_name: string },
    cents: number,
    c: Ctx
  ): Promise<'queued' | 'posted' | 'failed'> {
    const description = c.description as string | undefined;
    const payload = buildPayNowPayload({
      proxyType: c.payeeType as 'mobile' | 'uen',
      proxyValue: c.payeeValue as string,
      amountCents: cents,
      editable: false,
      ...(description ? { description } : {}),
    });
    const name = claimersOf(c).find((x) => x.id === from.id)?.name ?? from.first_name;
    const lines = [...(description ? [description] : []), sgd(cents), name];
    const caption = `${lines.join('\n')}\n\nScan with your banking app. Check the payee name before you pay.`;
    if (
      await this.enqueue([this.qrMessage(ctx, payload, lines, caption, `${sgd(cents)} ${name}`)])
    ) {
      return 'queued';
    }
    try {
      await ctx.replyWithPhoto(await qrPhoto(payload, lines), { caption });
      await countAll(this.counter, [SPLIT_QR_CHAT]);
      return 'posted';
    } catch {
      return 'failed';
    }
  }

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
    // While items are being claimed the conversation waits an hour, not ten minutes
    const claiming =
      state.step === HOW ||
      state.step === CLAIM ||
      (state.step === UNASSIGNED && state.context.assignHow === 'claim');
    // Pending voice lines only make sense while the assignment is being asked
    const { voice, ...rest } = state.context;
    const context = state.step === ASSIGN ? state.context : rest;
    await this.fetch('/state', { ...state, context, idleMs: claiming ? CLAIM_IDLE_MS : IDLE_MS });
  }

  private async fetch(path: string, body: unknown) {
    const response = await this.conversationDO.fetch(
      new Request(`http://localhost${path}`, { method: 'POST', body: JSON.stringify(body) })
    );
    await response.body?.cancel();
  }
}
