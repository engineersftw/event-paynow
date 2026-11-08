import { describe, expect, it, vi } from 'vitest';
import { createPaymentAccess, ownerOnly } from '../../src/commands/payment-access';
import type { EventRepository, Payment } from '../../src/db/repository';

const pay = (over: Partial<Payment> = {}) => ({ userId: 1, eventId: 7, ...over }) as Payment;

function setup(isAdmin: (c: number, u: number) => Promise<boolean>) {
  const events = {
    getEventById: vi.fn(async (id: number) => (id === 7 ? { id, chatId: -100 } : null)),
  } as unknown as EventRepository;
  return { events, access: createPaymentAccess(events, isAdmin) };
}

describe('payment access', () => {
  it('owner is allowed without any lookup', async () => {
    const isAdmin = vi.fn(async () => false);
    const { access, events } = setup(isAdmin);
    expect(await access(pay(), 1)).toBe(true);
    expect(isAdmin).not.toHaveBeenCalled();
    expect(events.getEventById).not.toHaveBeenCalled();
  });

  it('a chat admin is allowed, checked against the event’s chat', async () => {
    const isAdmin = vi.fn(async () => true);
    const { access } = setup(isAdmin);
    expect(await access(pay(), 2)).toBe(true);
    expect(isAdmin).toHaveBeenCalledWith(-100, 2);
  });

  it('an ordinary member is refused', async () => {
    expect(await setup(async () => false).access(pay(), 2)).toBe(false);
  });

  it('a payment without an event stays owner-only', async () => {
    const isAdmin = vi.fn(async () => true);
    expect(await setup(isAdmin).access(pay({ eventId: undefined }), 2)).toBe(false);
    expect(isAdmin).not.toHaveBeenCalled();
  });

  it('a failing admin check or a missing event denies', async () => {
    const boom = async () => {
      throw new Error('telegram down');
    };
    expect(await setup(boom).access(pay(), 2)).toBe(false);
    expect(await setup(async () => true).access(pay({ eventId: 999 }), 2)).toBe(false);
  });

  it('ownerOnly is the default and ignores events', async () => {
    expect(await ownerOnly(pay(), 1)).toBe(true);
    expect(await ownerOnly(pay(), 2)).toBe(false);
  });
});
