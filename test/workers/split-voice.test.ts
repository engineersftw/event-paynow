import { env } from 'cloudflare:test';
import type { Update } from 'grammy/types';
import { beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { createSplitBot } from '../../src/split-bot';
import { VoiceReaderError } from '../../src/voice-reader';
import {
  applyTestSchema,
  callbackUpdate,
  groupTextUpdate,
  photoUpdate,
  TEST_BOT_INFO,
  TelegramStub,
  textUpdate,
  voiceUpdate,
} from './harness';

// 30 + 10 + 20 = 60.00 of items on a 72.00 receipt
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

const stub = new TelegramStub();
let uid = 9100;
let upd = 1;
let heard: { heard: string; lines: string } | Error = { heard: '', lines: '' };
const hearCalls: { bytes: number; items: string[] }[] = [];
const voice = {
  async hear(audio: Uint8Array, items: string[]) {
    hearCalls.push({ bytes: audio.length, items });
    if (heard instanceof Error) throw heard;
    return heard;
  },
};

beforeAll(async () => {
  await applyTestSchema(env.paynow_db);
});
beforeEach(() => {
  stub.reset();
  hearCalls.length = 0;
  heard = { heard: '', lines: '' };
});

const makeBot = (withVoice = true) =>
  createSplitBot(
    { ...env, AI: undefined } as never,
    'split-token',
    { botInfo: TEST_BOT_INFO, client: { fetch: stub.fetch } },
    {
      reader: { read: async () => RECEIPT },
      download: async () => new Uint8Array([1, 2, 3]),
      ...(withVoice ? { voice } : {}),
    }
  );
type B = ReturnType<typeof makeBot>;

const say = (b: B, user: number, text: string) => b.handleUpdate(textUpdate(user, text, upd++));
const tapOn = (b: B, user: number, data: string, messageId: number) =>
  b.handleUpdate(callbackUpdate(user, data, messageId, upd++));
const tap = (b: B, user: number, data: string) => tapOn(b, user, data, stub.lastMessageId());
const speak = (b: B, user: number, opts?: { duration?: number; fileSize?: number }) =>
  b.handleUpdate(voiceUpdate(user, user, 'voice-1', opts, upd++));

/** A private split at the assignment question, items 1 Chilli crab, 2 Rice, 3 Beer. */
async function toAssign(b: B, user: number, how: 'type' | 'voice' = 'type') {
  await say(b, user, '/split_receipt');
  await say(b, user, '91234567');
  await b.handleUpdate(photoUpdate(user, user, 'file-1', upd++));
  await tap(b, user, 'split_scan:use');
  await tap(b, user, 'split_skip_description');
  // With voice available the menu comes first; without it the bot asks at once
  if (stub.lastText().includes('How do you want to share out the items?')) {
    await tap(b, user, `split_how:${how}`);
  }
  expect(stub.lastText()).toContain(how === 'voice' ? 'Say who had which item' : 'Who had what?');
}

/** The menu's buttons (callback data) of the last message. */
const menuButtons = () =>
  (
    stub.sentMessages.at(-1)!.replyMarkup as {
      inline_keyboard: Array<Array<{ callback_data: string }>>;
    }
  ).inline_keyboard
    .flat()
    .map((k) => k.callback_data);

/** The menu of a fresh private receipt split (the organiser has tapped Use this and skipped the description). */
async function toMenu(b: B, user: number) {
  await say(b, user, '/split_receipt');
  await say(b, user, '91234567');
  await b.handleUpdate(photoUpdate(user, user, 'file-1', upd++));
  await tap(b, user, 'split_scan:use');
  await tap(b, user, 'split_skip_description');
}

/** The message that carries `text` (the lines bubble): where the Use these lines button sits. */
const bubble = (text: string) => stub.sentMessages.findLast((m) => m.text === text)!;
const asked = (re: RegExp) => stub.sentMessages.some((m) => re.test(m.text));

describe('Split_PayNow_Bot voice assignment', () => {
  it('offers what it heard and the lines, and applies them only on the tap, like typed text', async () => {
    const b = makeBot();
    const [u, typed] = [uid++, uid++];
    heard = { heard: 'crab and beer are Ann, rice is mine', lines: '1,3 Ann\n2 me' };
    await toAssign(b, u);
    await speak(b, u);

    expect(hearCalls).toEqual([{ bytes: 3, items: ['Chilli crab', 'Rice', 'Beer'] }]);
    expect(asked(/I heard: "crab and beer are Ann, rice is mine"/)).toBe(true);
    const lines = bubble('1,3 Ann\n2 me');
    expect(JSON.stringify(lines.replyMarkup)).toContain('split_voice:use');
    expect(asked(/Please check the split/)).toBe(false); // nothing applied yet

    await tapOn(b, u, 'split_voice:use', lines.messageId);
    expect(asked(/Please check the split/)).toBe(true); // now the next question
    const viaVoice = stub.sentMessages.findLast((m) => m.text.startsWith('Please check'))!.text;

    // the same lines typed in another chat give the same summary
    await toAssign(b, typed);
    await say(b, typed, '1,3 Ann\n2 me');
    const viaText = stub.sentMessages.findLast((m) => m.text.startsWith('Please check'))!.text;
    expect(viaVoice).toBe(viaText);
  });

  it('counts "me (shared)" as the organiser, not as another person', async () => {
    const b = makeBot();
    const u = uid++;
    heard = {
      heard: 'crab and rice are Dylan and me',
      lines: '1,3 Dylan, me\n2 Dylan, me (shared)',
    };
    await toAssign(b, u);
    await speak(b, u);
    await tapOn(b, u, 'split_voice:use', bubble(heard.lines).messageId);
    const summary = stub.sentMessages.findLast((m) => m.text.startsWith('Please check'))!.text;
    expect(summary).not.toContain('(shared)');
    expect(summary).toContain('shared by 2 people');
  });

  it('drops the old lines when a newer voice note or typed text comes', async () => {
    const b = makeBot();
    const u = uid++;
    await toAssign(b, u);
    heard = { heard: 'first', lines: '1 Ann' };
    await speak(b, u);
    const first = bubble('1 Ann');
    heard = { heard: 'second', lines: '2 Bob' };
    await speak(b, u);
    const second = bubble('2 Bob');

    await tapOn(b, u, 'split_voice:use', first.messageId); // stale button
    expect(stub.callbackAnswers.at(-1)).toContain('no longer waiting');
    expect(asked(/Please check the split/)).toBe(false);

    await say(b, u, '3 Cy'); // typed text replaces the pending lines too
    await tapOn(b, u, 'split_voice:use', second.messageId);
    expect(stub.callbackAnswers.at(-1)).toContain('no longer waiting');
  });

  it('refuses lines that fail the usual check and keeps asking', async () => {
    const b = makeBot();
    const u = uid++;
    await toAssign(b, u);
    heard = { heard: 'item nine is Ann', lines: '9 Ann' };
    await speak(b, u);
    expect(stub.lastText()).toContain('I heard: "item nine is Ann"');
    expect(stub.lastText()).toContain('could not turn that into an assignment');
    expect(stub.lastText()).toContain('Send another voice note or type it');
    expect(
      stub.sentMessages.some((m) => JSON.stringify(m.replyMarkup ?? '').includes('voice:use'))
    ).toBe(false);
    await say(b, u, '1,3 Ann\n2 me'); // still waiting for the assignment
    expect(asked(/Please check the split/)).toBe(true);
  });

  it('says so when nothing was heard, nothing could be made, or the model fails', async () => {
    const b = makeBot();
    const u = uid++;
    await toAssign(b, u);
    heard = { heard: '', lines: '' };
    await speak(b, u);
    expect(stub.lastText()).toContain('I heard nothing');

    heard = { heard: 'we had a nice dinner', lines: '' };
    await speak(b, u);
    expect(stub.lastText()).toContain('I heard: "we had a nice dinner"');
    expect(stub.lastText()).toContain('could not turn that into an assignment');

    heard = new VoiceReaderError('hear', 'model down');
    await speak(b, u);
    expect(stub.lastText()).toContain('Voice is not working right now');

    await say(b, u, '1,3 Ann\n2 me'); // the step is unchanged
    expect(asked(/Please check the split/)).toBe(true);
  });

  it('refuses a long or large voice note before any download or model call', async () => {
    const b = makeBot();
    const u = uid++;
    await toAssign(b, u);
    await speak(b, u, { duration: 90 });
    expect(stub.lastText()).toContain('at most 60 seconds');
    await speak(b, u, { fileSize: 2_000_000 });
    expect(stub.lastText()).toContain('at most 60 seconds');
    expect(hearCalls).toHaveLength(0);
  });

  it('is ignored at other steps, from other members, and when voice is not configured', async () => {
    const b = makeBot();
    const u = uid++;
    await say(b, u, '/split_receipt');
    await speak(b, u); // waiting for the payee
    expect(stub.lastText()).toContain('only take a voice note when I ask who had which item');
    expect(hearCalls).toHaveLength(0);

    // in a group, a member who is not the organiser is ignored without a word
    const [chat, org, other] = [-uid++, uid++, uid++];
    await b.handleUpdate(
      (() => {
        const x = textUpdate(org, '/split_receipt', upd++) as unknown as {
          message: { chat: unknown };
        };
        x.message.chat = { id: chat, type: 'group' };
        return x as unknown as Update;
      })()
    );
    const before = stub.sentMessages.length;
    await b.handleUpdate(voiceUpdate(chat, other, 'voice-1', {}, upd++));
    expect(stub.sentMessages).toHaveLength(before);
    expect(hearCalls).toHaveLength(0);

    // without a voice reader the assignment prompt has no voice line and a voice note is declined
    const plain = makeBot(false);
    const v = uid++;
    await toAssign(plain, v);
    expect(stub.lastText()).not.toContain('voice note');
    await speak(plain, v);
    expect(stub.lastText()).toContain('Voice notes are not available');
  });

  it('mentions voice in the typed prompt when it is available', async () => {
    const b = makeBot();
    await toAssign(b, uid++, 'type');
    expect(stub.lastText()).toContain('You can also send a voice note');
  });
});

describe('Split_PayNow_Bot how to share out the items: the menu', () => {
  it('offers type or voice in a private chat, with no claiming', async () => {
    const b = makeBot();
    await toMenu(b, uid++);
    expect(stub.lastText()).toContain('How do you want to share out the items?');
    expect(menuButtons()).toEqual(['split_how:type', 'split_how:voice']);
  });

  it('shows no menu in a private chat without voice, and none of the voice wording', async () => {
    const b = makeBot(false);
    await toMenu(b, uid++);
    expect(stub.lastText()).toContain('Who had what?');
    expect(stub.sentMessages.some((m) => m.text.includes('How do you want to share out'))).toBe(
      false
    );
  });

  it('offers type, voice and claiming in a group', async () => {
    const b = makeBot();
    const chat = -uid++;
    const org = uid++;
    await b.handleUpdate(groupTextUpdate(chat, org, '/split_receipt', undefined, upd++));
    await b.handleUpdate(groupTextUpdate(chat, org, '91234567', undefined, upd++));
    await b.handleUpdate(photoUpdate(chat, org, 'file-1', upd++));
    const gtap = (data: string) => {
      const u = callbackUpdate(org, data, stub.lastMessageId(), upd++) as unknown as {
        callback_query: { message: Record<string, unknown> };
      };
      u.callback_query.message.chat = { id: chat, type: 'group' };
      return b.handleUpdate(u as unknown as Update);
    };
    await gtap('split_scan:use');
    await gtap('split_skip_description');
    expect(menuButtons()).toEqual(['split_how:type', 'split_how:voice', 'split_how:claim']);
  });

  it('choosing voice sends the list and a prompt that says what to say, with Type instead', async () => {
    const b = makeBot();
    const u = uid++;
    await toAssign(b, u, 'voice');
    expect(stub.editedMessages.at(-1)!.text).toBe('You will say who had what.');
    expect(stub.sentMessages.at(-2)!.text).toBe(
      '1. Chilli crab SGD 30.00\n2. Rice SGD 10.00\n3. Beer SGD 20.00'
    );
    expect(stub.lastText()).toContain('Say who had which item in a voice note');
    expect(stub.lastText()).toContain('"Chilli crab is Ann\'s, Rice is mine"');
    expect(stub.lastText()).toContain('show you what I heard');
    expect(menuButtons()).toEqual(['split_how:retype']);
  });

  it('Type instead shows the typed prompt, and typed text after choosing voice is read as typed', async () => {
    const b = makeBot();
    const [a, c] = [uid++, uid++];
    await toAssign(b, a, 'voice');
    await tap(b, a, 'split_how:retype');
    expect(stub.lastText()).toContain('Who had what? Send one line per group');

    await toAssign(b, c, 'voice');
    await say(b, c, '1,3 Ann\n2 me');
    expect(stub.lastText()).toContain('Please check the split');
  });

  it('a voice note at the menu is read as choosing voice, and the menu loses its buttons', async () => {
    const b = makeBot();
    const u = uid++;
    heard = { heard: 'crab is Ann, rice is mine', lines: '1 Ann\n2 me' };
    await toMenu(b, u);
    expect(stub.lastText()).toContain('How do you want to share out the items?');
    stub.otherCalls = [];
    await speak(b, u);
    expect(stub.otherCalls.some((c) => c.method === 'editMessageReplyMarkup')).toBe(true);
    expect(hearCalls).toHaveLength(1);
    expect(asked(/I heard: "crab is Ann, rice is mine"/)).toBe(true);
    expect(stub.sentMessages.some((m) => m.text.includes('I only take a voice note'))).toBe(false);
  });

  it('Amend then Items shows the menu again', async () => {
    const b = makeBot();
    const u = uid++;
    await toAssign(b, u, 'type');
    await say(b, u, '1,3 Ann\n2 me');
    await tap(b, u, 'split_amend');
    await tap(b, u, 'split_pick:items');
    expect(stub.lastText()).toContain('How do you want to share out the items?');
    expect(menuButtons()).toEqual(['split_how:type', 'split_how:voice', 'split_keep']); // Keep as is
  });

  it('a stale menu tap changes nothing', async () => {
    const b = makeBot();
    const u = uid++;
    await toAssign(b, u, 'type');
    await tap(b, u, 'split_how:voice'); // the menu is long gone
    const state = await env.CHAT_SESSION.get(env.CHAT_SESSION.idFromName(`split-${u}`)).fetch(
      'http://localhost/peek'
    );
    expect(((await state.json()) as { context: { assignHow?: string } }).context.assignHow).toBe(
      'type'
    );
  });
});
