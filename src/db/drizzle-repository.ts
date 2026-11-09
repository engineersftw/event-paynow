import { and, desc, eq, gte, inArray, isNull, ne, or, sql } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/d1';
import type {
  CreatePaybackBoundedResult,
  Event,
  EventPatch,
  EventRepository,
  EventStats,
  Payback,
  PaybackStatus,
  Payment,
  PaymentStatus,
  ReceiptSource,
  Repository,
  User,
} from './repository';
import * as schema from './schema';

/**
 * D1Repository implements the Repository interface using Drizzle ORM over D1.
 */
export class D1Repository implements Repository {
  private db: ReturnType<typeof drizzle>;
  private d1: D1Database;

  constructor(d1: D1Database) {
    this.db = drizzle(d1, { schema });
    this.d1 = d1;
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
      eventId,
      description,
      amountCents,
      payeeType,
      payeeValue,
      status,
      source,
      qrPayload,
      payerType,
      payerValue,
      payerName,
      timestamp,
    } = input;

    const values: Record<string, unknown> = {
      ref,
      userId,
      description,
      amountCents,
      payeeType,
      payeeValue,
      status,
      source,
      qrPayload,
      payerType: payerType ?? null,
      payerValue: payerValue ?? null,
      payerName: payerName ?? null,
      createdAt: timestamp,
    };
    if (eventId !== undefined) {
      values.eventId = eventId;
    }

    const created = await this.db
      .insert(schema.payments)
      // biome-ignore lint/suspicious/noExplicitAny: dynamic insert with optional eventId
      .values(values as any)
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

  async countRecentAnonymousPayments(eventId: number, sinceIso: string): Promise<number> {
    const row = await this.db
      .select({ n: sql<number>`COUNT(*)` })
      .from(schema.payments)
      .where(
        and(
          eq(schema.payments.eventId, eventId),
          eq(schema.payments.userId, 0),
          gte(schema.payments.createdAt, sinceIso)
        )
      )
      .get();
    return row?.n ?? 0;
  }

  async listPaymentsByUserAndEvent(userId: number, eventId: number): Promise<Payment[]> {
    const results = await this.db
      .select()
      .from(schema.payments)
      .where(and(eq(schema.payments.userId, userId), eq(schema.payments.eventId, eventId)))
      .orderBy(desc(schema.payments.createdAt), desc(schema.payments.id))
      .limit(50)
      .all();

    return results.map(toPayment);
  }

  async listPaymentsByEvent(eventId: number): Promise<Payment[]> {
    const results = await this.db
      .select()
      .from(schema.payments)
      .where(eq(schema.payments.eventId, eventId))
      .orderBy(desc(schema.payments.createdAt), desc(schema.payments.id))
      .all();

    return results.map(toPayment);
  }

  async searchPaymentsByEvent(
    eventId: number,
    opts: { status?: PaymentStatus; q?: string; limit: number; cursor?: string }
  ): Promise<{ payments: Payment[]; nextCursor: string | null }> {
    const t = schema.payments;
    const conds = [eq(t.eventId, eventId)];
    if (opts.status) conds.push(eq(t.status, opts.status));
    if (opts.q) {
      const pat = `%${opts.q.toLowerCase().replace(/[\\%_]/g, '\\$&')}%`;
      conds.push(
        or(
          sql`lower(${t.payerName}) LIKE ${pat} ESCAPE '\\'`,
          sql`lower(${t.ref}) LIKE ${pat} ESCAPE '\\'`
        )!
      );
    }
    if (opts.cursor) {
      const [createdAt, id] = opts.cursor.split('|') as [string, string];
      conds.push(
        or(
          sql`${t.createdAt} < ${createdAt}`,
          and(eq(t.createdAt, createdAt), sql`${t.id} < ${Number(id)}`)
        )!
      );
    }
    const rows = await this.db
      .select()
      .from(t)
      .where(and(...conds))
      .orderBy(desc(t.createdAt), desc(t.id))
      .limit(opts.limit + 1)
      .all();
    const page = rows.slice(0, opts.limit);
    const last = page[page.length - 1];
    return {
      payments: page.map(toPayment),
      nextCursor: rows.length > opts.limit && last ? `${last.createdAt}|${last.id}` : null,
    };
  }

