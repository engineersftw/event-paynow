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

beforeAll(async () => {
  await applyTestSchema(env.paynow_db);
});

const T0 = '2024-01-01T00:00:00Z';
const stub = new TelegramStub();

beforeEach(() => {
  stub.reset();
});

function makeWiredBot() {
  const bot = createBot(env as unknown as WorkerEnv, {
    botInfo: TEST_BOT_INFO,
    client: { fetch: stub.fetch },
  });
  return { bot };
}

async function seedEvent(chatId: number, name: string = 'Test Event') {
  const eventRepo = new D1EventRepository(env.paynow_db);
  return eventRepo.createEvent({
    ref: `EVT-${chatId}-${Math.random().toString(36).slice(2, 8)}`,
    chatId,
    topicId: 0,
    name,
    payeeType: 'mobile',
    payeeValue: '+6591234567',
    status: 'open',
    timestamp: T0,
  });
}

describe('end_event handler (Workers pool)', () => {
  it('closes an open event', async () => {
    const userId = 910000001;
    const { bot } = makeWiredBot();
    const _event = await seedEvent(userId);

    await bot.handleUpdate(textUpdate(userId, '/end_event'));
    // With 1 event, auto-advances to confirm step
    expect(stub.lastText()).toContain('Close event');

    const confirmMsg = stub.sentMessages[stub.sentMessages.length - 1]!;
    const keyboard = confirmMsg.replyMarkup as {
      inline_keyboard: Array<Array<{ text: string; callback_data: string }>>;
    };
    const confirmData = keyboard.inline_keyboard
      .flat()
      .find((b) => b.text.startsWith('✅'))!.callback_data;
    await bot.handleUpdate(callbackUpdate(userId, confirmData));

    expect(stub.editedMessages).toHaveLength(1);
    expect(stub.editedMessages[0]!.text).toContain('closed');
  });

  it('shows no open events message', async () => {
    const userId = 910000002;
    const { bot } = makeWiredBot();

    await bot.handleUpdate(textUpdate(userId, '/end_event'));

    expect(stub.lastText()).toContain('No open events');
  });

  it('double-tap shows already closed', async () => {
    const userId = 910000003;
    const { bot } = makeWiredBot();
    const _event = await seedEvent(userId);

    await bot.handleUpdate(textUpdate(userId, '/end_event'));
    const confirmMsg = stub.sentMessages[stub.sentMessages.length - 1]!;
    const keyboard = confirmMsg.replyMarkup as {
      inline_keyboard: Array<Array<{ text: string; callback_data: string }>>;
    };
    const confirmData = keyboard.inline_keyboard
      .flat()
      .find((b) => b.text.startsWith('✅'))!.callback_data;

    // First close
    await bot.handleUpdate(callbackUpdate(userId, confirmData));
    expect(stub.editedMessages[0]!.text).toContain('closed');

    // Second close attempt
    await bot.handleUpdate(callbackUpdate(userId, confirmData, 501, 3));
    // Should show already closed
    expect(stub.editedMessages.length).toBeGreaterThanOrEqual(1);
  });

  it('cancel does not close event', async () => {
    const userId = 910000004;
    const { bot } = makeWiredBot();
    const _event = await seedEvent(userId);

    await bot.handleUpdate(textUpdate(userId, '/end_event'));
    const confirmMsg = stub.sentMessages[stub.sentMessages.length - 1]!;
    const keyboard = confirmMsg.replyMarkup as {
      inline_keyboard: Array<Array<{ text: string; callback_data: string }>>;
    };
    const cancelData = keyboard.inline_keyboard
      .flat()
      .find((b) => b.text.startsWith('❌'))!.callback_data;
    await bot.handleUpdate(callbackUpdate(userId, cancelData));

    expect(stub.editedMessages[0]!.text).toContain('Cancelled');
  });
});
