import { formatCents, MAX_CENTS, parseAmount } from '../sgqr/amount';
import type { SplitEntry } from './split-math';

/** One line of a receipt, price in cents (the line total, not a unit price). */
export interface ReceiptItem {
  name: string;
  cents: number;
}

export interface Receipt {
  merchant?: string;
  items: ReceiptItem[];
  serviceCents: number;
  gstCents: number;
  discountCents: number;
  totalCents: number;
  subtotalCents?: number;
  /** Lines the model returned that could not be read (kept so the warning survives edits). */
  skipped?: number;
}

export type ScanResult =
  | { ok: true; receipt: Receipt; warnings: string[] }
  | { ok: false; error: string };

export const MAX_ITEMS = 40;
const MAX_NAME = 30;

/** A price the model returned (number or "12.50" / "$12.50") as integer cents, or null. */
function toCents(value: unknown): number | null {
  const n =
    typeof value === 'number'
      ? value
      : typeof value === 'string'
        ? Number(value.replace(/[^\d.-]/g, ''))
        : Number.NaN;
  if (!Number.isFinite(n) || n < 0) return null;
  const cents = Math.round(n * 100);
  return cents <= MAX_CENTS ? cents : null;
}

// biome-ignore lint/suspicious/noControlCharactersInRegex: stripping control characters is the point
const CONTROL = /[\u0000-\u001f\u007f]/g;
const clean = (v: unknown, max: number) =>
  typeof v === 'string' ? v.replace(CONTROL, ' ').replace(/\s+/g, ' ').trim().slice(0, max) : '';

const sumItems = (r: Receipt) => r.items.reduce((s, i) => s + i.cents, 0);

/**
 * How much the items fall short of what they should add up to, or 0. The expected amount is the
 * printed subtotal or, without one, the total minus service charge and GST plus any discount (only
 * when a charge was read, because otherwise a gap cannot be told apart from charges). Two cents of
 * rounding is ignored; items above the expected amount are not a shortfall.
 */
export function missingCents(r: Receipt): number {
  const expected =
    r.subtotalCents ??
    (r.serviceCents > 0 || r.gstCents > 0
      ? r.totalCents - r.serviceCents - r.gstCents + r.discountCents
      : undefined);
  if (expected === undefined) return 0;
  const gap = expected - sumItems(r);
  return gap > 2 ? gap : 0;
}

/** What the user is told about a scan; worked out again whenever items are added. */
export function receiptWarnings(r: Receipt): string[] {
  const warnings: string[] = [];
  if (r.skipped) warnings.push(`I skipped ${r.skipped} line(s) I could not read.`);
  const sum = sumItems(r);
  const missing = missingCents(r);
  if (sum > r.totalCents) {
    warnings.push('The items add up to more than the total, so something was misread.');
  }
  if (missing > 0) {
    warnings.push(
      `The items add up to SGD ${formatCents(sum)} but ${r.subtotalCents !== undefined ? `the subtotal is SGD ${formatCents(r.subtotalCents)}` : 'they should come to more'}: SGD ${formatCents(missing)} looks missing.`
    );
  } else if (r.subtotalCents && Math.abs(sum - r.subtotalCents) > 2) {
    warnings.push('The items do not add up to the subtotal printed on the receipt.');
  }
  if (
    r.subtotalCents &&
    Math.abs(r.subtotalCents + r.serviceCents + r.gstCents - r.discountCents - r.totalCents) > 5
  ) {
    warnings.push('The subtotal, charges and total on the receipt do not add up.');
  }
  return warnings;
}

export type AddedItems = { ok: true; items: ReceiptItem[] } | { ok: false; error: string };

/**
 * Items the user types for what the scan missed: one per line, a name then a price
 * ("Sapporo Black 9.50"). `existing` is how many items the receipt already has (for numbering and
 * the 40-item cap). The first bad line is named and nothing is added.
 */
export function parseAddedItems(text: string, existing: number): AddedItems {
  const lines = text
    .split('\n')
    .map((l) => l.trim())
    .filter(Boolean);
  if (lines.length === 0) return { ok: false, error: 'Send at least one item.' };
  if (existing + lines.length > MAX_ITEMS) {
    return { ok: false, error: `A receipt can have at most ${MAX_ITEMS} items.` };
  }
  const items: ReceiptItem[] = [];
  for (const line of lines) {
    const m = /^(.*?)\s*(\S+)$/.exec(line);
    const cents = m ? parseAmount(m[2]!.replace(/^\$/, '')) : null;
    if (!m || cents === null || cents > MAX_CENTS) {
      return {
        ok: false,
        error: `"${line}" needs a price, for example Sapporo Black 9.50. Send the items again.`,
      };
    }
    items.push({ name: clean(m[1], MAX_NAME) || `Item ${existing + items.length + 1}`, cents });
  }
  return { ok: true, items };
}

