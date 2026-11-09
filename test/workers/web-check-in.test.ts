import { env } from 'cloudflare:test';
import { beforeAll, describe, expect, it } from 'vitest';
import { D1EventRepository, D1Repository } from '../../src/db/drizzle-repository';
import type { Event } from '../../src/db/repository';
import { createPaymentRequest } from '../../src/payments/payment-request';
import { signSession } from '../../src/web/auth';
import { handleWeb, type WebEnv } from '../../src/web/handler';
import { applyTestSchema } from './harness';

const webEnv: WebEnv = {
  paynow_db: env.paynow_db,
  TELEGRAM_BOT_TOKEN: 'tok',
  SESSION_SECRET: 'sess',
  BOT_USERNAME: 'my_bot',
};
const status = (s: string) =>
  (async () => new Response(JSON.stringify({ ok: true, result: { status: s } }))) as typeof fetch;
const admin = status('administrator');
const member = status('member');

const ORIGIN = 'https://x.test';
const T = '2024-01-01T00:00:00Z';
let repo: D1Repository;
let events: D1EventRepository;

async function seedEvent(ref: string, chatId: number, closed = false): Promise<Event> {
  const e = await events.createEvent({
    ref,
    chatId,
    topicId: 0,
    name: 'Dinner',
    payeeType: 'mobile',
    payeeValue: '+6591110000',
    status: 'open',
    timestamp: T,
  });
  if (closed) await events.closeEvent(ref, T);
  return e;
}

/** A real payment created the way every path creates one, so its QR carries its reference. */
const seedPayment = (e: Event, name: string | null = 'Alice') =>
  createPaymentRequest(repo, e, {
    payerType: 'mobile',
    payerValue: '+6598887777',
    payerName: name,
    amountCents: 2300,
    userId: 1,
  });

async function post(
  path: string,
  body: unknown,
  o: { userId?: number | null; origin?: string | null; fetchFn?: typeof fetch } = {}
) {
  const { userId = 99, origin = ORIGIN, fetchFn = admin } = o;
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (origin) headers.Origin = origin;
  if (userId) headers.Cookie = `session=${await signSession(userId, 'sess')}`;
  return handleWeb(
    new Request(`${ORIGIN}${path}`, { method: 'POST', headers, body: JSON.stringify(body) }),
    webEnv,
    fetchFn
  );
}

beforeAll(async () => {
  await applyTestSchema(env.paynow_db);
  repo = new D1Repository(env.paynow_db);
  events = new D1EventRepository(env.paynow_db);
});

describe('POST /api/events/:ref/scan', () => {
  it('resolves a payment QR and a typed reference, with names only', async () => {
    const e = await seedEvent('EVTSCAN001', -80);
    const p = await seedPayment(e);

    const viaQr = await post(`/api/events/${e.ref}/scan`, { payload: p.qrPayload });
    expect(viaQr.status).toBe(200);
    const text = await viaQr.text();
    const body = JSON.parse(text) as { payment: Record<string, unknown> };
    expect(body.payment).toMatchObject({
      ref: p.ref,
      payerName: 'Alice',
      amountCents: 2300,
      status: 'pending',
      checkedInAt: null,
    });
    expect(text).not.toContain('+6598887777');
    expect(text).not.toContain('+6591110000');

    // Typed reference: any case, with spaces
    const typed = await post(`/api/events/${e.ref}/scan`, { ref: ` ${p.ref.toLowerCase()} ` });
    expect(typed.status).toBe(200);
    expect(((await typed.json()) as { payment: { ref: string } }).payment.ref).toBe(p.ref);
  });

  it('does not recognise another event’s QR, a payback QR, an edited or unknown code', async () => {
    const e = await seedEvent('EVTSCAN002', -81);
    const other = await seedEvent('EVTSCAN003', -81);
    const mine = await seedPayment(e);
    const theirs = await seedPayment(other);

    const path = `/api/events/${e.ref}/scan`;
    expect((await post(path, { payload: theirs.qrPayload })).status).toBe(404);
    expect((await post(path, { ref: theirs.ref })).status).toBe(404);
    // Same reference but a different amount in the code: not this payment's QR
    const edited = mine.qrPayload.replace('540523.00', '540599.00');
    expect(edited).not.toBe(mine.qrPayload);
    expect((await post(path, { payload: edited })).status).toBe(404);
    for (const bad of ['garbage', '', mine.qrPayload.replace(mine.ref, 'ZZZZZZZZZZ')]) {
      expect((await post(path, { payload: bad })).status).toBe(bad === '' ? 400 : 404);
    }
    expect((await post(path, { ref: 'NOSUCHPAY1' })).status).toBe(404);
    expect((await post(path, {})).status).toBe(400);
    expect((await post(path, { ref: 42 })).status).toBe(400);

    // A payback QR carries the payback's reference, not a payment's
    await repo.updatePaymentStatus(mine.ref, 'received', 'manual', T);
    const pb = await repo.createPayback({
      ref: 'PBSCAN0001',
      paymentId: mine.id,
      payerType: 'mobile',
      payerValue: '+6598887777',
      amountCents: 500,
      status: 'pending',
      qrPayload: (await import('../../src/sgqr/paynow')).buildPayNowPayload({
        proxyType: 'mobile',
        proxyValue: '+6598887777',
        amountCents: 500,
        reference: 'PBSCAN0001',
      }),
      timestamp: T,
    });
    expect((await post(path, { payload: pb.qrPayload })).status).toBe(404);
  });

  it('resolves a payment that is beyond the first page of the list', async () => {
    const e = await seedEvent('EVTSCAN004', -82);
    const first = await seedPayment(e);
    for (let i = 0; i < 25; i++) await seedPayment(e);
    const res = await post(`/api/events/${e.ref}/scan`, { payload: first.qrPayload });
    expect(res.status).toBe(200);
  });

  it('refuses non-admins and anonymous callers, and cross-origin writes', async () => {
    const e = await seedEvent('EVTSCAN005', -83);
    const p = await seedPayment(e);
    const path = `/api/events/${e.ref}/scan`;
    const denied = await post(path, { payload: p.qrPayload }, { fetchFn: member });
    expect(denied.status).toBe(403);
    expect(await denied.text()).not.toContain('Alice');
    expect((await post(path, { payload: p.qrPayload }, { userId: null })).status).toBe(401);
    expect(
      (await post(path, { payload: p.qrPayload }, { origin: 'https://evil.test' })).status
    ).toBe(403);
  });
});

