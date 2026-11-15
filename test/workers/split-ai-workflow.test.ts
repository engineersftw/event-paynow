import { env } from 'cloudflare:test';
import { beforeAll, beforeEach, describe, expect, it } from 'vitest';
import {
  AiReadError,
  readScan,
  SCAN_DOWNLOAD_FAILED,
  SCAN_MODEL_FAILED,
  type SplitAiParams,
  VOICE_FAILED,
} from '../../src/split-ai-job';
import { deliverJob, readJob, runSplitAi } from '../../src/split-ai-workflow';
import { createSplitBot } from '../../src/split-bot';
import {
  applyTestSchema,
  callbackUpdate,
  photoUpdate,
  TEST_BOT_INFO,
  TelegramStub,
  textUpdate,
  voiceUpdate,
} from './harness';

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
let uid = 9700;
let upd = 1;
let created: { id: string; params: SplitAiParams }[] = [];
let createError: Error | undefined;
let scanCalls = 0;
let scanReply: unknown = RECEIPT;
let hearCalls: string[][] = [];
let heard = { heard: 'crab is Ann, the rest mine', lines: '1 Ann\n2,3 me' };

// A Workflow binding that only records what it is started with
const workflow = {
  async create(options: { id: string; params: SplitAiParams }) {
    if (createError) throw createError;
    created.push(options);
    return { id: options.id };
  },
} as unknown as Workflow<SplitAiParams>;

const readers = {
  reader: {
    async read() {
      scanCalls++;
      if (scanReply instanceof Error) throw scanReply;
      return scanReply;
    },
  },
  voice: {
    async hear(_audio: Uint8Array, items: string[]) {
      hearCalls.push(items);
      return heard;
    },
  },
  download: async () => new Uint8Array([1, 2, 3]),
};
const opts = { token: 'split-token', readers, fetch: stub.fetch as unknown as typeof fetch };

beforeAll(async () => {
  await applyTestSchema(env.paynow_db);
});
beforeEach(() => {
  stub.reset();
  created = [];
  createError = undefined;
  scanCalls = 0;
  scanReply = RECEIPT;
  hearCalls = [];
  heard = { heard: 'crab is Ann, the rest mine', lines: '1 Ann\n2,3 me' };
});

const makeBot = (withWorkflow = true) =>
  createSplitBot(
    { ...env, AI: undefined } as never,
    'split-token',
    { botInfo: TEST_BOT_INFO, client: { fetch: stub.fetch } },
    { ...readers, ...(withWorkflow ? { aiWorkflow: workflow } : {}) }
  );
type B = ReturnType<typeof makeBot>;

const say = (b: B, user: number, text: string) => b.handleUpdate(textUpdate(user, text, upd++));
const photo = (b: B, user: number) => b.handleUpdate(photoUpdate(user, user, 'file-1', upd++));
const speak = (b: B, user: number) =>
  b.handleUpdate(voiceUpdate(user, user, 'voice-1', undefined, upd++));
const asked = (re: RegExp) => stub.sentMessages.some((m) => re.test(m.text));

/** A private /split_receipt at the point where the bot waits for the photo. */
async function toPhoto(b: B, user: number) {
  await say(b, user, '/split_receipt');
  await say(b, user, '91234567');
}

const readJobAndDeliver = async (p: SplitAiParams) => {
  expect(await readJob(env, p, opts)).toBe('stored');
  expect(await deliverJob(env, p, opts)).toBe('delivered');
};

