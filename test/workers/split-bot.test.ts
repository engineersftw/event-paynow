import { env } from 'cloudflare:test';
import type { Update } from 'grammy/types';
import jsQR from 'jsqr';
import { beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { D1SplitDirectory } from '../../src/db/split-repository';
import { D1UsageRepository } from '../../src/db/usage-repository';
import { ReceiptReaderError } from '../../src/receipt-reader';
import { acceptUpdate, createSplitBot } from '../../src/split-bot';
import worker from '../../src/worker';
import type { ConversationDO } from '../../src/worker/conversation-do';
import {
  applyTestSchema,
  bmpToRgba,
  callbackUpdate,
  editedTextUpdate,
  groupTextUpdate,
  photoUpdate,
  TEST_BOT_INFO,
  TelegramStub,
  textUpdate,
} from './harness';

const stub = new TelegramStub();
let memberCount: unknown = 7;
let uid = 8000;
let upd = 1;
beforeAll(async () => {
  await applyTestSchema(env.paynow_db);
});
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
// A tap lands on the latest message the bot sent, as it does for a user pressing a fresh button
const lastId = () => stub.lastMessageId();
const tap = (b: B, user: number, data: string) =>
  b.handleUpdate(callbackUpdate(user, data, lastId(), upd++));
const gsay = (b: B, chat: number, user: number, text: string, topic?: number) =>
  b.handleUpdate(groupTextUpdate(chat, user, text, topic, upd++));
function gtap(b: B, chat: number, user: number, data: string, topic?: number) {
  const u = callbackUpdate(user, data, lastId(), upd++) as unknown as {
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
    expect(stub.lastText()).toContain('How do you want to split');
    expect(buttons()).toEqual(['split_mode:equal', 'split_mode:custom']);
    await tap(b, u, 'split_mode:equal');
    expect(stub.lastText()).toContain('How many people');
    expect(buttons()).toBeUndefined(); // no member-count button in a private chat
    await say(b, u, '4');
    expect(stub.lastText()).toContain('Who should be paid');
    await say(b, u, '91234567');
    await tap(b, u, 'split_payee:me');
    expect(stub.lastText()).toContain('short description');
    await say(b, u, 'Dinner');

    expect(stub.sentPhotos).toHaveLength(0);
    const summary = stub.lastText();
    expect(summary).toContain('Payee: Mobile +6591234567');
    expect(summary).toContain('Each share: SGD 46.85');
    expect(summary).not.toContain('over');
    expect(buttons()).toEqual(['split_confirm', 'split_amend', 'split_cancel']);
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
    await tap(b, u, 'split_mode:equal');
    await say(b, u, '3');
    await say(b, u, '201900000A');
    await tap(b, u, 'split_payee:me');
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
    await tap(b, u, 'split_mode:equal');
    for (const v of ['1', '101', 'x', '2.5']) {
      await say(b, u, v);
      expect(stub.lastText()).toContain('2 to 100');
    }
    await say(b, u, '2');
    await say(b, u, '12345');
    expect(stub.lastText()).toContain('not a valid payee');
    await say(b, u, '91234567');
    await tap(b, u, 'split_payee:me');
    await say(b, u, 'x'.repeat(26));
    expect(stub.lastText()).toContain('25 characters');
    await tap(b, u, 'split_skip_description');
    await Promise.all([tap(b, u, 'split_confirm'), tap(b, u, 'split_confirm')]);
    expect(stub.sentPhotos).toHaveLength(1);

    await say(b, u, '/split');
    await say(b, u, '10');
    await tap(b, u, 'split_mode:equal');
    await say(b, u, '2');
    await say(b, u, '91234567');
    await tap(b, u, 'split_payee:me');
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
    await gtap(b, chat, owner, 'split_mode:equal');
    expect(buttons()).toEqual(['split_people:6']);
    await gtap(b, chat, owner, 'split_people:6');
    expect(stub.lastText()).toContain('Who should be paid');
    await gsay(b, chat, owner, '91234567');
    await gtap(b, chat, owner, 'split_payee:me');
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
    await gtap(b, chat, owner, 'split_mode:equal');
    expect(buttons()).toBeUndefined();
    await gsay(b, chat, owner, '4');
    expect(stub.lastText()).toContain('Who should be paid');

    memberCount = 2; // only the bot and one person: below 2 people
    const chat2 = -uid++;
    await gsay(b, chat2, owner, '/split');
    await gsay(b, chat2, owner, '50');
    await gtap(b, chat2, owner, 'split_mode:equal');
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
    await gtap(b, chat, owner, 'split_mode:equal');
    await gsay(b, chat, owner, '3');
    await gsay(b, chat, owner, '91234567');
    await gtap(b, chat, owner, 'split_payee:me');
    await gtap(b, chat, owner, 'split_skip_description');
    stub.reset();
    await gtap(b, chat, other, 'split_confirm');
    expect(stub.callbackAnswers).toContain('This split is not yours.');
    expect(stub.sentPhotos).toHaveLength(0);
    expect((await peek(`split-${chat}`)).step).toBe(8);
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
    await gtap(b, chat, owner, 'split_mode:equal');
    await gsay(b, chat, owner, '2');
    await gsay(b, chat, owner, '91234567');
    await gtap(b, chat, owner, 'split_payee:me');
    expect(stub.lastText()).toContain('short description');
  });
});

describe('Split_PayNow_Bot custom amounts', () => {
  const qrs = () =>
    stub.sentPhotos.map((photo) => {
      const { data, width, height } = bmpToRgba(photo.bytes);
      return { payload: jsQR(data, width, height)!.data, caption: photo.caption ?? '' };
    });
  async function toPayee(b: B, u: number, list: string, total = '100') {
    await say(b, u, '/split');
    await say(b, u, total);
    await tap(b, u, 'split_mode:custom');
    expect(stub.lastText()).toContain('one person per line');
    await say(b, u, list);
  }

  it('sends one QR per distinct amount, labelled with names', async () => {
    const u = uid++;
    const b = bot();
    await toPayee(b, u, 'Ann 40\nBob 25\nCy 25\nDee 10'); // exactly the bill: no leftover question
    expect(stub.lastText()).toContain('Who should be paid');
    await say(b, u, '91234567');
    await tap(b, u, 'split_payee:me');
    await tap(b, u, 'split_skip_description');
    const summary = stub.lastText();
    expect(summary).toContain('Ann: SGD 40.00');
    expect(summary).not.toContain('Leftover');
    await tap(b, u, 'split_confirm');
    const sent = qrs();
    expect(sent).toHaveLength(3);
    expect(sent[0]!.payload).toContain('540540.00');
    expect(sent[0]!.caption).toContain('Ann');
    expect(sent[1]!.payload).toContain('540525.00');
    expect(sent[1]!.caption).toContain('Bob, Cy');
    expect(sent[1]!.caption).not.toContain('91234567');
    expect((await peek(`split-${u}`)).flow).toBe('idle');
  });

  it('leaves the leftover out when asked: the organiser covers it', async () => {
    const u = uid++;
    const b = bot();
    await toPayee(b, u, 'Ann 40\nBob 40');
    expect(stub.lastText()).toContain('leaves SGD 20.00');
    await tap(b, u, 'split_leftover:omit');
    await say(b, u, '91234567');
    await tap(b, u, 'split_payee:me');
    await tap(b, u, 'split_skip_description');
    expect(stub.lastText()).toContain('Leftover SGD 20.00 left out: you cover it');
    await tap(b, u, 'split_confirm');
    expect(qrs()).toHaveLength(1);
    expect(qrs()[0]!.payload).toContain('540540.00');
    expect(qrs()[0]!.caption).toContain('Ann, Bob');
  });

  it('splits the leftover evenly with rounding, and skips the question on an exact sum', async () => {
    const u = uid++;
    const b = bot();
    await toPayee(b, u, 'Ann 30\nBob 30\nCy 30'); // leftover 10.00 over 3 people
    await tap(b, u, 'split_leftover:even');
    await say(b, u, '91234567');
    await tap(b, u, 'split_payee:me');
    await tap(b, u, 'split_skip_description');
    expect(stub.lastText()).toContain('split evenly (SGD 3.34 each)');
    expect(stub.lastText()).toContain('SGD 0.02 over');
    await tap(b, u, 'split_confirm');
    expect(qrs()).toHaveLength(1);
    expect(qrs()[0]!.payload).toContain('540533.34');

    stub.reset();
    const v = uid++;
    await toPayee(b, v, 'Ann 60\nBob 40');
    expect(stub.lastText()).toContain('Who should be paid'); // no leftover question
  });

  it('rejects an over-sum, bad lines and repeated names, asking for the whole list again', async () => {
    const u = uid++;
    const b = bot();
    await toPayee(b, u, 'Ann 70\nBob 40');
    expect(stub.lastText()).toContain('SGD 10.00 over the bill');
    await say(b, u, 'Ann 10\nBob');
    expect(stub.lastText()).toContain('"Bob" needs a name');
    await say(b, u, 'Ann 10\nann 20');
    expect(stub.lastText()).toContain('listed twice');
    expect((await peek(`split-${u}`)).step).toBe(4);
  });

  it('/split_custom skips the mode question, in a private chat and in a group', async () => {
    const u = uid++;
    const b = bot();
    await say(b, u, '/split_custom');
    await say(b, u, 'abc');
    expect(stub.lastText()).toContain('positive amount');
    await say(b, u, '100');
    expect(stub.lastText()).toContain('one person per line');
    expect(buttons()).toBeUndefined();

    // restarting discards the earlier answers
    await say(b, u, '/split_custom');
    expect(stub.lastText()).toContain('How much is the bill');
    expect((await peek(`split-${u}`)).step).toBe(1);

    const chat = -uid++;
    const owner = uid++;
    const other = uid++;
    await gsay(b, chat, owner, '/split_custom');
    expect(stub.sentMessages.at(-1)!.replyMarkup).toMatchObject({ force_reply: true });
    await gsay(b, chat, owner, '60');
    expect(stub.lastText()).toContain('one person per line');
    stub.reset();
    await gsay(b, chat, other, 'Eve 60');
    expect(stub.sentMessages).toHaveLength(0);
    await gsay(b, chat, owner, 'Ann 30\nBob 30');
    expect(stub.lastText()).toContain('Who should be paid');
  });

  it('stops and reports counts when a send fails part way', async () => {
    const u = uid++;
    let photos = 0;
    const b = createSplitBot(env, 'split-token', {
      botInfo: TEST_BOT_INFO,
      client: {
        fetch: async (url, init) =>
          String(url).endsWith('/sendPhoto') && ++photos === 2
            ? new Response(
                JSON.stringify({ ok: false, error_code: 429, description: 'slow down' }),
                {
                  status: 429,
                }
              )
            : stub.fetch(url, init),
      },
    });
    await toPayee(b, u, 'Ann 40\nBob 30\nCy 30');
    await say(b, u, '91234567');
    await tap(b, u, 'split_payee:me');
    await tap(b, u, 'split_skip_description');
    stub.reset();
    await tap(b, u, 'split_confirm');
    expect(stub.sentPhotos).toHaveLength(1);
    expect(stub.lastText()).toContain('Sent 1 of 2 QRs');
    expect(stub.lastText()).not.toContain('91234567');
  });
});

