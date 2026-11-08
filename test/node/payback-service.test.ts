import { describe, expect, it, vi } from 'vitest';
import { createPaybackFor } from '../../src/db/payback-service';
import type { Repository } from '../../src/db/repository';

describe('createPaybackFor', () => {
  it('builds a payload with the recipient as payee and passes the bounded result through', async () => {
    const createPaybackBounded = vi.fn(async (p: { ref: string }) => ({
      ok: true as const,
      payback: { ref: p.ref } as never,
      remainingCents: 500,
    }));
    const repo = { createPaybackBounded } as unknown as Repository;

    const result = await createPaybackFor(repo, {
      paymentId: 9,
      paymentRef: 'PAY123',
      recipientType: 'mobile',
      recipientValue: '+6598765432',
      amountCents: 550,
      createdBy: 42,
    });

    expect(result.ok).toBe(true);
    const arg = createPaybackBounded.mock.calls[0]![0] as Record<string, unknown>;
    expect(arg).toMatchObject({
      paymentId: 9,
      payerType: 'mobile',
      payerValue: '+6598765432',
      amountCents: 550,
      status: 'pending',
      createdBy: 42,
    });
    expect(arg.qrPayload).toContain('+6598765432');
    expect(arg.qrPayload).toContain('54045.50');
    expect(arg.qrPayload).toContain('Refund PAY123');
    expect(arg.qrPayload).toContain(arg.ref as string);
  });

  it('omits createdBy when none is given', async () => {
    const createPaybackBounded = vi.fn(async () => ({
      ok: false as const,
      reason: 'payment_not_found' as const,
    }));
    await createPaybackFor({ createPaybackBounded } as unknown as Repository, {
      paymentId: 1,
      paymentRef: 'P',
      recipientType: 'uen',
      recipientValue: '201234567A',
      amountCents: 100,
    });
    expect(createPaybackBounded.mock.calls[0]![0]).not.toHaveProperty('createdBy');
  });
});