  async sentPaybackTotalsByEvent(eventId: number): Promise<Map<number, number>> {
    const { results } = await this.d1
      .prepare(
        `SELECT pb.payment_id AS paymentId, SUM(pb.amount_cents) AS total
         FROM paybacks pb JOIN payments p ON p.id = pb.payment_id
         WHERE p.event_id = ? AND pb.status = 'sent'
         GROUP BY pb.payment_id`
      )
      .bind(eventId)
      .all<{ paymentId: number; total: number }>();
    return new Map(results.map((r) => [r.paymentId, r.total]));
  }

  async updatePaymentStatus(
    ref: string,
    status: PaymentStatus,
    source: ReceiptSource,
    timestamp: string,
    actorId?: number
  ): Promise<Payment | null> {
    const receivedAt = status === 'received' ? timestamp : null;

    // Receiving is a pending-only compare-and-set so it races cleanly against void
    // (and duplicate taps): the loser gets null.
    const where =
      status === 'received'
        ? and(eq(schema.payments.ref, ref), eq(schema.payments.status, 'pending'))
        : eq(schema.payments.ref, ref);

    const updated = await this.db
      .update(schema.payments)
      .set({
        status,
        source,
        receivedAt,
        // Written in the same guarded UPDATE, so a lost race records nobody
        ...(status === 'received' && actorId !== undefined ? { receivedBy: actorId } : {}),
      })
      .where(where)
      .returning()
      .get();

    return updated ? toPayment(updated) : null;
  }

  /** Void a payment: pending-only compare-and-set; null if missing or no longer pending. */
  async voidPayment(ref: string, actorId?: number): Promise<Payment | null> {
    const updated = await this.db
      .update(schema.payments)
      .set({ status: 'voided', ...(actorId !== undefined ? { voidedBy: actorId } : {}) })
      .where(and(eq(schema.payments.ref, ref), eq(schema.payments.status, 'pending')))
      .returning()
      .get();

    return updated ? toPayment(updated) : null;
  }

