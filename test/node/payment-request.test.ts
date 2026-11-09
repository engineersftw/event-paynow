import { describe, expect, it, vi } from 'vitest';
import type { Event, Payment, Repository } from '../../src/db/repository';
import {
  createPaymentRequest,
  KEEP_QR_REMINDER,
  paymentCaption,
  paymentImageLines,
  SHARE_HINT,
} from '../../src/payments/payment-request';

const event = {
  id: 3,
  ref: 'EVT1',
  chatId: -100,
  topicId: 0,
  name: 'Team Lunch',
  payeeType: 'mobile',
  payeeValue: '+6591110000',
  status: 'open',
} as Event;

describe('createPaymentRequest', () => {
  it('stores a pending manual payment with the event payee, name as description and the payer snapshot', async () => {
    const createPayment = vi.fn(async (p: Record<string, unknown>) => p as unknown as Payment);
    await createPaymentRequest({ createPayment } as unknown as Repository, event, {
      payerType: 'mobile',
      payerValue: '+6598887777',
      payerName: 'Alice',
      amountCents: 1250,
      userId: 42,
    });

    const arg = createPayment.mock.calls[0]![0] as Record<string, unknown>;
    expect(arg).toMatchObject({
      userId: 42,
      eventId: 3,
      description: 'Team Lunch',
      amountCents: 1250,
      payeeType: 'mobile',
      payeeValue: '+6591110000',
      payerType: 'mobile',
      payerValue: '+6598887777',
      payerName: 'Alice',
      status: 'pending',
      source: 'manual',
    });
    const payload = arg.qrPayload as string;
    expect(payload).toContain('+6591110000'); // the payee, not the payer
    expect(payload).not.toContain('+6598887777');
    expect(payload).toContain('12.50');
    expect(payload).toContain(arg.ref as string);
  });
});

describe('caption and image lines', () => {
  const payment = (payerName: string | null) =>
    ({
      ref: 'ABC123DEFG',
      description: 'Team Lunch',
      amountCents: 1250,
      payerName,
      payerValue: '+6598887777',
    }) as unknown as Payment;

  it('carry the name and never the payer number', () => {
    const p = payment('Alice');
    expect(paymentCaption(p)).toBe(
      `Team Lunch / SGD 12.50 / ABC123DEFG / Payer: Alice / ${KEEP_QR_REMINDER} / ${SHARE_HINT}`
    );
    expect(paymentImageLines(event, p)).toEqual([
      'Team Lunch',
      'SGD 12.50',
      'ABC123DEFG',
      'Payer: Alice',
    ]);
    expect(paymentCaption(p) + paymentImageLines(event, p).join()).not.toContain('98887777');
  });

  it('omit the payer segment without a name, and repeat the description only when it differs', () => {
    expect(paymentCaption(payment(null))).toBe(
      `Team Lunch / SGD 12.50 / ABC123DEFG / ${KEEP_QR_REMINDER} / ${SHARE_HINT}`
    );
    expect(paymentImageLines(event, payment(null))).toEqual([
      'Team Lunch',
      'SGD 12.50',
      'ABC123DEFG',
    ]);
    expect(paymentImageLines(event, { ...payment(null), description: 'Other' } as Payment)).toEqual(
      ['Team Lunch', 'Other', 'SGD 12.50', 'ABC123DEFG']
    );
  });
});
