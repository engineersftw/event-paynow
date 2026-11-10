/**
 * Usage numbers for the owner-facing /stats report, and the anonymous counters behind
 * Simple_PayNow_Bot's figures. Counters hold only (day, metric, count); nothing personal.
 */

export const SIMPLE_QR = 'simple_qr';
export const SIMPLE_AMOUNT_SKIPPED = 'simple_amount_skipped';
export const SIMPLE_AMOUNT_FIXED = 'simple_amount_fixed';
export const SIMPLE_AMOUNT_EDITABLE = 'simple_amount_editable';

// Split_PayNow_Bot, counted the same way: a day, a metric and a number, nothing else.
export const SPLIT_CONFIRMED = 'split_confirmed';
export const SPLIT_TYPE_EQUAL = 'split_type_equal';
export const SPLIT_TYPE_CUSTOM = 'split_type_custom';
export const SPLIT_TYPE_RECEIPT = 'split_type_receipt';
export const SPLIT_PLACE_PRIVATE = 'split_place_private';
export const SPLIT_PLACE_GROUP = 'split_place_group';
export const SPLIT_PAYEE_OTHER = 'split_payee_other';
export const SPLIT_QR_CHAT = 'split_qr_chat';
export const SPLIT_QR_DM = 'split_qr_dm';
export const SPLIT_SCAN_OK = 'split_scan_ok';
export const SPLIT_SCAN_FAILED = 'split_scan_failed';
export const SPLIT_CLAIM_CREATED = 'split_claim_created';
export const SPLIT_CLAIM_COLLECTED = 'split_claim_collected';

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

/** Split_PayNow_Bot numbers: anonymous daily counters plus two live counts read from its tables. */
export interface SplitUsageSnapshot {
  confirmed: { total: number; last7: number; last30: number };
  types: { equal: number; custom: number; receipt: number };
  places: { private: number; group: number };
  payeeOther: number;
  qrs: { chat: number; dm: number };
  scans: { ok: number; failed: number };
  claims: { created: number; collected: number; waiting: number };
  contacts: number;
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

  /** Split_PayNow_Bot's figures: the counters, and how many contacts and unexpired waiting QRs exist now. */
  async splitSnapshot(now: Date = new Date()): Promise<SplitUsageSnapshot> {
    const day7 = sgDay(new Date(now.getTime() - 6 * DAY_MS)); // today and the 6 days before
    const day30 = sgDay(new Date(now.getTime() - 29 * DAY_MS));
    const [counters, live] = await this.d1.batch([
      this.d1
        .prepare(
          `SELECT metric,
                  SUM(count) AS total,
                  COALESCE(SUM(CASE WHEN day >= ?1 THEN count END), 0) AS last7,
                  COALESCE(SUM(CASE WHEN day >= ?2 THEN count END), 0) AS last30
           FROM usage_counters WHERE substr(metric, 1, 6) = 'split_' GROUP BY metric`
        )
        .bind(day7, day30),
      this.d1
        .prepare(
          `SELECT (SELECT COUNT(*) FROM split_contacts) AS contacts,
                  (SELECT COUNT(*) FROM split_claims WHERE expires_at > ?1) AS waiting`
        )
        .bind(now.toISOString()),
    ]);
    const rows = (counters?.results ?? []) as Array<{
      metric: string;
      total: number;
      last7: number;
      last30: number;
    }>;
    const by = new Map(rows.map((r) => [r.metric, r]));
    const n = (m: string) => by.get(m)?.total ?? 0;
    const confirmed = by.get(SPLIT_CONFIRMED);
    const state = (live?.results[0] ?? {}) as { contacts?: number; waiting?: number };
    return {
      confirmed: {
        total: confirmed?.total ?? 0,
        last7: confirmed?.last7 ?? 0,
        last30: confirmed?.last30 ?? 0,
      },
      types: {
        equal: n(SPLIT_TYPE_EQUAL),
        custom: n(SPLIT_TYPE_CUSTOM),
        receipt: n(SPLIT_TYPE_RECEIPT),
      },
      places: { private: n(SPLIT_PLACE_PRIVATE), group: n(SPLIT_PLACE_GROUP) },
      payeeOther: n(SPLIT_PAYEE_OTHER),
      qrs: { chat: n(SPLIT_QR_CHAT), dm: n(SPLIT_QR_DM) },
      scans: { ok: n(SPLIT_SCAN_OK), failed: n(SPLIT_SCAN_FAILED) },
      claims: {
        created: n(SPLIT_CLAIM_CREATED),
        collected: n(SPLIT_CLAIM_COLLECTED),
        waiting: state.waiting ?? 0,
      },
      contacts: state.contacts ?? 0,
    };
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
