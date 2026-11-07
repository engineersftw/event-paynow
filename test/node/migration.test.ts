import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import Database from 'better-sqlite3';
import { describe, expect, it } from 'vitest';

describe('Migration 0000_initial_schema.sql', () => {
  it('creates all tables with correct schema', () => {
    const db = new Database(':memory:');

    // Read and execute the migrations
    const migration0000 = readFileSync(
      join(__dirname, '../../drizzle/0000_initial_schema.sql'),
      'utf-8'
    );
    const migration0001 = readFileSync(
      join(__dirname, '../../drizzle/0001_certain_albert_cleary.sql'),
      'utf-8'
    );

    // Split by statement-breakpoint and execute each statement
    for (const migration of [migration0000, migration0001]) {
      const statements = migration.split('--> statement-breakpoint');
      for (const stmt of statements) {
        const trimmed = stmt.trim();
        if (trimmed) {
          db.exec(trimmed);
        }
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
    expect(paymentsInfo).toHaveLength(13);
    expect(paymentsInfo.map((c: any) => c.name)).toContain('ref');
    expect(paymentsInfo.map((c: any) => c.name)).toContain('amount_cents');
    expect(paymentsInfo.map((c: any) => c.name)).toContain('status');
    expect(paymentsInfo.map((c: any) => c.name)).toContain('source');
    expect(paymentsInfo.map((c: any) => c.name)).toContain('event_id');

    // Verify events table
    const eventsInfo = db.prepare('PRAGMA table_info(events)').all();
    expect(eventsInfo).toHaveLength(10);
    expect(eventsInfo.map((c: any) => c.name)).toContain('ref');
    expect(eventsInfo.map((c: any) => c.name)).toContain('chat_id');
    expect(eventsInfo.map((c: any) => c.name)).toContain('topic_id');
    expect(eventsInfo.map((c: any) => c.name)).toContain('name');
    expect(eventsInfo.map((c: any) => c.name)).toContain('payee_type');
    expect(eventsInfo.map((c: any) => c.name)).toContain('payee_value');
    expect(eventsInfo.map((c: any) => c.name)).toContain('status');
    expect(eventsInfo.map((c: any) => c.name)).toContain('created_at');
    expect(eventsInfo.map((c: any) => c.name)).toContain('closed_at');
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

  it('0004 widens payments.status to allow voided and keeps every column of existing rows', () => {
    const db = new Database(':memory:');
    const run = (file: string) => {
      for (const stmt of readFileSync(join(__dirname, `../../drizzle/${file}`), 'utf-8').split(
        '--> statement-breakpoint'
      )) {
        if (stmt.trim()) db.exec(stmt.trim());
      }
    };
    for (const f of [
      '0000_initial_schema.sql',
      '0001_certain_albert_cleary.sql',
      '0002_empty_rocket_racer.sql',
      '0003_paybacks_cancelled_status.sql',
    ]) {
      run(f);
    }
    const insert = db.prepare(
      `INSERT INTO payments (ref, user_id, description, amount_cents, payee_type, payee_value, status, source, qr_payload, created_at, received_at, event_id, payer_type, payer_value, payer_name)
       VALUES (?, 7, 'Dinner', 1250, 'mobile', '+6591234567', ?, 'manual', 'payload', '2024-01-01', ?, ?, ?, ?, ?)`
    );
    insert.run('p1', 'pending', null, 3, 'mobile', '+6591234568', 'Alice');
    insert.run('p2', 'received', '2024-01-02', null, null, null, null); // legacy row
    const before = db.prepare('SELECT * FROM payments ORDER BY id').all();

    run('0004_payments_voided_status.sql');

    expect(db.prepare('SELECT * FROM payments ORDER BY id').all()).toEqual(before);
    insert.run('p3', 'voided', null, 3, 'mobile', '+6591234568', 'Alice');
    expect(() => insert.run('p4', 'bogus', null, 3, null, null, null)).toThrow(
      /CHECK constraint failed/i
    );
    expect(() => insert.run('p1', 'pending', null, 3, null, null, null)).toThrow(/UNIQUE/i);
    db.close();
  });

  it('0003 widens paybacks.status to allow cancelled and keeps existing rows', () => {
    const db = new Database(':memory:');
    const run = (file: string) => {
      for (const stmt of readFileSync(join(__dirname, `../../drizzle/${file}`), 'utf-8').split(
        '--> statement-breakpoint'
      )) {
        if (stmt.trim()) db.exec(stmt.trim());
      }
    };
    for (const f of [
      '0000_initial_schema.sql',
      '0001_certain_albert_cleary.sql',
      '0002_empty_rocket_racer.sql',
    ]) {
      run(f);
    }
    db.prepare(
      `INSERT INTO payments (ref, user_id, description, amount_cents, payee_type, payee_value, status, source, qr_payload, created_at)
       VALUES ('p1', 1, 'd', 1000, 'mobile', '+6512345678', 'received', 'manual', 'x', '2024-01-01')`
    ).run();
    const insert = db.prepare(
      `INSERT INTO paybacks (ref, payment_id, payer_type, payer_value, amount_cents, status, qr_payload, created_at, sent_at)
       VALUES (?, 1, 'mobile', '+6587654321', 500, ?, 'x', '2024-01-01', ?)`
    );
    insert.run('pb1', 'pending', null);
    insert.run('pb2', 'sent', '2024-01-02');

    run('0003_paybacks_cancelled_status.sql');

    const rows = db.prepare('SELECT ref, status, sent_at FROM paybacks ORDER BY id').all();
    expect(rows).toEqual([
      { ref: 'pb1', status: 'pending', sent_at: null },
      { ref: 'pb2', status: 'sent', sent_at: '2024-01-02' },
    ]);
    insert.run('pb3', 'cancelled', null);
    expect(() => insert.run('pb4', 'bogus', null)).toThrow(/CHECK constraint failed/i);
    expect(() => insert.run('pb1', 'pending', null)).toThrow(/UNIQUE/i); // index recreated
    db.close();
  });
});