describe('Split_PayNow_Bot amend and edited messages', () => {
  const sayId = async (b: B, user: number, text: string) => {
    const id = upd++;
    await b.handleUpdate(textUpdate(user, text, id));
    return id;
  };
  const edit = (b: B, chat: number, user: number, id: number, text: string) =>
    b.handleUpdate(editedTextUpdate(chat, user, id, text, upd++));
  const tapOn = (b: B, user: number, data: string, messageId: number) =>
    b.handleUpdate(callbackUpdate(user, data, messageId, upd++));
  const summaryText = () => stub.sentMessages.findLast((m) => m.text.startsWith('Please check'))!;
  const qrAmount = () => {
    const { data, width, height } = bmpToRgba(stub.sentPhotos[0]!.bytes);
    return jsQR(data, width, height)!.data;
  };

  /** Equal split of `total` between 2 people, payee 91234567, description skipped: at the summary. */
  async function toSummary(b: B, u: number, total = '100') {
    await say(b, u, '/split');
    const totalId = await sayId(b, u, total);
    await tap(b, u, 'split_mode:equal');
    await say(b, u, '2');
    await say(b, u, '91234567');
    await tap(b, u, 'split_payee:me');
    await tap(b, u, 'split_skip_description');
    return { totalId };
  }

  it('Amend total: one live summary, the old Confirm is stale, the new one sends the new amount', async () => {
    const u = uid++;
    const b = bot();
    await toSummary(b, u);
    const oldSummary = summaryText();
    expect(oldSummary.text).toContain('Each share: SGD 50.00');
    const oldId = oldSummary.messageId!;
    await tap(b, u, 'split_amend');
    expect((await peek(`split-${u}`)).step).toBe(9);
    await tap(b, u, 'split_pick:total');
    expect(stub.lastText()).toContain('How much is the bill');
    expect(buttons()).toEqual(['split_keep']);
    stub.otherCalls = [];
    await say(b, u, '120');
    expect(summaryText().text).toContain('Each share: SGD 60.00');
    // the earlier summary lost its buttons
    expect(stub.otherCalls.some((c) => c.method === 'editMessageReplyMarkup')).toBe(true);
    // its Confirm is dead
    stub.callbackAnswers = [];
    await tapOn(b, u, 'split_confirm', oldId);
    expect(stub.callbackAnswers).toContain('That step is over.');
    expect(stub.sentPhotos).toHaveLength(0);
    await tap(b, u, 'split_confirm');
    expect(qrAmount()).toContain('540560.00');
  });

  it('Keep as is and Back both return to the summary unchanged', async () => {
    const u = uid++;
    const b = bot();
    await toSummary(b, u);
    await tap(b, u, 'split_amend');
    await tap(b, u, 'split_pick:payee');
    expect(stub.lastText()).toContain('Who should be paid');
    await tap(b, u, 'split_keep');
    expect(stub.lastText()).toContain('Payee: Mobile +6591234567');
    expect(buttons()).toEqual(['split_confirm', 'split_amend', 'split_cancel']);

    await tap(b, u, 'split_amend');
    await tap(b, u, 'split_back');
    expect((await peek(`split-${u}`)).step).toBe(8);
    await tap(b, u, 'split_confirm');
    expect(stub.sentPhotos).toHaveLength(1);
  });

  it('Amend payee and description', async () => {
    const u = uid++;
    const b = bot();
    await toSummary(b, u);
    await tap(b, u, 'split_amend');
    await tap(b, u, 'split_pick:payee');
    await say(b, u, '98765432');
    await tap(b, u, 'split_payee:me');
    expect(stub.lastText()).toContain('+6598765432');
    await tap(b, u, 'split_amend');
    await tap(b, u, 'split_pick:description');
    await say(b, u, 'Lunch');
    expect(stub.lastText()).toContain('Description: Lunch');
  });

  it('Amend the split type: equal becomes custom', async () => {
    const u = uid++;
    const b = bot();
    await toSummary(b, u);
    await tap(b, u, 'split_amend');
    await tap(b, u, 'split_pick:split');
    expect(buttons()).toEqual(['split_mode:equal', 'split_mode:custom', 'split_keep']);
    await tap(b, u, 'split_mode:custom');
    expect(stub.lastText()).toContain('one person per line');
    await say(b, u, 'Ann 60\nBob 40');
    expect(stub.lastText()).toContain('Ann: SGD 60.00');
    expect(stub.lastText()).not.toContain('Each share');
  });

  it('a total that breaks the list asks for the list again; a gap asks about the leftover; a stored choice is kept', async () => {
    const u = uid++;
    const b = bot();
    await say(b, u, '/split_custom');
    await say(b, u, '100');
    await say(b, u, 'Ann 60\nBob 40');
    await say(b, u, '91234567');
    await tap(b, u, 'split_payee:me');
    await tap(b, u, 'split_skip_description');
    await tap(b, u, 'split_amend');
    await tap(b, u, 'split_pick:total');
    await say(b, u, '80');
    expect(stub.lastText()).toContain('SGD 20.00 over the bill of SGD 80.00');
    await say(b, u, 'Ann 50\nBob 30');
    expect(stub.lastText()).toContain('Ann: SGD 50.00');

    await tap(b, u, 'split_amend');
    await tap(b, u, 'split_pick:total');
    await say(b, u, '100'); // list adds up to 80: a gap of 20, no choice yet
    expect(stub.lastText()).toContain('leaves SGD 20.00');
    await tap(b, u, 'split_leftover:even');
    expect(stub.lastText()).toContain('split evenly (SGD 10.00 each)');

    await tap(b, u, 'split_amend');
    await tap(b, u, 'split_pick:total');
    await say(b, u, '120'); // gap 40, the earlier choice (even) is kept
    expect(stub.lastText()).toContain('split evenly (SGD 20.00 each)');
  });

  it('editing the total at the summary gives a new summary', async () => {
    const u = uid++;
    const b = bot();
    const { totalId } = await toSummary(b, u);
    await edit(b, u, u, totalId, '150');
    expect(summaryText().text).toContain('Each share: SGD 75.00');
    await tap(b, u, 'split_confirm');
    expect(qrAmount()).toContain('540575.00');
  });

  it('editing an earlier answer while a later question is open says Updated and does not repeat it', async () => {
    const u = uid++;
    const b = bot();
    await say(b, u, '/split');
    const totalId = await sayId(b, u, '100');
    await tap(b, u, 'split_mode:equal');
    await say(b, u, '2');
    expect(stub.lastText()).toContain('Who should be paid');
    const before = stub.sentMessages.length;
    await edit(b, u, u, totalId, '200');
    expect(stub.sentMessages.length).toBe(before + 1);
    expect(stub.lastText()).toBe('Updated.');
    await say(b, u, '91234567');
    await tap(b, u, 'split_payee:me');
    await tap(b, u, 'split_skip_description');
    expect(stub.lastText()).toContain('Each share: SGD 100.00');
  });

  it('refuses an invalid edit and keeps the earlier answer; ignores unrecorded and late edits', async () => {
    const u = uid++;
    const b = bot();
    const { totalId } = await toSummary(b, u);
    await edit(b, u, u, totalId, 'abc');
    expect(stub.lastText()).toContain('That edit was not used');
    expect((await peek(`split-${u}`)).step).toBe(8);
    stub.reset();
    await edit(b, u, u, 987654, '5'); // not an answer of this split
    expect(stub.sentMessages).toHaveLength(0);
    await tapOn(b, u, 'split_confirm', stub.lastMessageId() - 1); // the summary, before the refusal note
    expect(stub.sentPhotos).toHaveLength(1);
    stub.reset();
    await edit(b, u, u, totalId, '999'); // after the QR
    expect(stub.sentMessages).toHaveLength(0);
  });

  it('in a group: Amend works, edits by others are ignored, an edited payee message is deleted', async () => {
    const chat = -uid++;
    const owner = uid++;
    const other = uid++;
    const b = bot();
    await gsay(b, chat, owner, '/split');
    const totalId = upd;
    await gsay(b, chat, owner, '60');
    await gtap(b, chat, owner, 'split_mode:equal');
    await gsay(b, chat, owner, '3');
    const payeeId = upd;
    await gsay(b, chat, owner, '91234567');
    await gtap(b, chat, owner, 'split_payee:me');
    await gtap(b, chat, owner, 'split_skip_description');
    expect(summaryText().text).toContain('…4567');

    stub.reset();
    await edit(b, chat, other, totalId, '90'); // someone else's edit
    expect(stub.sentMessages).toHaveLength(0);

    await edit(b, chat, owner, payeeId, '98765432'); // may still be in the chat if it could not be deleted
    expect(stub.deletedMessages).toHaveLength(1);
    // a new payee means asking again whether it is the organiser
    expect(stub.lastText()).toContain('Is this payee you?');
    await gtap(b, chat, owner, 'split_payee:me');
    expect(summaryText().text).toContain('…5432');

    await gtap(b, chat, owner, 'split_amend');
    await gtap(b, chat, owner, 'split_pick:total');
    await gsay(b, chat, owner, '90');
    expect(summaryText().text).toContain('Each share: SGD 30.00');
  });
});

