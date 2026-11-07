import { applyD1Migrations } from '@cloudflare/vitest-pool-workers/config';
import { env } from 'cloudflare:test';

// This runs before each test file
export default async function () {
  // Apply migrations to the test database
  // We use applyD1Migrations with the migration content
  const migration = {
    name: '0000_initial_schema',
    queries: [
      `CREATE TABLE users (
        telegram_id INTEGER PRIMARY KEY,
        payee_type TEXT NOT NULL CHECK(payee_type IN ('mobile', 'uen')),
        payee_value TEXT NOT NULL,
        display_name TEXT NOT NULL,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      )`,
      `CREATE TABLE payments (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        ref TEXT NOT NULL UNIQUE,
        user_id INTEGER NOT NULL,
        description TEXT NOT NULL,
        amount_cents INTEGER NOT NULL,
        payee_type TEXT NOT NULL CHECK(payee_type IN ('mobile', 'uen')),
        payee_value TEXT NOT NULL,
        status TEXT NOT NULL CHECK(status IN ('pending', 'received')),
        source TEXT NOT NULL CHECK(source IN ('manual', 'notification')),
        qr_payload TEXT NOT NULL,
        created_at TEXT NOT NULL,
        received_at TEXT,
        FOREIGN KEY (user_id) REFERENCES users(telegram_id)
      )`,
      `CREATE TABLE paybacks (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        ref TEXT NOT NULL UNIQUE,
        payment_id INTEGER NOT NULL,
        payer_type TEXT NOT NULL CHECK(payer_type IN ('mobile', 'uen')),
        payer_value TEXT NOT NULL,
        amount_cents INTEGER NOT NULL,
        status TEXT NOT NULL CHECK(status IN ('pending', 'sent')),
        qr_payload TEXT NOT NULL,
        created_at TEXT NOT NULL,
        sent_at TEXT,
        FOREIGN KEY (payment_id) REFERENCES payments(id)
      )`,
      `CREATE INDEX idx_payments_user_id ON payments(user_id)`,
      `CREATE INDEX idx_payments_ref ON payments(ref)`,
      `CREATE INDEX idx_paybacks_payment_id ON paybacks(payment_id)`,
      `CREATE INDEX idx_paybacks_ref ON paybacks(ref)`
    ]
  };
  
  await applyD1Migrations(env.DB, [migration]);
}
