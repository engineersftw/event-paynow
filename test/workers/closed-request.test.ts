import { env } from 'cloudflare:test';
import { beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { createBot } from '../../src/bot';
import { D1EventRepository, D1Repository } from '../../src/db/drizzle-repository';
import type { Env as WorkerEnv } from '../../src/env';
import {
  applyTestSchema,
  callbackUpdate,
  groupTextUpdate,
  TEST_BOT_INFO,
  TelegramStub,
  textUpdate,
} from './harness';

/**
 * The Event bot's conversation buttons after the conversation is gone: a popup that says what to
 * do, the dead buttons removed, and nothing created. Buttons that read stored data keep working.
 */

beforeAll(async () => {
  await applyTestSchema(env.paynow_db);
});

const stub = new TelegramStub();
beforeEach(() => stub.reset());

function wired() {
  return createBot(env as unknown as WorkerEnv, {
    botInfo: TEST_BOT_INFO,
    client: { fetch: stub.fetch },
  });
}

let upd = 1;
const tapAs = (b: ReturnType<typeof wired>, user: number, data: string) =>
  b.handleUpdate(callbackUpdate(user, data, 500, upd++));

/** The keyboard the bot last put on a message (the markup is a JSON string inside the body). */
const lastKeyboard = () => {
  const body = stub.otherCalls.findLast((c) => c.method === 'editMessageReplyMarkup')?.body;
  const markup = body ? JSON.parse(body).reply_markup : undefined;
  return (typeof markup === 'string' ? JSON.parse(markup) : markup) as
    | { inline_keyboard: unknown[] }
    | undefined;
};

describe('a dead button of an Event bot conversation', () => {
  let user = 940000000;
  const cases: Array<[string, string, string]> = [
    ['/init', 'init_confirm:', 'Session expired'],
    ['/start', 'start_confirm', ''],
    ['/payback <ref>', 'payback_confirm_payer:ABC1234567', ''],
    ['/end_event', 'end_pick:EVT1234567', 'Session expired'],
    ['/edit_event', 'edit_cancel', 'Session expired'],
  ];

  for (const [command, data, editedText] of cases) {
    it(`gets a popup naming ${command}, and creates nothing`, async () => {
      const u = user++;
      const b = wired();
      await tapAs(b, u, data.endsWith(':') ? `${data}${u}` : data);
      const popup = stub.callbackAlerts.at(-1)!;
      expect(popup).toContain('no longer open');
      expect(popup).toContain('timed out after 10 minutes');
      expect(popup).toContain(`Send ${command} to start again`);
      expect(stub.sentPhotos).toHaveLength(0);
      if (editedText) {
        // these three replace the message (as before) and now also answer the tap
        expect(stub.editedMessages.at(-1)!.text).toContain(editedText);
      } else {
        // these two leave the message alone, so the buttons are taken off it
        expect(lastKeyboard()?.inline_keyboard.flat()).toEqual([]);
      }
    });
  }

  it('does not touch the payments list, which reads stored data and has no expiry', async () => {
    const u = user++;
    const b = wired();
    await tapAs(b, u, 'payments:0');
    expect(stub.callbackAlerts).toEqual([]);
    expect(lastKeyboard()).toBeUndefined();
  });

  it('keeps the old payment actions working long after the conversation that made them', async () => {
    const u = user++;
    const events = new D1EventRepository(env.paynow_db);
    const event = await events.createEvent({
      ref: `EVT${u}`,
      chatId: u,
      topicId: 0,
      name: 'Old Event',
      payeeType: 'mobile',
      payeeValue: '+6591234567',
      status: 'open',
      timestamp: '2024-01-01T00:00:00Z',
    });
    const repo = new D1Repository(env.paynow_db);
    const payment = await repo.createPayment({
      ref: `PAY${u}`,
      userId: u,
      eventId: event.id,
      description: 'Old',
      amountCents: 1000,
      payeeType: 'mobile',
      payeeValue: '+6591234567',
      status: 'pending',
      source: 'manual',
      qrPayload: 'p',
      timestamp: '2024-01-01T00:00:00Z',
    });
    const b = wired();
    await tapAs(b, u, `mark_received:${payment.ref}`);
    expect((await repo.getPaymentByRef(payment.ref))?.status).toBe('received');
    expect(stub.callbackAlerts).toEqual([]);
  });
});

describe('a conversation that is still open at another step', () => {
  it('does not get the popup: /start at the first step, a button of a later step', async () => {
    const u = 940001000;
    await new D1EventRepository(env.paynow_db).createEvent({
      ref: `EVT${u}`,
      chatId: u,
      topicId: 0,
      name: 'Open Event',
      payeeType: 'mobile',
      payeeValue: '+6591234567',
      status: 'open',
      timestamp: '2024-01-01T00:00:00Z',
    });
    const b = wired();
    await b.handleUpdate(textUpdate(u, '/start', upd++)); // one open event: straight to the payer step
    expect(stub.lastText()).toContain("payer's PayNow");
    stub.reset();
    await tapAs(b, u, 'start_skip_name'); // a later step's button, while /start is open
    expect(stub.callbackAnswers.at(-1)).toBe('That step is over.');
    expect(stub.callbackAlerts).toEqual([]);
    expect(lastKeyboard()).toBeUndefined(); // the buttons are not taken off a live conversation
  });
});

describe('typed text with no conversation open', () => {
  const HINT =
    'Nothing is waiting for an answer. Send /help to see what I can do. (A request is forgotten after 10 minutes without an answer.)';
  const timeOut = (key: string) =>
    env.CHAT_SESSION.get(env.CHAT_SESSION.idFromName(key)).fetch(
      new Request('http://localhost/reset', { method: 'POST' })
    );

  it('gets one hint in a private chat, also after a conversation timed out', async () => {
    const u = 941000001;
    const b = wired();
    await b.handleUpdate(textUpdate(u, '/init', upd++));
    await timeOut(`chat-${u}`);
    const sent = stub.sentMessages.length;
    await b.handleUpdate(textUpdate(u, 'Team Dinner', upd++)); // the event name, too late
    expect(stub.sentMessages).toHaveLength(sent + 1);
    expect(stub.lastText()).toBe(HINT);
  });

  it('is not sent for a command, known or unknown', async () => {
    const u = 941000002;
    const b = wired();
    await b.handleUpdate(textUpdate(u, '/help', upd++));
    expect(stub.lastText()).not.toBe(HINT);
    stub.reset();
    await b.handleUpdate(textUpdate(u, '/nosuchcommand', upd++));
    expect(stub.sentMessages).toHaveLength(0);
  });

  it('stays silent in a group, and for another member while a conversation is open', async () => {
    const chat = -1009410003;
    const [alice, bob] = [941000003, 941000004];
    const b = wired();
    await b.handleUpdate(groupTextUpdate(chat, bob, 'see you tomorrow', undefined, upd++));
    expect(stub.sentMessages).toHaveLength(0);

    await b.handleUpdate(groupTextUpdate(chat, alice, '/init', undefined, upd++));
    const sent = stub.sentMessages.length;
    await b.handleUpdate(groupTextUpdate(chat, bob, 'ok', undefined, upd++)); // Alice's flow, not Bob's
    expect(stub.sentMessages).toHaveLength(sent);
  });

  it('still reads the text as the answer while a conversation is open', async () => {
    const u = 941000005;
    const b = wired();
    await b.handleUpdate(textUpdate(u, '/init', upd++));
    await b.handleUpdate(textUpdate(u, 'Team Dinner', upd++));
    expect(stub.lastText()).not.toBe(HINT);
    expect(stub.lastText()).toContain('Team Dinner');
  });
});
