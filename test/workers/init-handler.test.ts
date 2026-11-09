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

const _T0 = '2024-01-01T00:00:00Z';
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

describe('init handler (Workers pool)', () => {
  it('happy path mobile: creates event and replies with ref', async () => {
    const userId = 900000001;
    const { bot } = makeWiredBot();

    await bot.handleUpdate(textUpdate(userId, '/init'));
    expect(stub.lastText()).toContain('create a new event');

    await bot.handleUpdate(textUpdate(userId, 'Birthday Party'));
    expect(stub.lastText()).toContain('Event: Birthday Party');

    await bot.handleUpdate(textUpdate(userId, '91234567'));
    await bot.handleUpdate(textUpdate(userId, '21')); // default amount step
    await bot.handleUpdate(textUpdate(userId, 'https://example.com/e2e')); // website step
    const confirmMsg = stub.sentMessages[stub.sentMessages.length - 1]!;
    expect(confirmMsg.text).toContain('+6591234567');

    const keyboard = confirmMsg.replyMarkup as {
      inline_keyboard: Array<Array<{ text: string; callback_data: string }>>;
    };
    const confirmData = keyboard.inline_keyboard
      .flat()
      .find((b) => b.text.startsWith('✅'))!.callback_data;
    await bot.handleUpdate(callbackUpdate(userId, confirmData));

    expect(stub.editedMessages).toHaveLength(1);
    expect(stub.editedMessages[0]!.text).toContain('Event created');
  });

  it('happy path UEN: creates event', async () => {
    const userId = 900000002;
    const { bot } = makeWiredBot();

    await bot.handleUpdate(textUpdate(userId, '/init'));
    await bot.handleUpdate(textUpdate(userId, 'Company Event'));
    await bot.handleUpdate(textUpdate(userId, '201234567A'));
    await bot.handleUpdate(textUpdate(userId, '21')); // default amount step
    await bot.handleUpdate(textUpdate(userId, 'https://example.com/e2e')); // website step

    const confirmMsg = stub.sentMessages[stub.sentMessages.length - 1]!;
    expect(confirmMsg.text).toContain('UEN: 201234567A');

    const keyboard = confirmMsg.replyMarkup as {
      inline_keyboard: Array<Array<{ text: string; callback_data: string }>>;
    };
    const confirmData = keyboard.inline_keyboard
      .flat()
      .find((b) => b.text.startsWith('✅'))!.callback_data;
    await bot.handleUpdate(callbackUpdate(userId, confirmData));

    expect(stub.editedMessages[0]!.text).toContain('Event created');
  });

  it('invalid proxy re-prompt', async () => {
    const userId = 900000003;
    const { bot } = makeWiredBot();

    await bot.handleUpdate(textUpdate(userId, '/init'));
    await bot.handleUpdate(textUpdate(userId, 'My Event'));
    await bot.handleUpdate(textUpdate(userId, 'invalid'));

    expect(stub.lastText()).toContain('Invalid reference');
  });

  it('cancel mid-flow does not create event', async () => {
    const userId = 900000004;
    const { bot } = makeWiredBot();

    await bot.handleUpdate(textUpdate(userId, '/init'));
    await bot.handleUpdate(textUpdate(userId, 'Cancel Event'));
    await bot.handleUpdate(textUpdate(userId, '91234567'));
    await bot.handleUpdate(textUpdate(userId, '21')); // default amount step
    await bot.handleUpdate(textUpdate(userId, 'https://example.com/e2e')); // website step

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

  it('empty name is rejected', async () => {
    const userId = 900000005;
    const { bot } = makeWiredBot();

    await bot.handleUpdate(textUpdate(userId, '/init'));
    await bot.handleUpdate(textUpdate(userId, '   '));

    // Should stay in flow (no advancement)
    expect(stub.lastText()).toContain('create a new event');
  });

  const tap = async (
    bot: ReturnType<typeof makeWiredBot>['bot'],
    userId: number,
    prefix: string
  ) => {
    const kb = stub.sentMessages[stub.sentMessages.length - 1]!.replyMarkup as {
      inline_keyboard: Array<Array<{ text: string; callback_data: string }>>;
    };
    const data = kb.inline_keyboard
      .flat()
      .find((b) => b.callback_data.startsWith(prefix))!.callback_data;
    await bot.handleUpdate(callbackUpdate(userId, data));
  };

  it('default amount: shown in the confirmation and success message, and stored on the event', async () => {
    const userId = 900000010;
    const { bot } = makeWiredBot();

    await bot.handleUpdate(textUpdate(userId, '/init'));
    await bot.handleUpdate(textUpdate(userId, 'Deepavali'));
    await bot.handleUpdate(textUpdate(userId, '91234567'));
    expect(stub.lastText()).toContain('Default amount to collect');
    await bot.handleUpdate(textUpdate(userId, '21'));
    expect(stub.lastText()).toContain('Event website (optional)');
    await bot.handleUpdate(textUpdate(userId, 'https://example.com/deepavali'));
    expect(stub.lastText()).toContain('Default amount: SGD 21.00');
    expect(stub.lastText()).toContain('Website: https://example.com/deepavali');

    await tap(bot, userId, 'init_confirm:');
    expect(stub.editedMessages.at(-1)!.text).toContain('Default amount: SGD 21.00');
    expect(stub.editedMessages.at(-1)!.text).toContain('Website: https://example.com/deepavali');

    const [event] = await new D1EventRepository(env.paynow_db).listOpenEventsByChat(userId, 0);
    expect(event!.defaultAmountCents).toBe(2100);
  });

  it('Skip: the event is created with no default amount', async () => {
    const userId = 900000011;
    const { bot } = makeWiredBot();

    await bot.handleUpdate(textUpdate(userId, '/init'));
    await bot.handleUpdate(textUpdate(userId, 'No Default'));
    await bot.handleUpdate(textUpdate(userId, '91234567'));
    await tap(bot, userId, 'init_skip_amount:');
    // the prompt turns into the website question (edited in place); Skip that too
    expect(stub.editedMessages.at(-1)!.text).toContain('Event website (optional)');
    await bot.handleUpdate(callbackUpdate(userId, `init_skip_website:${userId}`, 500, 10));
    // ...and then into the confirmation, without an amount or website line
    expect(stub.editedMessages.at(-1)!.text).toContain('Event: No Default');
    expect(stub.editedMessages.at(-1)!.text).not.toContain('Default amount');
    expect(stub.editedMessages.at(-1)!.text).not.toContain('Website');

    const kb = stub.editedMessages.at(-1)!.replyMarkup as {
      inline_keyboard: Array<Array<{ text: string; callback_data: string }>>;
    };
    const confirm = kb.inline_keyboard.flat().find((b) => b.text.startsWith('✅'))!.callback_data;
    await bot.handleUpdate(callbackUpdate(userId, confirm, 501, 11));
    expect(stub.editedMessages.at(-1)!.text).toContain('Event created');

    const [event] = await new D1EventRepository(env.paynow_db).listOpenEventsByChat(userId, 0);
    expect(event!.defaultAmountCents).toBeNull();
  });

  it('an invalid default amount re-asks and does not advance', async () => {
    const userId = 900000012;
    const { bot } = makeWiredBot();

    await bot.handleUpdate(textUpdate(userId, '/init'));
    await bot.handleUpdate(textUpdate(userId, 'Bad Amount'));
    await bot.handleUpdate(textUpdate(userId, '91234567'));
    for (const bad of ['abc', '0', '-5', '1.234']) {
      await bot.handleUpdate(textUpdate(userId, bad));
      expect(stub.lastText()).toContain('Invalid amount');
    }
    await bot.handleUpdate(textUpdate(userId, '12.50'));
    expect(stub.lastText()).toContain('Event website (optional)');
    await bot.handleUpdate(textUpdate(userId, 'https://example.com/x'));
    expect(stub.lastText()).toContain('Default amount: SGD 12.50');
  });

  it('website: stored normalised on the event, shown in the success message, escaped for Markdown', async () => {
    const userId = 900000013;
    const { bot } = makeWiredBot();

    await bot.handleUpdate(textUpdate(userId, '/init'));
    await bot.handleUpdate(textUpdate(userId, 'Site Event'));
    await bot.handleUpdate(textUpdate(userId, '91234567'));
    await bot.handleUpdate(textUpdate(userId, '21'));
    await bot.handleUpdate(textUpdate(userId, 'Example.com/my_event'));
    expect(stub.lastText()).toContain('Website: https://example.com/my_event');

    await tap(bot, userId, 'init_confirm:');
    expect(stub.editedMessages.at(-1)!.text).toContain('Event created');
    expect(stub.editedMessages.at(-1)!.text).toContain('Website: https://example.com/my\\_event');

    const [event] = await new D1EventRepository(env.paynow_db).listOpenEventsByChat(userId, 0);
    expect(event!.websiteUrl).toBe('https://example.com/my_event');
  });

  it('website: unsafe or malformed input re-asks and does not advance; Skip stores none', async () => {
    const userId = 900000014;
    const { bot } = makeWiredBot();

    await bot.handleUpdate(textUpdate(userId, '/init'));
    await bot.handleUpdate(textUpdate(userId, 'Skip Site'));
    await bot.handleUpdate(textUpdate(userId, '91234567'));
    await bot.handleUpdate(textUpdate(userId, '21'));
    for (const bad of [
      'javascript:alert(1)',
      'data:text/html,x',
      'https://u:p@example.com',
      'not a url',
    ]) {
      await bot.handleUpdate(textUpdate(userId, bad));
      expect(stub.lastText()).toContain('not a valid web address');
    }
    // the last message is the error reply, so tap the Skip button of the original prompt directly
    await bot.handleUpdate(callbackUpdate(userId, `init_skip_website:${userId}`, 503, 13));
    expect(stub.editedMessages.at(-1)!.text).toContain('Event: Skip Site');
    expect(stub.editedMessages.at(-1)!.text).not.toContain('Website');

    const kb = stub.editedMessages.at(-1)!.replyMarkup as {
      inline_keyboard: Array<Array<{ text: string; callback_data: string }>>;
    };
    const confirm = kb.inline_keyboard.flat().find((b) => b.text.startsWith('✅'))!.callback_data;
    await bot.handleUpdate(callbackUpdate(userId, confirm, 502, 12));
    const [event] = await new D1EventRepository(env.paynow_db).listOpenEventsByChat(userId, 0);
    expect(event!.websiteUrl).toBeNull();
  });

  it('website: cancelling at the confirmation stores nothing', async () => {
    const userId = 900000015;
    const { bot } = makeWiredBot();

    await bot.handleUpdate(textUpdate(userId, '/init'));
    await bot.handleUpdate(textUpdate(userId, 'Cancelled Site'));
    await bot.handleUpdate(textUpdate(userId, '91234567'));
    await bot.handleUpdate(textUpdate(userId, '21'));
    await bot.handleUpdate(textUpdate(userId, 'https://example.com/never'));
    await tap(bot, userId, 'init_cancel:');

    expect(await new D1EventRepository(env.paynow_db).listOpenEventsByChat(userId, 0)).toHaveLength(
      0
    );
  });
});
