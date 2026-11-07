/**
 * Parse a decimal amount string to integer cents.
 * Accepts: positive numbers with up to 2 decimal places.
 * Rejects: negative, zero, more than 2 decimals, non-numeric.
 *
 * @returns integer cents, or null if invalid.
 */
export function parseAmount(input: string): number | null {
  if (!input || typeof input !== "string") return null;

  const trimmed = input.trim();
  if (!trimmed) return null;

  // Must be a valid decimal number
  if (!/^\d+(\.\d{1,2})?$/.test(trimmed)) return null;

  const num = parseFloat(trimmed);
  if (!isFinite(num) || num <= 0) return null;

  // Convert to cents with rounding to avoid floating-point issues
  return Math.round(num * 100);
}

/**
 * Format integer cents to a 2-decimal string (e.g. 1250 → "12.50").
 */
export function formatCents(cents: number): string {
  if (!Number.isInteger(cents) || cents < 0) {
    throw new Error(`Invalid cents: ${cents}`);
  }
  return (cents / 100).toFixed(2);
}
