/**
 * Repository layer for database operations.
 * Provides infra-neutral interfaces that abstract over the D1/Drizzle implementation.
 */

// ============================================================================
// Types (plain TypeScript, not Drizzle types)
// ============================================================================

export type PayeeType = 'mobile' | 'uen';
export type PaymentStatus = 'pending' | 'received';
export type PaybackStatus = 'pending' | 'sent';
export type ReceiptSource = 'manual' | 'notification';
export type EventStatus = 'open' | 'closed';

export interface Event {
  id: number;
  ref: string;
  chatId: number;
  topicId: number;
  name: string;
  payeeType: PayeeType;
  payeeValue: string;
  status: EventStatus;
  createdAt: string;
  closedAt: string | null;
}

/**
 * Stats for an event (payment counts and amounts).
 */
export interface EventStats {
  paymentCount: number;
  collectedCents: number; // sum of received payments
  pendingCents: number; // sum of pending payments
}

export interface User {
  telegramId: number;
  payeeType: PayeeType;
  payeeValue: string;
  displayName: string;
  createdAt: string;
  updatedAt: string;
}

export interface Payment {
  id: number;
  ref: string;
  userId: number;
  eventId?: number;
  description: string;
  amountCents: number;
  payeeType: PayeeType;
  payeeValue: string;
  status: PaymentStatus;
  source: ReceiptSource;
  qrPayload: string;
  payerType?: PayeeType | null;
  payerValue?: string | null;
  payerName?: string | null;
  createdAt: string;
  receivedAt: string | null;
}

export interface Payback {
  id: number;
  ref: string;
  paymentId: number;
  payerType: PayeeType;
  payerValue: string;
  amountCents: number;
  status: PaybackStatus;
  qrPayload: string;
  createdAt: string;
  sentAt: string | null;
}

/**
 * Outcome of a bounded payback creation (task 7.2).
 * `ok: true` carries the stored row and the payable amount remaining after it.
 * `over_bound` carries the in-transaction totals so callers can explain the refusal.
 * The bound counts ALL paybacks (pending and sent): status only tracks delivery,
 * so marking a payback sent never frees up room for another.
 */
export type CreatePaybackBoundedResult =
  | { ok: true; payback: Payback; remainingCents: number }
  | {
      ok: false;
      reason: 'over_bound';
      paymentAmountCents: number;
      paidBackCents: number;
      remainingCents: number;
    }
  | { ok: false; reason: 'payment_not_found' };

// ============================================================================
// Event Repository Interface
// ============================================================================

export interface EventRepository {
  createEvent(
    event: Omit<Event, 'id' | 'createdAt' | 'closedAt'> & { timestamp: string }
  ): Promise<Event>;
  listOpenEventsByChat(chatId: number, topicId: number): Promise<Event[]>;
  listAllEventsByChat(chatId: number, topicId: number): Promise<Event[]>;
  getEventByRef(ref: string): Promise<Event | null>;
  closeEvent(ref: string, timestamp: string): Promise<boolean>; // returns true if closed (was open)
  getEventStats(eventId: number): Promise<EventStats>;
}

export interface Repository {
  // Users
  upsertUser(user: Omit<User, 'createdAt' | 'updatedAt'> & { timestamp: string }): Promise<User>;
  getUser(telegramId: number): Promise<User | null>;

  // Payments
  createPayment(
    payment: Omit<Payment, 'id' | 'createdAt' | 'receivedAt'> & { timestamp: string }
  ): Promise<Payment>;
  getPaymentByRef(ref: string): Promise<Payment | null>;
  listPaymentsByUser(userId: number): Promise<Payment[]>;
  updatePaymentStatus(
    ref: string,
    status: PaymentStatus,
    source: ReceiptSource,
    timestamp: string
  ): Promise<Payment | null>;

  // Paybacks
  createPayback(
    payback: Omit<Payback, 'id' | 'createdAt' | 'sentAt'> & { timestamp: string }
  ): Promise<Payback>;
  /**
   * Create a payback only if `SUM(paybacks) + amountCents <= payment.amountCents`
   * still holds when the write commits — counting both pending and sent rows.
   * The re-check runs inside the same D1 batch (transaction) as the insert as a
   * compare-and-set guard, so concurrent requests can never push the total over
   * the original amount (design §5, task 7.2).
   */
  createPaybackBounded(
    payback: Omit<Payback, 'id' | 'createdAt' | 'sentAt'> & { timestamp: string }
  ): Promise<CreatePaybackBoundedResult>;
  getPaybackByRef(ref: string): Promise<Payback | null>;
  /**
   * Transition a payback's status. Marking `sent` is a guarded transition: the update
   * applies only while the row is still `pending`, so duplicate taps concurrently
   * resolve to exactly one winner — the loser gets null back (task 7.4).
   */
  updatePaybackStatus(
    ref: string,
    status: PaybackStatus,
    timestamp: string
  ): Promise<Payback | null>;
  listPaybacksByPayment(paymentId: number): Promise<Payback[]>;
  /**
   * Total amount paid back against a payment across ALL statuses (pending + sent).
   * This is the quantity bounded by the payment amount (task 7.2).
   */
  sumPaybacks(paymentId: number): Promise<number>;
}