  async checkInPayment(ref: string, actorId: number, timestamp: string): Promise<Payment | null> {
    const updated = await this.db
      .update(schema.payments)
      .set({ checkedInAt: timestamp, checkedInBy: actorId })
      .where(
        and(
          eq(schema.payments.ref, ref),
          ne(schema.payments.status, 'voided'),
          isNull(schema.payments.checkedInAt)
        )
      )
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
      createdBy,
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
        createdBy: createdBy ?? null,
      })
      .returning()
      .get();

    return toPayback(created!);
  }

  /**
   * Task 7.2: payback bounding enforced inside one D1 batch (implicit transaction).
   *
   * The INSERT is a compare-and-set: `INSERT ... SELECT ... WHERE <guard>` only
   * materializes the row when `SUM(paybacks) + amount_cents <= payment.amount_cents`
   * is evaluated inside the transaction, at commit time. ALL paybacks count toward
   * the bound — pending and sent — because status only tracks delivery, so marking
   * a payback sent never frees room for another. A missing payment row makes the
   * guard NULL, so nothing is inserted (fail-closed). This closes cross-chat races on the
   * same payment even when the per-chat DO serialization does not apply (design §5).
   */
  async createPaybackBounded(
    input: Omit<Payback, 'id' | 'createdAt' | 'sentAt'> & { timestamp: string }
  ): Promise<CreatePaybackBoundedResult> {
    const {
      ref,
      paymentId,
      payerType,
      payerValue,
      amountCents,
      status,
      qrPayload,
      timestamp,
      createdBy,
    } = input;

    const guardedInsert = this.d1
      .prepare(
        `INSERT INTO paybacks (ref, payment_id, payer_type, payer_value, amount_cents, status, qr_payload, created_at, created_by)
         SELECT ?, ?, ?, ?, ?, ?, ?, ?, ?
         WHERE (
           SELECT COALESCE(SUM(amount_cents), 0) FROM paybacks
           WHERE payment_id = ? AND status != 'cancelled'
         ) + ? <= (SELECT amount_cents FROM payments WHERE id = ?)`
      )
      .bind(
        ref,
        paymentId,
        payerType,
        payerValue,
        amountCents,
        status,
        qrPayload,
        timestamp,
        createdBy ?? null,
        paymentId,
        amountCents,
        paymentId
      );

    // Totals read inside the same transaction: on success this already includes
    // the new row; on failure it is the competing state that rejected the insert.
    const totals = this.d1
      .prepare(
        `SELECT amount_cents AS paymentAmountCents,
                (SELECT COALESCE(SUM(amount_cents), 0) FROM paybacks p
                 WHERE p.payment_id = payments.id AND p.status != 'cancelled') AS paidBackCents
         FROM payments
         WHERE id = ?`
      )
      .bind(paymentId);

    const readback = this.d1
      .prepare(
        `SELECT id, ref, payment_id AS paymentId, payer_type AS payerType, payer_value AS payerValue,
                amount_cents AS amountCents, status, qr_payload AS qrPayload, created_at AS createdAt, sent_at AS sentAt
         FROM paybacks
         WHERE ref = ?`
      )
      .bind(ref);

    const [insertResult, totalsResult, readbackResult] = await this.d1.batch([
      guardedInsert,
      totals,
      readback,
    ]);

    if (!insertResult || !totalsResult || !readbackResult) {
      throw new Error('createPaybackBounded: D1 batch returned fewer results than statements');
    }

    const inserted = (insertResult.meta?.changes ?? 0) > 0;

    if (inserted) {
      const row = readbackResult.results?.[0] as unknown as
        | typeof schema.paybacks.$inferSelect
        | undefined;
      if (!row) {
        throw new Error(
          `createPaybackBounded: insert reported changes but read-back for ${ref} was empty`
        );
      }
      const totalsRow = totalsResult.results?.[0] as
        | { paymentAmountCents: number; paidBackCents: number }
        | undefined;
      const remainingCents = totalsRow
        ? Math.max(0, totalsRow.paymentAmountCents - totalsRow.paidBackCents)
        : 0;
      return { ok: true, payback: toPayback(row), remainingCents };
    }

    const totalsRow = totalsResult.results?.[0] as
      | { paymentAmountCents: number; paidBackCents: number }
      | undefined;
    if (!totalsRow) {
      return { ok: false, reason: 'payment_not_found' };
    }

    return {
      ok: false,
      reason: 'over_bound',
      paymentAmountCents: totalsRow.paymentAmountCents,
      paidBackCents: totalsRow.paidBackCents,
      remainingCents: Math.max(0, totalsRow.paymentAmountCents - totalsRow.paidBackCents),
    };
  }

  async getPaybackByRef(ref: string): Promise<Payback | null> {
    const result = await this.db
      .select()
      .from(schema.paybacks)
      .where(eq(schema.paybacks.ref, ref))
      .get();

    return result ? toPayback(result) : null;
  }

  /**
   * Task 7.4: payback status transition. `pending → sent` and `pending → cancelled`
   * are compare-and-set — the UPDATE only matches rows still `pending`, so duplicate
   * or concurrent taps (including Sent vs Cancel) yield exactly one winner; everyone
   * else gets null.
   */
  async updatePaybackStatus(
    ref: string,
    status: PaybackStatus,
    timestamp: string,
    actorId?: number
  ): Promise<Payback | null> {
    const sentAt = status === 'sent' ? timestamp : null;

    const where =
      status === 'pending'
        ? eq(schema.paybacks.ref, ref)
        : and(eq(schema.paybacks.ref, ref), eq(schema.paybacks.status, 'pending'));

    const updated = await this.db
      .update(schema.paybacks)
      .set({
        status,
        sentAt,
        // Same guarded UPDATE: only the winning transition records its actor
        ...(actorId !== undefined && status === 'sent' ? { sentBy: actorId } : {}),
        ...(actorId !== undefined && status === 'cancelled' ? { cancelledBy: actorId } : {}),
      })
      .where(where)
      .returning()
      .get();

    return updated ? toPayback(updated) : null;
  }

  async listPaybacksByPayments(paymentIds: number[]): Promise<Payback[]> {
    const chunks: number[][] = [];
    for (let i = 0; i < paymentIds.length; i += 90) chunks.push(paymentIds.slice(i, i + 90));
    const rows = await Promise.all(
      chunks.map((ids) =>
        this.db.select().from(schema.paybacks).where(inArray(schema.paybacks.paymentId, ids)).all()
      )
    );
    return rows
      .flat()
      .map(toPayback)
      .sort((x, y) => x.id - y.id);
  }

  async listPaybacksByPayment(paymentId: number): Promise<Payback[]> {
    const results = await this.db
      .select()
      .from(schema.paybacks)
      .where(eq(schema.paybacks.paymentId, paymentId))
      .all();

    return results.map(toPayback);
  }

  /**
   * Total amount paid back against a payment across ALL statuses (pending +
   * sent) — the quantity bounded by the payment amount (tasks 7.2, 7.4).
   */
  async sumPaybacks(paymentId: number): Promise<number> {
    const result = await this.db
      .select({
        total: sql<number>`COALESCE(SUM(${schema.paybacks.amountCents}), 0)`,
      })
      .from(schema.paybacks)
      .where(and(eq(schema.paybacks.paymentId, paymentId), ne(schema.paybacks.status, 'cancelled')))
      .get();

    return result?.total ?? 0;
  }
}