/**
 * Turn what the vision model returned into a receipt. The model is not trusted: anything that is
 * not a sane number is dropped or refused, names are cleaned, and odd totals produce warnings
 * that the user sees before the scan is used.
 */
export function parseScan(raw: unknown): ScanResult {
  if (typeof raw !== 'object' || raw === null) {
    return { ok: false, error: 'I could not read that receipt.' };
  }
  const r = raw as Record<string, unknown>;
  const totalCents = toCents(r.total);
  if (totalCents === null || totalCents === 0) {
    return { ok: false, error: 'I could not find a total on that receipt.' };
  }
  const items: ReceiptItem[] = [];
  let skipped = 0;
  for (const it of Array.isArray(r.items) ? r.items : []) {
    const o = (typeof it === 'object' && it !== null ? it : {}) as Record<string, unknown>;
    const cents = toCents(o.price);
    if (cents === null || cents === 0) {
      skipped++;
      continue;
    }
    items.push({ name: clean(o.name, MAX_NAME) || `Item ${items.length + 1}`, cents });
  }
  if (items.length === 0)
    return { ok: false, error: 'I could not read any items on that receipt.' };
  if (items.length > MAX_ITEMS) {
    return { ok: false, error: `That receipt has more than ${MAX_ITEMS} items.` };
  }

  const merchant = clean(r.merchant, MAX_NAME);
  const subtotal = toCents(r.subtotal);
  const receipt: Receipt = {
    ...(merchant ? { merchant } : {}),
    items,
    serviceCents: toCents(r.serviceCharge) ?? 0,
    gstCents: toCents(r.gst) ?? 0,
    discountCents: toCents(r.discount) ?? 0,
    totalCents,
    ...(subtotal ? { subtotalCents: subtotal } : {}),
  };
  if (skipped > 0) receipt.skipped = skipped;
  return { ok: true, receipt, warnings: receiptWarnings(receipt) };
}

/** A person in the assignment: a name, an @username, a picked mention, or the organiser. */
export interface Person {
  name: string;
  username?: string;
  userId?: number;
  isMe: boolean;
}

export type Assignment =
  | {
      ok: true;
      people: Person[];
      items: number[][]; // items[i] = indices into people; empty when nobody was given item i
      unassigned: number[]; // zero-based indexes of the items nobody was given
    }
  | { ok: false; error: string };

export type AssignedOk = Extract<Assignment, { ok: true }>;

const USERNAME = /^@([A-Za-z][A-Za-z0-9_]{4,31})$/;
const MAX_PEOPLE = 20;
const ITEM_LINE = /^(\d+)[.)]\s/;

/**
 * "1,3 Ann", "2 Ann, Bob", "4 me", "5 all": item numbers (or ranges), then comma-separated people.
 * `me` is the organiser, `all` is everyone named in the message. An item may not be given twice;
 * items given to nobody are returned in `unassigned` for the caller to settle.
 */
