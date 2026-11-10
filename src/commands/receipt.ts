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
}

export type ScanResult =
  | { ok: true; receipt: Receipt; warnings: string[] }
  | { ok: false; error: string };

const MAX_ITEMS = 40;
const MAX_NAME = 30;
const MAX_CENTS = 10_000_000; // SGD 100,000: anything above is a misread

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
  const warnings: string[] = [];
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
  if (skipped > 0) warnings.push(`I skipped ${skipped} line(s) I could not read.`);

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
  const sum = items.reduce((s, i) => s + i.cents, 0);
  if (sum > totalCents) {
    warnings.push('The items add up to more than the total, so something was misread.');
  }
  if (subtotal && Math.abs(sum - subtotal) > 2) {
    warnings.push('The items do not add up to the subtotal printed on the receipt.');
  }
  if (
    subtotal &&
    Math.abs(
      subtotal + receipt.serviceCents + receipt.gstCents - receipt.discountCents - totalCents
    ) > 5
  ) {
    warnings.push('The subtotal, charges and total on the receipt do not add up.');
  }
  return { ok: true, receipt, warnings };
}

/** A person in the assignment: a name, an @username, a picked mention, or the organiser. */
export interface Person {
  name: string;
  username?: string;
  userId?: number;
  isMe: boolean;
}

export type Assignment =
  | { ok: true; people: Person[]; items: number[][] } // items[i] = indices into people
  | { ok: false; error: string };

const USERNAME = /^@([A-Za-z][A-Za-z0-9_]{4,31})$/;
const MAX_PEOPLE = 20;

/**
 * "1,3 Ann", "2 Ann, Bob", "4 me", "5 all": item numbers (or ranges), then comma-separated people.
 * `me` is the organiser, `all` is everyone named in the message. Every item exactly once.
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

  for (const raw of text.split('\n')) {
    const line = raw.trim();
    if (!line) continue;
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
      return { ok: false, error: `"${line}" must start with item numbers (for example 1,3 Ann).` };
    }
    const names = rest
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean);
    if (names.length === 0)
      return { ok: false, error: `"${line}" has no people after the item numbers.` };
    const who: Array<number | 'all'> = [];
    for (const name of names) {
      const lower = name.toLowerCase();
      if (lower === 'all') who.push('all');
      else if (lower === 'me') who.push(indexOf({ name: 'me', isMe: true }));
      else {
        const username = USERNAME.exec(name)?.[1]?.toLowerCase();
        const userId = textMentions?.get(name);
        const mention = username !== undefined || userId !== undefined;
        if (name.length > (mention ? 33 : 20)) {
          return { ok: false, error: `"${name}" is too long for a name.` };
        }
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
    lines.push({ items, who });
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
      if (seen.has(n)) return { ok: false, error: `Item ${n} is listed twice.` };
      seen.add(n);
      assigned[n - 1] = sharers;
    }
  }
  const missing = assigned.map((a, i) => (a.length === 0 ? i + 1 : 0)).filter(Boolean);
  if (missing.length > 0) {
    return {
      ok: false,
      error: `Item ${missing.join(', ')} ${missing.length > 1 ? 'have' : 'has'} nobody.`,
    };
  }
  return { ok: true, people, items: assigned };
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
  assignment: Extract<Assignment, { ok: true }>,
  totalCents: number
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
  const order = people.map((_, i) => i).sort((a, b) => rems[b]! - rems[a]! || a - b);
  const bonus = people.map(() => 0);
  for (const i of order) {
    if (left <= 0) break;
    bonus[i] = 1;
    left--;
  }
  return {
    extrasCents: extras,
    shares: people.map((person, i) => {
      const extrasCents = floors[i]! + bonus[i]!;
      return { person, itemsCents: sub[i]!, extrasCents, cents: sub[i]! + extrasCents };
    }),
  };
}

/** The shares as custom-split entries: everyone but the organiser, nobody who owes nothing. */
export function toEntries(shares: PersonShare[]): SplitEntry[] {
  return shares
    .filter((s) => !s.person.isMe && s.cents > 0)
    .map((s) => ({
      name: s.person.name,
      cents: s.cents,
      ...(s.person.username !== undefined ? { username: s.person.username } : {}),
      ...(s.person.userId !== undefined ? { userId: s.person.userId } : {}),
    }));
}
