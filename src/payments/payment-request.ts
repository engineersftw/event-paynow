import { captionPart } from '../commands/payer-label';
import { generateRef } from '../db/proxy-validation';
import type { Event, PayeeType, Payment, Repository } from '../db/repository';
import { formatCents } from '../sgqr/amount';
import { buildPayNowPayload } from '../sgqr/paynow';

export const SHARE_HINT = 'Forward this message to share';

export interface PaymentRequestInput {
  payerType: PayeeType;
  payerValue: string;
  payerName: string | null;
  amountCents: number;
  /** Telegram user id of whoever creates it; becomes the payment's owner. */
  userId: number;
}

/**
 * Create a pending payment request for an event: the QR encodes the event's payee, the event name
 * is the description, and the payer is snapshotted. Shared by `/start` and the web admin page so
 * both produce identical requests.
 */
export async function createPaymentRequest(
  repo: Repository,
  event: Event,
  input: PaymentRequestInput
): Promise<Payment> {
  const ref = generateRef();
  const qrPayload = buildPayNowPayload({
    proxyType: event.payeeType,
    proxyValue: event.payeeValue,
    amountCents: input.amountCents,
    merchantName: event.name,
    reference: ref,
    description: event.name,
  });

  return repo.createPayment({
    ref,
    userId: input.userId,
    eventId: event.id,
    description: event.name,
    amountCents: input.amountCents,
    payeeType: event.payeeType,
    payeeValue: event.payeeValue,
    payerType: input.payerType,
    payerValue: input.payerValue,
    payerName: input.payerName,
    status: 'pending',
    source: 'manual',
    qrPayload,
    timestamp: new Date().toISOString(),
  });
}

/** Name only: this caption is forwarded, so it never carries the payer's number. */
export function paymentCaption(payment: Payment): string {
  return [
    payment.description,
    `SGD ${formatCents(payment.amountCents)}`,
    payment.ref,
    ...captionPart('Payer', payment.payerName),
    SHARE_HINT,
  ].join(' / ');
}

/** Detail lines printed below the QR (same name-only rule as the caption). */
export function paymentImageLines(event: Pick<Event, 'name'>, payment: Payment): string[] {
  return [
    event.name,
    ...(payment.description === event.name ? [] : [payment.description]),
    `SGD ${formatCents(payment.amountCents)}`,
    payment.ref,
    ...captionPart('Payer', payment.payerName),
  ];
}
