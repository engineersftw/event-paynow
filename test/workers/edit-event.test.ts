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

  it('sets, replaces and clears the website through the real bot pipeline', async () => {
    const chatId = 920000002;
    const events = new D1EventRepository(env.paynow_db);
    await events.createEvent({
      ref: 'EVT-EDIT-WEB',
      chatId,
      topicId: 0,
      name: 'Dinner',
      payeeType: 'mobile',
      payeeValue: '+6591234567',
      status: 'open',
      timestamp: T0,
    });
    const b = bot();
    const websiteOf = async () => (await events.getEventByRef('EVT-EDIT-WEB'))!.websiteUrl;

    // the Website button exists, a bad address is refused, a good one is saved and shown
    await b.handleUpdate(textUpdate(chatId, '/edit_event'));
    expect(buttons().map((x) => x.text)).toContain('Website');
    await b.handleUpdate(callbackUpdate(chatId, 'edit_field:website'));
    await b.handleUpdate(textUpdate(chatId, 'javascript:alert(1)'));
    expect(stub.lastText()).toContain('not a valid web address');
    expect(await websiteOf()).toBeNull();
    await b.handleUpdate(textUpdate(chatId, 'example.com/lunch'));
    expect(stub.lastText()).toContain('Website: https://example.com/lunch ✏️');
    expect(await websiteOf()).toBe('https://example.com/lunch');

    // replace it
    await b.handleUpdate(textUpdate(chatId, '/edit_event'));
    await b.handleUpdate(callbackUpdate(chatId, 'edit_field:website', 500, 20));
    await b.handleUpdate(textUpdate(chatId, 'https://example.com/other'));
    expect(await websiteOf()).toBe('https://example.com/other');

    // clear it with the Clear button (the tap is routed to the handler by its edit_ prefix)
    await b.handleUpdate(textUpdate(chatId, '/edit_event'));
    await b.handleUpdate(callbackUpdate(chatId, 'edit_field:website', 500, 21));
    await b.handleUpdate(callbackUpdate(chatId, 'edit_clear_website', 500, 22));
    expect(await websiteOf()).toBeNull();
    expect(stub.editedMessages.at(-1)!.text).toContain('Website: none ✏️');
  });
});
