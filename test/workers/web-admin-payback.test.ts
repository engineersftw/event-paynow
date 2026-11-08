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
const admin = (async () =>
  new Response(JSON.stringify({ ok: true, result: { status: 'administrator' } }))) as typeof fetch;
const member = (async () =>
  new Response(JSON.stringify({ ok: true, result: { status: 'member' } }))) as typeof fetch;

let repo: D1Repository;
let events: D1EventRepository;

beforeAll(async () => {
  await applyTestSchema(env.paynow_db);
  repo = new D1Repository(env.paynow_db);
  events = new D1EventRepository(env.paynow_db);
});

async function seedEvent(ref: string) {
  return events.createEvent({
    ref,
    chatId: -50,
    topicId: 0,
    name: ref,
    payeeType: 'mobile',
    payeeValue: '+6591110000',
    status: 'open',
    timestamp: T,
  });
}

async function seedPayment(
  eventId: number,
  ref: string,
  cents: number,
  opts: { received?: boolean; payer?: boolean } = {}
) {
  const { received = true, payer = true } = opts;
  const p = await repo.createPayment({
    ref,
    userId: 1,
    eventId,
    description: ref,
    amountCents: cents,
    payeeType: 'mobile',
    payeeValue: '+6591110000',
    status: 'pending',
    source: 'manual',
    qrPayload: 'p',
    ...(payer
      ? { payerType: 'mobile' as const, payerValue: '+6598887777', payerName: 'Alice' }
      : {}),
    timestamp: T,
  });
  if (received) await repo.updatePaymentStatus(ref, 'received', 'manual', T, 1);
  return p;
}

async function post(
  path: string,
  body: unknown,
  o: {
    userId?: number | null;
    origin?: string | null;
    contentType?: string;
    fetchFn?: typeof fetch;
  } = {}
) {
  const { userId = 99, origin = ORIGIN, contentType = 'application/json', fetchFn = admin } = o;
  const headers: Record<string, string> = { 'Content-Type': contentType };
  if (origin) headers.Origin = origin;
  if (userId) headers.Cookie = `session=${await signSession(userId, 'sess')}`;
  return handleWeb(
    new Request(`${ORIGIN}${path}`, { method: 'POST', headers, body: JSON.stringify(body) }),
    webEnv,
    fetchFn
  );
}

async function get(path: string, userId = 99, fetchFn: typeof fetch = admin) {
  return handleWeb(
    new Request(`${ORIGIN}${path}`, {
      headers: { Cookie: `session=${await signSession(userId, 'sess')}` },
    }),
    webEnv,
    fetchFn
  );
}

const createPath = (e: string, p: string) => `/api/events/${e}/payments/${p}/paybacks`;

describe('payback requests: access and safety', () => {
  it('refuses without a session, from non-admins, cross-origin and non-JSON, recording nothing', async () => {
    const e = await seedEvent('PBEVT00001');
    const p = await seedPayment(e.id, 'PBPAY00001', 2000);
    const path = createPath(e.ref, p.ref);

    expect((await post(path, { amount: '5' }, { userId: null })).status).toBe(401);
    expect((await post(path, { amount: '5' }, { fetchFn: member })).status).toBe(403);
    expect((await post(path, { amount: '5' }, { origin: 'https://evil.test' })).status).toBe(403);
    expect((await post(path, { amount: '5' }, { origin: null })).status).toBe(403);
    expect((await post(path, { amount: '5' }, { contentType: 'text/plain' })).status).toBe(403);
    expect(await repo.listPaybacksByPayment(p.id)).toHaveLength(0);
  });
});