// ============================================================================
// D1EventRepository (implements EventRepository)
// ============================================================================

export class D1EventRepository implements EventRepository {
  private db: ReturnType<typeof drizzle>;

  constructor(d1: D1Database) {
    this.db = drizzle(d1, { schema });
  }

  async createEvent(
    input: Omit<Event, 'id' | 'createdAt' | 'closedAt' | 'defaultAmountCents'> & {
      defaultAmountCents?: number | null;
      timestamp: string;
    }
  ): Promise<Event> {
    const { ref, chatId, topicId, name, payeeType, payeeValue, status, timestamp } = input;
    // Only a positive whole number of cents is a default amount; anything else means none
    const defaultAmountCents =
      Number.isInteger(input.defaultAmountCents) && (input.defaultAmountCents as number) > 0
        ? (input.defaultAmountCents as number)
        : null;

    const created = await this.db
      .insert(schema.events)
      .values({
        ref,
        chatId,
        topicId,
        name,
        payeeType,
        payeeValue,
        status,
        createdAt: timestamp,
        defaultAmountCents,
      })
      .returning()
      .get();

    return toEvent(created!);
  }

  async listOpenEventsByChat(chatId: number, topicId: number): Promise<Event[]> {
    const results = await this.db
      .select()
      .from(schema.events)
      .where(
        and(
          eq(schema.events.chatId, chatId),
          eq(schema.events.topicId, topicId),
          eq(schema.events.status, 'open')
        )
      )
      .all();

    return results.map(toEvent);
  }

  async listAllEventsByChat(chatId: number, topicId: number): Promise<Event[]> {
    const results = await this.db
      .select()
      .from(schema.events)
      .where(and(eq(schema.events.chatId, chatId), eq(schema.events.topicId, topicId)))
      .all();

    return results.map(toEvent);
  }

