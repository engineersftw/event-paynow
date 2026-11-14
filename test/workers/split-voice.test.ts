import { env } from 'cloudflare:test';
import type { Update } from 'grammy/types';
import { beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { createSplitBot } from '../../src/split-bot';
import { VoiceReaderError } from '../../src/voice-reader';
import {
  applyTestSchema,
  callbackUpdate,
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
async function toAssign(b: B, user: number) {
  await say(b, user, '/split_receipt');
  await say(b, user, '91234567');
  await tap(b, user, 'split_payee:me');
  await b.handleUpdate(photoUpdate(user, user, 'file-1', upd++));
  await tap(b, user, 'split_scan:use');
  expect(stub.lastText()).toContain('Who had what?');
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
    expect(asked(/short description/i)).toBe(false); // nothing applied yet

    await tapOn(b, u, 'split_voice:use', lines.messageId);
    expect(asked(/short description/i)).toBe(true); // now the next question
    await tap(b, u, 'split_skip_description');
    const viaVoice = stub.sentMessages.findLast((m) => m.text.startsWith('Please check'))!.text;

    // the same lines typed in another chat give the same summary
    await toAssign(b, typed);
    await say(b, typed, '1,3 Ann\n2 me');
    await tap(b, typed, 'split_skip_description');
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
    await tap(b, u, 'split_skip_description');
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
    expect(asked(/short description/i)).toBe(false);

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
    expect(asked(/short description/i)).toBe(true);
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
    expect(asked(/short description/i)).toBe(true);
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

  it('mentions voice in the assignment prompt when it is available', async () => {
    const b = makeBot();
    await toAssign(b, uid++);
    expect(stub.lastText()).toContain('You can also send a voice note');
  });
});
