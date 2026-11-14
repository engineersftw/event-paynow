import type { Api, Context } from 'grammy';
import { InlineKeyboard, InputFile } from 'grammy';
import type { Message } from 'grammy/types';
import { detectProxyType } from '../db/proxy-validation';
import type { SplitDirectory } from '../db/split-repository';
import {
  SPLIT_CLAIM_CREATED,
  SPLIT_CONFIRMED,
  SPLIT_PAYEE_OTHER,
  SPLIT_PLACE_GROUP,
  SPLIT_PLACE_PRIVATE,
  SPLIT_QR_CHAT,
  SPLIT_QR_DM,
  SPLIT_SCAN_FAILED,
  SPLIT_SCAN_OK,
  SPLIT_TYPE_CUSTOM,
  SPLIT_TYPE_EQUAL,
  SPLIT_TYPE_RECEIPT,
  type UsageCounter,
} from '../db/usage-repository';
import { type ReceiptReader, ReceiptReaderError } from '../receipt-reader';
import { formatCents, parseAmount } from '../sgqr/amount';
import { buildPayNowPayload, truncateAnsi } from '../sgqr/paynow';
import { renderQrPng } from '../sgqr/qr-render';
import type { VoiceReader } from '../voice-reader';
import type { ConversationDO, ConversationState } from '../worker/conversation-do';
import {
  type AssignedOk,
  applyUnassigned,
  assignmentFromClaims,
  type Claimer,
  claimerName,
  MAX_CLAIMERS,
  memberAmount,
  missingCents,
  type PersonShare,
  parseAddedItems,
  parseAssignments,
  parseScan,
  type Receipt,
  type ReceiptItem,
  receiptWarnings,
  resolveTyped,
  shareReceipt,
  toEntries,
} from './receipt';
import { countAll, directMessage, newExpiry, newToken, postWaiting } from './split-claim';
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
const HOW = 16; // group only: type who had what, or let everyone claim
const CLAIM = 17; // the claim message is open and any member can tap items
const PAYEE_ME = 14; // is the payee the organiser? if not, the organiser pays their own share too