  async getEventById(id: number): Promise<Event | null> {
    const result = await this.db.select().from(schema.events).where(eq(schema.events.id, id)).get();
    return result ? toEvent(result) : null;
  }

  async getEventByRef(ref: string): Promise<Event | null> {
    const result = await this.db
      .select()
      .from(schema.events)
      .where(eq(schema.events.ref, ref))
      .get();

    return result ? toEvent(result) : null;
  }

  async closeEvent(ref: string, timestamp: string): Promise<boolean> {
    const result = await this.db
      .update(schema.events)
      .set({ status: 'closed', closedAt: timestamp })
      .where(and(eq(schema.events.ref, ref), eq(schema.events.status, 'open')))
      .returning()
      .get();

    return !!result;
  }

  async updateEvent(ref: string, patch: EventPatch): Promise<Event | null> {
    if (Object.keys(patch).length === 0) return this.getEventByRef(ref);
    const result = await this.db
      .update(schema.events)
      .set(patch)
      .where(and(eq(schema.events.ref, ref), eq(schema.events.status, 'open')))
      .returning()
      .get();

    return result ? toEvent(result) : null;
  }

  async getEventStats(eventId: number): Promise<EventStats> {
    const result = await this.db
      .select({
        paymentCount: sql<number>`COUNT(CASE WHEN status != 'voided' THEN 1 END)`,
        collectedCents: sql<number>`COALESCE(SUM(CASE WHEN status = 'received' THEN amount_cents ELSE 0 END), 0)`,
        pendingCents: sql<number>`COALESCE(SUM(CASE WHEN status = 'pending' THEN amount_cents ELSE 0 END), 0)`,
        // Paybacks only exist for received payments; only SENT ones count (the bound counts pending too)
        paidBackCents: sql<number>`COALESCE((SELECT SUM(pb.amount_cents) FROM paybacks pb JOIN payments p ON p.id = pb.payment_id WHERE p.event_id = ${eventId} AND p.status = 'received' AND pb.status = 'sent'), 0)`,
      })
      .from(schema.payments)
      .where(eq(schema.payments.eventId, eventId))
      .get();

    const paidBackCents = result?.paidBackCents ?? 0;
    return {
      paymentCount: result?.paymentCount ?? 0,
      collectedCents: (result?.collectedCents ?? 0) - paidBackCents,
      paidBackCents,
      pendingCents: result?.pendingCents ?? 0,
    };
  }
}

// ============================================================================
// Conversion helpers (Drizzle row → plain types)
// ============================================================================

function toEvent(row: typeof schema.events.$inferSelect): Event {
  return {
    id: row.id,
    ref: row.ref,
    chatId: row.chatId,
    topicId: row.topicId,
    name: row.name,
    payeeType: row.payeeType as Event['payeeType'],
    payeeValue: row.payeeValue,
    status: row.status as Event['status'],
    createdAt: row.createdAt,
    closedAt: row.closedAt,
    defaultAmountCents: row.defaultAmountCents,
  };
}

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
    eventId: row.eventId,
    description: row.description,
    amountCents: row.amountCents,
    payeeType: row.payeeType as Payment['payeeType'],
    payeeValue: row.payeeValue,
    status: row.status as Payment['status'],
    source: row.source as Payment['source'],
    qrPayload: row.qrPayload,
    payerType: row.payerType as NonNullable<Payment['payerType']> | null,
    payerValue: row.payerValue,
    payerName: row.payerName,
    createdAt: row.createdAt,
    receivedAt: row.receivedAt,
    receivedBy: row.receivedBy,
    voidedBy: row.voidedBy,
    checkedInAt: row.checkedInAt,
    checkedInBy: row.checkedInBy,
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
    createdBy: row.createdBy,
    sentBy: row.sentBy,
    cancelledBy: row.cancelledBy,
  };
}