describe('Split_PayNow_Bot mentions', () => {
  const directory = () => new D1SplitDirectory(env.paynow_db);
  const asUser = (update: Update, username: string) => {
    (update as unknown as { message: { from: Record<string, unknown> } }).message.from.username =
      username;
    return update;
  };
  /** A person messaging the bot privately with a Telegram username. */
  const privately = (b: B, id: number, username: string, text: string) =>
    b.handleUpdate(asUser(textUpdate(id, text, upd++), username));
  const counts = async () => {
    const r = await env.paynow_db
      .prepare(
        'SELECT (SELECT COUNT(*) FROM split_contacts) AS contacts, (SELECT COUNT(*) FROM split_claims) AS claims'
      )
      .first<{ contacts: number; claims: number }>();
    return `${r?.contacts}/${r?.claims}`;
  };
  const claimToken = () => {
    const url = stub.sentMessages.findLast((m) => m.text.startsWith('Waiting for their QR'))!
      .replyMarkup as { inline_keyboard: Array<Array<{ url: string }>> };
    return /start=claim_(\S+)$/.exec(url.inline_keyboard[0]![0]!.url)![1]!;
  };
  /** Run a confirmed custom split of `list` (total `total`) from a fresh organiser. */
  async function confirmSplit(b: B, organiser: number, total: string, list: string, desc?: string) {
    await say(b, organiser, '/split_custom');
    await say(b, organiser, total);
    await say(b, organiser, list);
    await say(b, organiser, '91234567');
    await tap(b, organiser, 'split_payee:me');
    if (desc) await say(b, organiser, desc);
    else await tap(b, organiser, 'split_skip_description');
    await tap(b, organiser, 'split_confirm');
  }

  it('DMs each known mentioned person their own QR and posts nothing in the chat', async () => {
    const b = bot();
    const [ann, bob, org] = [uid++, uid++, uid++];
    await privately(b, ann, `ann_${ann}`, '/start');
    await privately(b, bob, `bob_${bob}`, '/start');
    stub.reset();
    await say(b, org, '/split_custom');
    await say(b, org, '65');
    await say(b, org, `@ann_${ann} 40\n@Bob_${bob} 25`); // usernames match ignoring case
    await say(b, org, '91234567');
    await tap(b, org, 'split_payee:me');
    await tap(b, org, 'split_skip_description');
    expect(stub.lastText()).toContain(`@ann_${ann}: SGD 40.00 (by direct message)`);
    await tap(b, org, 'split_confirm');

    expect(stub.sentPhotos.map((p) => p.chatId).sort()).toEqual([String(ann), String(bob)].sort());
    const toAnn = stub.sentPhotos.find((p) => p.chatId === String(ann))!;
    expect(toAnn.caption).toContain('Test User asks you for SGD 40.00');
    expect(toAnn.caption).not.toContain('91234567');
    expect(stub.lastText()).toContain('Sent their QR by direct message');
    expect(stub.sentPhotos.some((p) => p.chatId === String(org))).toBe(false);
    expect((await peek(`split-${org}`)).flow).toBe('idle');
  });

  it('mixed list: the mentioned person gets a DM, the plain name a chat QR', async () => {
    const b = bot();
    const [ann, org] = [uid++, uid++];
    await privately(b, ann, `ann_${ann}`, '/start');
    stub.reset();
    await confirmSplit(b, org, '65', `@ann_${ann} 40\nCy 25`);
    const toChat = stub.sentPhotos.filter((p) => p.chatId === String(org));
    expect(toChat).toHaveLength(1);
    expect(toChat[0]!.caption).toContain('Cy');
    expect(stub.sentPhotos.filter((p) => p.chatId === String(ann))).toHaveLength(1);
  });

  it('an unknown person gets a Get my QR button, only they can collect, and only once', async () => {
    const b = bot();
    const [dee, eve, org] = [uid++, uid++, uid++];
    await confirmSplit(b, org, '25', `@dee_${dee} 25`);
    expect(stub.sentPhotos).toHaveLength(0);
    expect(stub.lastText()).toContain('Waiting for their QR');
    const token = claimToken();

    await privately(b, eve, `eve_${eve}`, `/start claim_${token}`);
    expect(stub.lastText()).toContain('This QR is for someone else.');
    expect(stub.sentPhotos).toHaveLength(0);

    await privately(b, dee, `Dee_${dee}`, `/start claim_${token}`); // case-insensitive
    expect(stub.sentPhotos).toHaveLength(1);
    expect(stub.sentPhotos[0]!.chatId).toBe(String(dee));
    expect(stub.sentPhotos[0]!.caption).toContain('asks you for SGD 25.00');
    expect(stub.editedMessages.at(-1)!.text).toBe('Everyone has their QR.');
    expect((await directory().findContacts([`dee_${dee}`])).get(`dee_${dee}`)).toBe(dee);

    await privately(b, dee, `Dee_${dee}`, `/start claim_${token}`);
    expect(stub.lastText()).toContain('expired or was already collected');
    expect(stub.sentPhotos).toHaveLength(1);
  });

  it('an expired request sends nothing', async () => {
    const b = bot();
    const [dee, org] = [uid++, uid++];
    await confirmSplit(b, org, '25', `@dee_${dee} 25`);
    const token = claimToken();
    await env.paynow_db
      .prepare('UPDATE split_claims SET expires_at = ?1 WHERE token = ?2')
      .bind(new Date(Date.now() - 1000).toISOString(), token)
      .run();
    await privately(b, dee, `dee_${dee}`, `/start claim_${token}`);
    expect(stub.lastText()).toContain('expired or was already collected');
    expect(stub.sentPhotos).toHaveLength(0);
  });

  it('a known person who refuses the message falls back to a button', async () => {
    const b = bot();
    const [ann, org] = [uid++, uid++];
    await privately(b, ann, `ann_${ann}`, '/start');
    stub.reset();
    stub.blockedChats.add(String(ann));
    await confirmSplit(b, org, '40', `@ann_${ann} 40`);
    expect(stub.sentPhotos).toHaveLength(0);
    expect(stub.lastText()).toContain('Waiting for their QR');
  });

  it('a text mention carries the user id, so no earlier /start is needed', async () => {
    const b = bot();
    const [target, org] = [uid++, uid++];
    await say(b, org, '/split_custom');
    await say(b, org, '40');
    const update = textUpdate(org, 'Ann Lee 40', upd++);
    (update as unknown as { message: Record<string, unknown> }).message.entities = [
      {
        type: 'text_mention',
        offset: 0,
        length: 7,
        user: { id: target, is_bot: false, first_name: 'Ann' },
      },
    ];
    await b.handleUpdate(update);
    await say(b, org, '91234567');
    await tap(b, org, 'split_payee:me');
    await tap(b, org, 'split_skip_description');
    expect(stub.lastText()).toContain('Ann Lee: SGD 40.00 (by direct message)');
    await tap(b, org, 'split_confirm');
    expect(stub.sentPhotos.map((p) => p.chatId)).toEqual([String(target)]);
  });

  it('/start records and replaces a contact, and /forget deletes it', async () => {
    const b = bot();
    const [first, second] = [uid++, uid++];
    const name = `shared_${first}`;
    await privately(b, first, name, '/start');
    expect((await directory().findContacts([name])).get(name)).toBe(first);
    await privately(b, second, name, '/start'); // the username changed hands
    expect((await directory().findContacts([name])).get(name)).toBe(second);
    await privately(b, second, name, '/forget');
    expect(stub.lastText()).toContain('Forgotten');
    expect((await directory().findContacts([name])).size).toBe(0);
    await b.handleUpdate(groupTextUpdate(-uid++, second, '/forget', undefined, upd++));
    expect(stub.lastText()).toContain('private chat');
  });

  it('writes nothing for an equal split or a custom split with no mentions', async () => {
    const b = bot();
    const before = await counts();
    const u = uid++;
    await say(b, u, '/split');
    await say(b, u, '100');
    await tap(b, u, 'split_mode:equal');
    await say(b, u, '2');
    await say(b, u, '91234567');
    await tap(b, u, 'split_payee:me');
    await tap(b, u, 'split_skip_description');
    await tap(b, u, 'split_confirm');
    await confirmSplit(b, uid++, '65', 'Ann 40\nBob 25');
    expect(await counts()).toBe(before);
  });
});