const MAX_DESCRIPTION = 25;
// Each round of simultaneous taps lets one write through, so this many taps at once all fit
const MAX_TAP_RETRIES = 25;
const VOICE_MAX_SECONDS = 60; // a longer voice note is refused before any download or AI call
const VOICE_MAX_BYTES = 1_000_000;
const IDLE_MS = 10 * 60 * 1000;
const CLAIM_IDLE_MS = 60 * 60 * 1000; // people finish dinner at different speeds

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
  '/split - payee first (and whether it is you), then the total, equal or custom amounts and an optional description\n' +
  '/split_custom - same, straight to custom amounts (one line per person: name and amount; @mention someone to send them their QR directly)\n' +
  '/split_receipt - same, but start from a photo of the receipt (I read the items, GST and service charge). In a group everyone can tap the items they had instead of you typing who had what; you can also answer that question with a voice note.\n' +
  'If someone else is the payee, you get a QR for your own share too.\n' +
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
  if (c.payeeIsMe === undefined) return { step: PAYEE_ME };
  const total = c.totalCents as number | undefined;
  if (total === undefined) return { step: c.entry === 'receipt' ? RECEIPT : TOTAL };
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
      if (c.group && !c.assignHow) return { step: HOW };
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
    // A receipt gives the organiser their own share, rounded up like everybody's; any other list
    // leaves them the remainder
    const own = c.receipt ? (c.own as OwnShare | undefined) : undefined;
    // The organiser counts when an amount for them is shown (own share, or a leftover they carry)
    const people =
      listed.length +
      (c.receipt ? (own ? 1 : 0) : r.leftoverCents > 0 && r.extraCents === 0 ? 1 : 0);
    lines.push(`Bill: ${sgd(total)} shared by ${people} people`);
    for (const e of r.entries) {
      const direct = e.sent
        ? ' (QR already sent)'
        : e.username || e.userId
          ? ' (by direct message)'
          : '';
      lines.push(`${e.name}: ${amountText(e)}${direct}`);
    }
    const paid = c.payeeIsMe === false; // someone else is paid, so the organiser pays too
    if (c.receipt) {
      if (own) {
        lines.push(
          paid
            ? `Your own share, which you pay the payee: ${amountText(own)} (you get a QR)`
            : `Your own share, not collected: ${amountText(own)}`
        );
      }
    } else if (r.leftoverCents > 0) {
      lines.push(
        r.extraCents > 0
          ? `Leftover ${sgd(r.leftoverCents)} split evenly (${sgd(r.extraCents)} each)`
          : paid
            ? `Leftover ${sgd(r.leftoverCents)} is yours to pay: you get a QR`
            : `Leftover ${sgd(r.leftoverCents)} left out: you cover it`
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

const claimsOf = (c: Ctx) => (c.claims as Record<string, number[]> | undefined) ?? {};
const claimersOf = (c: Ctx) => (c.claimers as Claimer[] | undefined) ?? [];
const servedOf = (c: Ctx) => (c.served as Record<string, number> | undefined) ?? {};
const waysOf = (c: Ctx) => (c.ways as Record<string, number> | undefined) ?? {};
type Menu = { item: number; msg: number; awaiting?: 'names' | 'ways' };
const MAX_WAYS = 20;

/** An item is locked once any of its holders has taken their QR. */
const itemLocked = (c: Ctx, item: number) =>
  (claimsOf(c)[String(item)] ?? []).some((id) => servedOf(c)[String(id)] !== undefined);

/** The claimers (by position, which is also their place in the assignment) who hold their QR. */
function lockedPeople(c: Ctx): Set<number> {
  const served = servedOf(c);
  return new Set(claimersOf(c).flatMap((x, i) => (served[String(x.id)] !== undefined ? [i] : [])));
}

/** The claim message: every item with the people who claimed it (and the shares left). */
function claimText(c: Ctx): string {
  const claims = claimsOf(c);
  const claimers = claimersOf(c);
  const ways = waysOf(c);
  const lines = (c.receipt as Receipt).items.map((it, i) => {
    const holders = claims[String(i)] ?? [];
    const who = holders
      .map((id) => {
        const name = claimers.find((x) => x.id === id)?.name ?? '?';
        return servedOf(c)[String(id)] !== undefined ? `${name} (QR sent)` : name;
      })
      .join(', ');
    const lock = itemLocked(c, i) ? '🔒 ' : '';
    const n = ways[String(i)];
    if (n === undefined) {
      return `${lock}${i + 1}. ${it.name} ${sgd(it.cents)}: ${who || 'unclaimed'}`;
    }
    const left = n - holders.length;
    const parts = [who, left > 0 ? `${left} left` : ''].filter(Boolean).join(', ');
    return `${lock}${i + 1}. ${it.name} ${sgd(it.cents)} (${n} ways): ${parts}`;
  });
  return `Tap the items you had; tap again to take one back. An item claimed by several people is split equally. The organiser taps Done when everyone has claimed, and can tap an item to assign it to someone else or share it. Tap Get my QR to pay now: your items are then locked. This stays open for an hour after the last tap.\n\n${lines.join('\n')}`;
}

/** One button per item (with how many have claimed it) and Done. */
function claimButtons(c: Ctx): InlineKeyboard {
  const claims = claimsOf(c);
  const ways = waysOf(c);
  const kb = new InlineKeyboard();
  (c.receipt as Receipt).items.forEach((it, i) => {
    const n = (claims[String(i)] ?? []).length;
    const w = ways[String(i)];
    const count = w !== undefined ? ` (${n}/${w})` : n > 0 ? ` (${n})` : '';
    const lock = itemLocked(c, i) ? '🔒 ' : '';
    kb.text(`${lock}${i + 1}. ${it.name}${count}`.slice(0, 40), `split_claim:${i}`).row();
  });
  return kb.text('💳 Get my QR', 'split_claim:qr').row().text('✅ Done', 'split_claim:done');
}

/** The organiser's menu for one item: what it says and its buttons. */
function menuView(c: Ctx, organiserId: number): { text: string; kb: InlineKeyboard } {
  const menu = c.menu as Menu;
  const item = menu.item;
  const it = (c.receipt as Receipt).items[item]!;
  const holders = claimsOf(c)[String(item)] ?? [];
  const n = waysOf(c)[String(item)];
  const head = `Item ${item + 1}: ${it.name} ${sgd(it.cents)}${n !== undefined ? ` (${n} ways)` : ''}`;
  const at = (action: string) => `split_who:${item}:${action}`;
  if (itemLocked(c, item)) {
    return {
      text: `🔒 ${head}\n\nThis item is locked: someone on it already has their QR.`,
      kb: new InlineKeyboard().text('Close', at('close')),
    };
  }
  if (menu.awaiting === 'names') {
    return {
      text: `${head}\n\nWho else had it? Send their names or @mentions, separated by commas (reply to this message).`,
      kb: new InlineKeyboard().text('Back', at('back')),
    };
  }
  if (menu.awaiting === 'ways') {
    const kb = new InlineKeyboard();
    for (const k of [2, 3, 4, 5, 6]) kb.text(String(k), at(`w${k}`));
    return {
      text: `${head}\n\nHow many ways should it be split? Tap a number or send one from 2 to ${MAX_WAYS} (reply to this message).`,
      kb: kb.row().text('Back', at('back')),
    };
  }
  const kb = new InlineKeyboard().text(
    `${holders.includes(organiserId) ? '✓ ' : ''}🙋 Mine`,
    at('mine')
  );
  for (const person of claimersOf(c)) {
    if (person.id === organiserId) continue;
    kb.row().text(
      `${holders.includes(person.id) ? '✓ ' : ''}${person.name}`.slice(0, 40),
      at(String(person.id))
    );
  }
  kb.row().text('➕ Someone else…', at('else'));
  kb.row().text(n !== undefined ? `👥 Shared ${n} ways: change` : '👥 Shared by all…', at('all'));
  if (n !== undefined) kb.row().text('Not shared: remove the ways', at('noways'));
  if (holders.length > 0) kb.row().text('🗑 Remove all claims', at('clear'));
  return {
    text: `${head}\n\nWho had it? Tap a person to add or remove them.`,
    kb: kb.row().text('Close', at('close')),
  };
}

type TgUser = { id: number; first_name: string; last_name?: string; username?: string };
type ClaimOp =
  | { kind: 'toggle'; from: TgUser } // a member's own tap, or the organiser's Mine
  | { kind: 'toggleId'; id: number } // the organiser taps a person in the menu
  | { kind: 'add'; people: Claimer[] } // typed names
  | { kind: 'clear' }
  | { kind: 'ways'; n: number | null };
type ClaimResult = { context: Ctx; note: string } | { refuse: string };

/** Apply one change to the claims of one item; pure, so it can be retried on a newer state. */
function applyClaim(c: Ctx, item: number, op: ClaimOp): ClaimResult {
  const claims: Record<string, number[]> = {};
  for (const [k, v] of Object.entries(claimsOf(c))) claims[k] = [...v];
  let claimers = [...claimersOf(c)];
  const ways = { ...waysOf(c) };
  const key = String(item);
  const holders = () => claims[key] ?? [];
  let note = 'Done';
  // Taking a QR fixes the amounts of everyone on the item: nobody can change it any more
  if (itemLocked(c, item))
    return { refuse: 'That item is locked: someone on it already has their QR.' };
  const served = servedOf(c);

  const add = (person: Claimer): string | undefined => {
    if (served[String(person.id)] !== undefined) {
      return 'They already have their QR, so their items cannot change.';
    }
    if (!claimers.some((x) => x.id === person.id)) {
      // A typed @username who now taps themselves becomes the same person
      const typed =
        person.id > 0 && person.username
          ? claimers.find(
              (x) => x.id < 0 && x.username?.toLowerCase() === person.username!.toLowerCase()
            )
          : undefined;
      if (typed) {
        for (const k of Object.keys(claims)) {
          claims[k] = claims[k]!.map((id) => (id === typed.id ? person.id : id));
        }
        claimers = claimers.map((x) => (x.id === typed.id ? { ...x, id: person.id } : x));
      } else {
        if (claimers.length >= MAX_CLAIMERS) return `Up to ${MAX_CLAIMERS} people can claim items.`;
        claimers.push(person);
      }
    }
    if (holders().includes(person.id)) return undefined;
    const n = ways[key];
    if (n !== undefined && holders().length >= n) return `All ${n} shares are taken.`;
    claims[key] = [...holders(), person.id];
    return undefined;
  };
  const remove = (id: number) => {
    claims[key] = holders().filter((x) => x !== id);
  };

  if (op.kind === 'toggle') {
    const known = claimers.find((x) => x.id === op.from.id);
    if (known && holders().includes(known.id)) {
      remove(known.id);
      note = 'Removed';
    } else {
      const refusal = add(
        known ?? {
          id: op.from.id,
          name: claimerName(
            claimers.map((x) => x.name),
            op.from
          ),
          ...(op.from.username ? { username: op.from.username } : {}),
        }
      );
      if (refusal) return { refuse: refusal };
      note = 'Claimed';
    }
  } else if (op.kind === 'toggleId') {
    const person = claimers.find((x) => x.id === op.id);
    if (!person) return { refuse: 'That person has no items now. Use Someone else to add them.' };
    if (holders().includes(person.id)) {
      remove(person.id);
      note = 'Removed';
    } else {
      const refusal = add(person);
      if (refusal) return { refuse: refusal };
      note = 'Added';
    }
  } else if (op.kind === 'add') {
    for (const person of op.people) {
      const refusal = add(person);
      if (refusal) return { refuse: refusal };
    }
    note = 'Added';
  } else if (op.kind === 'clear') {
    claims[key] = [];
    note = 'Cleared';
  } else if (op.n === null) {
    delete ways[key];
    note = 'Not shared';
  } else {
    if (op.n < holders().length) {
      return { refuse: `${holders().length} people already hold it, so it cannot be fewer ways.` };
    }
    ways[key] = op.n;
    note = `Shared ${op.n} ways`;
  }
  // Someone with no items left is no longer counted as a claimer
  const holding = new Set(Object.values(claims).flat());
  claimers = claimers.filter((x) => holding.has(x.id));
  return { context: { ...c, claims, claimers, ways }, note };
}

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
      /** Turns a voice note into assignment lines; voice is off without it. */
      voice?: VoiceReader;
      download?: (api: Api, fileId: string) => Promise<Uint8Array>;
    } = {},
    /** Anonymous daily counts for the owner's /stats; absent in tests that do not need it. */
    private readonly counter?: UsageCounter
  ) {}

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
    const failed = async (why: string) => {
      await countAll(this.counter, [SPLIT_SCAN_FAILED]);
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
    const reading = await ctx.reply('Reading your receipt… this takes a few seconds.');
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
    await countAll(this.counter, [SPLIT_SCAN_OK]);
    // The notice has done its job; a failure keeps it, so the failure message has context
    await ctx.api.deleteMessage(reading.chat.id, reading.message_id).catch(() => undefined);
    await this.showReview(ctx, { ...state.context, scan: { receipt: scan.receipt } });
  }

  /**
   * A voice note answering "who had what": heard, turned into the typed lines and offered back with
   * a button. Nothing is applied until the organiser taps it. The audio and the heard text are
   * never stored or logged; only the made lines wait in the conversation state.
   */
  async handleVoice(ctx: Context): Promise<void> {
    const note = ctx.message?.voice;
    const state = await this.getState();
    if (!note || state.flow !== 'split' || !this.isOwner(ctx, state)) return;
    const reply = (text: string) => ctx.reply(text);
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
    const items = (state.context.receipt as Receipt).items.map((it) => it.name);
    const retry = 'Send another voice note or type it.';
    const listening = await ctx.reply('Listening… this takes a few seconds.');
    const gone = () =>
      ctx.api.deleteMessage(listening.chat.id, listening.message_id).catch(() => undefined);
    let result: { heard: string; lines: string };
    try {
      result = await voice.hear(await download(ctx.api, note.file_id), items);
    } catch (error) {
      // Only the stage and the error's own message: never audio or what was said
      console.error(
        `split voice failed: ${(error instanceof Error ? error.message : String(error)).slice(0, 200)}`
      );
      await reply(`Voice is not working right now. Please type who had what.`);
      return;
    }
    await gone();
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

    if (state.step === CLAIM) {
      // The organiser's reply to the menu (names or a number of ways); other chat is ignored
      if ((state.context.menu as Menu | undefined)?.awaiting) await this.menuText(ctx, text, state);
      return true;
    }

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
    if (data.startsWith('split_who:')) return this.menuTap(ctx, data);
    if (data === 'split_voice:use') return this.voiceUse(ctx, state);
    const c = state.context;
    const step = state.flow === 'split' ? state.step : 0;
    const onSummary = data === 'split_confirm' || data === 'split_cancel' || data === 'split_amend';
    const onMenu = data.startsWith('split_pick:') || data === 'split_back';
    const expected = data.startsWith('split_payee:')
      ? PAYEE_ME
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
      const claim = data.endsWith(':claim');
      await ctx
        .editMessageText(claim ? 'Everyone claims their own items.' : 'You will type who had what.')
        .catch(() => undefined);
      const organiserName = [ctx.from?.first_name, ctx.from?.last_name].filter(Boolean).join(' ');
      const context = {
        ...c,
        assignHow: claim ? 'claim' : 'type',
        ...(claim ? { organiserName, organiserId: ctx.from?.id } : {}),
      };
      const next = claim ? CLAIM : ASSIGN;
      await this.setState({ flow: 'split', step: next, context });
      await this.askStep(ctx, next, context);
    } else if (data === 'split_claim:done') {
      const receipt = c.receipt as Receipt;
      const a = assignmentFromClaims(
        receipt.items,
        claimsOf(c),
        claimersOf(c),
        ctx.from!.id,
        waysOf(c)
      );
      const shared = Object.keys(waysOf(c)).length > 0;
      const result = assignmentPatch(
        a,
        c,
        { ...receipt, items: a.lines },
        shared ? a.lines : undefined,
        lockedPeople(c)
      );
      if (!result.ok) {
        await ctx.reply(result.error);
        return true;
      }
      // Claiming is over for now (Keep claiming opens a fresh message): the buttons go
      await ctx.editMessageText(`${claimText(c)}\n\nClaiming is closed.`).catch(() => undefined);
      const { menu, ...withoutMenu } = c;
      if (menu) {
        await ctx.api.deleteMessage(ctx.chat!.id, (menu as Menu).msg).catch(() => undefined);
      }
      await this.proceed(ctx, { ...withoutMenu, ...result.patch });
    } else if (data === 'split_claim:keep') {
      await this.setButtons(ctx, new InlineKeyboard()); // the question is answered
      const { partial, gap, unassignedChoice, shareItems, ...rest } = c;
      await this.setState({ flow: 'split', step: CLAIM, context: rest });
      await this.askStep(ctx, CLAIM, rest);
    } else if (data.startsWith('split_payee:')) {
      const mine = data.endsWith(':me');
      await ctx
        .editMessageText(mine ? 'Payment was made by you.' : 'Payment was made by someone else.')
        .catch(() => undefined);
      await this.proceed(ctx, { ...c, payeeIsMe: mine });
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
          menu,
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
        pick === 'split'
          ? MODE
          : pick === 'items'
            ? c.group
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
      await ctx.reply('How do you want to share out the items?', {
        reply_markup: keep(
          new InlineKeyboard()
            .text("I'll type who had what", 'split_how:type')
            .row()
            .text('Let everyone claim their items', 'split_how:claim')
        )!,
      });
    } else if (step === CLAIM) {
      const sent = await ctx.reply(claimText(c), { reply_markup: claimButtons(c) });
      await this.setState({
        flow: 'split',
        step: CLAIM,
        context: { ...c, claimMsg: sent.message_id },
      });
    } else if (step === ASSIGN) {
      const items = (c.receipt as Receipt).items;
      // The list gets its own bubble so it can be copied whole, without the instructions
      await ctx.reply(items.map((it, i) => `${i + 1}. ${it.name} ${sgd(it.cents)}`).join('\n'));
      await this.ask(
        ctx,
        'Who had what? Send one line per group of items, then the people:\n\n1,3 Ann\n2 Ann, Bob (shared)\n4 me\n5 all (shared by everyone named)\n\nOr copy the items above, put a name above each group and send it back (a colon after a name is optional):\n\nAnn\n1. …\n\nAll\n2. …\n\nLeave out any item nobody had and I will ask what to do with it. GST and service charge are shared in proportion. "me" is you. If you are the one being paid, your share is not collected; otherwise I send you a QR for it.' +
          (this.receipts.voice
            ? '\n\nYou can also send a voice note: say who had which item.'
            : ''),
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
    await countAll(this.counter, [
      SPLIT_CONFIRMED,
      c.receipt ? SPLIT_TYPE_RECEIPT : c.entries ? SPLIT_TYPE_CUSTOM : SPLIT_TYPE_EQUAL,
      ctx.chat?.type === 'private' ? SPLIT_PLACE_PRIVATE : SPLIT_PLACE_GROUP,
      ...(c.payeeIsMe === false ? [SPLIT_PAYEE_OTHER] : []),
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

    // Mentioned people get their own QR by direct message (or a button to collect it);
    // everyone else is served by the shared chat QRs below
    const isMentioned = (e: SplitEntry) =>
      this.directory !== undefined && (e.username !== undefined || e.userId !== undefined);
    // People who took their QR early already have it: they are not sent another
    const already = (final ?? []).filter((e) => e.sent);
    const mentioned = (final ?? []).filter((e) => isMentioned(e) && !e.sent);

    // Someone else is paid, so the organiser's own amount (their items, or the remainder left
    // out) is theirs to pay: they get a QR for it like everybody else
    let ownJob: { cents: number; lines: string[] } | undefined;
    const selfId = ctx.from?.id;
    if (
      listed &&
      c.payeeIsMe === false &&
      c.leftover !== 'even' &&
      selfId !== undefined &&
      servedOf(c)[String(selfId)] === undefined
    ) {
      const own = c.receipt
        ? ((c.own as OwnShare | undefined)?.cents ?? 0)
        : applyLeftover(listed, total, 'omit').leftoverCents;
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
    if (already.length > 0) {
      await ctx.reply(`Already sent their QR: ${already.map((e) => e.name).join(', ')}.`);
    }

    // One QR per distinct amount (an equal split has exactly one)
    const jobs = final
      ? [
          ...groupByAmount(final.filter((e) => !isMentioned(e) && !e.sent)).map((g) => ({
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
        await countAll(this.counter, [SPLIT_QR_CHAT]);
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
        await countAll(this.counter, [SPLIT_QR_DM]);
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
    await countAll(
      this.counter,
      waiting.map(() => SPLIT_CLAIM_CREATED)
    );
  }

  /**
   * Change the claims through a conditional write: read the state, apply the change to it, write
   * only if nobody wrote since, and apply it again on the newer state otherwise. That keeps
   * simultaneous taps (and the organiser's menu choices) all recorded. `expectMsg` names the
   * message the tap must come from (a stale button is refused); typed text passes none.
   */
  private async mutateClaims(
    ctx: Context,
    expectMsg: ((c: Ctx) => number | undefined) | null,
    change: (c: Ctx, state: ConversationState) => ClaimResult
  ): Promise<
    | { kind: 'ok'; context: Ctx; note: string }
    | { kind: 'refused'; text: string }
    | { kind: 'stale' }
    | { kind: 'busy' }
  > {
    for (let attempt = 0; attempt < MAX_TAP_RETRIES; attempt++) {
      const state = await this.getState();
      const c = state.context;
      if (
        state.flow !== 'split' ||
        state.step !== CLAIM ||
        (expectMsg && ctx.callbackQuery?.message?.message_id !== expectMsg(c))
      ) {
        return { kind: 'stale' };
      }
      const result = change(c, state);
      if ('refuse' in result) return { kind: 'refused', text: result.refuse };
      const status = await this.writeIfRev(
        { flow: 'split', step: CLAIM, context: result.context },
        state.rev ?? 0
      );
      if (status === 409) continue; // another change got in first: apply this one on top of it
      return { kind: 'ok', context: result.context, note: result.note };
    }
    return { kind: 'busy' };
  }

  /** Show the claims on the claim message (not modified or rate limited: the stored claims win). */
  private async refreshClaims(ctx: Context, c: Ctx): Promise<void> {
    if (!ctx.chat || c.claimMsg === undefined) return;
    await ctx.api
      .editMessageText(ctx.chat.id, c.claimMsg as number, claimText(c), {
        reply_markup: claimButtons(c),
      })
      .catch(() => undefined);
  }

  /** Show the organiser's menu with the current state (or its waiting-for-text version). */
  private async refreshMenu(ctx: Context, c: Ctx, organiserId: number): Promise<void> {
    const menu = c.menu as Menu | undefined;
    if (!ctx.chat || !menu) return;
    const view = menuView(c, organiserId);
    await ctx.api
      .editMessageText(ctx.chat.id, menu.msg, view.text, { reply_markup: view.kb })
      .catch(() => undefined);
  }

  /**
   * A member taps an item: claim it, or take their claim back. The organiser's tap opens the
   * menu for that item instead, where they can claim it, give it to someone else or share it.
   */
  private async claimTap(ctx: Context, data: string): Promise<boolean> {
    const index = Number(data.slice('split_claim:'.length));
    const from = ctx.from;
    if (!from) return true;
    const first = await this.getState();
    const c0 = first.context;
    if (
      first.flow === 'split' &&
      first.step === CLAIM &&
      ctx.callbackQuery?.message?.message_id === c0.claimMsg &&
      first.owner?.userId === from.id &&
      (c0.receipt as Receipt).items[index] !== undefined
    ) {
      await ctx.answerCallbackQuery();
      return this.openMenu(ctx, index, c0);
    }
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
   * send them the QR by direct message, or hand them a start link when the bot cannot message them.
   */
  private async qrTap(ctx: Context): Promise<boolean> {
    const from = ctx.from;
    if (!from) return true;
    const r = await this.mutateClaims(
      ctx,
      (c) => c.claimMsg as number | undefined,
      (c, state) => {
        const served = servedOf(c);
        if (served[String(from.id)] !== undefined) {
          return { refuse: 'You already took your QR: check your direct messages.' };
        }
        if (state.owner?.userId === from.id && c.payeeIsMe === true) {
          return { refuse: 'You are the payee, so your own share is not collected.' };
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
        // Nothing could be delivered: give the member their items back
        await this.mutateClaims(ctx, null, (c) => {
          const { [String(from.id)]: _gone, ...rest } = servedOf(c);
          return { context: { ...c, served: rest }, note: '' };
        });
        await ctx.answerCallbackQuery({
          text: 'I could not send the QR. Start a chat with me and tap again.',
          show_alert: true,
        });
      } else if (sent === 'dm') {
        await ctx.answerCallbackQuery({ text: 'Your QR is in your direct messages.' });
      } else {
        await ctx.answerCallbackQuery({ text: 'Open the chat to get your QR.', url: sent.url });
      }
      await this.refreshClaims(ctx, r.context);
    }
    return true;
  }

  /** The QR for a member who took it early: by direct message, else a start link. */
  private async deliverEarly(
    ctx: Context,
    from: { id: number; first_name: string; username?: string },
    cents: number,
    c: Ctx
  ): Promise<'dm' | 'failed' | { url: string }> {
    const receipt = c.receipt as Receipt;
    const description = receipt.merchant
      ? truncateAnsi(receipt.merchant, MAX_DESCRIPTION)
      : undefined;
    const payload = buildPayNowPayload({
      proxyType: c.payeeType as 'mobile' | 'uen',
      proxyValue: c.payeeValue as string,
      amountCents: cents,
      editable: false,
      ...(description ? { description } : {}),
    });
    const own = c.organiserId === from.id;
    const organiser = own ? '' : ((c.organiserName as string | undefined) ?? '');
    const dm = directMessage(organiser, cents, description ?? null);
    try {
      const image = await renderQrPng(payload, dm.lines);
      await ctx.api.sendPhoto(from.id, new InputFile(image, 'paynow-qr.bmp'), {
        caption: dm.caption,
      });
      await countAll(this.counter, [SPLIT_QR_DM]);
      return 'dm';
    } catch {
      // Not started the bot, blocked it, or rate limited: a start link collects it
    }
    if (!this.directory || !this.botUsername || !ctx.chat) return 'failed';
    try {
      const token = newToken();
      const name = claimersOf(c).find((x) => x.id === from.id)?.name ?? from.first_name;
      await this.directory.createClaim({
        token,
        username: from.username?.toLowerCase() ?? null,
        userId: from.id,
        name,
        amountCents: cents,
        description: description ?? null,
        payload,
        organiser,
        chatId: ctx.chat.id,
        expiresAt: newExpiry(),
      });
      await countAll(this.counter, [SPLIT_CLAIM_CREATED]);
      return { url: `https://t.me/${this.botUsername}?start=claim_${token}` };
    } catch {
      return 'failed';
    }
  }

  /** Post the organiser's menu for an item, replacing any earlier one. */
  private async openMenu(ctx: Context, item: number, before: Ctx): Promise<boolean> {
    const organiserId = ctx.from!.id;
    const old = before.menu as Menu | undefined;
    if (old) await ctx.api.deleteMessage(ctx.chat!.id, old.msg).catch(() => undefined);
    // The message id is not known until it is sent, so send, then record it
    const placeholder = { ...before, menu: { item, msg: 0 } };
    const view = menuView(placeholder, organiserId);
    const sent = await ctx.reply(view.text, { reply_markup: view.kb });
    const r = await this.mutateClaims(
      ctx,
      (c) => c.claimMsg as number | undefined,
      (c) => ({ context: { ...c, menu: { item, msg: sent.message_id } }, note: '' })
    );
    if (r.kind !== 'ok')
      await ctx.api.deleteMessage(ctx.chat!.id, sent.message_id).catch(() => undefined);
    return true;
  }

  /** A tap on the organiser's menu (the owner check has already been made). */
  private async menuTap(ctx: Context, data: string): Promise<boolean> {
    const m = /^split_who:(\d+):(-?\d+|[a-z]+\d*)$/.exec(data);
    const organiser = ctx.from;
    if (!m || !organiser) {
      await ctx.answerCallbackQuery();
      return true;
    }
    const item = Number(m[1]);
    const action = m[2]!;
    const stale = (c: Ctx) =>
      (c.menu as Menu | undefined)?.item !== item ? undefined : (c.menu as Menu).msg;

    if (action === 'close') {
      const r = await this.mutateClaims(ctx, stale, (c) => {
        const { menu, ...rest } = c;
        return { context: rest, note: '' };
      });
      await ctx.answerCallbackQuery(
        r.kind === 'stale' ? { text: 'That step is over.' } : undefined
      );
      if (r.kind === 'ok') await ctx.deleteMessage().catch(() => undefined);
      return true;
    }

    const awaiting = action === 'else' ? 'names' : action === 'all' ? 'ways' : undefined;
    const op: ClaimOp | undefined =
      action === 'mine'
        ? { kind: 'toggle', from: organiser }
        : action === 'clear'
          ? { kind: 'clear' }
          : action === 'noways'
            ? { kind: 'ways', n: null }
            : /^w\d+$/.test(action)
              ? { kind: 'ways', n: Number(action.slice(1)) }
              : /^-?\d+$/.test(action)
                ? { kind: 'toggleId', id: Number(action) }
                : undefined;
    const r = await this.mutateClaims(ctx, stale, (c) => {
      const menu = c.menu as Menu;
      if (op) {
        const done = applyClaim(c, item, op);
        if ('refuse' in done) return done;
        return { context: { ...done.context, menu: { item, msg: menu.msg } }, note: done.note };
      }
      // Else, Shared by all and Back only change what the menu is waiting for
      return {
        context: { ...c, menu: { item, msg: menu.msg, ...(awaiting ? { awaiting } : {}) } },
        note: '',
      };
    });
    if (r.kind === 'stale') {
      await ctx.answerCallbackQuery({ text: 'That step is over.' });
    } else if (r.kind === 'busy') {
      await ctx.answerCallbackQuery({ text: 'Busy. Please tap again.' });
    } else if (r.kind === 'refused') {
      await ctx.answerCallbackQuery({ text: r.text, show_alert: true });
    } else {
      await ctx.answerCallbackQuery(r.note ? { text: r.note } : undefined);
      await this.refreshMenu(ctx, r.context, organiser.id);
      if (op) await this.refreshClaims(ctx, r.context);
    }
    return true;
  }

  /** The organiser's typed answer to the menu: names for Someone else, or a number of ways. */
  private async menuText(ctx: Context, text: string, state: ConversationState): Promise<void> {
    const organiser = ctx.from!;
    const menu = state.context.menu as Menu;
    const item = menu.item;
    const mentions = textMentionsOf(ctx.message);
    const r = await this.mutateClaims(ctx, null, (c) => {
      const current = c.menu as Menu | undefined;
      if (!current?.awaiting || current.item !== item) return { refuse: '' };
      let done: ClaimResult;
      if (current.awaiting === 'ways') {
        const n = /^\d+$/.test(text) ? Number(text) : 0;
        if (n < 2 || n > MAX_WAYS) {
          return { refuse: `Send a whole number from 2 to ${MAX_WAYS}.` };
        }
        done = applyClaim(c, item, { kind: 'ways', n });
      } else {
        const typed = resolveTyped(claimersOf(c), text, mentions, {
          id: organiser.id,
          name: claimerName(
            claimersOf(c).map((x) => x.name),
            organiser
          ),
        });
        if (!typed.ok) return { refuse: typed.error };
        done = applyClaim(c, item, { kind: 'add', people: typed.people });
      }
      if ('refuse' in done) return done;
      return { context: { ...done.context, menu: { item, msg: current.msg } }, note: done.note };
    });
    if (r.kind === 'ok') {
      await this.refreshMenu(ctx, r.context, organiser.id);
      await this.refreshClaims(ctx, r.context);
    } else if (r.kind === 'refused') {
      if (r.text) await ctx.reply(r.text);
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

  /** Write the state only if nobody wrote since `rev` was read; the HTTP status says which. */
  private async writeIfRev(
    state: Pick<ConversationState, 'flow' | 'step' | 'context'>,
    rev: number
  ): Promise<number> {
    const response = await this.conversationDO.fetch(
      new Request('http://localhost/state', {
        method: 'POST',
        body: JSON.stringify({ ...state, idleMs: CLAIM_IDLE_MS, ifRev: rev }),
      })
    );
    await response.body?.cancel();
    return response.status;
  }

  private async fetch(path: string, body: unknown) {
    const response = await this.conversationDO.fetch(
      new Request(`http://localhost${path}`, { method: 'POST', body: JSON.stringify(body) })
    );
    await response.body?.cancel();
  }
}
