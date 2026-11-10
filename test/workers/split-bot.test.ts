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
  editedTextUpdate,
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
    await gtap(b, chat, owner, 'split_skip_description');
    expect(summaryText().text).toContain('…4567');

    stub.reset();
    await edit(b, chat, other, totalId, '90'); // someone else's edit
    expect(stub.sentMessages).toHaveLength(0);

    await edit(b, chat, owner, payeeId, '98765432'); // may still be in the chat if it could not be deleted
    expect(stub.deletedMessages).toHaveLength(1);
    expect(summaryText().text).toContain('…5432');

    await gtap(b, chat, owner, 'split_amend');
    await gtap(b, chat, owner, 'split_pick:total');
    await gsay(b, chat, owner, '90');
    expect(summaryText().text).toContain('Each share: SGD 30.00');
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
