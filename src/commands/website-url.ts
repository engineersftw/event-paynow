/** Longest website address accepted for an event. */
const MAX_LENGTH = 200;

/**
 * Turns what a user typed into a stored website address, or null when it is not acceptable.
 * Accepts only http and https addresses (so `javascript:`, `data:`, `mailto:` and `ftp:` are out) with
 * a host that contains a dot, no username or password, no spaces and at most 200 characters. An
 * address without a scheme gets `https://`. The result is the parsed form (host lowercased).
 */
export function normalizeWebsiteUrl(input: string): string | null {
  const text = input.trim();
  if (!text || text.length > MAX_LENGTH || /\s/.test(text)) return null;

  // Anything that starts with `scheme:` is taken as written (so javascript:alert(1) is seen as a scheme);
  // `host:port/...` is not a scheme, so a bare address with a port still gets https://
  const hasScheme = /^[a-z][a-z0-9+.-]*:(?!\d+(?:[/?#]|$))/i.test(text);
  let url: URL;
  try {
    url = new URL(hasScheme ? text : `https://${text}`);
  } catch {
    return null;
  }

  if (url.protocol !== 'http:' && url.protocol !== 'https:') return null;
  if (url.username || url.password) return null;
  if (!url.hostname.includes('.')) return null;
  if (url.href.length > MAX_LENGTH) return null;
  return url.href;
}