describe('Split_PayNow_Bot receipt scan', () => {
  const directory = () => new D1SplitDirectory(env.paynow_db);
  // 30 + 10 + 20 = 60.00 of items on a 72.00 receipt: 12.00 of service charge and GST
  const RECEIPT = {
    merchant: 'Ah Seng Cafe',
    items: [
      { name: 'Chilli crab', price: 30 },
      { name: 'Rice', price: 10 },
      { name: 'Beer', price: 20 },
    ],
    serviceCharge: 6,
    gst: 6,
    total: 72,
  };
  let scanned: unknown = RECEIPT;
  const asked: string[] = [];
  const reader = {
    async read(image: Uint8Array) {
      asked.push(`${image.length} bytes`);
      if (scanned instanceof Error) throw scanned;
      return scanned;
    },
  };
  const download = async () => new Uint8Array([1, 2, 3]);
  const receiptBot = (withReader = true) =>
    createSplitBot(
      { ...env, AI: undefined } as never,
      'split-token',
      {
        botInfo: TEST_BOT_INFO,
        client: {
          fetch: async (url, init) =>
            String(url).endsWith('/getChatMemberCount')
              ? new Response(JSON.stringify({ ok: true, result: 7 }))
              : stub.fetch(url, init),
        },
      },
      withReader ? { reader, download } : { download }
    );
  const photo = (b: B, user: number) => b.handleUpdate(photoUpdate(user, user, 'file-1', upd++));
  const sayId = async (b: B, user: number, text: string) => {
    const id = upd++;
    await b.handleUpdate(textUpdate(user, text, id));
    return id;
  };
  const qrs = () =>
    stub.sentPhotos.map((p) => {
      const { data, width, height } = bmpToRgba(p.bytes);
      return { to: p.chatId, payload: jsQR(data, width, height)!.data, caption: p.caption };
    });
  beforeEach(() => {
    scanned = RECEIPT;
    asked.length = 0;
  });

  async function toSummary(b: B, org: number, assignment: string) {
    await say(b, org, '/split_receipt');
    await photo(b, org);
    await tap(b, org, 'split_scan:use');
    await say(b, org, assignment);
    await say(b, org, '91234567');
    await tap(b, org, 'split_payee:me');
    await tap(b, org, 'split_skip_description');
  }

  it('reads the receipt, shares GST and service charge pro rata, and DMs the mentioned person', async () => {
    const [ann, org] = [uid++, uid++];
    const b = receiptBot();
    await b.handleUpdate(
      (() => {
        const u = textUpdate(ann, '/start', upd++);
        (u as unknown as { message: { from: Record<string, unknown> } }).message.from.username =
          `ann_${ann}`;
        return u;
      })()
    );
    stub.reset();
    await say(b, org, '/split_receipt');
    expect(stub.lastText()).toContain('Send a photo of the receipt');
    await photo(b, org);
    expect(asked).toEqual(['3 bytes']);
    const review = stub.lastText();
    expect(review).toContain('Ah Seng Cafe');
    expect(review).toContain('1. Chilli crab: SGD 30.00');
    expect(review).toContain('Total: SGD 72.00');
    expect(buttons()).toEqual(['split_scan:use', 'split_scan:again', 'split_scan:manual']);
    await tap(b, org, 'split_scan:use');
    expect(stub.lastText()).toContain('Who had what?');
    expect(stub.lastText()).toContain('3. Beer SGD 20.00');
    await say(b, org, `1 @ann_${ann}\n2 Bob\n3 me`);
    await say(b, org, '91234567');
    await tap(b, org, 'split_payee:me');
    await tap(b, org, 'split_skip_description');
    const summary = stub.lastText();
    expect(summary).toContain(`@ann_${ann}: SGD 36.00 (by direct message)`);
    expect(summary).toContain('Bob: SGD 12.00');
    expect(summary).toContain('Your own share, not collected: SGD 24.00');
    await tap(b, org, 'split_confirm');
    const sent = qrs();
    expect(sent.find((q) => q.to === String(ann))!.payload).toContain('540536.00');
    expect(sent.find((q) => q.to === String(org))!.payload).toContain('540512.00');
    expect(sent.find((q) => q.to === String(org))!.caption).toContain('Bob');
    expect(sent.every((q) => !q.caption.includes('91234567'))).toBe(true);
  });

  it('reads a photo sent at the total prompt, and Type the total instead goes back to a normal split', async () => {
    const org = uid++;
    const b = receiptBot();
    await say(b, org, '/split');
    await photo(b, org);
    expect(stub.lastText()).toContain('I read this receipt');
    await tap(b, org, 'split_scan:manual');
    expect(stub.lastText()).toContain('How much is the bill');
    await say(b, org, '100');
    expect(stub.lastText()).toContain('How do you want to split');
  });

  it('warns when the items exceed the total, and says so when a photo cannot be read', async () => {
    const org = uid++;
    const b = receiptBot();
    scanned = { items: [{ name: 'Crab', price: 50 }], total: 40 };
    await say(b, org, '/split_receipt');
    await photo(b, org);
    expect(stub.lastText()).toContain('⚠️ The items add up to more than the total');

    scanned = { items: [] };
    await tap(b, org, 'split_scan:again');
    await photo(b, org);
    expect(stub.lastText()).toContain('could not find a total');
    expect(buttons()).toEqual(['split_scan:again', 'split_scan:manual']);

    scanned = new ReceiptReaderError('model', 'model down');
    await photo(b, org);
    expect(stub.lastText()).toContain('receipt reader failed (model)');
    scanned = new ReceiptReaderError('reply', 'no JSON in reply');
    await photo(b, org);
    expect(stub.lastText()).toContain('could not use its answer (reply)');

    // at the total prompt a failed photo just asks again, with no extra buttons
    await say(b, org, '/split');
    await photo(b, org);
    expect(stub.lastText()).toContain('(reply)');
    expect(buttons()).toBeUndefined();
  });

  it('is unavailable without a reader', async () => {
    const org = uid++;
    const b = receiptBot(false);
    await say(b, org, '/split_receipt');
    expect(stub.lastText()).toContain('not available');
    expect((await peek(`split-${org}`)).flow).not.toBe('split');
  });

  it('names assignment mistakes and asks for the whole message again', async () => {
    const org = uid++;
    const b = receiptBot();
    await say(b, org, '/split_receipt');
    await photo(b, org);
    await tap(b, org, 'split_scan:use');
    await say(b, org, '1 Ann\n2 Ann\n3 me\n3 Bob');
    expect(stub.lastText()).toContain('Item 3 is listed twice');
    await say(b, org, '9 Ann');
    expect(stub.lastText()).toContain('There is no item 9');
    await say(b, org, '1 me\n2 me\n3 me');
    expect(stub.lastText()).toContain('Nobody else owes anything');
    await say(b, org, '1 me'); // items 2 and 3 are unassigned, but only the organiser is named
    expect(stub.lastText()).toContain('Nobody else owes anything');
    expect((await peek(`split-${org}`)).step).toBe(12);
    await say(b, org, '1,2 Ann\n3 Bob');
    expect(stub.lastText()).toContain('Who should be paid');
  });

  describe('items nobody was given', () => {
    async function toGap(b: B, org: number, text = '1 Ann\n3 Bob') {
      await say(b, org, '/split_receipt');
      await photo(b, org);
      await tap(b, org, 'split_scan:use');
      const id = await sayId(b, org, text);
      return id;
    }
    const finish = async (b: B, org: number) => {
      await say(b, org, '91234567');
      await tap(b, org, 'split_payee:me');
      await tap(b, org, 'split_skip_description');
    };

    it('asks, naming the items and their price, and does not guess', async () => {
      const org = uid++;
      const b = receiptBot();
      await toGap(b, org);
      expect(stub.lastText()).toContain(
        'Item 2 (SGD 10.00 before charges) was not given to anyone'
      );
      expect(buttons()).toEqual(['split_unassigned:even', 'split_unassigned:me']);
      expect((await peek(`split-${org}`)).step).toBe(13);
    });

    it('Split evenly shares the gap between those named', async () => {
      const org = uid++;
      const b = receiptBot();
      await toGap(b, org);
      await tap(b, org, 'split_unassigned:even');
      expect(stub.lastText()).toContain('Who should be paid');
      await finish(b, org);
      // item 2 (10.00) is split 5.00 each: Ann 30+5, Bob 20+5, then 12.00 of charges pro rata
      expect(stub.lastText()).toContain('Ann: SGD 42.00');
      expect(stub.lastText()).toContain('Bob: SGD 30.00');
      expect(stub.lastText()).not.toContain('Your own share');
    });

    it('Leave them out makes the organiser carry the gap, not collected', async () => {
      const org = uid++;
      const b = receiptBot();
      await toGap(b, org);
      await tap(b, org, 'split_unassigned:me');
      await finish(b, org);
      expect(stub.lastText()).toContain('Ann: SGD 36.00');
      expect(stub.lastText()).toContain('Bob: SGD 24.00');
      expect(stub.lastText()).toContain('Your own share, not collected: SGD 12.00');
    });

    it('lists several items together', async () => {
      const org = uid++;
      const b = receiptBot();
      await toGap(b, org, '1 Ann');
      expect(stub.lastText()).toContain('Items 2, 3 (SGD 30.00 before charges) were not given');
    });

    it('keeps the choice when an edit leaves the same gap, and asks again for a different gap', async () => {
      const org = uid++;
      const b = receiptBot();
      const id = await toGap(b, org);
      await tap(b, org, 'split_unassigned:me');
      await finish(b, org);
      expect(stub.lastText()).toContain('Ann: SGD 36.00');

      // same gap (item 2): the earlier choice applies and a new summary appears
      await b.handleUpdate(editedTextUpdate(org, org, id, '1 Ann, Bob\n3 Bob', upd++));
      expect(stub.lastText()).toContain('Please check the split');
      expect(stub.lastText()).toContain('Ann: SGD 18.00');
      expect(stub.lastText()).toContain('Bob: SGD 42.00');

      // a different gap (item 1): the bot asks again
      await b.handleUpdate(editedTextUpdate(org, org, id, '2 Ann\n3 Bob', upd++));
      expect(stub.lastText()).toContain('Item 1 (SGD 30.00 before charges) was not given');
      expect(buttons()).toEqual(['split_unassigned:even', 'split_unassigned:me']);
    });

    it('no question once every item is given, and an old choice is dropped', async () => {
      const org = uid++;
      const b = receiptBot();
      const id = await toGap(b, org);
      await tap(b, org, 'split_unassigned:even');
      // the payee question is open, so the edit is simply applied
      await b.handleUpdate(editedTextUpdate(org, org, id, '1 Ann\n2 Ann\n3 Bob', upd++));
      expect(stub.lastText()).toBe('Updated.');
      const ctx = await peek(`split-${org}`);
      expect(ctx.context).not.toHaveProperty('unassignedChoice');
    });

    it('Amend → Items goes through the same question', async () => {
      const org = uid++;
      const b = receiptBot();
      await toGap(b, org);
      await tap(b, org, 'split_unassigned:me');
      await finish(b, org);
      await tap(b, org, 'split_amend');
      await tap(b, org, 'split_pick:items');
      await say(b, org, '1 Ann\n3 Bob'); // the same gap: the choice stays
      expect(stub.lastText()).toContain('Please check the split');
      await tap(b, org, 'split_amend');
      await tap(b, org, 'split_pick:items');
      await say(b, org, '1 Ann\n2 Bob\n3 Bob'); // gap closed: no question
      expect(stub.lastText()).toContain('Please check the split');
      expect(stub.lastText()).toContain('Bob: SGD 36.00');
    });
  });

  it('Amend offers Items (not Total), and editing the assignment message updates the summary', async () => {
    const org = uid++;
    const b = receiptBot();
    await say(b, org, '/split_receipt');
    await photo(b, org);
    await tap(b, org, 'split_scan:use');
    await say(b, org, '1 Ann\n2 Bob\n3 me');
    await say(b, org, '91234567');
    await tap(b, org, 'split_payee:me');
    await tap(b, org, 'split_skip_description');
    expect(stub.lastText()).toContain('Ann: SGD 36.00');

    await tap(b, org, 'split_amend');
    const menu = stub.otherCalls.findLast((c) => c.method === 'editMessageReplyMarkup')?.body ?? '';
    expect(menu).toContain('split_pick:items');
    expect(menu).not.toContain('split_pick:total');
    await tap(b, org, 'split_pick:items');
    expect(stub.lastText()).toContain('Who had what?');
    const assignId = await sayId(b, org, '1 Ann\n2 Bob\n3 Bob');
    expect(stub.lastText()).toContain('Bob: SGD 36.00');
    expect(stub.lastText()).toContain('Ann: SGD 36.00');

    // an edit of the latest assignment message re-reads it
    await b.handleUpdate(editedTextUpdate(org, org, assignId, '1 Ann\n2 me\n3 Bob', upd++));
    expect(stub.lastText()).toContain('Bob: SGD 24.00');
    expect(stub.lastText()).toContain('Your own share, not collected: SGD 12.00');
  });

  it('someone else paid: the organiser gets their own QR for their items', async () => {
    const org = uid++;
    const b = receiptBot();
    const start = textUpdate(org, '/start', upd++);
    (start as unknown as { message: { from: Record<string, unknown> } }).message.from.username =
      `org_${org}`;
    await b.handleUpdate(start);
    stub.reset();
    await say(b, org, '/split_receipt');
    await photo(b, org);
    await tap(b, org, 'split_scan:use');
    await say(b, org, '1 Ann\n2 Bob\n3 me');
    await say(b, org, '91234567');
    await tap(b, org, 'split_payee:other');
    await tap(b, org, 'split_skip_description');
    expect(stub.lastText()).toContain(
      'Your own share, which you pay the payee: SGD 24.00 (you get a QR)'
    );
    await tap(b, org, 'split_confirm');
    const payloads = qrs().map((q) => q.payload);
    expect(payloads.some((q) => q.includes('540524.00'))).toBe(true); // the organiser's 24.00
    expect(payloads.some((q) => q.includes('540536.00'))).toBe(true); // Ann
    expect(payloads.some((q) => q.includes('540512.00'))).toBe(true); // Bob
  });

  it('an organiser who never started the bot gets a Get my QR button and can collect', async () => {
    const org = uid++;
    const b = receiptBot();
    await say(b, org, '/split_receipt');
    await photo(b, org);
    await tap(b, org, 'split_scan:use');
    await say(b, org, '1 Ann\n2 Bob\n3 me');
    await say(b, org, '91234567');
    await tap(b, org, 'split_payee:other');
    await tap(b, org, 'split_skip_description');
    stub.reset();
    stub.blockedChats.add(String(org)); // direct messages to the organiser are refused
    await tap(b, org, 'split_confirm');
    const waiting = stub.sentMessages.findLast((m) => m.text.startsWith('Waiting for their QR'))!;
    expect(waiting.text).toContain('SGD 24.00');
    const url = (waiting.replyMarkup as { inline_keyboard: Array<Array<{ url: string }>> })
      .inline_keyboard[0]![0]!.url;
    const token = /start=claim_(\S+)$/.exec(url)![1]!;

    stub.reset();
    await b.handleUpdate(textUpdate(org, `/start claim_${token}`, upd++));
    const mine = qrs().find((q) => q.to === String(org))!;
    expect(mine.caption).toContain('Your share: SGD 24.00');
    expect(mine.payload).toContain('540524.00');
  });

  it('counts receipt scans read and failed, and the receipt split', async () => {
    const org = uid++;
    const b = receiptBot();
    const counts = () => new D1UsageRepository(env.paynow_db).splitSnapshot();
    const before = await counts();
    scanned = new ReceiptReaderError('model', 'down');
    await say(b, org, '/split_receipt');
    await photo(b, org);
    scanned = RECEIPT;
    await tap(b, org, 'split_scan:again');
    await photo(b, org);
    await tap(b, org, 'split_scan:use');
    await say(b, org, '1 Ann\n2 Bob\n3 me');
    await say(b, org, '91234567');
    await tap(b, org, 'split_payee:me');
    await tap(b, org, 'split_skip_description');
    await tap(b, org, 'split_confirm');
    const after = await counts();
    expect(after.scans.failed - before.scans.failed).toBe(1);
    expect(after.scans.ok - before.scans.ok).toBe(1);
    expect(after.types.receipt - before.types.receipt).toBe(1);
  });

  describe('a scan that dropped an item', () => {
    // nine items read (107.60) of ten, the printed subtotal is 117.10, service 11.71, GST 11.59
    const DROPPED = {
      merchant: 'Bistrot',
      items: [14.9, 12.9, 9.5, 11.9, 1.8, 9.9, 14.9, 12.0, 19.8].map((price, i) => ({
        name: `Item ${i + 1}`,
        price,
      })),
      subtotal: 117.1,
      serviceCharge: 11.71,
      gst: 11.59,
      total: 140.4,
    };
    async function toReview(b: B, org: number, raw: unknown = DROPPED) {
      scanned = raw;
      await say(b, org, '/split_receipt');
      await photo(b, org);
    }

    it('says how much is missing and offers the button; nothing when the numbers add up', async () => {
      const [org, org2] = [uid++, uid++];
      const b = receiptBot();
      await toReview(b, org);
      expect(stub.lastText()).toContain(
        'The items add up to SGD 107.60 but the subtotal is SGD 117.10: SGD 9.50 looks missing.'
      );
      expect(buttons()).toEqual([
        'split_scan:add',
        'split_scan:use',
        'split_scan:again',
        'split_scan:manual',
      ]);
      await toReview(b, org2, RECEIPT); // 30 + 10 + 20 + 12 charges = 72: it adds up
      expect(stub.lastText()).not.toContain('looks missing');
      expect(buttons()).toEqual(['split_scan:use', 'split_scan:again', 'split_scan:manual']);
    });

    it('adds a named item as the next number and clears the warning', async () => {
      const org = uid++;
      const b = receiptBot();
      await toReview(b, org);
      await tap(b, org, 'split_scan:add');
      expect(stub.lastText()).toContain('SGD 9.50 looks missing. Send the missing item(s)');
      expect(buttons()).toEqual(['split_scan:oneline', 'split_scan:back']);
      await say(b, org, 'Sapporo Black 9.50');
      expect(stub.lastText()).toContain('10. Sapporo Black: SGD 9.50');
      expect(stub.lastText()).toContain('9. Item 9: SGD 19.80'); // earlier numbers unchanged
      expect(stub.lastText()).not.toContain('looks missing');
      expect(buttons()).toEqual(['split_scan:use', 'split_scan:again', 'split_scan:manual']);
    });

    it('Add as one line adds Unread items for exactly the gap', async () => {
      const org = uid++;
      const b = receiptBot();
      await toReview(b, org);
      await tap(b, org, 'split_scan:add');
      expect(buttons()?.[0]).toBe('split_scan:oneline');
      await tap(b, org, 'split_scan:oneline');
      expect(stub.lastText()).toContain('10. Unread items: SGD 9.50');
      expect(stub.lastText()).not.toContain('looks missing');
    });

    it('adds several items, refuses a bad line, and keeps the button while still short', async () => {
      const org = uid++;
      const b = receiptBot();
      await toReview(b, org);
      await tap(b, org, 'split_scan:add');
      await say(b, org, 'Sapporo Black 9.50\nWater');
      expect(stub.lastText()).toContain('"Water" needs a price');
      expect((await peek(`split-${org}`)).step).toBe(15);
      await say(b, org, 'Sapporo Black 4.00\nPeanuts 1.50');
      expect(stub.lastText()).toContain('10. Sapporo Black: SGD 4.00');
      expect(stub.lastText()).toContain('11. Peanuts: SGD 1.50');
      expect(stub.lastText()).toContain('SGD 4.00 looks missing'); // 9.50 - 5.50 still short
      expect(buttons()?.[0]).toBe('split_scan:add');
    });

    it('Back shows the review again unchanged', async () => {
      const org = uid++;
      const b = receiptBot();
      await toReview(b, org);
      await tap(b, org, 'split_scan:add');
      await tap(b, org, 'split_scan:back');
      expect(stub.lastText()).toContain('I read this receipt');
      expect(stub.lastText()).toContain('SGD 9.50 looks missing');
      expect((await peek(`split-${org}`)).step).toBe(11);
    });

    it('the added item is part of what the bot asks about, and shares the receipt total correctly', async () => {
      const org = uid++;
      const b = receiptBot();
      await toReview(b, org);
      await tap(b, org, 'split_scan:add');
      await say(b, org, 'Sapporo Black 9.50');
      await tap(b, org, 'split_scan:use');
      expect(stub.lastText()).toContain('10. Sapporo Black SGD 9.50');
      await say(b, org, '1,2,3,4,5,6,7,8,9 Ann\n10 Bob');
      await say(b, org, '91234567');
      await tap(b, org, 'split_payee:me');
      await tap(b, org, 'split_skip_description');
      // Bob: 9.50 of the 117.10 of items, plus 9.50/117.10 of the 23.30 charges (1.89), then Ann the rest
      const summary = stub.lastText();
      const amounts = [...summary.matchAll(/(Ann|Bob): SGD (\d+\.\d\d)/g)].map((m) => Number(m[2]));
      expect(amounts.reduce((x, y) => x + y, 0)).toBeCloseTo(140.4, 2);
      expect(summary).toContain('Bob: SGD 11.39');
      expect(summary).toContain('Ann: SGD 129.01');
    });

    it('a new photo discards the added items', async () => {
      const org = uid++;
      const b = receiptBot();
      await toReview(b, org);
      await tap(b, org, 'split_scan:add');
      await say(b, org, 'Sapporo Black 9.50');
      await tap(b, org, 'split_scan:again');
      await photo(b, org);
      expect(stub.lastText()).not.toContain('Sapporo Black');
      expect(stub.lastText()).toContain('SGD 9.50 looks missing');
    });

    it('stale buttons do nothing', async () => {
      const org = uid++;
      const b = receiptBot();
      await toReview(b, org);
      const reviewId = stub.lastMessageId();
      await tap(b, org, 'split_scan:add');
      stub.callbackAnswers = [];
      await b.handleUpdate(callbackUpdate(org, 'split_scan:add', reviewId, upd++)); // already in ADD_ITEM
      expect(stub.callbackAnswers).toContain('That step is over.');
    });
  });

  it('keeps no receipt data after the split, and writes nothing to the database', async () => {
    const org = uid++;
    const b = receiptBot();
    const before = await env.paynow_db
      .prepare(
        'SELECT (SELECT COUNT(*) FROM split_contacts) + (SELECT COUNT(*) FROM split_claims) AS n'
      )
      .first<{ n: number }>();
    await toSummary(b, org, '1 Ann\n2 Bob\n3 me');
    await tap(b, org, 'split_confirm');
    expect((await peek(`split-${org}`)).flow).toBe('idle');
    const after = await env.paynow_db
      .prepare(
        'SELECT (SELECT COUNT(*) FROM split_contacts) + (SELECT COUNT(*) FROM split_claims) AS n'
      )
      .first<{ n: number }>();
    expect(after?.n).toBe(before?.n);
    expect(directory()).toBeDefined();
  });
});

