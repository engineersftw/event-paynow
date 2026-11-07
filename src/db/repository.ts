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
  description: string;
  amountCents: number;
  payeeType: PayeeType;
  payeeValue: string;
  status: PaymentStatus;
  source: ReceiptSource;
  qrPayload: string;
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

// ============================================================================
// Repository Interface
// ============================================================================

export interface Repository {
  // Users
  upsertUser(user: Omit<User, 'createdAt' | 'updatedAt'> & { timestamp: string }): Promise<User>;
  getUser(telegramId: number): Promise<User | null>;

  // Payments
  createPayment(payment: Omit<Payment, 'id' | 'createdAt' | 'receivedAt'> & { timestamp: string }): Promise<Payment>;
  getPaymentByRef(ref: string): Promise<Payment | null>;
  listPaymentsByUser(userId: number): Promise<Payment[]>;
  updatePaymentStatus(ref: string, status: PaymentStatus, source: ReceiptSource, timestamp: string): Promise<Payment | null>;

  // Paybacks
  createPayback(payback: Omit<Payback, 'id' | 'createdAt' | 'sentAt'> & { timestamp: string }): Promise<Payback>;
  listPaybacksByPayment(paymentId: number): Promise<Payback[]>;
  sumActivePaybacks(paymentId: number): Promise<number>;
}
