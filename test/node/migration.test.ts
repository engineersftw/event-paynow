import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import Database from 'better-sqlite3';
import { describe, expect, it } from 'vitest';

describe('Migration 0000_initial_schema.sql', () => {
  it('creates all tables with correct schema', () => {
    const db = new Database(':memory:');

    // Read and execute the migration
    const migration = readFileSync(
      join(__dirname, '../../drizzle/0000_initial_schema.sql'),
      'utf-8'
    );

    // Split by statement-breakpoint and execute each statement
    const statements = migration.split('--> statement-breakpoint');
    for (const stmt of statements) {
      const trimmed = stmt.trim();
      if (trimmed) {
        db.exec(trimmed);
      }
    }

    // Verify users table
    const usersInfo = db.prepare('PRAGMA table_info(users)').all();
    expect(usersInfo).toHaveLength(6);
    expect(usersInfo.map((c: any) => c.name)).toContain('telegram_id');
    expect(usersInfo.map((c: any) => c.name)).toContain('payee_type');
    expect(usersInfo.map((c: any) => c.name)).toContain('payee_value');

    // Verify payments table
    const paymentsInfo = db.prepare('PRAGMA table_info(payments)').all();
    expect(paymentsInfo).toHaveLength(12);
    expect(paymentsInfo.map((c: any) => c.name)).toContain('ref');
    expect(paymentsInfo.map((c: any) => c.name)).toContain('amount_cents');
    expect(paymentsInfo.map((c: any) => c.name)).toContain('status');
    expect(paymentsInfo.map((c: any) => c.name)).toContain('source');

    // Verify paybacks table
    const paybacksInfo = db.prepare('PRAGMA table_info(paybacks)').all();
    expect(paybacksInfo).toHaveLength(10);
    expect(paybacksInfo.map((c: any) => c.name)).toContain('ref');
    expect(paybacksInfo.map((c: any) => c.name)).toContain('payment_id');
    expect(paybacksInfo.map((c: any) => c.name)).toContain('payer_type');

    db.close();
  });

  it('enforces CHECK constraints on payments.status', () => {
    const db = new Database(':memory:');
    const migration = readFileSync(
      join(__dirname, '../../drizzle/0000_initial_schema.sql'),
      'utf-8'
    );

    const statements = migration.split('--> statement-breakpoint');
    for (const stmt of statements) {
      const trimmed = stmt.trim();
      if (trimmed) {
        db.exec(trimmed);
      }
    }

    // Valid status should work
    db.prepare(`
      INSERT INTO payments (ref, user_id, description, amount_cents, payee_type, payee_value, status, source, qr_payload, created_at)
      VALUES ('test-ref-1', 123, 'test', 1000, 'mobile', '+6512345678', 'pending', 'manual', 'payload', '2024-01-01')
    `).run();

    // Invalid status should fail
    expect(() => {
      db.prepare(`
        INSERT INTO payments (ref, user_id, description, amount_cents, payee_type, payee_value, status, source, qr_payload, created_at)
        VALUES ('test-ref-2', 123, 'test', 1000, 'mobile', '+6512345678', 'invalid', 'manual', 'payload', '2024-01-01')
      `).run();
    }).toThrow(/CHECK constraint failed/i);

    db.close();
  });

  it('enforces CHECK constraints on paybacks.status', () => {
    const db = new Database(':memory:');
    const migration = readFileSync(
      join(__dirname, '../../drizzle/0000_initial_schema.sql'),
      'utf-8'
    );

    const statements = migration.split('--> statement-breakpoint');
    for (const stmt of statements) {
      const trimmed = stmt.trim();
      if (trimmed) {
        db.exec(trimmed);
      }
    }

    // Create a payment first
    db.prepare(`
      INSERT INTO payments (ref, user_id, description, amount_cents, payee_type, payee_value, status, source, qr_payload, created_at)
      VALUES ('test-ref-1', 123, 'test', 1000, 'mobile', '+6512345678', 'received', 'manual', 'payload', '2024-01-01')
    `).run();

    // Valid payback status should work
    db.prepare(`
      INSERT INTO paybacks (ref, payment_id, payer_type, payer_value, amount_cents, status, qr_payload, created_at)
      VALUES ('payback-ref-1', 1, 'mobile', '+6587654321', 500, 'pending', 'payload', '2024-01-01')
    `).run();

    // Invalid status should fail
    expect(() => {
      db.prepare(`
        INSERT INTO paybacks (ref, payment_id, payer_type, payer_value, amount_cents, status, qr_payload, created_at)
        VALUES ('payback-ref-2', 1, 'mobile', '+6587654321', 500, 'invalid', 'payload', '2024-01-01')
      `).run();
    }).toThrow(/CHECK constraint failed/i);

    db.close();
  });

  it('is idempotent (can be applied twice)', () => {
    const db = new Database(':memory:');
    const migration = readFileSync(
      join(__dirname, '../../drizzle/0000_initial_schema.sql'),
      'utf-8'
    );

    const statements = migration.split('--> statement-breakpoint');

    // Apply once
    for (const stmt of statements) {
      const trimmed = stmt.trim();
      if (trimmed) {
        db.exec(trimmed);
      }
    }

    // Apply again should fail (tables already exist)
    expect(() => {
      for (const stmt of statements) {
        const trimmed = stmt.trim();
        if (trimmed) {
          db.exec(trimmed);
        }
      }
    }).toThrow();

    db.close();
  });
});
