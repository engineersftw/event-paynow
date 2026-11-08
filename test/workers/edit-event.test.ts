import { env } from 'cloudflare:test';
import { beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { createBot } from '../../src/bot';
import { D1EventRepository, D1Repository } from '../../src/db/drizzle-repository';
import type { Env as WorkerEnv } from '../../src/env';
import {
  applyTestSchema,
  callbackUpdate,
  TEST_BOT_INFO,
  TelegramStub,
  textUpdate,
} from './harness';

beforeAll(async () => {
  await applyTestSchema(env.paynow_db);
});

const T0 = '2024-01-01T00:00:00Z';
const stub = new TelegramStub();
beforeEach(() => stub.reset());

const bot = () =>
  createBot(env as unknown as WorkerEnv, {
    botInfo: TEST_BOT_INFO,
    client: { fetch: stub.fetch },
  });

function buttons(): Array<{ text: string; callback_data: string }> {
  const m = stub.sentMessages[stub.sentMessages.length - 1]!.replyMarkup as {
    inline_keyboard: Array<Array<{ text: string; callback_data: string }>>;
  };
  return m.inline_keyboard.flat();
}

describe('/edit_event (Workers pool)', () => {
  it('edits the name and payee in a private chat, leaving an existing payment as it was', async () => {
    const chatId = 920000001;
    const events = new D1EventRepository(env.paynow_db);
    const event = await events.createEvent({
      ref: 'EVT-EDIT-1',
      chatId,
      topicId: 0,
      name: 'Dinner',
      payeeType: 'mobile',
      payeeValue: '+6591234567',
      status: 'open',
      timestamp: T0,
    });
    const repo = new D1Repository(env.paynow_db);
    await repo.createPayment({
      ref: 'PAY-EDIT-1',
      userId: 1,
      eventId: event.id,
      description: 'Dinner',
      amountCents: 500,
      payeeType: 'mobile',
      payeeValue: '+6591234567',
      status: 'pending',
      source: 'manual',
      qrPayload: 'p',
      timestamp: T0,
    });
    const b = bot();

    await b.handleUpdate(textUpdate(chatId, '/edit_event'));
    expect(stub.lastText()).toContain('What do you want to change?');
    await b.handleUpdate(
      callbackUpdate(chatId, buttons().find((x) => x.text === 'Name')!.callback_data)
    );
    await b.handleUpdate(textUpdate(chatId, 'Team lunch'));
    expect(stub.lastText()).toContain('Name: Team lunch ✏️');

    await b.handleUpdate(textUpdate(chatId, '/edit_event'));
    await b.handleUpdate(
      callbackUpdate(chatId, buttons().find((x) => x.text === 'Payee')!.callback_data)
    );
    await b.handleUpdate(textUpdate(chatId, '98765432'));
    expect(stub.lastText()).toContain('Mobile number: +6598765432 ✏️');

    const after = (await events.getEventByRef('EVT-EDIT-1'))!;
    expect([after.name, after.payeeValue]).toEqual(['Team lunch', '+6598765432']);
    const payment = (await repo.getPaymentByRef('PAY-EDIT-1'))!;
    expect([payment.description, payment.payeeValue]).toEqual(['Dinner', '+6591234567']);
  });
});