export function parseAssignments(
  text: string,
  itemCount: number,
  textMentions?: Map<string, number>
): Assignment {
  const people: Person[] = [];
  const indexOf = (p: Omit<Person, 'name'> & { name: string }) => {
    const key = p.name.toLowerCase();
    let i = people.findIndex((x) => x.name.toLowerCase() === key);
    if (i < 0) i = people.push(p) - 1;
    return i;
  };
  const lines: Array<{ items: number[]; who: Array<number | 'all'> }> = [];

  // Names (me, all, @mention or plain) to people; a string is an error message
  const resolve = (names: string[]): Array<number | 'all'> | string => {
    const who: Array<number | 'all'> = [];
    for (const name of names) {
      const lower = name.toLowerCase();
      if (lower === 'all') who.push('all');
      else if (lower === 'me') who.push(indexOf({ name: 'me', isMe: true }));
      else {
        const username = USERNAME.exec(name)?.[1]?.toLowerCase();
        const userId = textMentions?.get(name);
        const mention = username !== undefined || userId !== undefined;
        if (name.length > (mention ? 33 : 20)) return `"${name}" is too long for a name.`;
        who.push(
          indexOf({
            name,
            isMe: false,
            ...(username !== undefined ? { username } : {}),
            ...(userId !== undefined ? { userId } : {}),
          })
        );
      }
    }
    return who;
  };
  // A trailing note in brackets ("Bob (shared)", "all (shared by everyone named)", as the prompt
  // shows it) is not part of the name
  const splitNames = (s: string) =>
    s
      .split(',')
      .map((x) => x.replace(/\s*\([^)]*\)$/, '').trim())
      .filter(Boolean);

  // Header format: a line naming people, then item lines ("1. Pizza SGD 18.80") copied from the list
  const rows = text
    .split('\n')
    .map((r) => r.trim())
    .filter(Boolean);
  const headerFormat = rows.some((r) => ITEM_LINE.test(r) || !/^\d/.test(r));
  if (headerFormat) {
    let who: Array<number | 'all'> | undefined;
    for (const row of rows) {
      const item = ITEM_LINE.exec(row);
      if (item) {
        if (!who) {
          return {
            ok: false,
            error: `"${row}" comes before any name. Put a name above the items.`,
          };
        }
        lines.push({ items: [Number(item[1])], who });
        continue;
      }
      const names = splitNames(row.replace(/:$/, ''));
      if (names.length === 0 || /^\d/.test(row)) {
        return { ok: false, error: `"${row}" must be a name or an item from the list.` };
      }
      const r = resolve(names);
      if (typeof r === 'string') return { ok: false, error: r };
      who = r;
    }
    if (lines.length === 0) {
      return {
        ok: false,
        error: `"${rows[0]}" must start with item numbers (for example 1,3 Ann).`,
      };
    }
  } else {
    for (const line of rows) {
      let rest = line;
      const items: number[] = [];
      for (;;) {
        const m = /^(\d+)(?:-(\d+))?(?:\s*,\s*|\s+|$)/.exec(rest);
        if (!m) break;
        const from = Number(m[1]);
        const to = m[2] ? Number(m[2]) : from;
        if (to < from)
          return { ok: false, error: `"${line}": the range ${from}-${to} is backwards.` };
        for (let n = from; n <= to; n++) items.push(n);
        rest = rest.slice(m[0].length);
      }
      if (items.length === 0) {
        return {
          ok: false,
          error: `"${line}" must start with item numbers (for example 1,3 Ann).`,
        };
      }
      const names = splitNames(rest);
      if (names.length === 0)
        return { ok: false, error: `"${line}" has no people after the item numbers.` };
      const who = resolve(names);
      if (typeof who === 'string') return { ok: false, error: who };
      lines.push({ items, who });
    }
  }
  if (lines.length === 0) return { ok: false, error: 'The message is empty.' };
  if (people.length === 0) return { ok: false, error: '"all" needs people named in other lines.' };
  if (people.filter((p) => !p.isMe).length > MAX_PEOPLE) {
    return { ok: false, error: `The limit is ${MAX_PEOPLE} people.` };
  }

  const assigned: number[][] = Array.from({ length: itemCount }, () => []);
  const seen = new Set<number>();
  for (const l of lines) {
    const sharers = [
      ...new Set(l.who.flatMap((w) => (w === 'all' ? people.map((_, i) => i) : [w]))),
    ];
    for (const n of l.items) {
      if (n < 1 || n > itemCount) return { ok: false, error: `There is no item ${n}.` };
      if (seen.has(n) && !headerFormat) {
        return { ok: false, error: `Item ${n} is listed twice.` };
      }
      seen.add(n);
      assigned[n - 1] = [...new Set([...(assigned[n - 1] ?? []), ...sharers])];
    }
  }
  const unassigned = assigned.flatMap((a, i) => (a.length === 0 ? [i] : []));
  return { ok: true, people, items: assigned, unassigned };
}

/** Someone who tapped an item in a group: a Telegram account and the name shown for them. */
export interface Claimer {
  id: number;
  name: string;
  username?: string;
}

export const MAX_CLAIMERS = 20;

/**
 * The name shown for a new claimer: the first name; when another claimer already shows it, add
 * the last initial, then the @username, then a number. Fixed once chosen, so names never change
 * under the others.
 */
export function claimerName(
  taken: string[],
  from: { first_name: string; last_name?: string; username?: string }
): string {
  const used = new Set(taken.map((t) => t.toLowerCase()));
  const base = from.first_name.trim().slice(0, 20) || 'Someone';
  const last = from.last_name?.trim()[0];
  const tries = [
    base,
    ...(last ? [`${base} ${last.toUpperCase()}.`] : []),
    ...(from.username ? [`@${from.username}`] : []),
  ];
  for (const t of tries) if (!used.has(t.toLowerCase())) return t;
  for (let n = 2; ; n++) if (!used.has(`${base} ${n}`.toLowerCase())) return `${base} ${n}`;
}

/**
 * Items shared N ways become N share lines (the item's cents split as evenly as possible, odd
 * cents on the first shares). `first[i]` is the index of item i's first line.
 */
