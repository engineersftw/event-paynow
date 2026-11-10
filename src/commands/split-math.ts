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