describe('POST /api/events/:ref/payments/:paymentRef/check-in', () => {
  const checkIn = (e: Event, p: { ref: string }, o = {}) =>
    post(`/api/events/${e.ref}/payments/${p.ref}/check-in`, {}, o);

  it('checks in a pending and a received payment and records the admin', async () => {
    const e = await seedEvent('EVTCHKIN01', -84);
    const pending = await seedPayment(e);
    const received = await seedPayment(e);
    await repo.updatePaymentStatus(received.ref, 'received', 'manual', T);

    const a = await checkIn(e, pending, { userId: 31 });
    expect(a.status).toBe(200);
    const body = (await a.json()) as { payment: { status: string; checkedInAt: string } };
    expect(body.payment.status).toBe('pending');
    expect(body.payment.checkedInAt).toMatch(/^\d{4}-/);
    expect(await repo.getPaymentByRef(pending.ref)).toMatchObject({ checkedInBy: 31 });
    expect((await checkIn(e, received)).status).toBe(200);

    // The list now carries the mark
    const list = (await (
      await handleWeb(
        new Request(`${ORIGIN}/api/events/${e.ref}`, {
          headers: { Cookie: `session=${await signSession(99, 'sess')}` },
        }),
        webEnv,
        admin
      )
    ).json()) as { payments: Array<{ ref: string; checkedInAt: string | null }> };
    expect(list.payments.find((p) => p.ref === pending.ref)!.checkedInAt).toBe(
      body.payment.checkedInAt
    );
  });

  it('reports a repeat as already checked in with the first time, keeping the first admin', async () => {
    const e = await seedEvent('EVTCHKIN02', -85);
    const p = await seedPayment(e);
    const first = (await (await checkIn(e, p, { userId: 41 })).json()) as {
      payment: { checkedInAt: string };
    };
    const again = await checkIn(e, p, { userId: 42 });
    expect(again.status).toBe(409);
    expect(await again.json()).toEqual({
      error: 'already_checked_in',
      checkedInAt: first.payment.checkedInAt,
    });
    expect((await repo.getPaymentByRef(p.ref))!.checkedInBy).toBe(41);
  });

  it('refuses voided payments, other events’ payments, non-admins and cross-origin writes', async () => {
    const e = await seedEvent('EVTCHKIN03', -86);
    const other = await seedEvent('EVTCHKIN04', -86);
    const voided = await seedPayment(e);
    await repo.voidPayment(voided.ref);
    const foreign = await seedPayment(other);
    const ok = await seedPayment(e);

    const v = await checkIn(e, voided);
    expect([v.status, await v.json()]).toEqual([409, { error: 'voided' }]);
    expect((await repo.getPaymentByRef(voided.ref))!.checkedInAt).toBeNull();
    expect((await checkIn(e, foreign)).status).toBe(404);
    expect((await checkIn(e, ok, { fetchFn: member })).status).toBe(403);
    expect((await checkIn(e, ok, { userId: null })).status).toBe(401);
    expect((await checkIn(e, ok, { origin: 'https://evil.test' })).status).toBe(403);
    expect((await repo.getPaymentByRef(ok.ref))!.checkedInAt).toBeNull();
  });

  it('works on a closed event', async () => {
    const e = await seedEvent('EVTCHKIN05', -87, true);
    const p = await seedPayment(e);
    expect((await checkIn(e, p)).status).toBe(200);
  });
});
