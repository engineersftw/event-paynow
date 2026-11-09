/**
 * Usage numbers for the owner-facing /stats report, and the anonymous counters behind
 * Simple_PayNow_Bot's figures. Counters hold only (day, metric, count); nothing personal.
 */

export const SIMPLE_QR = 'simple_qr';
export const SIMPLE_AMOUNT_SKIPPED = 'simple_amount_skipped';
export const SIMPLE_AMOUNT_FIXED = 'simple_amount_fixed';
export const SIMPLE_AMOUNT_EDITABLE = 'simple_amount_editable';

/** Counts one occurrence of a metric on a day. */
export interface UsageCounter {
  increment(metric: string, day: string): Promise<void>;
}

export interface UsageSnapshot {
  events: {
    total: number;
    open: number;
    closed: number;
    last7: number;
    last30: number;
    chats: number;
  };
  payments: {
    total: number;
    last7: number;
    last30: number;
    pending: number;
    received: number;
    voided: number;
    anonymous: number; // from the public payment page without sign-in (user_id 0)
    receivedCents: number;
    checkedIn: number;
  };
  paybacks: { total: number; sent: number };
  simple: {
    total: number;
    last7: number;
    last30: number;
    skipped: number;
    fixed: number;
    editable: number;
  };
}

const DAY_MS = 24 * 60 * 60 * 1000;
const SGT_OFFSET_MS = 8 * 60 * 60 * 1000;

/** The Singapore calendar day (YYYY-MM-DD) of an instant. */
export function sgDay(at: Date = new Date()): string {
  return new Date(at.getTime() + SGT_OFFSET_MS).toISOString().slice(0, 10);
}

export class D1UsageRepository implements UsageCounter {
  constructor(private readonly d1: D1Database) {}

  /** One atomic upsert, so concurrent QRs cannot lose a count. */
  async increment(metric: string, day: string): Promise<void> {
    await this.d1
      .prepare(
        'INSERT INTO usage_counters (day, metric, count) VALUES (?1, ?2, 1) ' +
          'ON CONFLICT(day, metric) DO UPDATE SET count = count + 1'
      )
      .bind(day, metric)
      .run();
  }

  /** Everything the report needs, from existing records plus the counters. */
  async snapshot(now: Date = new Date()): Promise<UsageSnapshot> {
    const since7 = new Date(now.getTime() - 7 * DAY_MS).toISOString();
    const since30 = new Date(now.getTime() - 30 * DAY_MS).toISOString();
    const day7 = sgDay(new Date(now.getTime() - 6 * DAY_MS)); // today and the 6 days before
    const day30 = sgDay(new Date(now.getTime() - 29 * DAY_MS));

    const [events, payments, paybacks, counters] = await this.d1.batch([
      this.d1
        .prepare(
          `SELECT COUNT(*) AS total,
                  COALESCE(SUM(status = 'open'), 0) AS open,
                  COALESCE(SUM(status = 'closed'), 0) AS closed,
                  COALESCE(SUM(created_at >= ?1), 0) AS last7,
                  COALESCE(SUM(created_at >= ?2), 0) AS last30,
                  COUNT(DISTINCT chat_id) AS chats
           FROM events`
        )
        .bind(since7, since30),
      this.d1
        .prepare(
          `SELECT COUNT(*) AS total,
                  COALESCE(SUM(created_at >= ?1), 0) AS last7,
                  COALESCE(SUM(created_at >= ?2), 0) AS last30,
                  COALESCE(SUM(status = 'pending'), 0) AS pending,
                  COALESCE(SUM(status = 'received'), 0) AS received,
                  COALESCE(SUM(status = 'voided'), 0) AS voided,
                  COALESCE(SUM(user_id = 0), 0) AS anonymous,
                  COALESCE(SUM(CASE WHEN status = 'received' THEN amount_cents END), 0) AS receivedCents,
                  COALESCE(SUM(checked_in_at IS NOT NULL), 0) AS checkedIn
           FROM payments`
        )
        .bind(since7, since30),
      this.d1.prepare(
        `SELECT COUNT(*) AS total, COALESCE(SUM(status = 'sent'), 0) AS sent FROM paybacks`
      ),
      this.d1
        .prepare(
          `SELECT metric,
                  SUM(count) AS total,
                  COALESCE(SUM(CASE WHEN day >= ?1 THEN count END), 0) AS last7,
                  COALESCE(SUM(CASE WHEN day >= ?2 THEN count END), 0) AS last30
           FROM usage_counters GROUP BY metric`
        )
        .bind(day7, day30),
    ]);

    const rows = (counters?.results ?? []) as Array<{
      metric: string;
      total: number;
      last7: number;
      last30: number;
    }>;
    const byMetric = new Map(rows.map((r) => [r.metric, r]));
    const total = (m: string) => byMetric.get(m)?.total ?? 0;
    const qr = byMetric.get(SIMPLE_QR);

    return {
      events: events?.results[0] as UsageSnapshot['events'],
      payments: payments?.results[0] as UsageSnapshot['payments'],
      paybacks: paybacks?.results[0] as UsageSnapshot['paybacks'],
      simple: {
        total: qr?.total ?? 0,
        last7: qr?.last7 ?? 0,
        last30: qr?.last30 ?? 0,
        skipped: total(SIMPLE_AMOUNT_SKIPPED),
        fixed: total(SIMPLE_AMOUNT_FIXED),
        editable: total(SIMPLE_AMOUNT_EDITABLE),
      },
    };
  }
}
