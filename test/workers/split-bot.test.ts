import { env } from 'cloudflare:test';
import type { Update } from 'grammy/types';
import jsQR from 'jsqr';
import { beforeEach, describe, expect, it } from 'vitest';
import { createSplitBot } from '../../src/split-bot';
import worker from '../../src/worker';
import type { ConversationDO } from '../../src/worker/conversation-do';
import {
  bmpToRgba,
  callbackUpdate,
  groupTextUpdate,
  TEST_BOT_INFO,
  TelegramStub,
  textUpdate,
} from './harness';

const stub = new TelegramStub();
let memberCount: unknown = 7;
let uid = 8000;
let upd = 1;
beforeEach(() => {
  stub.reset();
  memberCount = 7;
});

function bot() {
  return createSplitBot(env, 'split-token', {
    botInfo: TEST_BOT_INFO,
    client: {
      fetch: async (url, init) =>
        String(url).endsWith('/getChatMemberCount')
          ? new Response(JSON.stringify({ ok: true, result: memberCount }))
          : stub.fetch(url, init),
    },
  });
}
type B = ReturnType<typeof bot>;

const say = (b: B, user: number, text: string) => b.handleUpdate(textUpdate(user, text, upd++));
const tap = (b: B, user: number, data: string) =>
  b.handleUpdate(callbackUpdate(user, data, 500, upd++));
const gsay = (b: B, chat: number, user: number, text: string, topic?: number) =>
  b.handleUpdate(groupTextUpdate(chat, user, text, topic, upd++));
function gtap(b: B, chat: number, user: number, data: string, topic?: number) {
  const u = callbackUpdate(user, data, 500, upd++) as unknown as {
    callback_query: { message: Record<string, unknown> };
  };
  u.callback_query.message.chat = { id: chat, type: 'group' };
  if (topic) u.callback_query.message.message_thread_id = topic;
  return b.handleUpdate(u as unknown as Update);
}

function peek(key: string) {
  const s = env.CHAT_SESSION.get(env.CHAT_SESSION.idFromName(key)) as unknown as ConversationDO;
  return s.fetch(new Request('http://localhost/peek')).then((r) => r.json()) as Promise<{
    flow: string;
    step: number;
  }>;
}
const buttons = () =>
  stub.sentMessages
    .at(-1)
    ?.replyMarkup?.inline_keyboard?.flat()
    .map((k) => k.callback_data);

function decode() {
  expect(stub.sentPhotos).toHaveLength(1);
  const photo = stub.sentPhotos[0]!;
  const { data, width, height } = bmpToRgba(photo.bytes);
  const result = jsQR(data, width, height);
  expect(result).not.toBeNull();
  return { payload: result!.data, caption: photo.caption };
}

describe('Split_PayNow_Bot in a private chat', () => {
  it('splits 187.40 by 4 into a fixed 46.85 QR with no payee number in the caption', async () => {
    const u = uid++;
    const b = bot();
    await say(b, u, '/split');
    expect(stub.lastText()).toContain('How much is the bill');
    await say(b, u, '187.40');
    expect(stub.lastText()).toContain('How many people');
    expect(buttons()).toBeUndefined(); // no member-count button in a private chat
    await say(b, u, '4');
    expect(stub.lastText()).toContain('Who should be paid');
    await say(b, u, '91234567');
    expect(stub.lastText()).toContain('short description');
    await say(b, u, 'Dinner');

    expect(stub.sentPhotos).toHaveLength(0);
    const summary = stub.lastText();
    expect(summary).toContain('Payee: Mobile +6591234567');
    expect(summary).toContain('Each share: SGD 46.85');
    expect(summary).not.toContain('over');
    expect(buttons()).toEqual(['split_confirm', 'split_cancel']);
    await tap(b, u, 'split_confirm');

    const { payload, caption } = decode();
    expect(payload).toContain('+6591234567');
    expect(payload).toContain('540546.85');
    expect(payload).toContain('03010'); // not editable
    expect(payload).toContain('Dinner');
    expect(caption).toContain('SGD 46.85 each (split 4 ways)');
    expect(caption).not.toContain('91234567');
    expect((await peek(`split-${u}`)).flow).toBe('idle');
  });

  it('rounds up and shows the over-collection; skip leaves the description out', async () => {
    const u = uid++;
    const b = bot();
    await say(b, u, '/start');
    await say(b, u, '100');
    await say(b, u, '3');
    await say(b, u, '201900000A');
    await tap(b, u, 'split_skip_description');
    expect(stub.lastText()).toContain('Each share: SGD 33.34');
    expect(stub.lastText()).toContain('SGD 0.02 over');
    expect(stub.lastText()).toContain('Description: none');
    await tap(b, u, 'split_confirm');
    expect(decode().payload).toContain('540533.34');
  });

  it('re-asks on bad input and a double Confirm sends one QR; Cancel sends none', async () => {
    const u = uid++;
    const b = bot();
    await say(b, u, '/split');
    await say(b, u, 'abc');
    expect(stub.lastText()).toContain('positive amount');
    await say(b, u, '10');
    for (const v of ['1', '101', 'x', '2.5']) {
      await say(b, u, v);
      expect(stub.lastText()).toContain('2 to 100');
    }
    await say(b, u, '2');
    await say(b, u, '12345');
    expect(stub.lastText()).toContain('not a valid payee');
    await say(b, u, '91234567');
    await say(b, u, 'x'.repeat(26));
    expect(stub.lastText()).toContain('25 characters');
    await tap(b, u, 'split_skip_description');
    await Promise.all([tap(b, u, 'split_confirm'), tap(b, u, 'split_confirm')]);
    expect(stub.sentPhotos).toHaveLength(1);

    await say(b, u, '/split');
    await say(b, u, '10');
    await say(b, u, '2');
    await say(b, u, '91234567');
    await tap(b, u, 'split_skip_description');
    stub.reset();
    await tap(b, u, 'split_cancel');
    expect(stub.sentPhotos).toHaveLength(0);
    expect(stub.lastText()).toContain('/split');
    expect((await peek(`split-${u}`)).flow).toBe('idle');
  });
});

