/** Escape legacy-Markdown specials so user-typed names can't break parse_mode: 'Markdown'. */
export function escapeMarkdown(text: string): string {
  return text.replace(/[_*`[]/g, '\\$&');
}

/** "Alice (+6591234568)" or just the proxy when no name was given. Markdown-safe. */
export function payerLabel(name: string | null | undefined, value: string): string {
  return name ? `${escapeMarkdown(name)} (${value})` : value;
}

/** Same as {@link payerLabel} for plain-text messages (no parse_mode): nothing is escaped. */
export function plainPayerLabel(name: string | null | undefined, value: string): string {
  return name ? `${name} (${value})` : value;
}

/**
 * A payback recipient only has a known name when it is the payment's stored payer
 * (paybacks don't store names): match by proxy value.
 */
export function recipientName(
  storedValue: string | null | undefined,
  storedName: string | null | undefined,
  proxy: string
): string | null {
  return storedValue && storedValue === proxy ? (storedName ?? null) : null;
}

/**
 * Caption segment such as "Payer: Alice" / "To: Alice"; empty when there is no name so a
 * caption stays byte-identical to the pre-name format. Captions are plain text and name-only
 * (they get forwarded — never put the PayNow number in one).
 */
export function captionPart(prefix: 'Payer' | 'To', name: string | null | undefined): string[] {
  return name ? [`${prefix}: ${name}`] : [];
}