describe('Split bot reads receipts and voice notes in the background', () => {
  it('starts one instance with ids only, and shows the review when the steps have run', async () => {
    const b = makeBot();
    const u = uid++;
    await toPhoto(b, u);
    await photo(b, u);

    expect(created).toHaveLength(1);
    const { id, params } = created[0]!;
    expect(id).toMatch(/^split-\d+$/);
    expect(Object.keys(params).sort()).toEqual(
      ['chatId', 'chatType', 'fileId', 'jobId', 'kind', 'noticeMsg', 'userId'].sort()
    );
    expect(params).toMatchObject({ kind: 'scan', chatId: u, userId: u, fileId: 'file-1' });
    expect(asked(/Reading your receipt/)).toBe(true);
    expect(asked(/Chilli crab/)).toBe(false); // nothing read inline
    expect(scanCalls).toBe(0);

    await readJobAndDeliver(params);
    expect(scanCalls).toBe(1);
    expect(asked(/Chilli crab/)).toBe(true);
    expect(stub.deletedMessages.map((d) => d.messageId)).toContain(params.noticeMsg);
  });

  it('reads inline when the Workflow cannot be started', async () => {
    const b = makeBot();
    const u = uid++;
    createError = new Error('workflows are down');
    await toPhoto(b, u);
    await photo(b, u);
    expect(scanCalls).toBe(1);
    expect(asked(/Chilli crab/)).toBe(true);
    // the failed start leaves no job behind in the conversation
    const peek = await env.CHAT_SESSION.get(env.CHAT_SESSION.idFromName(`split-${u}`)).fetch(
      'http://localhost/peek'
    );
    const state = (await peek.json()) as { context: Record<string, unknown> };
    expect(state.context.pendingJob).toBeUndefined();
    expect(created).toHaveLength(0);
  });

  it('treats an instance that already exists as started, without reading inline', async () => {
    const b = makeBot();
    const u = uid++;
    createError = new Error('instance.already_exists');
    await toPhoto(b, u);
    await photo(b, u);
    expect(scanCalls).toBe(0);
    expect(asked(/Chilli crab/)).toBe(false);
  });

  it('reads inline when there is no Workflow binding', async () => {
    const b = makeBot(false);
    const u = uid++;
    await toPhoto(b, u);
    await photo(b, u);
    expect(scanCalls).toBe(1);
    expect(asked(/Chilli crab/)).toBe(true);
  });

  it('drops the result when the split was cancelled, and removes the notice', async () => {
    const b = makeBot();
    const u = uid++;
    await toPhoto(b, u);
    await photo(b, u);
    const p = created[0]!.params;
    await say(b, u, '/cancel');

    expect(await readJob(env, p, opts)).toBe('stale'); // no model call for a gone conversation
    expect(scanCalls).toBe(0);
    await deliverJob(env, p, opts);
    expect(asked(/Chilli crab/)).toBe(false);
    expect(stub.deletedMessages.map((d) => d.messageId)).toContain(p.noticeMsg);
  });

  it('shows only the newest photo when two are sent', async () => {
    const b = makeBot();
    const u = uid++;
    await toPhoto(b, u);
    await photo(b, u);
    await photo(b, u);
    const [first, second] = created.map((c) => c.params);

    expect(await readJob(env, first!, opts)).toBe('stale');
    await readJobAndDeliver(second!);
    expect(stub.sentMessages.filter((m) => /Chilli crab/.test(m.text))).toHaveLength(1);
  });

  it('drops the result when the conversation is no longer at the same step', async () => {
    const b = makeBot();
    const u = uid++;
    await toPhoto(b, u);
    await photo(b, u);
    const p = created[0]!.params;
    expect(await readJob(env, p, opts)).toBe('stored');
    // Choosing to type the total instead moves the conversation on
    await b.handleUpdate(callbackUpdate(u, 'split_scan:manual', stub.lastMessageId(), upd++));
    await deliverJob(env, p, opts);
    expect(asked(/Chilli crab/)).toBe(false);
    expect(stub.deletedMessages.map((d) => d.messageId)).toContain(p.noticeMsg);
  });

  it('keeps an unusable scan as a result, not as an error that is tried again', async () => {
    const b = makeBot();
    const u = uid++;
    scanReply = { items: [] }; // no total
    await toPhoto(b, u);
    await photo(b, u);
    const p = created[0]!.params;
    await readJobAndDeliver(p);
    expect(scanCalls).toBe(1);
    expect(asked(/could not find a total/)).toBe(true);
    expect(JSON.stringify(stub.sentMessages.at(-1)!.replyMarkup)).toContain('split_scan:again');
  });

  it('tells the user when the model keeps failing, with the usual buttons', async () => {
    const b = makeBot();
    const u = uid++;
    scanReply = new Error('model down');
    const before = await env.paynow_db
      .prepare(
        "SELECT COALESCE(SUM(count), 0) AS n FROM usage_counters WHERE metric = 'split_scan_failed'"
      )
      .first<{ n: number }>();
    await toPhoto(b, u);
    await photo(b, u);
    const p = created[0]!.params;

    // A step runner that retries `read` like Workflows would, 3 attempts in all
    const attempts: string[] = [];
    const step = {
      async do(name: string, a: unknown, b2?: () => Promise<unknown>) {
        const fn = (b2 ?? a) as () => Promise<unknown>;
        attempts.push(name);
        if (name !== 'read') return fn();
        let last: unknown;
        for (let i = 0; i < 3; i++) {
          try {
            return await fn();
          } catch (error) {
            last = error;
          }
        }
        throw last;
      },
    };
    await runSplitAi(env, p, step as never, opts);
    expect(scanCalls).toBe(3);
    expect(attempts).toEqual(['read', 'fail', 'deliver']);
    expect(asked(new RegExp(SCAN_MODEL_FAILED.replace(/[()]/g, '\\$&')))).toBe(true);
    expect(JSON.stringify(stub.sentMessages.at(-1)!.replyMarkup)).toContain('split_scan:manual');
    expect(stub.sentMessages.filter((m) => m.text.includes(SCAN_MODEL_FAILED))).toHaveLength(1);
    const failed = await env.paynow_db
      .prepare(
        "SELECT COALESCE(SUM(count), 0) AS n FROM usage_counters WHERE metric = 'split_scan_failed'"
      )
      .first<{ n: number }>();
    expect(failed!.n).toBe(before!.n + 1); // counted once, whatever the number of attempts
  });

  it('never puts the photo, the token or bill data in a failure message', async () => {
    const leaky = async () => {
      throw new Error('https://api.telegram.org/file/botSECRET:TOKEN/photos/p.jpg');
    };
    const error = await readScan({ read: async () => ({}) }, leaky, {} as never, 'file-1').catch(
      (e) => e
    );
    expect(error).toBeInstanceOf(AiReadError);
    expect(error.message).toBe(SCAN_DOWNLOAD_FAILED);
    expect(error.message).not.toContain('SECRET');
  });

  describe('voice notes', () => {
    /** A private receipt split with the bot waiting for who had what. */
    async function atAssign(b: B, user: number) {
      await toPhoto(b, user);
      await photo(b, user);
      await readJobAndDeliver(created.at(-1)!.params);
      await b.handleUpdate({
        update_id: upd++,
        callback_query: {
          id: 'c1',
          from: { id: user, is_bot: false, first_name: 'T' },
          chat_instance: 'ci',
          data: 'split_scan:use',
          message: {
            message_id: stub.lastMessageId(),
            chat: { id: user, type: 'private' },
            date: 1,
          },
        },
      } as never);
      await b.handleUpdate({
        update_id: upd++,
        callback_query: {
          id: 'c2',
          from: { id: user, is_bot: false, first_name: 'T' },
          chat_instance: 'ci',
          data: 'split_skip_description',
          message: {
            message_id: stub.lastMessageId(),
            chat: { id: user, type: 'private' },
            date: 1,
          },
        },
      } as never);
    }

    it('starts a voice job, reads the item names from the conversation, and offers the lines', async () => {
      const b = makeBot();
      const u = uid++;
      await atAssign(b, u);
      await speak(b, u);
      const p = created.at(-1)!.params;
      expect(p.kind).toBe('voice');
      expect(JSON.stringify(p)).not.toMatch(/Chilli|crab|Rice|Beer/); // ids only
      expect(asked(/Listening/)).toBe(true);
      expect(hearCalls).toHaveLength(0);

      await readJobAndDeliver(p);
      expect(hearCalls).toEqual([['Chilli crab', 'Rice', 'Beer']]);
      expect(asked(/I heard: "crab is Ann, the rest mine"/)).toBe(true);
      expect(
        JSON.stringify(stub.sentMessages.find((m) => m.text === '1 Ann\n2,3 me')?.replyMarkup)
      ).toContain('split_voice:use');
    });

    it('says it heard nothing when the note is silent', async () => {
      const b = makeBot();
      const u = uid++;
      await atAssign(b, u);
      heard = { heard: '', lines: '' };
      await speak(b, u);
      const p = created.at(-1)!.params;
      await readJobAndDeliver(p);
      expect(asked(/I heard nothing/)).toBe(true);
      expect(stub.deletedMessages.map((d) => d.messageId)).toContain(p.noticeMsg);
    });

    it('says voice is not working when every attempt fails', async () => {
      const b = makeBot();
      const u = uid++;
      await atAssign(b, u);
      await speak(b, u);
      const p = created.at(-1)!.params;
      const failing = {
        ...readers,
        voice: {
          hear: async () => {
            throw new Error('whisper down');
          },
        },
      };
      const step = {
        async do(name: string, a: unknown, b2?: () => Promise<unknown>) {
          const fn = (b2 ?? a) as () => Promise<unknown>;
          if (name !== 'read') return fn();
          await fn().catch(() => undefined); // one attempt is enough to know it throws
          throw new AiReadError(VOICE_FAILED);
        },
      };
      await runSplitAi(env, p, step as never, { ...opts, readers: failing });
      expect(asked(new RegExp(VOICE_FAILED.slice(0, 25)))).toBe(true);
    });
  });
});