describe('Split_PayNow_Bot when the payee is not the organiser', () => {
  const qrOf = (p: { bytes: Uint8Array }) => {
    const { data, width, height } = bmpToRgba(p.bytes);
    return jsQR(data, width, height)!.data;
  };
  const startAs = (b: B, id: number, username: string) => {
    const u = textUpdate(id, '/start', upd++);
    (u as unknown as { message: { from: Record<string, unknown> } }).message.from.username =
      username;
    return b.handleUpdate(u);
  };
  /** A custom split of 100.00: Ann 50, Bob 30, so 20.00 is left for the organiser. */
  async function customToPayee(b: B, org: number) {
    await say(b, org, '/split_custom');
    await say(b, org, '100');
    await say(b, org, 'Ann 50\nBob 30');
    await tap(b, org, 'split_leftover:omit');
    await say(b, org, '91234567');
  }

  it('asks right after the payee, with both answers offered', async () => {
    const org = uid++;
    const b = bot();
    await customToPayee(b, org);
    expect(stub.lastText()).toContain('Is this payee you?');
    expect(buttons()).toEqual(['split_payee:me', 'split_payee:other']);
    expect((await peek(`split-${org}`)).step).toBe(14);
  });

  it('custom split, someone else paid: the organiser gets a QR for the left-out remainder', async () => {
    const [org] = [uid++];
    const b = bot();
    await startAs(b, org, `org_${org}`); // so the bot can message them
    stub.reset();
    await customToPayee(b, org);
    await tap(b, org, 'split_payee:other');
    await tap(b, org, 'split_skip_description');
    expect(stub.lastText()).toContain('Leftover SGD 20.00 is yours to pay: you get a QR');
    await tap(b, org, 'split_confirm');
    const toOrg = stub.sentPhotos.filter((p) => p.chatId === String(org));
    // the shared chat QRs for Ann and Bob arrive in the same chat, so tell them apart by amount
    const own = toOrg.find((p) => qrOf(p).includes('540520.00'));
    expect(own).toBeDefined();
    expect(own!.caption).toContain('Your share: SGD 20.00');
    expect(own!.caption).not.toContain('asks you');
    expect(own!.caption).not.toContain('91234567');
    expect(toOrg.map((p) => qrOf(p)).some((q) => q.includes('540550.00'))).toBe(true);
    expect(
      stub.sentMessages.some((m) => m.text.includes('Sent their QR by direct message: you'))
    ).toBe(true);
  });

  it('custom split, payee is the organiser: nothing for the organiser, as before', async () => {
    const org = uid++;
    const b = bot();
    await customToPayee(b, org);
    await tap(b, org, 'split_payee:me');
    await tap(b, org, 'split_skip_description');
    expect(stub.lastText()).toContain('Leftover SGD 20.00 left out: you cover it');
    await tap(b, org, 'split_confirm');
    expect(stub.sentPhotos.map((p) => qrOf(p)).some((q) => q.includes('540520.00'))).toBe(false);
  });

  it('no QR when the organiser owes nothing', async () => {
    const org = uid++;
    const b = bot();
    await say(b, org, '/split_custom');
    await say(b, org, '80');
    await say(b, org, 'Ann 50\nBob 30'); // exactly the bill
    await say(b, org, '91234567');
    await tap(b, org, 'split_payee:other');
    await tap(b, org, 'split_skip_description');
    await tap(b, org, 'split_confirm');
    expect(stub.sentPhotos).toHaveLength(2); // Ann and Bob only
  });

  it('equal split: the wording follows the answer and no extra QR is made', async () => {
    const [a, c] = [uid++, uid++];
    const b = bot();
    for (const [user, answer, wording] of [
      [a, 'other', 'all 4 people pay the payee this'],
      [c, 'me', 'everyone else pays you this'],
    ] as const) {
      await say(b, user, '/split');
      await say(b, user, '100');
      await tap(b, user, 'split_mode:equal');
      await say(b, user, '4');
      await say(b, user, '91234567');
      await tap(b, user, `split_payee:${answer}`);
      await tap(b, user, 'split_skip_description');
      expect(stub.lastText()).toContain(wording);
      stub.reset();
      await tap(b, user, 'split_confirm');
      expect(stub.sentPhotos).toHaveLength(1); // the one shared QR
    }
  });

  it('asks again when the payee is amended', async () => {
    const org = uid++;
    const b = bot();
    await customToPayee(b, org);
    await tap(b, org, 'split_payee:other');
    await tap(b, org, 'split_skip_description');
    await tap(b, org, 'split_amend');
    await tap(b, org, 'split_pick:payee');
    await say(b, org, '98765432');
    expect(stub.lastText()).toContain('Is this payee you?');
    await tap(b, org, 'split_payee:me');
    expect(stub.lastText()).toContain('Leftover SGD 20.00 left out: you cover it');
  });

  it('only the organiser answers the question in a group', async () => {
    const chat = -uid++;
    const [owner, other] = [uid++, uid++];
    const b = bot();
    await gsay(b, chat, owner, '/split');
    await gsay(b, chat, owner, '60');
    await gtap(b, chat, owner, 'split_mode:equal');
    await gsay(b, chat, owner, '3');
    await gsay(b, chat, owner, '91234567');
    expect(stub.lastText()).toContain('Is this payee you?');
    stub.callbackAnswers = [];
    await gtap(b, chat, other, 'split_payee:me');
    expect(stub.callbackAnswers).toContain('This split is not yours.');
    expect((await peek(`split-${chat}`)).step).toBe(14);
  });
});

