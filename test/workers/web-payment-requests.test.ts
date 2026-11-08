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
const ORIGIN = 'https://x.test';
const T = '2024-01-01T00:00:00Z';

/** Telegram stub: getChatMember answers per `member`, sendPhoto is recorded (and may fail). */
function telegram(opts: { member?: boolean; postOk?: boolean } = {}) {
  const { member = false, postOk = true } = opts;
  const posts: FormData[] = [];
  const fetchFn = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    if (url.includes('/sendPhoto')) {
      posts.push(init!.body as FormData);
      return new Response('{}', { status: postOk ? 200 : 400 });
    }
    return new Response(
      JSON.stringify({ ok: true, result: { status: member ? 'member' : 'administrator' } })
    );
  }) as typeof fetch;
  return { fetchFn, posts };
}

let repo: D1Repository;
let events: D1EventRepository;

beforeAll(async () => {
  await applyTestSchema(env.paynow_db);
  repo = new D1Repository(env.paynow_db);
  events = new D1EventRepository(env.paynow_db);
});

async function seedEvent(ref: string, status: 'open' | 'closed' = 'open', topicId = 0) {
  const e = await events.createEvent({
    ref,
    chatId: -50,
    topicId,
    name: 'Team Lunch',
    payeeType: 'mobile',
    payeeValue: '+6591110000',
    status: 'open',
    timestamp: T,
  });
  if (status === 'closed') await events.closeEvent(ref, T);
  return e;
}

async function seedPayment(eventId: number, ref: string, cents = 2000) {
  return repo.createPayment({
    ref,
    userId: 1,
    eventId,
    description: 'Team Lunch',
    amountCents: cents,
    payeeType: 'mobile',
    payeeValue: '+6591110000',
    payerType: 'mobile',
    payerValue: '+6598887777',
    payerName: 'Alice',
    status: 'pending',
    source: 'manual',
    qrPayload: 'p',
    timestamp: T,
  });
}

async function post(
  path: string,
  body: unknown,
  o: {
    userId?: number | null;
    origin?: string | null;
    tg?: ReturnType<typeof telegram>;
  } = {}
) {
  const { userId = 99, origin = ORIGIN, tg = telegram() } = o;
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (origin) headers.Origin = origin;
  if (userId) headers.Cookie = `session=${await signSession(userId, 'sess')}`;
  return handleWeb(
    new Request(`${ORIGIN}${path}`, { method: 'POST', headers, body: JSON.stringify(body) }),
    webEnv,
    tg.fetchFn
  );
}

async function get(path: string, tg = telegram(), userId = 99) {
  return handleWeb(
    new Request(`${ORIGIN}${path}`, {
      headers: { Cookie: `session=${await signSession(userId, 'sess')}` },
    }),
    webEnv,
    tg.fetchFn
  );
}

const newPath = (e: string) => `/api/events/${e}/payments`;

describe('create a payment request', () => {
  it('records a pending payment owned by the admin, posts the QR to the chat, and leaks no number', async () => {
    const e = await seedEvent('WPEVT00001', 'open', 7);
    const tg = telegram();
    const res = await post(
      newPath(e.ref),
      { payer: '98887777', name: ' Alice ', amount: '12.50' },
      { tg }
    );

    expect(res.status).toBe(201);
    const raw = await res.text();
    expect(raw).not.toContain('98887777');
    const { payment } = JSON.parse(raw) as { payment: { ref: string; posted: boolean } };
    expect(payment.posted).toBe(true);

    const stored = (await repo.getPaymentByRef(payment.ref))!;
    expect(stored).toMatchObject({
      userId: 99,
      eventId: e.id,
      amountCents: 1250,
      status: 'pending',
      payerValue: '+6598887777',
      payerName: 'Alice',
      description: 'Team Lunch',
      payeeValue: '+6591110000',
    });
    expect(stored.qrPayload).not.toContain('+6598887777');

    expect(tg.posts).toHaveLength(1);
    const form = tg.posts[0]!;
    expect(form.get('chat_id')).toBe('-50');
    expect(form.get('message_thread_id')).toBe('7');
    expect(form.get('caption')).toBe(
      `Team Lunch / SGD 12.50 / ${payment.ref} / Payer: Alice / Forward this message to share`
    );
    expect(form.get('reply_markup') as string).toContain(`mark_received:${payment.ref}`);
  });

  it('works without a name', async () => {
    const e = await seedEvent('WPEVT00002');
    const res = await post(newPath(e.ref), { payer: '91234567', amount: '5' });
    const { payment } = (await res.json()) as { payment: { ref: string } };
    expect((await repo.getPaymentByRef(payment.ref))!.payerName).toBeNull();
  });

  it('refuses invalid input, closed and unknown events, recording nothing', async () => {
    const e = await seedEvent('WPEVT00003');
    const closed = await seedEvent('WPEVT00004', 'closed');
    const code = async (path: string, body: unknown) => {
      const r = await post(path, body);
      return [r.status, ((await r.json()) as { error?: string }).error] as const;
    };
    expect(await code(newPath(e.ref), { payer: 'nope', amount: '5' })).toEqual([
      400,
      'invalid_payer',
    ]);
    expect(await code(newPath(e.ref), { payer: '91234567', amount: '5.123' })).toEqual([
      400,
      'invalid_amount',
    ]);
    expect(await code(newPath(e.ref), { payer: '91234567', amount: '0' })).toEqual([
      400,
      'invalid_amount',
    ]);
    expect(await code(newPath(closed.ref), { payer: '91234567', amount: '5' })).toEqual([
      409,
      'event_closed',
    ]);
    expect(await code(newPath('NOSUCHEVT1'), { payer: '91234567', amount: '5' })).toEqual([
      404,
      'not_found',
    ]);
    expect(await repo.listPaymentsByEvent(e.id)).toHaveLength(0);
    expect(await repo.listPaymentsByEvent(closed.id)).toHaveLength(0);
  });

  it('keeps the payment and reports posted: false when the chat post fails', async () => {
    const e = await seedEvent('WPEVT00005');
    const res = await post(
      newPath(e.ref),
      { payer: '91234567', amount: '5' },
      { tg: telegram({ postOk: false }) }
    );
    expect(res.status).toBe(201);
    const { payment } = (await res.json()) as { payment: { ref: string; posted: boolean } };
    expect(payment.posted).toBe(false);
    expect(await repo.getPaymentByRef(payment.ref)).not.toBeNull();
  });

  it('refuses without a session, from non-admins and cross-origin, recording nothing', async () => {
    const e = await seedEvent('WPEVT00006');
    const body = { payer: '91234567', amount: '5' };
    expect((await post(newPath(e.ref), body, { userId: null })).status).toBe(401);
    expect((await post(newPath(e.ref), body, { tg: telegram({ member: true }) })).status).toBe(403);
    expect((await post(newPath(e.ref), body, { origin: 'https://evil.test' })).status).toBe(403);
    expect(await repo.listPaymentsByEvent(e.id)).toHaveLength(0);
  });
});

