import { buildPayNowPayload } from '../sgqr/paynow';
import { generateRef } from './proxy-validation';
import type { CreatePaybackBoundedResult, PayeeType, Repository } from './repository';

export interface CreatePaybackInput {
  paymentId: number;
  paymentRef: string;
  recipientType: PayeeType;
  recipientValue: string;
  amountCents: number;
  /** Telegram user id of whoever creates it (audit). */
  createdBy?: number;
}

/**
 * Build and store a pending payback inside the bounded D1 transaction. The QR payload encodes
 * the RECIPIENT as payee proxy (the collector scans it in their own bank app to send the money
 * back). Shared by the bot and the web admin page so the payload shape cannot drift.
 */
export function createPaybackFor(
  repo: Repository,
  input: CreatePaybackInput
): Promise<CreatePaybackBoundedResult> {
  const ref = generateRef();
  const qrPayload = buildPayNowPayload({
    proxyType: input.recipientType,
    proxyValue: input.recipientValue,
    amountCents: input.amountCents,
    reference: ref,
    description: `Refund ${input.paymentRef}`,
  });

  return repo.createPaybackBounded({
    ref,
    paymentId: input.paymentId,
    payerType: input.recipientType,
    payerValue: input.recipientValue,
    amountCents: input.amountCents,
    status: 'pending',
    qrPayload,
    ...(input.createdBy !== undefined ? { createdBy: input.createdBy } : {}),
    timestamp: new Date().toISOString(),
  });
}