describe('create payback', () => {
  it('pays back the stored payer and records the creator', async () => {
    const e = await seedEvent('PBEVT00002');
    const p = await seedPayment(e.id, 'PBPAY00002', 2000);
    const res = await post(createPath(e.ref, p.ref), { amount: '5.00' }, { userId: 123 });
    expect(res.status).toBe(201);
    const { payback } = (await res.json()) as { payback: { ref: string } };
    const stored = (await repo.getPaybackByRef(payback.ref))!;
    expect(stored).toMatchObject({
      amountCents: 500,
      status: 'pending',
      payerValue: '+6598887777',
      createdBy: 123,
    });
    expect(stored.qrPayload).toContain('+6598887777');
  });

  it('a different recipient applies to that payback only', async () => {
    const e = await seedEvent('PBEVT00003');
    const p = await seedPayment(e.id, 'PBPAY00003', 2000);
    const res = await post(createPath(e.ref, p.ref), { amount: '5', recipient: '91234567' });
    expect(res.status).toBe(201);
    const [pb] = await repo.listPaybacksByPayment(p.id);
    expect(pb!.payerValue).toBe('+6591234567');
    expect((await repo.getPaymentByRef(p.ref))!.payerValue).toBe('+6598887777');
  });

  it('refuses invalid input, a missing recipient, non-received and other-event payments', async () => {
    const e = await seedEvent('PBEVT00004');
    const other = await seedEvent('PBEVT00005');
    const ok = await seedPayment(e.id, 'PBPAY00004', 2000);
    const legacy = await seedPayment(e.id, 'PBPAY00005', 2000, { payer: false });
    const pending = await seedPayment(e.id, 'PBPAY00006', 2000, { received: false });
    const elsewhere = await seedPayment(other.id, 'PBPAY00007', 2000);

    const code = async (path: string, body: unknown) => {
      const r = await post(path, body);
      return [r.status, ((await r.json()) as { error?: string }).error] as const;
    };
    expect(await code(createPath(e.ref, ok.ref), { amount: '5.123' })).toEqual([
      400,
      'invalid_amount',
    ]);
    expect(await code(createPath(e.ref, ok.ref), { amount: '5', recipient: 'nope' })).toEqual([
      400,
      'invalid_recipient',
    ]);
    expect(await code(createPath(e.ref, legacy.ref), { amount: '5' })).toEqual([
      400,
      'recipient_required',
    ]);
    expect(await code(createPath(e.ref, pending.ref), { amount: '5' })).toEqual([
      409,
      'not_received',
    ]);
    expect(await code(createPath(e.ref, elsewhere.ref), { amount: '5' })).toEqual([
      404,
      'not_found',
    ]);
    for (const pay of [ok, legacy, pending, elsewhere]) {
      expect(await repo.listPaybacksByPayment(pay.id)).toHaveLength(0);
    }
  });

  it('refuses an amount over the bound with the remaining amount', async () => {
    const e = await seedEvent('PBEVT00006');
    const p = await seedPayment(e.id, 'PBPAY00008', 1000);
    expect((await post(createPath(e.ref, p.ref), { amount: '6' })).status).toBe(201);
    const res = await post(createPath(e.ref, p.ref), { amount: '5' });
    expect(res.status).toBe(409);
    expect(await res.json()).toEqual({ error: 'over_bound', remainingCents: 400 });
    expect(await repo.listPaybacksByPayment(p.id)).toHaveLength(1);
  });

  it('of two racing paybacks that together exceed the amount, at most one is recorded', async () => {
    const e = await seedEvent('PBEVT00007');
    const p = await seedPayment(e.id, 'PBPAY00009', 1000);
    const results = await Promise.all([
      post(createPath(e.ref, p.ref), { amount: '6' }),
      post(createPath(e.ref, p.ref), { amount: '6' }),
    ]);
    expect(results.filter((r) => r.status === 201)).toHaveLength(1);
    expect(await repo.listPaybacksByPayment(p.id)).toHaveLength(1);
  });
});

