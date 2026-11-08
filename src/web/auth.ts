/**
 * Telegram Login Widget verification and signed session cookies.
 * Runtime-agnostic (Web Crypto only), so it runs in Pages Functions and in Node tests.
 */

const enc = new TextEncoder();

/** Fields Telegram signs; anything else on the login URL (e.g. our `ref`) is not part of the hash. */
const LOGIN_FIELDS = ['id', 'first_name', 'last_name', 'username', 'photo_url', 'auth_date'];
const LOGIN_MAX_AGE_SEC = 24 * 60 * 60;
export const SESSION_MAX_AGE_SEC = 12 * 60 * 60;

function toHex(bytes: ArrayBuffer): string {
  return [...new Uint8Array(bytes)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

function safeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

async function hmacHex(key: ArrayBuffer | Uint8Array, message: string): Promise<string> {
  const k = await crypto.subtle.importKey('raw', key, { name: 'HMAC', hash: 'SHA-256' }, false, [
    'sign',
  ]);
  return toHex(await crypto.subtle.sign('HMAC', k, enc.encode(message)));
}

/**
 * Verify Login Widget data: HMAC-SHA256 over the sorted `key=value` lines, keyed with
 * SHA256(bot token), and no older than a day. Returns the Telegram user id or null.
 */
export async function verifyTelegramLogin(
  params: URLSearchParams,
  botToken: string,
  nowSec: number = Math.floor(Date.now() / 1000)
): Promise<number | null> {
  const hash = params.get('hash');
  if (!hash) return null;

  const check = LOGIN_FIELDS.filter((f) => params.has(f))
    .sort()
    .map((f) => `${f}=${params.get(f)}`)
    .join('\n');
  const secret = await crypto.subtle.digest('SHA-256', enc.encode(botToken));
  if (!safeEqual(await hmacHex(secret, check), hash.toLowerCase())) return null;

  const authDate = Number(params.get('auth_date'));
  if (
    !Number.isFinite(authDate) ||
    nowSec - authDate > LOGIN_MAX_AGE_SEC ||
    authDate > nowSec + 60
  ) {
    return null;
  }
  const id = Number(params.get('id'));
  return Number.isSafeInteger(id) && id > 0 ? id : null;
}

/** `userId.expiryMs.signature` */
export async function signSession(
  userId: number,
  secret: string,
  nowMs: number = Date.now()
): Promise<string> {
  const body = `${userId}.${nowMs + SESSION_MAX_AGE_SEC * 1000}`;
  return `${body}.${await hmacHex(enc.encode(secret), body)}`;
}

export async function verifySession(
  value: string | undefined,
  secret: string,
  nowMs: number = Date.now()
): Promise<number | null> {
  const parts = value?.split('.');
  if (!parts || parts.length !== 3) return null;
  const [id, expiry, sig] = parts as [string, string, string];
  if (!safeEqual(await hmacHex(enc.encode(secret), `${id}.${expiry}`), sig)) return null;
  if (Number(expiry) <= nowMs) return null;
  const userId = Number(id);
  return Number.isSafeInteger(userId) && userId > 0 ? userId : null;
}