describe('Split_PayNow_Bot /stats and counting', () => {
  const snap = () => new D1UsageRepository(env.paynow_db).splitSnapshot();
  const statsBot = (list: string | undefined) =>
    createSplitBot({ ...env, STATS_USER_IDS: list } as never, 'split-token', {
      botInfo: TEST_BOT_INFO,
      client: { fetch: stub.fetch },
    });
  const qrAmounts = () =>
    stub.sentPhotos.map((p) => {
      const { data, width, height } = bmpToRgba(p.bytes);
      return jsQR(data, width, height)!.data;
    });

  describe('access', () => {
    it('answers an authorized user in a private chat', async () => {
      const u = uid++;
      const b = statsBot(`1, ${u},abc`);
      await say(b, u, '/stats');
      expect(stub.lastText()).toContain('Split_PayNow_Bot usage');
      expect(stub.lastText()).toContain('People remembered for direct messages');
    });

    it('stays silent for anyone else, in a group, and with no list', async () => {
      const [u, other] = [uid++, uid++];
      await say(statsBot(String(u)), other, '/stats');
      expect(stub.sentMessages).toHaveLength(0);
      await statsBot(String(u)).handleUpdate(
        groupTextUpdate(-uid++, u, '/stats', undefined, upd++)
      );
      expect(stub.sentMessages).toHaveLength(0);
      for (const none of [undefined, '', 'abc, ,']) {
        await say(statsBot(none), u, '/stats');
      }
      expect(stub.sentMessages).toHaveLength(0);
    });

    it('is not in /help', async () => {
      const u = uid++;
      await say(statsBot(String(u)), u, '/help');
      expect(stub.lastText()).not.toContain('/stats');
    });
  });

  describe('counting', () => {
    const diff = (a: Awaited<ReturnType<typeof snap>>, z: Awaited<ReturnType<typeof snap>>) => ({
      confirmed: z.confirmed.total - a.confirmed.total,
      equal: z.types.equal - a.types.equal,
      custom: z.types.custom - a.types.custom,
      receipt: z.types.receipt - a.types.receipt,
      priv: z.places.private - a.places.private,
      group: z.places.group - a.places.group,
      other: z.payeeOther - a.payeeOther,
      chat: z.qrs.chat - a.qrs.chat,
      dm: z.qrs.dm - a.qrs.dm,
    });

    it('an equal split in a private chat', async () => {
      const u = uid++;
      const b = bot();
      const before = await snap();
      await say(b, u, '/split');
      await say(b, u, '100');
      await tap(b, u, 'split_mode:equal');
      await say(b, u, '4');
      await say(b, u, '91234567');
      await tap(b, u, 'split_payee:me');
      await tap(b, u, 'split_skip_description');
      expect(diff(before, await snap()).confirmed).toBe(0); // nothing counted before Confirm
      await tap(b, u, 'split_confirm');
      expect(diff(before, await snap())).toMatchObject({
        confirmed: 1,
        equal: 1,
        custom: 0,
        priv: 1,
        group: 0,
        other: 0,
        chat: 1,
      });
    });

    it('a custom split in a group with someone else paid counts each distinct amount', async () => {
      const chat = -uid++;
      const owner = uid++;
      const b = bot();
      const before = await snap();
      await gsay(b, chat, owner, '/split_custom');
      await gsay(b, chat, owner, '100');
      await gsay(b, chat, owner, 'Ann 50\nBob 30\nCy 20');
      await gsay(b, chat, owner, '91234567');
      await gtap(b, chat, owner, 'split_payee:other');
      await gtap(b, chat, owner, 'split_skip_description');
      await gtap(b, chat, owner, 'split_confirm');
      expect(diff(before, await snap())).toMatchObject({
        confirmed: 1,
        custom: 1,
        group: 1,
        priv: 0,
        other: 1,
        chat: 3,
      });
    });

    it('a failure to count never stops the QR', async () => {
      const u = uid++;
      const b = bot();
      await env.paynow_db.prepare('ALTER TABLE usage_counters RENAME TO usage_counters_off').run();
      await say(b, u, '/split');
      await say(b, u, '10');
      await tap(b, u, 'split_mode:equal');
      await say(b, u, '2');
      await say(b, u, '91234567');
      await tap(b, u, 'split_payee:me');
      await tap(b, u, 'split_skip_description');
      await tap(b, u, 'split_confirm');
      expect(stub.sentPhotos).toHaveLength(1);
      await env.paynow_db.prepare('ALTER TABLE usage_counters_off RENAME TO usage_counters').run();
    });

    it('direct messages, waiting QRs and collections', async () => {
      const [ann, dee, org] = [uid++, uid++, uid++];
      const b = bot();
      const start = (id: number, username: string) => {
        const u = textUpdate(id, '/start', upd++);
        (u as unknown as { message: { from: Record<string, unknown> } }).message.from.username =
          username;
        return b.handleUpdate(u);
      };
      await start(ann, `ann_${ann}`);
      const before = await snap();
      await say(b, org, '/split_custom');
      await say(b, org, '65');
      await say(b, org, `@ann_${ann} 40\n@dee_${dee} 25`);
      await say(b, org, '91234567');
      await tap(b, org, 'split_payee:me');
      await tap(b, org, 'split_skip_description');
      await tap(b, org, 'split_confirm');
      const mid = await snap();
      expect(mid.qrs.dm - before.qrs.dm).toBe(1); // Ann
      expect(mid.claims.created - before.claims.created).toBe(1); // Dee must collect
      expect(mid.claims.waiting - before.claims.waiting).toBe(1);

      const waiting = stub.sentMessages.findLast((m) => m.text.startsWith('Waiting for their QR'))!;
      const url = (waiting.replyMarkup as { inline_keyboard: Array<Array<{ url: string }>> })
        .inline_keyboard[0]![0]!.url;
      const token = /start=claim_(\S+)$/.exec(url)![1]!;
      const claim = textUpdate(dee, `/start claim_${token}`, upd++);
      (claim as unknown as { message: { from: Record<string, unknown> } }).message.from.username =
        `dee_${dee}`;
      await b.handleUpdate(claim);
      const after = await snap();
      expect(after.claims.collected - before.claims.collected).toBe(1);
      expect(after.qrs.dm - before.qrs.dm).toBe(2); // Ann, and Dee's collection
      expect(after.claims.waiting).toBe(before.claims.waiting);
      expect(qrAmounts().length).toBeGreaterThan(0);
    });

    it('records nothing but a day, a metric and a number', async () => {
      const u = uid++;
      const b = bot();
      await say(b, u, '/split');
      await say(b, u, '12.34');
      await tap(b, u, 'split_mode:equal');
      await say(b, u, '3');
      await say(b, u, '98765432');
      await tap(b, u, 'split_payee:me');
      await say(b, u, 'Secret lunch');
      await tap(b, u, 'split_confirm');
      const rows = await env.paynow_db
        .prepare('SELECT day, metric, count FROM usage_counters')
        .all<{ day: string; metric: string; count: number }>();
      const text = JSON.stringify(rows.results);
      for (const secret of ['98765432', 'Secret', '12.34', String(u)]) {
        expect(text).not.toContain(secret);
      }
      expect(rows.results.every((r) => /^\d{4}-\d{2}-\d{2}$/.test(r.day))).toBe(true);
    });
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
    // .dev.vars may define these locally, so blank them for the unconfigured case
    const off = { SPLIT_BOT_TOKEN: undefined, SPLIT_WEBHOOK_SECRET: undefined };
    expect((await post(off)).status).toBe(404);
    const on = { SPLIT_BOT_TOKEN: 't', SPLIT_WEBHOOK_SECRET: 's' };
    expect((await post(on, 'wrong')).status).toBe(403);
    expect((await post(on)).status).toBe(403);
  });
});

