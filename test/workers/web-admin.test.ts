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

/** Telegram stub for payer requests: records each sendPhoto chat id; `refuse` simulates a 403. */
function telegram(refuse = false) {
  const chats: string[] = [];
  const fetchFn = (async (_url: string, init?: { body?: FormData }) => {
    chats.push(String(init?.body?.get('chat_id')));
    return new Response('{}', { status: refuse ? 403 : 200 });
  }) as unknown as typeof fetch;
  return { chats, fetchFn };
}

async function payerPost(
  path: string,
  userId: number | null,
  body: unknown,
  origin = 'https://x.test',
  fetchFn: typeof fetch = telegram().fetchFn
) {
  return handleWeb(
    new Request(`https://x.test${path}`, {
      method: 'POST',
      headers: {
        ...(userId === null ? {} : { Cookie: `session=${await signSession(userId, 'sess')}` }),
        Origin: origin,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
    }),
    webEnv,
    fetchFn
  );
}

beforeAll(async () => {
  await applyTestSchema(env.paynow_db);
  repo = new D1Repository(env.paynow_db);
  eventRepo = new D1EventRepository(env.paynow_db);
});

describe('listPaymentsByUserAndEvent', () => {
  it('returns only that user’s payments for that event, newest first', async () => {
    const e1 = await seedEvent('EVTUSER001', -1);
    const e2 = await seedEvent('EVTUSER002', -1);
    await seedPayment(e1.id, 'UEVP000001', 5, 100, { at: '2024-01-01T00:00:00Z' });
    await seedPayment(e1.id, 'UEVP000002', 5, 200, { at: '2024-01-03T00:00:00Z' });
    await seedPayment(e1.id, 'UEVP000003', 6, 300);
    await seedPayment(e2.id, 'UEVP000004', 5, 400);

    expect((await repo.listPaymentsByUserAndEvent(5, e1.id)).map((p) => p.ref)).toEqual([
      'UEVP000002',
      'UEVP000001',
    ]);
    expect(await repo.listPaymentsByUserAndEvent(7, e1.id)).toEqual([]);
  });
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

const at = (i: number) => `2024-02-01T00:${String(i).padStart(2, '0')}:00Z`;
const prefRef = (prefix: string, i: number) => `${prefix}${String(i).padStart(5, '0')}`;

describe('searchPaymentsByEvent', () => {
  it('pages newest first by cursor, including rows that share a created time', async () => {
    const e = await seedEvent('EVTPAGE001', -20);
    for (let i = 1; i <= 5; i++)
      await seedPayment(e.id, prefRef('PGA', i), 1, 100 + i, { at: at(1) });
    await seedPayment(e.id, prefRef('PGA', 6), 1, 106, { at: at(2) });

    const p1 = await repo.searchPaymentsByEvent(e.id, { limit: 4 });
    expect(p1.payments.map((p) => p.ref)).toEqual(['PGA00006', 'PGA00005', 'PGA00004', 'PGA00003']);
    expect(p1.nextCursor).not.toBeNull();
    const p2 = await repo.searchPaymentsByEvent(e.id, { limit: 4, cursor: p1.nextCursor! });
    expect(p2.payments.map((p) => p.ref)).toEqual(['PGA00002', 'PGA00001']);
    expect(p2.nextCursor).toBeNull();
  });

  it('filters by status and searches name or reference literally, ignoring case', async () => {
    const e = await seedEvent('EVTPAGE002', -21);
    await seedPayment(e.id, 'SRCH000001', 1, 100, { payerName: 'Alice Tan' });
    await seedPayment(e.id, 'SRCH000002', 1, 100, { payerName: '50% Bob_x' });
    await seedPayment(e.id, 'SRCH000003', 1, 100, { payerName: 'Bobby' });
    await repo.updatePaymentStatus('SRCH000001', 'received', 'manual', T);
    const refs = async (o: Parameters<typeof repo.searchPaymentsByEvent>[1]) =>
      (await repo.searchPaymentsByEvent(e.id, o)).payments.map((p) => p.ref).sort();

    expect(await refs({ limit: 20, status: 'received' })).toEqual(['SRCH000001']);
    expect(await refs({ limit: 20, q: 'ALI' })).toEqual(['SRCH000001']);
    expect(await refs({ limit: 20, q: 'srch000003' })).toEqual(['SRCH000003']);
    expect(await refs({ limit: 20, q: 'bob' })).toEqual(['SRCH000002', 'SRCH000003']);
    expect(await refs({ limit: 20, q: '%' })).toEqual(['SRCH000002']);
    expect(await refs({ limit: 20, q: '_' })).toEqual(['SRCH000002']);
    expect(await refs({ limit: 20, q: 'b_', status: 'pending' })).toEqual(['SRCH000002']); // _ is literal: Bobby does not match
    expect(await refs({ limit: 20, q: 'bob', status: 'pending' })).toEqual([
      'SRCH000002',
      'SRCH000003',
    ]);
  });
});

describe('listPaybacksByPayments', () => {
  it('returns only the given payments’ paybacks, across the 90-id chunk boundary', async () => {
    const e = await seedEvent('EVTPAGE006', -25);
    await seedPayment(e.id, 'PBK0000001', 1, 1000);
    await seedPayment(e.id, 'PBK0000002', 1, 1000);
    await seedPayment(e.id, 'PBK0000003', 1, 1000);
    const [a, b, c] = await Promise.all(
      ['PBK0000001', 'PBK0000002', 'PBK0000003'].map((r) => repo.getPaymentByRef(r))
    );
    for (const [pay, ref] of [
      [a!, 'PBKBACK001'],
      [b!, 'PBKBACK002'],
      [c!, 'PBKBACK003'],
    ] as const) {
      await repo.createPayback({
        ref,
        paymentId: pay.id,
        payerType: 'mobile',
        payerValue: '+6592220000',
        amountCents: 100,
        status: 'pending',
        qrPayload: 'p',
        timestamp: T,
      });
    }
    const filler = Array.from({ length: 93 }, (_, i) => 900_000 + i);
    const ids = [a!.id, ...filler, c!.id]; // 95 ids: a and c fall in different chunks
    expect((await repo.listPaybacksByPayments(ids)).map((p) => p.ref)).toEqual([
      'PBKBACK001',
      'PBKBACK003',
    ]);
    expect(await repo.listPaybacksByPayments([])).toEqual([]);
  });
});

describe('web admin event default amount', () => {
  it('returns the event default amount in cents, or null when none was set', async () => {
    const withDefault = await eventRepo.createEvent({
      ref: 'EVTDEFAM01',
      chatId: -30,
      topicId: 0,
      name: 'With default',
      payeeType: 'mobile',
      payeeValue: '+6591110000',
      status: 'open',
      defaultAmountCents: 2100,
      timestamp: T,
    });
    const without = await seedEvent('EVTDEFAM02', -31);

    const a = (await (await get(`/api/events/${withDefault.ref}`, 99)).json()) as {
      event: { defaultAmountCents: number | null };
    };
    const b = (await (await get(`/api/events/${without.ref}`, 99)).json()) as {
      event: { defaultAmountCents: number | null };
    };
    expect(a.event.defaultAmountCents).toBe(2100);
    expect(b.event.defaultAmountCents).toBeNull();
  });
});

describe('web admin list paging', () => {
  type Page = {
    payments: { ref: string }[];
    nextCursor: string | null;
    totals: { collectedCents: number; paidBackCents: number; pendingCents: number };
  };
  const page = async (ref: string, query = '') => {
    const res = await get(`/api/events/${ref}${query}`, 99);
    return { status: res.status, body: (await res.json()) as Page };
  };

  it('returns 20 per page with a cursor, no duplicates, and event-wide totals', async () => {
    const e = await seedEvent('EVTPAGE003', -22);
    for (let i = 1; i <= 45; i++) await seedPayment(e.id, prefRef('PGB', i), 1, 100, { at: at(i) });
    await repo.updatePaymentStatus('PGB00001', 'received', 'manual', T);
    await repo.voidPayment('PGB00002');

    const p1 = await page(e.ref);
    expect(p1.body.payments).toHaveLength(20);
    expect(p1.body.payments[0]!.ref).toBe('PGB00045');
    expect(p1.body.totals).toEqual({ collectedCents: 100, paidBackCents: 0, pendingCents: 4300 });
    const p2 = await page(e.ref, `?cursor=${encodeURIComponent(p1.body.nextCursor!)}`);
    expect(p2.body.payments).toHaveLength(20);
    // a payment created meanwhile does not shift the next page
    await seedPayment(e.id, 'PGB99999', 1, 100, { at: at(59) });
    const p3 = await page(e.ref, `?cursor=${encodeURIComponent(p2.body.nextCursor!)}`);
    expect(p3.body.payments.map((p) => p.ref)).toEqual([
      'PGB00005',
      'PGB00004',
      'PGB00003',
      'PGB00002',
      'PGB00001',
    ]);
    expect(p3.body.nextCursor).toBeNull();
    const all = [...p1.body.payments, ...p2.body.payments, ...p3.body.payments].map((p) => p.ref);
    expect(new Set(all).size).toBe(45);
  });

  it('filters and searches across all pages while totals stay event-wide', async () => {
    const e = await seedEvent('EVTPAGE004', -23);
    for (let i = 1; i <= 25; i++) {
      await seedPayment(e.id, prefRef('PGC', i), 1, 100, {
        at: at(i),
        payerName: i === 3 ? 'Zed' : 'Amy',
      });
    }
    await repo.updatePaymentStatus('PGC00003', 'received', 'manual', T);
    await repo.voidPayment('PGC00004');

    const voided = await page(e.ref, '?status=voided');
    expect(voided.body.payments.map((p) => p.ref)).toEqual(['PGC00004']);
    expect(voided.body.totals).toEqual({
      collectedCents: 100,
      paidBackCents: 0,
      pendingCents: 2300,
    });
    const zed = await page(e.ref, '?q=zed');
    expect(zed.body.payments.map((p) => p.ref)).toEqual(['PGC00003']);
    expect(zed.body.nextCursor).toBeNull();
    const none = await page(e.ref, '?q=nobody');
    expect(none.body.payments).toEqual([]);
    const refresh = await page(e.ref, '?limit=25');
    expect(refresh.body.payments).toHaveLength(25);
    expect(refresh.body.nextCursor).toBeNull();
  });

  it('refuses invalid parameters', async () => {
    const e = await seedEvent('EVTPAGE005', -24);
    for (const q of [
      '?status=paid',
      `?q=${'x'.repeat(41)}`,
      '?limit=0',
      '?limit=201',
      '?limit=abc',
    ]) {
      expect((await page(e.ref, q)).status).toBe(400);
    }
    expect((await page(e.ref, '?cursor=garbage')).status).toBe(400);
  });
});

/** Telegram Login Widget query signed with the test bot token ("tok"). */
async function loginQuery(extra: Record<string, string>, ref = 'EVTME00001') {
  const enc = new TextEncoder();
  const fields: Record<string, string> = {
    id: '42',
    auth_date: String(Math.floor(Date.now() / 1000)),
    ...extra,
  };
  const check = Object.keys(fields)
    .sort()
    .map((k) => `${k}=${fields[k]}`)
    .join('\n');
  const key = await crypto.subtle.importKey(
    'raw',
    await crypto.subtle.digest('SHA-256', enc.encode('tok')),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  );
  const sig = await crypto.subtle.sign('HMAC', key, enc.encode(check));
  const hash = [...new Uint8Array(sig)].map((b) => b.toString(16).padStart(2, '0')).join('');
  return new URLSearchParams({ ...fields, hash, ref });
}

const cookiesOf = (res: Response) => res.headers.getSetCookie();
const meWith = (cookie?: string) =>
  handleWeb(
    new Request('https://x.test/api/me', { headers: cookie ? { Cookie: cookie } : {} }),
    webEnv,
    admin
  );

describe('signed-in user name and sign out', () => {
  it('login remembers the name (first + last, else @username), URL-encoded and capped', async () => {
    const full = await get(
      `/api/login?${await loginQuery({ first_name: 'Zoë', last_name: 'Tan' })}`
    );
    const name = cookiesOf(full).find((c) => c.startsWith('tg_name='))!;
    expect(name).toContain('HttpOnly');
    expect(decodeURIComponent(name.split(';')[0]!.slice('tg_name='.length))).toBe('Zoë Tan');
    expect(cookiesOf(full).some((c) => c.startsWith('session='))).toBe(true);

    const handle = cookiesOf(
      await get(`/api/login?${await loginQuery({ first_name: '', username: 'zed' })}`)
    );
    expect(
      decodeURIComponent(
        handle
          .find((c) => c.startsWith('tg_name='))!
          .split(';')[0]!
          .slice(8)
      )
    ).toBe('@zed');

    const long = cookiesOf(
      await get(`/api/login?${await loginQuery({ first_name: 'x'.repeat(200) })}`)
    );
    expect(
      decodeURIComponent(
        long
          .find((c) => c.startsWith('tg_name='))!
          .split(';')[0]!
          .slice(8)
      ).length
    ).toBe(64);
  });

  it('GET /api/me returns the name, null name for old sessions, and no user without a session', async () => {
    const session = `session=${await signSession(42, 'sess')}`;
    const named = await meWith(`${session}; tg_name=${encodeURIComponent('Zoë Tan')}`);
    expect(await named.json()).toEqual({ user: { name: 'Zoë Tan' } });
    expect(named.headers.get('Cache-Control')).toBe('no-store');
    expect(await (await meWith(session)).json()).toEqual({ user: { name: null } });
    expect(await (await meWith(`${session}; tg_name=%E0%A4%A`)).json()).toEqual({
      user: { name: null },
    });
    expect(await (await meWith()).json()).toEqual({ user: null });
    // A forged name cookie without a session, or with a bad one, never counts as signed in
    expect(await (await meWith('tg_name=Admin')).json()).toEqual({ user: null });
    expect(await (await meWith('session=1.2.3; tg_name=Admin')).json()).toEqual({ user: null });
  });

  it('POST /api/logout clears both cookies; cross-origin is refused and clears nothing', async () => {
    const out = await payerPost('/api/logout', 42, {});
    expect(out.status).toBe(204);
    const cleared = cookiesOf(out);
    expect(cleared.map((c) => c.split('=')[0]).sort()).toEqual(['session', 'tg_name']);
    for (const c of cleared) expect(c).toContain('Max-Age=0');
    // Works without a session too
    expect((await payerPost('/api/logout', null, {})).status).toBe(204);

    const evil = await payerPost('/api/logout', 42, {}, 'https://evil.test');
    expect(evil.status).toBe(403);
    expect(cookiesOf(evil)).toEqual([]);
  });
});

describe('anonymous payer requests', () => {
  const anon = { payer: '91234567', amount: '2.00' };

  it('serves event data without a session, and treats a bad session as anonymous', async () => {
    const e = await seedEvent('EVTANON001', -60);
    const none = await get(`/api/pay/${e.ref}`);
    expect(none.status).toBe(200);
    expect(await none.json()).toMatchObject({ signedIn: false, event: { name: 'Dinner <b>' } });
    const bad = await handleWeb(
      new Request(`https://x.test/api/pay/${e.ref}`, { headers: { Cookie: 'session=1.2.3' } }),
      webEnv,
      admin
    );
    expect(((await bad.json()) as { signedIn: boolean }).signedIn).toBe(false);
    expect(
      ((await (await get(`/api/pay/${e.ref}`, 900)).json()) as { signedIn: boolean }).signedIn
    ).toBe(true);
    expect((await get('/api/pay/NOPENOPE01')).status).toBe(404);
  });

  it('history and the owner-only QR route still need a session', async () => {
    const e = await seedEvent('EVTANON002', -61);
    await seedPayment(e.id, 'ANONP00001', 901, 100);
    expect((await get(`/api/pay/${e.ref}/payments`)).status).toBe(401);
    expect((await get(`/api/pay/${e.ref}/payments/ANONP00001/qr`)).status).toBe(401);
  });

  it('creates an owner-0 payment, returns the QR inline and sends no Telegram message', async () => {
    const e = await seedEvent('EVTANON003', -62);
    const tg = telegram();
    const res = await payerPost(
      `/api/pay/${e.ref}/payments`,
      null,
      anon,
      'https://x.test',
      tg.fetchFn
    );
    expect(res.status).toBe(201);
    const body = (await res.json()) as { payment: { ref: string; qr: string; dm?: boolean } };
    expect(body.payment.qr.startsWith('data:image/png;base64,')).toBe(true);
    const png = Uint8Array.from(atob(body.payment.qr.split(',')[1]!), (c) => c.charCodeAt(0));
    expect([...png.slice(1, 4)]).toEqual([80, 78, 71]); // "PNG"
    expect('dm' in body.payment).toBe(false);
    expect(tg.chats).toEqual([]);
    expect(await repo.getPaymentByRef(body.payment.ref)).toMatchObject({
      userId: 0,
      status: 'pending',
    });
    // Admins list it like any other request
    const list = (await (await get(`/api/events/${e.ref}`, 1)).json()) as {
      payments: Array<{ ref: string }>;
    };
    expect(list.payments.map((p) => p.ref)).toContain(body.payment.ref);
  });

  it('still rejects cross-origin anonymous writes', async () => {
    const e = await seedEvent('EVTANON004', -63);
    expect(
      (await payerPost(`/api/pay/${e.ref}/payments`, null, anon, 'https://evil.test')).status
    ).toBe(403);
  });

  it('caps anonymous creation at 30 per 10 minutes per event; signed-in users are exempt', async () => {
    const e = await seedEvent('EVTANON005', -64);
    const old = new Date(Date.now() - 11 * 60 * 1000).toISOString();
    const now = new Date().toISOString();
    for (let i = 0; i < 5; i++) await seedPayment(e.id, `ANONOLD${i}00`, 0, 100, { at: old });
    for (let i = 0; i < 30; i++)
      await seedPayment(e.id, `ANONNEW${String(i).padStart(3, '0')}`, 0, 100, { at: now });

    const blocked = await payerPost(`/api/pay/${e.ref}/payments`, null, anon);
    expect(blocked.status).toBe(429);
    expect(await blocked.json()).toEqual({ error: 'rate_limited' });
    expect((await repo.listPaymentsByEvent(e.id)).length).toBe(35);
    expect((await payerPost(`/api/pay/${e.ref}/payments`, 902, anon)).status).toBe(201);
    // Another event is unaffected
    const other = await seedEvent('EVTANON006', -65);
    expect((await payerPost(`/api/pay/${other.ref}/payments`, null, anon)).status).toBe(201);
  });
});

describe('countRecentAnonymousPayments', () => {
  it('counts only that event’s owner-0 rows inside the window', async () => {
    const e1 = await seedEvent('EVTCNT0001', -66);
    const e2 = await seedEvent('EVTCNT0002', -66);
    await seedPayment(e1.id, 'CNTP000001', 0, 100, { at: '2024-01-01T00:00:00Z' });
    await seedPayment(e1.id, 'CNTP000002', 0, 100, { at: '2024-01-01T00:05:00Z' });
    await seedPayment(e1.id, 'CNTP000003', 5, 100, { at: '2024-01-01T00:05:00Z' });
    await seedPayment(e2.id, 'CNTP000004', 0, 100, { at: '2024-01-01T00:05:00Z' });
    expect(await repo.countRecentAnonymousPayments(e1.id, '2024-01-01T00:01:00Z')).toBe(1);
    expect(await repo.countRecentAnonymousPayments(e1.id, '2023-12-31T00:00:00Z')).toBe(2);
  });
});

describe('payer page history and private copy', () => {
  it('lists only the signed-in user’s requests for the event, newest first, without numbers', async () => {
    const e = await seedEvent('EVTHIST001', -50);
    const other = await seedEvent('EVTHIST002', -50);
    await seedPayment(e.id, 'HISTP00001', 800, 100, { at: '2024-01-01T00:00:00Z' });
    await seedPayment(e.id, 'HISTP00002', 800, 200, { at: '2024-01-02T00:00:00Z' });
    await seedPayment(e.id, 'HISTP00003', 801, 300);
    await seedPayment(other.id, 'HISTP00004', 800, 400);

    const res = await get(`/api/pay/${e.ref}/payments`, 800, member);
    expect(res.status).toBe(200);
    const text = await res.text();
    expect(
      (JSON.parse(text) as { payments: Array<{ ref: string }> }).payments.map((p) => p.ref)
    ).toEqual(['HISTP00002', 'HISTP00001']);
    expect(text).not.toContain('+6598887777');
    expect(text).not.toContain('payerValue');

    expect((await get(`/api/pay/${e.ref}/payments`)).status).toBe(401);
    expect((await get('/api/pay/NOPENOPE01/payments', 800)).status).toBe(404);
  });

  it('sends the payer a private copy, and keeps the payment when Telegram refuses', async () => {
    const e = await seedEvent('EVTDM00001', -51);
    const ok = telegram();
    const sent = await payerPost(
      `/api/pay/${e.ref}/payments`,
      810,
      { payer: '91234567', amount: '2.00' },
      'https://x.test',
      ok.fetchFn
    );
    expect(((await sent.json()) as { payment: { dm: boolean } }).payment.dm).toBe(true);
    expect(ok.chats).toEqual(['810']); // only the payer; nothing posted to the event chat

    const no = telegram(true);
    const refused = await payerPost(
      `/api/pay/${e.ref}/payments`,
      811,
      { payer: '91234567', amount: '2.00' },
      'https://x.test',
      no.fetchFn
    );
    expect(refused.status).toBe(201);
    const body = (await refused.json()) as { payment: { ref: string; dm: boolean } };
    expect(body.payment.dm).toBe(false);
    expect(await repo.getPaymentByRef(body.payment.ref)).toMatchObject({ userId: 811 });
  });
});

describe('web admin', () => {
  it('payer page allows any signed-in user and uses a configured default amount', async () => {
    const e = await eventRepo.createEvent({
      ref: 'EVTPAYER001',
      chatId: -40,
      topicId: 0,
      name: 'Payer event',
      payeeType: 'mobile',
      payeeValue: '+6591110000',
      status: 'open',
      defaultAmountCents: 1250,
      timestamp: T,
    });
    const metadata = await get(`/api/pay/${e.ref}`, 700, member);
    expect(metadata.status).toBe(200);
    expect(await metadata.json()).toMatchObject({
      event: { name: 'Payer event', defaultAmountCents: 1250 },
    });

    const created = await payerPost(
      `/api/pay/${e.ref}/payments`,
      700,
      { payer: '91234567', name: 'Alice', amount: '99.99' },
      'https://x.test'
    );
    expect(created.status).toBe(201);
    const body = (await created.json()) as { payment: { ref: string; amountCents: number } };
    expect(body.payment.amountCents).toBe(1250);
    const payment = await repo.getPaymentByRef(body.payment.ref);
    expect(payment).toMatchObject({
      userId: 700,
      eventId: e.id,
      status: 'pending',
      amountCents: 1250,
    });

    const qr = await get(`/api/pay/${e.ref}/payments/${body.payment.ref}/qr`, 700);
    expect(qr.status).toBe(200);
    expect(qr.headers.get('Content-Type')).toBe('image/png');
    expect((await get(`/api/pay/${e.ref}/payments/${body.payment.ref}/qr`, 701)).status).toBe(404);
  });

  it('payer page requires an amount only when the event has no default and rejects cross-origin writes', async () => {
    const e = await seedEvent('EVTPAYER002', -41);
    const created = await payerPost(`/api/pay/${e.ref}/payments`, 702, {
      payer: '91234567',
      amount: '3.50',
    });
    expect(created.status).toBe(201);
    const body = (await created.json()) as { payment: { ref: string; amountCents: number } };
    expect(body.payment.amountCents).toBe(350);
    expect(
      (
        await payerPost(
          `/api/pay/${e.ref}/payments`,
          702,
          { payer: '91234567', amount: '1.00' },
          'https://evil.test'
        )
      ).status
    ).toBe(403);
  });

  it('payer page refuses closed-event creation', async () => {
    const e = await seedEvent('EVTPAYER003', -42);
    await eventRepo.closeEvent(e.ref, T);
    expect(
      (await payerPost(`/api/pay/${e.ref}/payments`, 703, { payer: '91234567', amount: '1.00' }))
        .status
    ).toBe(409);
  });

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

    q.set('next', 'pay');
    expect((await get(`/api/login?${q}`)).headers.get('Location')).toBe('/pay/EVTLOGIN01');

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
    expect(body.totals).toEqual({ collectedCents: 1000, paidBackCents: 0, pendingCents: 250 });
    expect(body.payments.map((p: { status: string }) => p.status).sort()).toEqual([
      'pending',
      'received',
      'voided',
    ]);
    expect(raw).not.toContain('+6598887777'); // payer number
    expect(raw).not.toContain('+6591110000'); // payee number
    expect(raw).toContain('Alice');
  });

  it('API: sent paybacks reduce net and collected; pending and cancelled are ignored', async () => {
    const e = await seedEvent('EVTWEB0005', -8);
    await seedPayment(e.id, 'WEBP000020', 1, 2000);
    await seedPayment(e.id, 'WEBP000021', 2, 1000);
    await repo.updatePaymentStatus('WEBP000020', 'received', 'manual', T);
    await repo.updatePaymentStatus('WEBP000021', 'received', 'manual', T);
    const [p20, p21] = [
      (await repo.getPaymentByRef('WEBP000020'))!,
      (await repo.getPaymentByRef('WEBP000021'))!,
    ];
    const payback = async (
      paymentId: number,
      ref: string,
      cents: number,
      status?: 'sent' | 'cancelled'
    ) => {
      await repo.createPayback({
        ref,
        paymentId,
        payerType: 'mobile',
        payerValue: '+6592220000',
        amountCents: cents,
        status: 'pending',
        qrPayload: 'p',
        timestamp: T,
      });
      if (status) await repo.updatePaybackStatus(ref, status, T);
    };
    await payback(p20.id, 'WEBPB00001', 500, 'sent');
    await payback(p21.id, 'WEBPB00002', 300); // pending
    await payback(p21.id, 'WEBPB00003', 200, 'cancelled');

    const raw = await (await get(`/api/events/${e.ref}`, 99)).text();
    const body = JSON.parse(raw);
    const byRef = Object.fromEntries(body.payments.map((p: { ref: string }) => [p.ref, p]));
    expect(byRef.WEBP000020).toMatchObject({
      amountCents: 2000,
      paidBackCents: 500,
      netCents: 1500,
    });
    expect(byRef.WEBP000021).toMatchObject({ amountCents: 1000, paidBackCents: 0, netCents: 1000 });
    expect(body.totals).toEqual({ collectedCents: 2500, paidBackCents: 500, pendingCents: 0 });
    expect(raw).not.toContain('+6592220000'); // payback recipient number
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
    expect(html).toContain('Paid back');
    expect(html).toContain("'Net ' + sgd(p.netCents)");
    expect(html).not.toMatch(/<form|method=["']post/i);
    expect((await get('/events/bad ref')).status).toBe(404);
    expect(
      (await handleWeb(new Request('https://x.test/events/EVTWEB0001', { method: 'POST' }), webEnv))
        .status
    ).toBe(404);
  });
});
