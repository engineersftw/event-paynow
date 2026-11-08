import type { EventRepository, Payment } from '../db/repository.js';

/** (chatId, userId) → is the user an administrator/owner of that chat (live check, false on error). */
export type ChatAdminCheck = (chatId: number, userId: number) => Promise<boolean>;
/** May this user act on this payment (view, receive, void, pay back, sent, cancel)? */
export type PaymentAccess = (payment: Payment, userId: number) => Promise<boolean>;

/** Default: only the user who created the payment (the behaviour before chat admins). */
export const ownerOnly: PaymentAccess = async (payment, userId) => payment.userId === userId;

/**
 * The owner always may (no network call). Anyone else must be an administrator of the chat of
 * the payment's event; a payment with no event stays owner-only, and a failing check denies.
 */
export function createPaymentAccess(
  events: Pick<EventRepository, 'getEventById'>,
  isChatAdmin: ChatAdminCheck
): PaymentAccess {
  return async (payment, userId) => {
    if (payment.userId === userId) return true;
    if (payment.eventId == null) return false;
    try {
      const event = await events.getEventById(payment.eventId);
      return event ? await isChatAdmin(event.chatId, userId) : false;
    } catch {
      return false;
    }
  };
}
