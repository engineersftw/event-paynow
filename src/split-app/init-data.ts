/**
 * Telegram Mini App launch data (`initData`): a query string Telegram signs for the bot that owns
 * the app. Verifying it tells the Worker who opened the page and from which link, without a login.
 * Runtime-agnostic (Web Crypto only): it must run in the Workers isolate and in Node tests.
 */

/** How long launch data stays acceptable; the claim itself must still be open on every call. */
export const INIT_DATA_MAX_AGE_SEC = 24 * 60 * 60;
/** Tolerated clock difference between Telegram and the Worker. */
const FUTURE_SKEW_SEC = 60;

export interface InitDataUser {
  id: number;
  first_name: string;
  last_name?: string;
  username?: string;
}

export interface InitData {
  user: InitDataUser;
  /** The `startapp` value of the link the app was opened from, when there was one. */
  startParam?: string;
  authDate: number;
}

const enc = new TextEncoder();

async function hmac(key: ArrayBuffer | Uint8Array, message: string): Promise<ArrayBuffer> {
  const k = await crypto.subtle.importKey('raw', key, { name: 'HMAC', hash: 'SHA-256' }, false, [
    'sign',
  ]);
  return crypto.subtle.sign('HMAC', k, enc.encode(message));
}

const hex = (buf: ArrayBuffer) =>
  [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('');

/** Compare two strings without stopping at the first difference. */
function safeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

/**
 * The verified launch data, or null when it is not valid for this bot: no or wrong hash, a missing
 * or malformed `user`, or an `auth_date` that is older than 24 hours or in the future.
 * Every field Telegram sent (except `hash`) is part of the signature, so none is dropped here.
 */
export async function verifyInitData(
  initData: string,
  botToken: string,
  nowSec: number = Math.floor(Date.now() / 1000)
): Promise<InitData | null> {
  const params = new URLSearchParams(initData);
  const hash = params.get('hash');
  if (!hash) return null;
  params.delete('hash');

  const check = [...params.entries()]
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
    .map(([k, v]) => `${k}=${v}`)
    .join('\n');
  const secret = await hmac(enc.encode('WebAppData'), botToken);
  if (!safeEqual(hex(await hmac(secret, check)), hash.toLowerCase())) return null;

  const authDate = Number(params.get('auth_date'));
  if (!Number.isInteger(authDate)) return null;
  if (authDate > nowSec + FUTURE_SKEW_SEC || nowSec - authDate > INIT_DATA_MAX_AGE_SEC) return null;

  let user: unknown;
  try {
    user = JSON.parse(params.get('user') ?? '');
  } catch {
    return null;
  }
  const u = user as Partial<InitDataUser> | null;
  if (
    !u ||
    typeof u.id !== 'number' ||
    !Number.isInteger(u.id) ||
    typeof u.first_name !== 'string'
  ) {
    return null;
  }
  const startParam = params.get('start_param');
  return {
    user: {
      id: u.id,
      first_name: u.first_name,
      ...(typeof u.last_name === 'string' ? { last_name: u.last_name } : {}),
      ...(typeof u.username === 'string' ? { username: u.username } : {}),
    },
    ...(startParam ? { startParam } : {}),
    authDate,
  };
}