export function expandShares(
  items: ReceiptItem[],
  ways: Record<string, number> = {}
): { lines: ReceiptItem[]; first: number[] } {
  const lines: ReceiptItem[] = [];
  const first: number[] = [];
  items.forEach((item, i) => {
    first.push(lines.length);
    const n = ways[String(i)];
    if (!n) {
      lines.push(item);
      return;
    }
    const base = Math.floor(item.cents / n);
    const odd = item.cents - base * n;
    for (let k = 0; k < n; k++) {
      lines.push({
        name: `${item.name} (share ${k + 1} of ${n})`,
        cents: base + (k < odd ? 1 : 0),
      });
    }
  });
  return { lines, first };
}

/**
 * The assignment a group's claims make, in the same shape the typed parser returns, plus the
 * lines it refers to (the items, with N-way items turned into share lines). `claims[i]` holds the
 * ids of the people who claimed item i (zero-based); the organiser is `me`, everyone else keeps
 * their user id (when they have one) so the QR can be sent to them directly. Each holder of an
 * item shared N ways takes one share; shares nobody holds are unassigned.
 */
export function assignmentFromClaims(
  items: ReceiptItem[],
  claims: Record<string, number[]>,
  claimers: Claimer[],
  organiserId: number,
  ways: Record<string, number> = {}
): AssignedOk & { lines: ReceiptItem[] } {
  const people: Person[] = claimers.map((c) =>
    c.id === organiserId
      ? { name: 'me', isMe: true }
      : {
          name: c.name,
          isMe: false,
          ...(c.id > 0 ? { userId: c.id } : {}),
          ...(c.username ? { username: c.username.toLowerCase() } : {}),
        }
  );
  const { lines, first } = expandShares(items, ways);
  const assigned: number[][] = lines.map(() => []);
  items.forEach((_, i) => {
    const holders = (claims[String(i)] ?? [])
      .map((id) => claimers.findIndex((c) => c.id === id))
      .filter((p) => p >= 0);
    const n = ways[String(i)];
    if (n) {
      for (const [k, p] of holders.slice(0, n).entries()) assigned[first[i]! + k] = [p];
    } else {
      assigned[first[i]!] = holders;
    }
  });
  const unassigned = assigned.flatMap((a, i) => (a.length === 0 ? [i] : []));
  return { ok: true, people, items: assigned, unassigned, lines };
}

/**
 * The people a typed message names, for the organiser to add to an item: `me`, a person picked
 * from the member list, an @username or a plain name. Anyone already among the claimers is
 * reused; new people without a Telegram id get a negative id so they never clash with one.
 */
export function resolveTyped(
  existing: Claimer[],
  text: string,
  textMentions: Map<string, number> | undefined,
  organiser: { id: number; name: string }
): { ok: true; people: Claimer[] } | { ok: false; error: string } {
  const names = text
    .split(',')
    .map((x) => x.trim())
    .filter(Boolean);
  if (names.length === 0) return { ok: false, error: 'Send at least one name.' };
  const known = [...existing];
  let next = Math.min(0, ...known.map((c) => c.id)) - 1;
  const people: Claimer[] = [];
  const take = (c: Claimer) => {
    if (!known.some((k) => k.id === c.id)) known.push(c);
    if (!people.some((p) => p.id === c.id)) people.push(known.find((k) => k.id === c.id)!);
  };
  for (const name of names) {
    const lower = name.toLowerCase();
    const username = USERNAME.exec(name)?.[1]?.toLowerCase();
    const userId = textMentions?.get(name);
    if (lower === 'me') {
      take(known.find((k) => k.id === organiser.id) ?? { id: organiser.id, name: organiser.name });
    } else if (userId !== undefined) {
      take(known.find((k) => k.id === userId) ?? { id: userId, name });
    } else if (username !== undefined) {
      take(
        known.find((k) => k.username?.toLowerCase() === username) ?? {
          id: next--,
          name,
          username,
        }
      );
    } else {
      if (name.length > 20) return { ok: false, error: `"${name}" is too long for a name.` };
      take(known.find((k) => k.name.toLowerCase() === lower) ?? { id: next--, name });
    }
  }
  return { ok: true, people };
}

/**
 * One member's amount now, from the claims so far: their items (each item split equally between
 * its holders, odd cents to the first; an item shared N ways costs the holder one share) plus
 * their share of what the receipt total adds on top of the items, in proportion to the receipt's
 * total of all items and rounded down, so it does not depend on what anyone else claims.
 */
