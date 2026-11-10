import { parseAmount } from '../sgqr/amount';

/** Bounds for the number of people sharing a bill. */
export const MIN_PEOPLE = 2;
export const MAX_PEOPLE = 100;

/** A whole number of people, 2 to 100, and no more than the cents in the bill (a share is at least 1 cent). */
export function parsePeople(input: string, totalCents: number): number | null {
  const text = input.trim();
  if (!/^\d{1,3}$/.test(text)) return null;
  const n = Number(text);
  return n >= MIN_PEOPLE && n <= MAX_PEOPLE && n <= totalCents ? n : null;
}

/** One share rounded up to a whole cent (integers only), so the payer is never short. */
export function splitEqually(totalCents: number, people: number) {
  const shareCents = Math.ceil(totalCents / people);
  const collectedCents = shareCents * people;
  return { shareCents, collectedCents, overCents: collectedCents - totalCents };
}

/** One person in a custom split and what they owe, in cents. */
export interface SplitEntry {
  name: string;
  cents: number;
  /** Lowercase Telegram username (no @) when the person was mentioned as @username. */
  username?: string;
  /** Telegram user id when the person was picked from the member list (a text mention). */
  userId?: number;
}

export const MAX_CUSTOM_PEOPLE = 20;
export const MAX_NAME_LENGTH = 20;
/** A mention is not subject to the plain-name limit; a Telegram username is at most 32 characters. */
export const MAX_MENTION_LENGTH = 33;
const USERNAME_MENTION = /^@([A-Za-z][A-Za-z0-9_]{4,31})$/;

export type CustomList = { ok: true; entries: SplitEntry[] } | { ok: false; error: string };

/**
 * A custom list: one person per line, a name then an amount (`Ann 40`, `Mary Ann 12.50`).
 * 1 to 20 people, names of 1 to 20 characters and unique ignoring case; the first bad line is named.
 */
export function parseCustomList(text: string, textMentions?: Map<string, number>): CustomList {
  const lines = text
    .split('\n')
    .map((l) => l.trim())
    .filter(Boolean);
  if (lines.length === 0) return { ok: false, error: 'The list is empty.' };
  if (lines.length > MAX_CUSTOM_PEOPLE) {
    return { ok: false, error: `The limit is ${MAX_CUSTOM_PEOPLE} people.` };
  }
  const entries: SplitEntry[] = [];
  const seen = new Set<string>();
  for (const line of lines) {
    const m = /^(.*\S)\s+(\S+)$/.exec(line);
    const cents = m ? parseAmount(m[2]!) : null;
    if (!m || cents === null) {
      return {
        ok: false,
        error: `"${line}" needs a name and then a positive amount (e.g. Ann 40).`,
      };
    }
    const name = m[1]!;
    const username = USERNAME_MENTION.exec(name)?.[1]?.toLowerCase();
    const userId = textMentions?.get(name);
    const mention = username !== undefined || userId !== undefined;
    if (name.length > (mention ? MAX_MENTION_LENGTH : MAX_NAME_LENGTH)) {
      return { ok: false, error: `"${name}" is longer than ${MAX_NAME_LENGTH} characters.` };
    }
    if (seen.has(name.toLowerCase())) return { ok: false, error: `"${name}" is listed twice.` };
    seen.add(name.toLowerCase());
    entries.push({
      name,
      cents,
      ...(username !== undefined ? { username } : {}),
      ...(userId !== undefined ? { userId } : {}),
    });
  }
  return { ok: true, entries };
}

export const sumCents = (entries: SplitEntry[]) => entries.reduce((s, e) => s + e.cents, 0);

/**
 * Final amounts for a custom split. `even` adds the leftover to everyone, each share rounded up so
 * the organiser is never short; `omit` leaves it with the organiser. Integers only.
 */
export function applyLeftover(entries: SplitEntry[], totalCents: number, mode: 'even' | 'omit') {
  const leftoverCents = Math.max(0, totalCents - sumCents(entries));
  const extraCents = mode === 'even' ? Math.ceil(leftoverCents / entries.length) : 0;
  const final = entries.map((e) => ({ ...e, cents: e.cents + extraCents }));
  return {
    entries: final,
    leftoverCents,
    extraCents,
    overCents: Math.max(0, sumCents(final) - totalCents),
  };
}

/** Distinct amounts with the names that owe each, in first-appearance order. */
export function groupByAmount(entries: SplitEntry[]) {
  const groups = new Map<number, string[]>();
  for (const e of entries) groups.set(e.cents, [...(groups.get(e.cents) ?? []), e.name]);
  return [...groups].map(([cents, names]) => ({ cents, names }));
}
