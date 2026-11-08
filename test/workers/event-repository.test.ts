import { env } from 'cloudflare:test';
import { beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { D1EventRepository, D1Repository } from '../../src/db/drizzle-repository';

describe('D1EventRepository', () => {
  let repo: D1EventRepository;
  const testTimestamp = '2024-01-01T00:00:00Z';

  beforeAll(async () => {
    const statements = [
      `CREATE TABLE IF NOT EXISTS events (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        ref TEXT NOT NULL UNIQUE,
        chat_id INTEGER NOT NULL,
        topic_id INTEGER NOT NULL DEFAULT 0,
        name TEXT NOT NULL,
        payee_type TEXT NOT NULL CHECK(payee_type IN ('mobile', 'uen')),
        payee_value TEXT NOT NULL,
        status TEXT NOT NULL DEFAULT 'open' CHECK(status IN ('open', 'closed')),
        created_at TEXT NOT NULL,
        closed_at TEXT,
    default_amount_cents INTEGER
      )`,
      `CREATE TABLE IF NOT EXISTS payments (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        ref TEXT NOT NULL UNIQUE,
        user_id INTEGER NOT NULL,
        event_id INTEGER,
        description TEXT NOT NULL,
        amount_cents INTEGER NOT NULL,
        payee_type TEXT NOT NULL CHECK(payee_type IN ('mobile', 'uen')),
        payee_value TEXT NOT NULL,
        status TEXT NOT NULL CHECK(status IN ('pending', 'received', 'voided')),
        source TEXT NOT NULL CHECK(source IN ('manual', 'notification')),
        qr_payload TEXT NOT NULL,
        payer_type TEXT,
        payer_value TEXT,
        payer_name TEXT,
        created_at TEXT NOT NULL,
        received_at TEXT,
        received_by INTEGER,
        voided_by INTEGER,
        FOREIGN KEY (event_id) REFERENCES events(id)
      )`,
      `CREATE TABLE IF NOT EXISTS paybacks (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        ref TEXT NOT NULL UNIQUE,
        payment_id INTEGER NOT NULL,
        payer_type TEXT NOT NULL,
        payer_value TEXT NOT NULL,
        amount_cents INTEGER NOT NULL,
        status TEXT NOT NULL CHECK(status IN ('pending', 'sent', 'cancelled')),
        qr_payload TEXT NOT NULL,
        created_at TEXT NOT NULL,
        sent_at TEXT,
        created_by INTEGER,
        sent_by INTEGER,
        cancelled_by INTEGER
      )`,
    ];
    for (const stmt of statements) {
      await env.paynow_db.prepare(stmt).run();
    }
  });

  beforeEach(() => {
    repo = new D1EventRepository(env.paynow_db);
  });

  // ========================================================================
  // createEvent
  // ========================================================================

  describe('createEvent', () => {
    it('stores an optional default amount; none, zero, negative or fractional become null', async () => {
      const base = {
        chatId: -42,
        topicId: 0,
        name: 'Default amount',
        payeeType: 'mobile' as const,
        payeeValue: '+6591234567',
        status: 'open' as const,
        timestamp: testTimestamp,
      };
      const withDefault = await repo.createEvent({
        ...base,
        ref: 'DEFAMT0001',
        defaultAmountCents: 2100,
      });
      expect(withDefault.defaultAmountCents).toBe(2100);
      expect((await repo.getEventByRef('DEFAMT0001'))!.defaultAmountCents).toBe(2100);

      expect(
        (await repo.createEvent({ ...base, ref: 'DEFAMT0002' })).defaultAmountCents
      ).toBeNull();
      for (const [i, bad] of [0, -5, 12.5, Number.NaN].entries()) {
        const e = await repo.createEvent({
          ...base,
          ref: `DEFAMT01${i}0`,
          defaultAmountCents: bad,
        });
        expect(e.defaultAmountCents).toBeNull();
      }
    });

    it('creates an event with all fields', async () => {
      const event = await repo.createEvent({
        ref: 'EVT-TEST01',
        chatId: 100,
        topicId: 0,
        name: 'Test Event',
        payeeType: 'mobile',
        payeeValue: '+6591234567',
        status: 'open',
        timestamp: testTimestamp,
      });

      expect(event.ref).toBe('EVT-TEST01');
      expect(event.chatId).toBe(100);
      expect(event.topicId).toBe(0);
      expect(event.name).toBe('Test Event');
      expect(event.payeeType).toBe('mobile');
      expect(event.payeeValue).toBe('+6591234567');
      expect(event.status).toBe('open');
      expect(event.createdAt).toBe(testTimestamp);
      expect(event.closedAt).toBeNull();
    });

    it('creates an event with topic_id for supergroup topics', async () => {
      const event = await repo.createEvent({
        ref: 'EVT-TOPIC1',
        chatId: 200,
        topicId: 42,
        name: 'Topic Event',
        payeeType: 'uen',
        payeeValue: '201234567A',
        status: 'open',
        timestamp: testTimestamp,
      });

      expect(event.topicId).toBe(42);
      expect(event.payeeType).toBe('uen');
    });

    it('enforces unique ref constraint', async () => {
      await repo.createEvent({
        ref: 'EVT-DUP',
        chatId: 300,
        topicId: 0,
        name: 'Duplicate',
        payeeType: 'mobile',
        payeeValue: '+6591234567',
        status: 'open',
        timestamp: testTimestamp,
      });

      await expect(
        repo.createEvent({
          ref: 'EVT-DUP',
          chatId: 301,
          topicId: 0,
          name: 'Duplicate 2',
          payeeType: 'mobile',
          payeeValue: '+6591234567',
          status: 'open',
          timestamp: testTimestamp,
        })
      ).rejects.toThrow();
    });
  });

  // ========================================================================
  // listOpenEventsByChat
  // ========================================================================

  describe('listOpenEventsByChat', () => {
    it('returns only open events for the given chat+topic', async () => {
      const chatId = 400;
      const topicId = 0;

      await repo.createEvent({
        ref: 'EVT-OPEN1',
        chatId,
        topicId,
        name: 'Open Event',
        payeeType: 'mobile',
        payeeValue: '+6591234567',
        status: 'open',
        timestamp: testTimestamp,
      });

      const closedEvent = await repo.createEvent({
        ref: 'EVT-CLOSED1',
        chatId,
        topicId,
        name: 'Closed Event',
        payeeType: 'mobile',
        payeeValue: '+6591234567',
        status: 'open',
        timestamp: testTimestamp,
      });
      await repo.closeEvent(closedEvent.ref, testTimestamp);

      const openEvents = await repo.listOpenEventsByChat(chatId, topicId);
      expect(openEvents.map((e) => e.ref)).toContain('EVT-OPEN1');
      expect(openEvents.map((e) => e.ref)).not.toContain('EVT-CLOSED1');
    });

    it('isolates events by chat_id', async () => {
      const chatA = 500;
      const chatB = 501;

      await repo.createEvent({
        ref: 'EVT-CHATA',
        chatId: chatA,
        topicId: 0,
        name: 'Chat A Event',
        payeeType: 'mobile',
        payeeValue: '+6591234567',
        status: 'open',
        timestamp: testTimestamp,
      });

      await repo.createEvent({
        ref: 'EVT-CHATB',
        chatId: chatB,
        topicId: 0,
        name: 'Chat B Event',
        payeeType: 'mobile',
        payeeValue: '+6591234567',
        status: 'open',
        timestamp: testTimestamp,
      });

      const chatAEvents = await repo.listOpenEventsByChat(chatA, 0);
      const chatBEvents = await repo.listOpenEventsByChat(chatB, 0);

      expect(chatAEvents.map((e) => e.ref)).toContain('EVT-CHATA');
      expect(chatAEvents.map((e) => e.ref)).not.toContain('EVT-CHATB');

      expect(chatBEvents.map((e) => e.ref)).toContain('EVT-CHATB');
      expect(chatBEvents.map((e) => e.ref)).not.toContain('EVT-CHATA');
    });

    it('isolates events by topic_id within the same chat', async () => {
      const chatId = 600;

      await repo.createEvent({
        ref: 'EVT-TOPIC0-600',
        chatId,
        topicId: 0,
        name: 'Topic 0 Event',
        payeeType: 'mobile',
        payeeValue: '+6591234567',
        status: 'open',
        timestamp: testTimestamp,
      });

      await repo.createEvent({
        ref: 'EVT-TOPIC1-600',
        chatId,
        topicId: 1,
        name: 'Topic 1 Event',
        payeeType: 'mobile',
        payeeValue: '+6591234567',
        status: 'open',
        timestamp: testTimestamp,
      });

      const topic0Events = await repo.listOpenEventsByChat(chatId, 0);
      const topic1Events = await repo.listOpenEventsByChat(chatId, 1);

      expect(topic0Events.map((e) => e.ref)).toContain('EVT-TOPIC0-600');
      expect(topic0Events.map((e) => e.ref)).not.toContain('EVT-TOPIC1-600');

      expect(topic1Events.map((e) => e.ref)).toContain('EVT-TOPIC1-600');
      expect(topic1Events.map((e) => e.ref)).not.toContain('EVT-TOPIC0-600');
    });

    it('returns empty array when no open events', async () => {
      const events = await repo.listOpenEventsByChat(99999, 0);
      expect(events).toEqual([]);
    });
  });

  // ========================================================================
  // getEventByRef
  // ========================================================================

  describe('getEventByRef', () => {
    it('returns the event by ref', async () => {
      const chatId = 700;
      await repo.createEvent({
        ref: 'EVT-GETREF',
        chatId,
        topicId: 0,
        name: 'Get Ref Event',
        payeeType: 'mobile',
        payeeValue: '+6591234567',
        status: 'open',
        timestamp: testTimestamp,
      });

      const event = await repo.getEventByRef('EVT-GETREF');
      expect(event).not.toBeNull();
      expect(event!.name).toBe('Get Ref Event');
      expect(event!.chatId).toBe(chatId);
    });

    it('returns null for non-existent ref', async () => {
      const event = await repo.getEventByRef('EVT-DOESNOTEXIST');
      expect(event).toBeNull();
    });
  });

  // ========================================================================
  // closeEvent
  // ========================================================================

  describe('closeEvent', () => {
    it('closes an open event (CAS winner)', async () => {
      const chatId = 800;
      await repo.createEvent({
        ref: 'EVT-CLOSE1',
        chatId,
        topicId: 0,
        name: 'To Close',
        payeeType: 'mobile',
        payeeValue: '+6591234567',
        status: 'open',
        timestamp: testTimestamp,
      });

      const closed = await repo.closeEvent('EVT-CLOSE1', '2024-01-02T00:00:00Z');
      expect(closed).toBe(true);

      const event = await repo.getEventByRef('EVT-CLOSE1');
      expect(event!.status).toBe('closed');
      expect(event!.closedAt).toBe('2024-01-02T00:00:00Z');
    });

    it('returns false for already-closed event (idempotent)', async () => {
      const chatId = 900;
      await repo.createEvent({
        ref: 'EVT-CLOSE2',
        chatId,
        topicId: 0,
        name: 'Already Closed',
        payeeType: 'mobile',
        payeeValue: '+6591234567',
        status: 'open',
        timestamp: testTimestamp,
      });

      await repo.closeEvent('EVT-CLOSE2', testTimestamp);
      const secondClose = await repo.closeEvent('EVT-CLOSE2', testTimestamp);
      expect(secondClose).toBe(false);

      const event = await repo.getEventByRef('EVT-CLOSE2');
      expect(event!.status).toBe('closed');
    });

    it('returns false for non-existent event', async () => {
      const closed = await repo.closeEvent('EVT-NOPE', testTimestamp);
      expect(closed).toBe(false);
    });
  });

  // ========================================================================
  // getEventStats
  // ========================================================================

  describe('getEventStats', () => {
    it('returns zero stats for event with no payments', async () => {
      const chatId = 1000;
      const event = await repo.createEvent({
        ref: 'EVT-STATS0',
        chatId,
        topicId: 0,
        name: 'No Payments',
        payeeType: 'mobile',
        payeeValue: '+6591234567',
        status: 'open',
        timestamp: testTimestamp,
      });

      const stats = await repo.getEventStats(event.id);
      expect(stats.paymentCount).toBe(0);
      expect(stats.collectedCents).toBe(0);
      expect(stats.pendingCents).toBe(0);
    });

    it('excludes voided payments from the count and both totals', async () => {
      const chatId = 1001;
      const event = await repo.createEvent({
        ref: 'EVT-STATS1',
        chatId,
        topicId: 0,
        name: 'With Voids',
        payeeType: 'mobile',
        payeeValue: '+6591234567',
        status: 'open',
        timestamp: testTimestamp,
      });
      const payments = new D1Repository(env.paynow_db);
      const make = (ref: string, amountCents: number, status: 'pending' | 'received' | 'voided') =>
        payments.createPayment({
          ref,
          userId: chatId,
          eventId: event.id,
          description: 'With Voids',
          amountCents,
          payeeType: 'mobile',
          payeeValue: '+6591234567',
          status,
          source: 'manual',
          qrPayload: 'x',
          timestamp: testTimestamp,
        });
      await make('STAT-R1', 1000, 'received');
      await make('STAT-P1', 500, 'pending');
      await make('STAT-V1', 700, 'voided');

      const stats = await repo.getEventStats(event.id);

      expect(stats).toEqual({
        paymentCount: 2,
        collectedCents: 1000,
        paidBackCents: 0,
        pendingCents: 500,
      });
    });
  });
});