describe('acceptUpdate', () => {
  it('answers Telegram at once and finishes a slow update in the background', async () => {
    let release!: () => void;
    const gate = new Promise<void>((r) => (release = r));
    const b = createSplitBot(env, 'split-token', {
      botInfo: TEST_BOT_INFO,
      client: {
        fetch: async (url, init) => {
          await gate; // Telegram (or the model) is slow
          return stub.fetch(url, init);
        },
      },
    });
    const pending: Promise<unknown>[] = [];
    const request = new Request('https://x.test/webhook/split', {
      method: 'POST',
      body: JSON.stringify(textUpdate(uid++, '/split', upd++)),
    });
    const response = await acceptUpdate(b, request, { waitUntil: (p) => void pending.push(p) });
    expect(response.status).toBe(200); // returned although the update is still running
    expect(stub.sentMessages).toHaveLength(0);
    release();
    await Promise.all(pending);
    expect(stub.lastText()).toContain('How much is the bill');
  });

  it('logs a failing update instead of failing the webhook', async () => {
    const b = createSplitBot(env, 'split-token', {
      botInfo: TEST_BOT_INFO,
      client: {
        fetch: async () => {
          throw new Error('telegram down');
        },
      },
    });
    const pending: Promise<unknown>[] = [];
    const request = new Request('https://x.test/webhook/split', {
      method: 'POST',
      body: JSON.stringify(textUpdate(uid++, '/split', upd++)),
    });
    const response = await acceptUpdate(b, request, { waitUntil: (p) => void pending.push(p) });
    expect(response.status).toBe(200);
    await expect(Promise.all(pending)).resolves.toBeDefined();
  });
});
