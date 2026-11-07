/** Escape legacy-Markdown specials so user-typed names can't break parse_mode: 'Markdown'. */
export function escapeMarkdown(text: string): string {
  return text.replace(/[_*`[]/g, '\\$&');
}

/** "Alice (+6591234568)" or just the proxy when no name was given. Markdown-safe. */
export function payerLabel(name: string | null | undefined, value: string): string {
  return name ? `${escapeMarkdown(name)} (${value})` : value;
}
