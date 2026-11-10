import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import Database from 'better-sqlite3';
import { describe, expect, it } from 'vitest';

const DIR = join(__dirname, '../../drizzle');
const files = () =>
  readdirSync(DIR)
    .filter((f) => f.endsWith('.sql'))
    .sort();

/** Applies every migration in drizzle/ in name order to an empty in-memory database. */
function migrate(): Database.Database {
  const db = new Database(':memory:');
  for (const f of files()) {
    for (const stmt of readFileSync(join(DIR, f), 'utf-8').split('--> statement-breakpoint')) {
      if (stmt.trim()) db.exec(stmt);
    }
  }
  return db;
}

const columns = (db: Database.Database, table: string) =>
  (db.prepare(`PRAGMA table_info(${table})`).all() as Array<{ name: string }>).map((c) => c.name);

const rejectedByCheck = (db: Database.Database, sql: string) => {
  try {
    db.exec(sql);
    return false;
  } catch (e) {
    return /CHECK/i.test((e as Error).message);
  }
};

describe('migrations (whole history, applied in order)', () => {
  it('starts with the baseline, whose name must never change (deployed databases recorded it)', () => {
    expect(files()[0]).toBe('0000_initial_schema.sql');
  });

  it('creates every table with the expected columns', () => {
    const db = migrate();
    const tables = (
      db
        .prepare(
          "SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%' ORDER BY name"
        )
        .all() as Array<{
        name: string;
      }>
    ).map((t) => t.name);
    expect(tables).toEqual([
      'events',
      'paybacks',
      'payments',
      'split_claims',
      'split_contacts',
      'usage_counters',
      'users',
    ]);

    expect(columns(db, 'users')).toEqual([
      'telegram_id',
      'payee_type',
      'payee_value',
      'display_name',
      'created_at',
      'updated_at',
    ]);
    expect(columns(db, 'events')).toEqual([
      'id',
      'ref',
      'chat_id',
      'topic_id',
      'name',
      'payee_type',
      'payee_value',
      'status',
      'created_at',
      'closed_at',
      'default_amount_cents',
      'website_url',
    ]);
    expect(columns(db, 'payments')).toEqual([
      'id',
      'ref',
      'user_id',
      'description',
      'amount_cents',
      'payee_type',
      'payee_value',
      'status',
      'source',
      'qr_payload',
      'created_at',
      'received_at',
      'event_id',
      'payer_type',
      'payer_value',
      'payer_name',
      'received_by',
      'voided_by',
      'checked_in_at',
      'checked_in_by',
    ]);
    expect(columns(db, 'paybacks')).toEqual([
      'id',
      'ref',
      'payment_id',
      'payer_type',
      'payer_value',
      'amount_cents',
      'status',
      'qr_payload',
      'created_at',
      'sent_at',
      'created_by',
      'sent_by',
      'cancelled_by',
    ]);
    expect(columns(db, 'usage_counters')).toEqual(['day', 'metric', 'count']);
    expect(columns(db, 'split_contacts')).toEqual(['username', 'user_id', 'updated_at']);
    expect(columns(db, 'split_claims')).toEqual([
      'token',
      'username',
      'user_id',
      'name',
      'amount_cents',
      'description',
      'payload',
      'organiser',
      'chat_id',
      'message_id',
      'expires_at',
    ]);
  });

  it('has unique references and a (day, metric) key for the counters', () => {
    const db = migrate();
    const unique = (
      db
        .prepare(
          "SELECT name FROM sqlite_master WHERE type = 'index' AND name LIKE '%_ref_unique' ORDER BY name"
        )
        .all() as Array<{
        name: string;
      }>
    ).map((i) => i.name);
    expect(unique).toEqual(['events_ref_unique', 'paybacks_ref_unique', 'payments_ref_unique']);

    const pk = (
      db.prepare('PRAGMA table_info(usage_counters)').all() as Array<{ name: string; pk: number }>
    )
      .filter((c) => c.pk > 0)
      .sort((a, b) => a.pk - b.pk)
      .map((c) => c.name);
    expect(pk).toEqual(['day', 'metric']);
  });

  it('enforces the status CHECK constraints (they exist only in the SQL, not in the Drizzle schema)', () => {
    const db = migrate();
    const event = (status: string) =>
      `INSERT INTO events (ref, chat_id, name, payee_type, payee_value, status, created_at) VALUES ('E${status}', 1, 'n', 'mobile', 'p', '${status}', 't')`;
    const payment = (status: string) =>
      `INSERT INTO payments (ref, user_id, description, amount_cents, payee_type, payee_value, status, source, qr_payload, created_at) VALUES ('P${status}', 1, 'd', 1, 'mobile', 'p', '${status}', 'manual', 'q', 't')`;
    const payback = (status: string) =>
      `INSERT INTO paybacks (ref, payment_id, payer_type, payer_value, amount_cents, status, qr_payload, created_at) VALUES ('B${status}', 1, 'mobile', 'p', 1, '${status}', 'q', 't')`;

    for (const ok of ['open', 'closed']) expect(rejectedByCheck(db, event(ok))).toBe(false);
    for (const ok of ['pending', 'received', 'voided'])
      expect(rejectedByCheck(db, payment(ok))).toBe(false);
    for (const ok of ['pending', 'sent', 'cancelled'])
      expect(rejectedByCheck(db, payback(ok))).toBe(false);

    expect(rejectedByCheck(db, event('bogus'))).toBe(true);
    expect(rejectedByCheck(db, payment('bogus'))).toBe(true);
    expect(rejectedByCheck(db, payback('bogus'))).toBe(true);
  });

  it('applies cleanly twice into separate databases (no leftover state)', () => {
    expect(columns(migrate(), 'payments')).toEqual(columns(migrate(), 'payments'));
  });
});
