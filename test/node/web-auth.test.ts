import { describe, expect, it } from 'vitest';
import { canViewChat } from '../../src/web/access';
import { signSession, verifySession, verifyTelegramLogin } from '../../src/web/auth';

const TOKEN = '123:bot-token';
const NOW = 1_800_000_000;
const enc = new TextEncoder();

/** Build widget data the way Telegram signs it. */
async function loginParams(fields: Record<string, string>, token = TOKEN) {
  const check = Object.keys(fields)
    .sort()
    .map((k) => `${k}=${fields[k]}`)
    .join('\n');
  const secret = await crypto.subtle.digest('SHA-256', enc.encode(token));
  const key = await crypto.subtle.importKey(
    'raw',
    secret,
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  );
  const sig = await crypto.subtle.sign('HMAC', key, enc.encode(check));
  const hash = [...new Uint8Array(sig)].map((b) => b.toString(16).padStart(2, '0')).join('');
  return new URLSearchParams({ ...fields, hash });
}

describe('verifyTelegramLogin', () => {
  const base = { id: '42', first_name: 'Alice', auth_date: String(NOW - 60) };

  it('accepts valid data and ignores unsigned extras like ref', async () => {
    const params = await loginParams(base);
    params.set('ref', 'ABC123');
    expect(await verifyTelegramLogin(params, TOKEN, NOW)).toBe(42);
  });

  it('rejects tampered data, a wrong token and a missing hash', async () => {
    const params = await loginParams(base);
    params.set('id', '43');
    expect(await verifyTelegramLogin(params, TOKEN, NOW)).toBeNull();
    expect(await verifyTelegramLogin(await loginParams(base), 'other', NOW)).toBeNull();
    expect(await verifyTelegramLogin(new URLSearchParams(base), TOKEN, NOW)).toBeNull();
  });

  it('rejects data older than a day', async () => {
    const stale = await loginParams({ ...base, auth_date: String(NOW - 86_401) });
    expect(await verifyTelegramLogin(stale, TOKEN, NOW)).toBeNull();
  });
});

describe('session cookie', () => {
  it('round-trips, and rejects tampering, a wrong secret and expiry', async () => {
    const cookie = await signSession(42, 'secret', 1_000);
    expect(await verifySession(cookie, 'secret', 2_000)).toBe(42);
    expect(await verifySession(cookie.replace(/^42/, '43'), 'secret', 2_000)).toBeNull();
    expect(await verifySession(cookie, 'other', 2_000)).toBeNull();
    expect(await verifySession(cookie, 'secret', 1_000 + 12 * 3600 * 1000 + 1)).toBeNull();
    expect(await verifySession(undefined, 'secret')).toBeNull();
    expect(await verifySession('garbage', 'secret')).toBeNull();
  });
});

describe('canViewChat', () => {
  const stub = (status: string | null, ok = true) =>
    (async () =>
      new Response(JSON.stringify({ ok, result: status ? { status } : undefined }), {
        status: ok ? 200 : 400,
      })) as unknown as typeof fetch;

  it('allows administrators and the owner, denies members, outsiders and API errors', async () => {
    expect(await canViewChat(-100, 1, TOKEN, stub('administrator'))).toBe(true);
    expect(await canViewChat(-100, 1, TOKEN, stub('creator'))).toBe(true);
    expect(await canViewChat(-100, 1, TOKEN, stub('member'))).toBe(false);
    expect(await canViewChat(-100, 1, TOKEN, stub('left'))).toBe(false);
    expect(await canViewChat(-100, 1, TOKEN, stub(null, false))).toBe(false);
    expect(
      await canViewChat(-100, 1, TOKEN, (async () => {
        throw new Error('down');
      }) as unknown as typeof fetch)
    ).toBe(false);
  });

  it('allows the user themself in a private chat without calling the API', async () => {
    const never = (async () => {
      throw new Error('should not be called');
    }) as unknown as typeof fetch;
    expect(await canViewChat(7, 7, TOKEN, never)).toBe(true);
  });
});
