import { eq, and, sql } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/d1';
import * as schema from './schema';
import type { Repository, User, Payment, Payback, PaymentStatus, ReceiptSource } from './repository';

/**
 * D1Repository implements the Repository interface using Drizzle ORM over D1.
 */
export class D1Repository implements Repository {
  private db: ReturnType<typeof drizzle>;

  constructor(d1: D1Database) {
    this.db = drizzle(d1, { schema });
  }

  // ============================================================================
  // Users
  // ============================================================================

  async upsertUser(
    input: Omit<User, 'createdAt' | 'updatedAt'> & { timestamp: string }
  ): Promise<User> {
    const { telegramId, payeeType, payeeValue, displayName, timestamp } = input;

    // Check if user exists
    const existing = await this.db
      .select()
      .from(schema.users)
      .where(eq(schema.users.telegramId, telegramId))
      .get();

    if (existing) {
      // Update existing user
      const updated = await this.db
        .update(schema.users)
        .set({
          payeeType,
          payeeValue,
          displayName,
          updatedAt: timestamp,
        })
        .where(eq(schema.users.telegramId, telegramId))
        .returning()
        .get();

      return toUser(updated!);
    } else {
      // Insert new user
      const created = await this.db
        .insert(schema.users)
        .values({
          telegramId,
          payeeType,
          payeeValue,
          displayName,
          createdAt: timestamp,
          updatedAt: timestamp,
        })
        .returning()
        .get();

      return toUser(created!);
    }
  }

  async getUser(telegramId: number): Promise<User | null> {
    const result = await this.db
      .select()
      .from(schema.users)
      .where(eq(schema.users.telegramId, telegramId))
      .get();

    return result ? toUser(result) : null;
  }

  // ============================================================================
  // Payments
  // ============================================================================

  async createPayment(
    input: Omit<Payment, 'id' | 'createdAt' | 'receivedAt'> & { timestamp: string }
  ): Promise<Payment> {
    const {
      ref,
      userId,
      description,
      amountCents,
      payeeType,
      payeeValue,
      status,
      source,
      qrPayload,
      timestamp,
    } = input;

    const created = await this.db
      .insert(schema.payments)
      .values({
        ref,
        userId,
        description,
        amountCents,
        payeeType,
        payeeValue,
        status,
        source,
        qrPayload,
        createdAt: timestamp,
      })
      .returning()
      .get();

    return toPayment(created!);
  }

  async getPaymentByRef(ref: string): Promise<Payment | null> {
    const result = await this.db
      .select()
      .from(schema.payments)
      .where(eq(schema.payments.ref, ref))
      .get();

    return result ? toPayment(result) : null;
  }

  async listPaymentsByUser(userId: number): Promise<Payment[]> {
    const results = await this.db
      .select()
      .from(schema.payments)
      .where(eq(schema.payments.userId, userId))
      .all();

    return results.map(toPayment);
  }

  async updatePaymentStatus(
    ref: string,
    status: PaymentStatus,
    source: ReceiptSource,
    timestamp: string
  ): Promise<Payment | null> {
    const receivedAt = status === 'received' ? timestamp : null;

    const updated = await this.db
      .update(schema.payments)
      .set({
        status,
        source,
        receivedAt,
      })
      .where(eq(schema.payments.ref, ref))
      .returning()
      .get();

    return updated ? toPayment(updated) : null;
  }

  // ============================================================================
  // Paybacks
  // ============================================================================

  async createPayback(
    input: Omit<Payback, 'id' | 'createdAt' | 'sentAt'> & { timestamp: string }
  ): Promise<Payback> {
    const {
      ref,
      paymentId,
      payerType,
      payerValue,
      amountCents,
      status,
      qrPayload,
      timestamp,
    } = input;

    const created = await this.db
      .insert(schema.paybacks)
      .values({
        ref,
        paymentId,
        payerType,
        payerValue,
        amountCents,
        status,
        qrPayload,
        createdAt: timestamp,
      })
      .returning()
      .get();

    return toPayback(created!);
  }

  async listPaybacksByPayment(paymentId: number): Promise<Payback[]> {
    const results = await this.db
      .select()
      .from(schema.paybacks)
      .where(eq(schema.paybacks.paymentId, paymentId))
      .all();

    return results.map(toPayback);
  }

  async sumActivePaybacks(paymentId: number): Promise<number> {
    const result = await this.db
      .select({
        total: sql<number>`COALESCE(SUM(${schema.paybacks.amountCents}), 0)`,
      })
      .from(schema.paybacks)
      .where(
        and(
          eq(schema.paybacks.paymentId, paymentId),
          eq(schema.paybacks.status, 'pending')
        )
      )
      .get();

    return result?.total ?? 0;
  }
}

// ============================================================================
// Conversion helpers (Drizzle row → plain types)
// ============================================================================

function toUser(row: typeof schema.users.$inferSelect): User {
  return {
    telegramId: row.telegramId,
    payeeType: row.payeeType as User['payeeType'],
    payeeValue: row.payeeValue,
    displayName: row.displayName,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

function toPayment(row: typeof schema.payments.$inferSelect): Payment {
  return {
    id: row.id,
    ref: row.ref,
    userId: row.userId,
    description: row.description,
    amountCents: row.amountCents,
    payeeType: row.payeeType as Payment['payeeType'],
    payeeValue: row.payeeValue,
    status: row.status as Payment['status'],
    source: row.source as Payment['source'],
    qrPayload: row.qrPayload,
    createdAt: row.createdAt,
    receivedAt: row.receivedAt,
  };
}

function toPayback(row: typeof schema.paybacks.$inferSelect): Payback {
  return {
    id: row.id,
    ref: row.ref,
    paymentId: row.paymentId,
    payerType: row.payerType as Payback['payerType'],
    payerValue: row.payerValue,
    amountCents: row.amountCents,
    status: row.status as Payback['status'],
    qrPayload: row.qrPayload,
    createdAt: row.createdAt,
    sentAt: row.sentAt,
  };
}
