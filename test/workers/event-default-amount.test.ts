import { env } from 'cloudflare:test';
import { beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { createBot } from '../../src/bot';
import { D1EventRepository } from '../../src/db/drizzle-repository';
import type { Env as WorkerEnv } from '../../src/env';
import {
  applyTestSchema,
  callbackUpdate,
  TEST_BOT_INFO,
  TelegramStub,
  textUpdate,
} from './harness';

/** /start offers the event's default amount as a one-tap choice (typing still works). */

beforeAll(async () => {
  await applyTestSchema(env.paynow_db);
});

const stub = new TelegramStub();
beforeEach(() => stub.reset());

const bot = () =>
  createBot(env as unknown as WorkerEnv, {
    botInfo: TEST_BOT_INFO,
    client: { fetch: stub.fetch },
  });

async function seedEvent(chatId: number, defaultAmountCents?: number) {
  return new D1EventRepository(env.paynow_db).createEvent({
    ref: `DEF${String(chatId).slice(-7)}`,
    chatId,
    topicId: 0,
    name: 'Deepavali',
    payeeType: 'mobile',
    payeeValue: '+6591234567',
    status: 'open',
    ...(defaultAmountCents === undefined ? {} : { defaultAmountCents }),
    timestamp: '2024-01-01T00:00:00Z',
  });
}

/** /start → payer → skip the name; leaves the conversation at the amount step. */
async function toAmountStep(b: ReturnType<typeof bot>, userId: number) {
  await b.handleUpdate(textUpdate(userId, '/start'));
  await b.handleUpdate(textUpdate(userId, '91234568'));
  await b.handleUpdate(callbackUpdate(userId, 'start_skip_name', 500, 3));
}

const buttons = (markup: unknown) =>
  (
    (markup as { inline_keyboard?: Array<Array<{ text: string; callback_data: string }>> })
      ?.inline_keyboard ?? []
  ).flat();

describe('/start with a default amount', () => {
  it('offers "Use SGD 21.00"; tapping it goes to the summary and a payment is created only after Confirm', async () => {
    const userId = 930000001;
    await seedEvent(userId, 2100);
    const b = bot();
    await toAmountStep(b, userId);

    const prompt = stub.editedMessages.at(-1)!;
    expect(buttons(prompt.replyMarkup).map((x) => x.text)).toEqual(['Use SGD 21.00']);

    await b.handleUpdate(callbackUpdate(userId, 'start_use_default', 501, 4));
    expect(stub.lastText()).toContain('Amount: SGD 21.00');
    expect(stub.sentPhotos).toHaveLength(0);

    await b.handleUpdate(callbackUpdate(userId, 'start_confirm', 502, 5));
    expect(stub.sentPhotos).toHaveLength(1);
    expect(stub.sentPhotos[0]!.caption).toContain('SGD 21.00');
  });

  it('typing a different amount still works', async () => {
    const userId = 930000002;
    await seedEvent(userId, 2100);
    const b = bot();
    await toAmountStep(b, userId);

    await b.handleUpdate(textUpdate(userId, '15'));
    expect(stub.lastText()).toContain('Amount: SGD 15.00');
  });

  it('the button also shows when the payer name was typed', async () => {
    const userId = 930000003;
    await seedEvent(userId, 2100);
    const b = bot();
    await b.handleUpdate(textUpdate(userId, '/start'));
    await b.handleUpdate(textUpdate(userId, '91234568'));
    await b.handleUpdate(textUpdate(userId, 'Alice'));

    const prompt = stub.sentMessages.at(-1)!;
    expect(buttons(prompt.replyMarkup).map((x) => x.callback_data)).toEqual(['start_use_default']);
  });

  it('an event without a default amount has no button', async () => {
    const userId = 930000004;
    await seedEvent(userId);
    const b = bot();
    await toAmountStep(b, userId);

    expect(buttons(stub.editedMessages.at(-1)!.replyMarkup)).toEqual([]);
  });

  it('a stale tap (no conversation) says the session expired and creates nothing', async () => {
    const userId = 930000005;
    await seedEvent(userId, 2100);
    const b = bot();

    await b.handleUpdate(callbackUpdate(userId, 'start_use_default', 500, 3));

    expect(stub.callbackAnswers.join(' ')).toContain('Session expired');
    expect(stub.sentPhotos).toHaveLength(0);
  });

  it('a tap after the event closed is refused', async () => {
    const userId = 930000006;
    const event = await seedEvent(userId, 2100);
    const b = bot();
    await toAmountStep(b, userId);
    await new D1EventRepository(env.paynow_db).closeEvent(event.ref, '2024-01-02T00:00:00Z');

    await b.handleUpdate(callbackUpdate(userId, 'start_use_default', 501, 4));

    expect(stub.callbackAnswers.join(' ')).toContain('closed');
    expect(stub.sentPhotos).toHaveLength(0);
  });
});
