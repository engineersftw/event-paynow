import { env } from 'cloudflare:test';
import { beforeAll, describe, expect, it } from 'vitest';
import { D1EventRepository, D1Repository } from '../../src/db/drizzle-repository';
import type { PaybackStatus } from '../../src/db/repository';
import { applyTestSchema } from './harness';

const T = '2024-01-01T00:00:00Z';
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
    chatId: 1,
    topicId: 0,
    name: ref,
    payeeType: 'mobile',
    payeeValue: '+6591110000',
    status: 'open',
    timestamp: T,
  });
}

async function seedPayment(eventId: number, ref: string, cents: number, received = true) {
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
    timestamp: T,
  });
  if (received) await repo.updatePaymentStatus(ref, 'received', 'manual', T);
  return p;
}

async function seedPayback(paymentId: number, ref: string, cents: number, status: PaybackStatus) {
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
  if (status !== 'pending') await repo.updatePaybackStatus(ref, status, T);
}

describe('event stats net of paybacks', () => {
  it('no paybacks: collected is gross and paid back is zero', async () => {
    const e = await seedEvent('NETEVT0001');
    await seedPayment(e.id, 'NETPAY0001', 1000);
    expect(await events.getEventStats(e.id)).toEqual({
      paymentCount: 1,
      collectedCents: 1000,
      paidBackCents: 0,
      pendingCents: 0,
      checkedInCount: 0,
      notCheckedInPaidCount: 1,
      notCheckedInPendingCount: 0,
    });
  });

  it('sent paybacks reduce collected; pending and cancelled do not', async () => {
    const e = await seedEvent('NETEVT0002');
    const p = await seedPayment(e.id, 'NETPAY0002', 1000);
    await seedPayback(p.id, 'NETPB00001', 300, 'sent');
    await seedPayback(p.id, 'NETPB00002', 200, 'pending');
    await seedPayback(p.id, 'NETPB00003', 100, 'cancelled');
    await seedPayment(e.id, 'NETPAY0003', 500, false); // pending payment

    expect(await events.getEventStats(e.id)).toEqual({
      paymentCount: 2,
      collectedCents: 700,
      paidBackCents: 300,
      pendingCents: 500,
      checkedInCount: 0,
      notCheckedInPaidCount: 1,
      notCheckedInPendingCount: 1,
    });
  });

  it('a voided payment contributes nothing', async () => {
    const e = await seedEvent('NETEVT0003');
    await seedPayment(e.id, 'NETPAY0004', 400);
    const v = await seedPayment(e.id, 'NETPAY0005', 900, false);
    await repo.voidPayment(v.ref);
    const s = await events.getEventStats(e.id);
    expect(s).toMatchObject({ paymentCount: 1, collectedCents: 400, paidBackCents: 0 });
  });
});

describe('sentPaybackTotalsByEvent', () => {
  it('sums sent paybacks per payment, ignoring pending/cancelled and other events', async () => {
    const e = await seedEvent('NETEVT0004');
    const other = await seedEvent('NETEVT0005');
    const a = await seedPayment(e.id, 'NETPAY0006', 2000);
    const b = await seedPayment(e.id, 'NETPAY0007', 2000);
    const c = await seedPayment(other.id, 'NETPAY0008', 2000);
    await seedPayback(a.id, 'NETPB00004', 500, 'sent');
    await seedPayback(a.id, 'NETPB00005', 250, 'sent');
    await seedPayback(a.id, 'NETPB00006', 100, 'pending');
    await seedPayback(b.id, 'NETPB00007', 300, 'cancelled');
    await seedPayback(c.id, 'NETPB00008', 999, 'sent');

    const totals = await repo.sentPaybackTotalsByEvent(e.id);
    expect(Object.fromEntries(totals)).toEqual({ [a.id]: 750 });
    expect((await repo.sentPaybackTotalsByEvent(999_999)).size).toBe(0);
  });
});