describe('Split_PayNow_Bot in a group', () => {
  it('offers the member count minus the bot, uses it, hides the payee and deletes the message', async () => {
    const chat = -uid++;
    const owner = uid++;
    const b = bot();
    await gsay(b, chat, owner, '/split');
    const first = stub.sentMessages.at(-1)!;
    expect(first.text).toContain('How much is the bill');
    expect(first.replyMarkup).toMatchObject({ force_reply: true, selective: true });
    await gsay(b, chat, owner, '120');
    expect(buttons()).toEqual(['split_people:6']);
    await gtap(b, chat, owner, 'split_people:6');
    expect(stub.lastText()).toContain('Who should be paid');
    await gsay(b, chat, owner, '91234567');
    expect(stub.deletedMessages).toHaveLength(1);
    await gtap(b, chat, owner, 'split_skip_description');
    const summary = stub.lastText();
    expect(summary).toContain('…4567');
    expect(summary).not.toContain('91234567');
    expect(summary).toContain('Each share: SGD 20.00');
    await gtap(b, chat, owner, 'split_confirm');
    const { caption } = decode();
    expect(caption).not.toContain('91234567');
  });

  it('lets the owner type another number, and offers no button without a usable count', async () => {
    const chat = -uid++;
    const owner = uid++;
    const b = bot();
    memberCount = 'nope';
    await gsay(b, chat, owner, '/split');
    await gsay(b, chat, owner, '50');
    expect(buttons()).toBeUndefined();
    await gsay(b, chat, owner, '4');
    expect(stub.lastText()).toContain('Who should be paid');

    memberCount = 2; // only the bot and one person: below 2 people
    const chat2 = -uid++;
    await gsay(b, chat2, owner, '/split');
    await gsay(b, chat2, owner, '50');
    expect(buttons()).toBeUndefined();
  });

  it('ignores other members, who cannot tap the owner’s buttons either', async () => {
    const chat = -uid++;
    const owner = uid++;
    const other = uid++;
    const b = bot();
    await gsay(b, chat, owner, '/split');
    stub.reset();
    await gsay(b, chat, other, '99');
    expect(stub.sentMessages).toHaveLength(0);
    await gsay(b, chat, owner, '60');
    await gsay(b, chat, owner, '3');
    await gsay(b, chat, owner, '91234567');
    await gtap(b, chat, owner, 'split_skip_description');
    stub.reset();
    await gtap(b, chat, other, 'split_confirm');
    expect(stub.callbackAnswers).toContain('This split is not yours.');
    expect(stub.sentPhotos).toHaveLength(0);
    expect((await peek(`split-${chat}`)).step).toBe(5);
    await gtap(b, chat, owner, 'split_confirm');
    expect(stub.sentPhotos).toHaveLength(1);
  });

  it('keeps going if the payee message cannot be deleted', async () => {
    const chat = -uid++;
    const owner = uid++;
    const b = createSplitBot(env, 'split-token', {
      botInfo: TEST_BOT_INFO,
      client: {
        fetch: async (url, init) =>
          String(url).endsWith('/deleteMessage')
            ? new Response(JSON.stringify({ ok: false, error_code: 400, description: 'no' }), {
                status: 400,
              })
            : String(url).endsWith('/getChatMemberCount')
              ? new Response(JSON.stringify({ ok: true, result: 5 }))
              : stub.fetch(url, init),
      },
    });
    await gsay(b, chat, owner, '/split');
    await gsay(b, chat, owner, '40');
    await gsay(b, chat, owner, '2');
    await gsay(b, chat, owner, '91234567');
    expect(stub.lastText()).toContain('short description');
  });
});

describe('POST /webhook/split', () => {
  const post = (e: Record<string, unknown>, secret?: string) =>
    worker.fetch(
      new Request('https://x.test/webhook/split', {
        method: 'POST',
        headers: secret ? { 'X-Telegram-Bot-Api-Secret-Token': secret } : {},
        body: '{}',
      }),
      { ...env, ...e } as never,
      {} as ExecutionContext
    );
  it('is 404 until configured, 403 on a wrong secret', async () => {
    expect((await post({})).status).toBe(404);
    const on = { SPLIT_BOT_TOKEN: 't', SPLIT_WEBHOOK_SECRET: 's' };
    expect((await post(on, 'wrong')).status).toBe(403);
    expect((await post(on)).status).toBe(403);
  });
});