describe('payback QR, sent and cancel', () => {
  async function newPayback(eventRef: string, cents = 2000) {
    const e = await seedEvent(eventRef);
    const p = await seedPayment(e.id, `P${eventRef.slice(-9)}`, cents);
    const res = await post(createPath(e.ref, p.ref), { amount: '5' }, { userId: 10 });
    const { payback } = (await res.json()) as { payback: { ref: string } };
    return { e, p, pb: payback.ref };
  }

  it('serves a PNG to an admin of the event, and 404 for another event or a non-admin', async () => {
    const { e, pb } = await newPayback('PBEVT00008');
    const other = await seedEvent('PBEVT00009');

    const ok = await get(`/api/events/${e.ref}/paybacks/${pb}/qr`);
    expect(ok.status).toBe(200);
    expect(ok.headers.get('Content-Type')).toBe('image/png');
    const bytes = new Uint8Array(await ok.arrayBuffer());
    expect([...bytes.subarray(0, 4)]).toEqual([0x89, 0x50, 0x4e, 0x47]);

    expect((await get(`/api/events/${other.ref}/paybacks/${pb}/qr`)).status).toBe(404);
    expect((await get(`/api/events/${e.ref}/paybacks/${pb}/qr`, 99, member)).status).toBe(403);
  });

  it('marking sent reduces net and collected and records the actor; a repeat is refused', async () => {
    const { e, p, pb } = await newPayback('PBEVT00010');
    const res = await post(`/api/events/${e.ref}/paybacks/${pb}/sent`, {}, { userId: 20 });
    expect(res.status).toBe(200);
    expect(await repo.getPaybackByRef(pb)).toMatchObject({
      status: 'sent',
      sentBy: 20,
      cancelledBy: null,
    });

    const data = (await (await get(`/api/events/${e.ref}`)).json()) as {
      totals: { collectedCents: number; paidBackCents: number };
      payments: Array<{ ref: string; netCents: number; remainingCents: number }>;
    };
    expect(data.totals).toMatchObject({ collectedCents: 1500, paidBackCents: 500 });
    expect(data.payments.find((x) => x.ref === p.ref)).toMatchObject({
      netCents: 1500,
      remainingCents: 1500,
    });

    const again = await post(`/api/events/${e.ref}/paybacks/${pb}/sent`, {});
    expect(again.status).toBe(409);
    expect(await again.json()).toEqual({ error: 'not_pending', status: 'sent' });
  });

  it('cancelling changes no figure, frees the amount and records the actor', async () => {
    const { e, p, pb } = await newPayback('PBEVT00011', 1000);
    expect(
      (await post(`/api/events/${e.ref}/paybacks/${pb}/cancel`, {}, { userId: 30 })).status
    ).toBe(200);
    expect(await repo.getPaybackByRef(pb)).toMatchObject({ status: 'cancelled', cancelledBy: 30 });

    const data = (await (await get(`/api/events/${e.ref}`)).json()) as {
      totals: { collectedCents: number; paidBackCents: number };
      payments: Array<{ ref: string; remainingCents: number }>;
    };
    expect(data.totals).toMatchObject({ collectedCents: 1000, paidBackCents: 0 });
    expect(data.payments.find((x) => x.ref === p.ref)!.remainingCents).toBe(1000);
    // the freed amount can be paid back again
    expect((await post(createPath(e.ref, p.ref), { amount: '10' })).status).toBe(201);
  });

  it('racing Sent and Cancel have exactly one winner', async () => {
    const { e, pb } = await newPayback('PBEVT00012');
    const [a, b] = await Promise.all([
      post(`/api/events/${e.ref}/paybacks/${pb}/sent`, {}, { userId: 20 }),
      post(`/api/events/${e.ref}/paybacks/${pb}/cancel`, {}, { userId: 30 }),
    ]);
    expect([a.status, b.status].sort()).toEqual([200, 409]);
  });

  it('refuses a payback of another event', async () => {
    const { pb } = await newPayback('PBEVT00013');
    const other = await seedEvent('PBEVT00014');
    expect((await post(`/api/events/${other.ref}/paybacks/${pb}/sent`, {})).status).toBe(404);
  });
});

describe('event payload with paybacks', () => {
  it('lists paybacks with names only and the remaining amount, ignoring cancelled ones', async () => {
    const e = await seedEvent('PBEVT00015');
    const p = await seedPayment(e.id, 'PBPAY00015', 2000);
    const mk = async (cents: string) =>
      (
        (await (await post(createPath(e.ref, p.ref), { amount: cents })).json()) as {
          payback: { ref: string };
        }
      ).payback.ref;
    const a = await mk('5');
    const b = await mk('3');
    await post(`/api/events/${e.ref}/paybacks/${a}/sent`, {});
    await post(`/api/events/${e.ref}/paybacks/${b}/cancel`, {});

    const raw = await (await get(`/api/events/${e.ref}`)).text();
    const body = JSON.parse(raw);
    const row = body.payments.find((x: { ref: string }) => x.ref === p.ref);
    expect(row.remainingCents).toBe(1500);
    expect(row.paybacks.map((x: { status: string }) => x.status).sort()).toEqual([
      'cancelled',
      'sent',
    ]);
    expect(row.paybacks[0].recipientName).toBe('Alice');
    expect(raw).not.toContain('+6598887777');
  });
});
