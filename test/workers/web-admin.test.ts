import { env } from 'cloudflare:test';
import { beforeAll, describe, expect, it } from 'vitest';
import { D1EventRepository, D1Repository } from '../../src/db/drizzle-repository';
import { signSession } from '../../src/web/auth';
import { handleWeb, type WebEnv } from '../../src/web/handler';
import { applyTestSchema } from './harness';

const webEnv: WebEnv = {
  paynow_db: env.paynow_db,
  TELEGRAM_BOT_TOKEN: 'tok',
  SESSION_SECRET: 'sess',
  BOT_USERNAME: 'my_bot',
};

const admin = (async () =>
  new Response(JSON.stringify({ ok: true, result: { status: 'administrator' } }))) as typeof fetch;
const member = (async () =>
  new Response(JSON.stringify({ ok: true, result: { status: 'member' } }))) as typeof fetch;

const T = '2024-01-01T00:00:00Z';
let repo: D1Repository;
let eventRepo: D1EventRepository;

async function seedEvent(ref: string, chatId: number) {
  return eventRepo.createEvent({
    ref,
    chatId,
    topicId: 0,
    name: 'Dinner <b>',
    payeeType: 'mobile',
    payeeValue: '+6591110000',
    status: 'open',
    timestamp: T,
  });
}

async function seedPayment(
  eventId: number,
  ref: string,
  userId: number,
  amountCents: number,
  extra: { payerName?: string; at?: string } = {}
) {
  await repo.createPayment({
    ref,
    userId,
    eventId,
    description: 'Dinner <b>',
    amountCents,
    payeeType: 'mobile',
    payeeValue: '+6591110000',
    status: 'pending',
    source: 'manual',
    qrPayload: 'p',
    payerType: 'mobile',
    payerValue: '+6598887777',
    payerName: extra.payerName ?? null,
    timestamp: extra.at ?? T,
  });
}

async function get(path: string, userId?: number, fetchFn: typeof fetch = admin) {
  const headers: Record<string, string> = {};
  if (userId) headers.Cookie = `session=${await signSession(userId, 'sess')}`;
  return handleWeb(new Request(`https://x.test${path}`, { headers }), webEnv, fetchFn);
}

beforeAll(async () => {
  await applyTestSchema(env.paynow_db);
  repo = new D1Repository(env.paynow_db);
  eventRepo = new D1EventRepository(env.paynow_db);
});

describe('listPaymentsByEvent', () => {
  it('returns every user’s payments for the event, newest first, and no other events', async () => {
    const e1 = await seedEvent('EVTLIST001', -1);
    const e2 = await seedEvent('EVTLIST002', -1);
    await seedPayment(e1.id, 'LISTP00001', 1, 100, { at: '2024-01-01T00:00:00Z' });
    await seedPayment(e1.id, 'LISTP00002', 2, 200, { at: '2024-01-03T00:00:00Z' });
    await seedPayment(e2.id, 'LISTP00003', 1, 300);

    expect((await repo.listPaymentsByEvent(e1.id)).map((p) => p.ref)).toEqual([
      'LISTP00002',
      'LISTP00001',
    ]);
    expect(await repo.listPaymentsByEvent(999_999)).toEqual([]);
  });
});

describe('web admin', () => {
  it('login: valid sign-in sets a session cookie and redirects to the event; bad data is refused', async () => {
    // Build valid widget data with the same HMAC scheme (see test/node/web-auth.test.ts)
    const enc = new TextEncoder();
    const fields: Record<string, string> = {
      id: '42',
      first_name: 'A',
      auth_date: String(Math.floor(Date.now() / 1000)),
    };
    const check = Object.keys(fields)
      .sort()
      .map((k) => `${k}=${fields[k]}`)
      .join('\n');
    const secret = await crypto.subtle.digest('SHA-256', enc.encode('tok'));
    const key = await crypto.subtle.importKey(
      'raw',
      secret,
      { name: 'HMAC', hash: 'SHA-256' },
      false,
      ['sign']
    );
    const sig = await crypto.subtle.sign('HMAC', key, enc.encode(check));
    const hash = [...new Uint8Array(sig)].map((b) => b.toString(16).padStart(2, '0')).join('');
    const q = new URLSearchParams({ ...fields, hash, ref: 'EVTLOGIN01' });

    const ok = await get(`/api/login?${q}`);
    expect(ok.status).toBe(302);
    expect(ok.headers.get('Location')).toBe('/events/EVTLOGIN01');
    expect(ok.headers.get('Set-Cookie')).toMatch(/^session=.*HttpOnly.*Secure/);

    q.set('id', '43');
    expect((await get(`/api/login?${q}`)).status).toBe(403);
  });

  it('API: no session → 401 with no data', async () => {
    const e = await seedEvent('EVTWEB0001', -5);
    const res = await get(`/api/events/${e.ref}`);
    expect(res.status).toBe(401);
    expect(await res.text()).not.toContain('Dinner');
  });

  it('API: signed-in non-admin → 403 and no payment data', async () => {
    const e = await seedEvent('EVTWEB0002', -6);
    await seedPayment(e.id, 'WEBP000001', 1, 500, { payerName: 'Alice' });
    const res = await get(`/api/events/${e.ref}`, 99, member);
    expect(res.status).toBe(403);
    const text = await res.text();
    expect(text).not.toContain('Alice');
    expect(text).not.toContain('WEBP000001');
  });

  it('API: unknown event → 404 for a signed-in user', async () => {
    expect((await get('/api/events/NOSUCHEVT1', 99)).status).toBe(404);
  });

  it('API: admin sees all users’ payments with totals excluding voided, names only', async () => {
    const e = await seedEvent('EVTWEB0003', -7);
    await seedPayment(e.id, 'WEBP000010', 1, 1000, { payerName: 'Alice' }); // → received
    await seedPayment(e.id, 'WEBP000011', 2, 250); // pending
    await seedPayment(e.id, 'WEBP000012', 3, 777); // → voided
    await repo.updatePaymentStatus('WEBP000010', 'received', 'manual', T);
    await repo.voidPayment('WEBP000012');

    const res = await get(`/api/events/${e.ref}`, 99);
    expect(res.status).toBe(200);
    const raw = await res.text();
    const body = JSON.parse(raw);
    expect(body.payments).toHaveLength(3);
    expect(body.totals).toEqual({ collectedCents: 1000, pendingCents: 250 });
    expect(body.payments.map((p: { status: string }) => p.status).sort()).toEqual([
      'pending',
      'received',
      'voided',
    ]);
    expect(raw).not.toContain('+6598887777'); // payer number
    expect(raw).not.toContain('+6591110000'); // payee number
    expect(raw).toContain('Alice');
  });

  it('API: a private-chat owner sees their own event without a bot-API call', async () => {
    const e = await seedEvent('EVTWEB0004', 4242);
    const never = (async () => {
      throw new Error('no call expected');
    }) as unknown as typeof fetch;
    expect((await get(`/api/events/${e.ref}`, 4242, never)).status).toBe(200);
  });

  it('page: serves a read-only shell; non-GET and junk paths are 404', async () => {
    const res = await get('/events/EVTWEB0001');
    expect(res.status).toBe(200);
    const html = await res.text();
    expect(html).toContain('data-telegram-login="my_bot"');
    expect(html).not.toMatch(/<form|method=["']post/i);
    expect((await get('/events/bad ref')).status).toBe(404);
    expect(
      (await handleWeb(new Request('https://x.test/events/EVTWEB0001', { method: 'POST' }), webEnv))
        .status
    ).toBe(404);
  });
});