describe('event data for the page', () => {
  it('reports the event status so the page can hide the form for a closed event', async () => {
    const open = await seedEvent('WPEVT00014');
    const closed = await seedEvent('WPEVT00015', 'closed');
    const status = async (ref: string) =>
      ((await (await get(`/api/events/${ref}`)).json()) as { event: { status: string } }).event
        .status;
    expect(await status(open.ref)).toBe('open');
    expect(await status(closed.ref)).toBe('closed');
  });
});

describe('payment QR image', () => {
  it('serves a PNG to an admin; 404 for another event; 403 for a non-admin', async () => {
    const e = await seedEvent('WPEVT00007');
    const other = await seedEvent('WPEVT00008');
    const p = await seedPayment(e.id, 'WPPAY00001');

    const ok = await get(`/api/events/${e.ref}/payments/${p.ref}/qr`);
    expect(ok.status).toBe(200);
    expect(ok.headers.get('Content-Type')).toBe('image/png');
    expect([...new Uint8Array(await ok.arrayBuffer()).subarray(0, 4)]).toEqual([
      0x89, 0x50, 0x4e, 0x47,
    ]);

    expect((await get(`/api/events/${other.ref}/payments/${p.ref}/qr`)).status).toBe(404);
    expect(
      (await get(`/api/events/${e.ref}/payments/${p.ref}/qr`, telegram({ member: true }))).status
    ).toBe(403);
  });
});

describe('mark received and void from the page', () => {
  const act = (e: string, p: string, a: 'received' | 'void', userId = 99) =>
    post(`/api/events/${e}/payments/${p}/${a}`, {}, { userId });

  it('received moves the amount from pending to collected and records the actor', async () => {
    const e = await seedEvent('WPEVT00009');
    const p = await seedPayment(e.id, 'WPPAY00002', 2000);

    expect((await act(e.ref, p.ref, 'received', 21)).status).toBe(200);
    expect(await repo.getPaymentByRef(p.ref)).toMatchObject({
      status: 'received',
      receivedBy: 21,
      voidedBy: null,
    });

    const data = (await (await get(`/api/events/${e.ref}`)).json()) as {
      totals: { collectedCents: number; pendingCents: number };
    };
    expect(data.totals).toMatchObject({ collectedCents: 2000, pendingCents: 0 });

    const again = await act(e.ref, p.ref, 'received');
    expect(again.status).toBe(409);
    expect(await again.json()).toEqual({ error: 'not_pending', status: 'received' });
  });

  it('void excludes the payment from totals and records the actor', async () => {
    const e = await seedEvent('WPEVT00010');
    const p = await seedPayment(e.id, 'WPPAY00003', 2000);
    expect((await act(e.ref, p.ref, 'void', 22)).status).toBe(200);
    expect(await repo.getPaymentByRef(p.ref)).toMatchObject({ status: 'voided', voidedBy: 22 });

    const data = (await (await get(`/api/events/${e.ref}`)).json()) as {
      totals: { collectedCents: number; pendingCents: number };
    };
    expect(data.totals).toMatchObject({ collectedCents: 0, pendingCents: 0 });
    expect((await act(e.ref, p.ref, 'received')).status).toBe(409);
  });

  it('racing Received and Void have exactly one winner', async () => {
    const e = await seedEvent('WPEVT00011');
    const p = await seedPayment(e.id, 'WPPAY00004');
    const [a, b] = await Promise.all([
      act(e.ref, p.ref, 'received', 21),
      act(e.ref, p.ref, 'void', 22),
    ]);
    expect([a.status, b.status].sort()).toEqual([200, 409]);
  });

  it('refuses a payment of another event', async () => {
    const e = await seedEvent('WPEVT00012');
    const other = await seedEvent('WPEVT00013');
    const p = await seedPayment(other.id, 'WPPAY00005');
    expect((await act(e.ref, p.ref, 'void')).status).toBe(404);
    expect((await repo.getPaymentByRef(p.ref))!.status).toBe('pending');
  });
});