export function memberAmount(
  items: ReceiptItem[],
  claims: Record<string, number[]>,
  ways: Record<string, number>,
  memberId: number,
  totalCents: number
): { itemsCents: number; extrasCents: number; cents: number } {
  const { lines, first } = expandShares(items, ways);
  let itemsCents = 0;
  items.forEach((item, i) => {
    const holders = claims[String(i)] ?? [];
    const k = holders.indexOf(memberId);
    if (k < 0) return;
    if (ways[String(i)]) {
      itemsCents += lines[first[i]! + k]?.cents ?? 0;
    } else {
      const base = Math.floor(item.cents / holders.length);
      itemsCents += base + (k < item.cents - base * holders.length ? 1 : 0);
    }
  });
  const allItems = items.reduce((t, it) => t + it.cents, 0);
  const extrasCents =
    allItems === 0 ? 0 : Math.floor(((totalCents - allItems) * itemsCents) / allItems);
  return { itemsCents, extrasCents, cents: itemsCents + extrasCents };
}

/**
 * Give the unassigned items to somebody: `me` makes the organiser carry them (counted, not
 * collected); `even` shares each one equally between everyone named in the message.
 */
export function applyUnassigned(
  a: AssignedOk,
  choice: 'me' | 'even',
  locked: ReadonlySet<number> = new Set()
): AssignedOk {
  if (a.unassigned.length === 0) return a;
  const people = [...a.people];
  let who: number[];
  if (choice === 'me') {
    let me = people.findIndex((p) => p.isMe);
    if (me < 0) me = people.push({ name: 'me', isMe: true }) - 1;
    who = [me];
  } else {
    // Sharing evenly leaves out people whose amount is already fixed
    who = people.map((_, i) => i).filter((i) => !locked.has(i));
  }
  const items = a.items.map((sharers, i) => (a.unassigned.includes(i) ? who : sharers));
  return { ok: true, people, items, unassigned: [] };
}

export interface PersonShare {
  person: Person;
  itemsCents: number;
  extrasCents: number;
  cents: number;
}

/**
 * Each item is split equally between its people (odd cents to the first listed); whatever the
 * receipt total adds on top of the items (service charge, GST, rounding, minus any discount) is
 * shared in proportion to each person's items, by largest remainder, so every amount, the
 * organiser's included, adds up exactly to the receipt total.
 */
export function shareReceipt(
  items: ReceiptItem[],
  assignment: AssignedOk,
  totalCents: number,
  locked: ReadonlySet<number> = new Set()
): { shares: PersonShare[]; extrasCents: number } {
  const { people } = assignment;
  const sub = people.map(() => 0);
  items.forEach((item, i) => {
    const sharers = assignment.items[i]!;
    const base = Math.floor(item.cents / sharers.length);
    const odd = item.cents - base * sharers.length;
    sharers.forEach((p, j) => {
      sub[p]! += base + (j < odd ? 1 : 0);
    });
  });
  const itemsTotal = sub.reduce((s, c) => s + c, 0);
  const extras = totalCents - itemsTotal;
  const floors = sub.map((c) => Math.floor((extras * c) / itemsTotal));
  const rems = sub.map((c, i) => extras * c - floors[i]! * itemsTotal);
  let left = extras - floors.reduce((s, c) => s + c, 0);
  // Someone whose amount is fixed (they already hold a QR) gets the floor only; the cents the
  // rounding leaves over go to the others, and to the organiser's own remainder when nobody is left
  const order = people
    .map((_, i) => i)
    .filter((i) => !locked.has(i))
    .sort((a, b) => rems[b]! - rems[a]! || a - b);
  const bonus = people.map(() => 0);
  for (let k = 0; left > 0 && order.length > 0; k++, left--) bonus[order[k % order.length]!]!++;
  return {
    extrasCents: extras,
    shares: people.map((person, i) => {
      const extrasCents = floors[i]! + bonus[i]!;
      return { person, itemsCents: sub[i]!, extrasCents, cents: sub[i]! + extrasCents };
    }),
  };
}

/** The shares as custom-split entries: everyone but the organiser, nobody who owes nothing. */
export function toEntries(
  shares: PersonShare[],
  locked: ReadonlySet<number> = new Set()
): SplitEntry[] {
  return shares.flatMap((s, i) =>
    s.person.isMe || s.cents <= 0
      ? []
      : [
          {
            name: s.person.name,
            cents: s.cents,
            ...(s.person.username !== undefined ? { username: s.person.username } : {}),
            ...(s.person.userId !== undefined ? { userId: s.person.userId } : {}),
            // Already sent their QR when they took it early
            ...(locked.has(i) ? { sent: true } : {}),
          },
        ]
  );
}
