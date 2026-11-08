import { env } from 'cloudflare:test';
import { beforeAll, describe, expect, it } from 'vitest';
import { D1EventRepository, D1Repository } from '../../src/db/drizzle-repository';
import { applyTestSchema } from './harness';

const T = '2024-01-01T00:00:00Z';
let repo: D1Repository;

beforeAll(async () => {
  await applyTestSchema(env.paynow_db);
  repo = new D1Repository(env.paynow_db);
  await new D1EventRepository(env.paynow_db).createEvent({
    ref: 'AUDITEVT01',
    chatId: 1,
    topicId: 0,
    name: 'Audit',
    payeeType: 'mobile',
    payeeValue: '+6591110000',
    status: 'open',
    timestamp: T,
  });
});

async function payment(ref: string, cents = 1000) {
  return repo.createPayment({
    ref,
    userId: 1,
    eventId: 1,
    description: 'x',
    amountCents: cents,
    payeeType: 'mobile',
    payeeValue: '+6591110000',
    status: 'pending',
    source: 'manual',
    qrPayload: 'p',
    timestamp: T,
  });
}

async function payback(paymentId: number, ref: string, createdBy?: number) {
  const r = await repo.createPaybackBounded({
    ref,
    paymentId,
    payerType: 'mobile',
    payerValue: '+6592220000',
    amountCents: 100,
    status: 'pending',
    qrPayload: 'p',
    ...(createdBy !== undefined ? { createdBy } : {}),
    timestamp: T,
  });
  expect(r.ok).toBe(true);
}

describe('audit columns', () => {
  it('records who marked a payment received, and nobody when no actor is given', async () => {
    await payment('AUDPAY0001');
    await payment('AUDPAY0002');
    const withActor = await repo.updatePaymentStatus('AUDPAY0001', 'received', 'manual', T, 42);
    const without = await repo.updatePaymentStatus('AUDPAY0002', 'received', 'manual', T);
    expect(withActor).toMatchObject({ receivedBy: 42, voidedBy: null });
    expect(without).toMatchObject({ receivedBy: null });
  });

  it('records who voided a payment', async () => {
    await payment('AUDPAY0003');
    expect(await repo.voidPayment('AUDPAY0003', 77)).toMatchObject({
      status: 'voided',
      voidedBy: 77,
      receivedBy: null,
    });
  });

  it('a lost Received-vs-Void race records only the winner', async () => {
    await payment('AUDPAY0004');
    const [received, voided] = await Promise.all([
      repo.updatePaymentStatus('AUDPAY0004', 'received', 'manual', T, 1),
      repo.voidPayment('AUDPAY0004', 2),
    ]);
    const final = (await repo.getPaymentByRef('AUDPAY0004'))!;
    expect([received, voided].filter(Boolean)).toHaveLength(1);
    if (final.status === 'received') {
      expect(final).toMatchObject({ receivedBy: 1, voidedBy: null });
    } else {
      expect(final).toMatchObject({ voidedBy: 2, receivedBy: null });
    }
  });

  it('records the creator, the sender and the canceller of paybacks', async () => {
    const p = await payment('AUDPAY0005', 5000);
    await repo.updatePaymentStatus('AUDPAY0005', 'received', 'manual', T, 1);
    await payback(p.id, 'AUDPB00001', 10);
    await payback(p.id, 'AUDPB00002', 11);
    await payback(p.id, 'AUDPB00003'); // no creator given

    expect(await repo.updatePaybackStatus('AUDPB00001', 'sent', T, 20)).toMatchObject({
      createdBy: 10,
      sentBy: 20,
      cancelledBy: null,
    });
    expect(await repo.updatePaybackStatus('AUDPB00002', 'cancelled', T, 30)).toMatchObject({
      createdBy: 11,
      sentBy: null,
      cancelledBy: 30,
    });
    expect((await repo.getPaybackByRef('AUDPB00003'))!.createdBy).toBeNull();
  });

  it('a lost Sent-vs-Cancel race records only the winner', async () => {
    const p = await payment('AUDPAY0006', 5000);
    await repo.updatePaymentStatus('AUDPAY0006', 'received', 'manual', T, 1);
    await payback(p.id, 'AUDPB00004', 10);
    const [sent, cancelled] = await Promise.all([
      repo.updatePaybackStatus('AUDPB00004', 'sent', T, 20),
      repo.updatePaybackStatus('AUDPB00004', 'cancelled', T, 30),
    ]);
    expect([sent, cancelled].filter(Boolean)).toHaveLength(1);
    const final = (await repo.getPaybackByRef('AUDPB00004'))!;
    if (final.status === 'sent') expect(final).toMatchObject({ sentBy: 20, cancelledBy: null });
    else expect(final).toMatchObject({ cancelledBy: 30, sentBy: null });
  });
});
