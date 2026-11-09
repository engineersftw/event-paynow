import { env } from 'cloudflare:test';
import { beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { createBot } from '../../src/bot';
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

describe('end-to-end event flow (task 6.1)', () => {
  it('full flow: /init → /start → /payments → /end_event → /start rejected', async () => {
    const userId = 920000001;
    const { bot } = makeWiredBot();

    // 1. /init — create event
    await bot.handleUpdate(textUpdate(userId, '/init'));
    expect(stub.lastText()).toContain('create a new event');

    await bot.handleUpdate(textUpdate(userId, 'E2E Event'));
    expect(stub.lastText()).toContain('Event: E2E Event');

    await bot.handleUpdate(textUpdate(userId, '91234567'));
    await bot.handleUpdate(textUpdate(userId, '21')); // default amount step
    await bot.handleUpdate(textUpdate(userId, 'https://example.com/e2e')); // website step
    const confirmMsg = stub.sentMessages[stub.sentMessages.length - 1]!;
    const keyboard = confirmMsg.replyMarkup as {
      inline_keyboard: Array<Array<{ text: string; callback_data: string }>>;
    };
    const confirmData = keyboard.inline_keyboard
      .flat()
      .find((b) => b.text.startsWith('✅'))!.callback_data;
    await bot.handleUpdate(callbackUpdate(userId, confirmData));

    expect(stub.editedMessages[0]!.text).toContain('Event created');

    // 2. /start — with 1 event, auto-advance to amount
    await bot.handleUpdate(textUpdate(userId, '/start'));
    expect(stub.lastText()).toContain("payer's PayNow");
    await bot.handleUpdate(textUpdate(userId, '91234568'));
    await bot.handleUpdate(callbackUpdate(userId, 'start_skip_name'));

    await bot.handleUpdate(textUpdate(userId, '10.00'));
    expect(stub.sentPhotos).toHaveLength(0); // summary first
    await bot.handleUpdate(callbackUpdate(userId, 'start_confirm'));
    expect(stub.sentPhotos).toHaveLength(1);
    const ref = stub.sentPhotos[0]!.caption.split(' / ')[2]!;

    // 3. /payments — drill into event, see the payment
    await bot.handleUpdate(textUpdate(userId, '/payments'));
    const paymentsReply = stub.sentMessages[stub.sentMessages.length - 1]!;
    expect(paymentsReply.text).toContain('E2E Event');

    // Drill into the event
    const eventKeyboard = paymentsReply.replyMarkup as {
      inline_keyboard: Array<Array<{ text: string; callback_data: string }>>;
    };
    const viewData = eventKeyboard.inline_keyboard
      .flat()
      .find((b) => b.text.startsWith('View'))!.callback_data;
    await bot.handleUpdate(callbackUpdate(userId, viewData));

    const detailReply = stub.sentMessages[stub.sentMessages.length - 1]!;
    expect(detailReply.text).toContain(ref);

    // 4. /end_event — close the event
    await bot.handleUpdate(textUpdate(userId, '/end_event'));
    const endConfirmMsg = stub.sentMessages[stub.sentMessages.length - 1]!;
    const endKeyboard = endConfirmMsg.replyMarkup as {
      inline_keyboard: Array<Array<{ text: string; callback_data: string }>>;
    };
    const endConfirmData = endKeyboard.inline_keyboard
      .flat()
      .find((b) => b.text.startsWith('✅'))!.callback_data;
    await bot.handleUpdate(callbackUpdate(userId, endConfirmData));

    expect(stub.editedMessages.some((m) => m.text.includes('closed'))).toBe(true);

    // 5. /start again — should be rejected (no open events)
    await bot.handleUpdate(textUpdate(userId, '/start'));
    expect(stub.lastText()).toContain('No open events');
  });

  it('shows event picker when multiple events exist', async () => {
    const userId = 920000002;
    const { bot } = makeWiredBot();

    // Create two events
    for (const name of ['Event A', 'Event B']) {
      await bot.handleUpdate(textUpdate(userId, '/init'));
      await bot.handleUpdate(textUpdate(userId, name));
      await bot.handleUpdate(textUpdate(userId, '91234567'));
      await bot.handleUpdate(textUpdate(userId, '21')); // default amount step
      await bot.handleUpdate(textUpdate(userId, 'https://example.com/e2e')); // website step
      const confirmMsg = stub.sentMessages[stub.sentMessages.length - 1]!;
      const keyboard = confirmMsg.replyMarkup as {
        inline_keyboard: Array<Array<{ text: string; callback_data: string }>>;
      };
      const confirmData = keyboard.inline_keyboard
        .flat()
        .find((b) => b.text.startsWith('✅'))!.callback_data;
      await bot.handleUpdate(
        callbackUpdate(userId, confirmData, 500 + (name === 'Event A' ? 0 : 1), 10)
      );
    }

    // /start should show picker
    await bot.handleUpdate(textUpdate(userId, '/start'));
    const pickerMsg = stub.sentMessages[stub.sentMessages.length - 1]!;
    expect(pickerMsg.text).toContain('Which event is this payment for?');
    const kb = (pickerMsg.replyMarkup?.inline_keyboard ?? []).filter(
      (row: any[]) => row.length > 0
    );
    expect(kb).toHaveLength(2);
  });
});
