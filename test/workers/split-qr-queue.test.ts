import { env } from 'cloudflare:test';
import type { Update } from 'grammy/types';
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { D1UsageRepository } from '../../src/db/usage-repository';
import { buildPayNowPayload } from '../../src/sgqr/paynow';
import { createSplitBot } from '../../src/split-bot';
import { handleSplitQrBatch, type SplitQrMessage } from '../../src/split-qr-queue';
import {
  applyTestSchema,
  callbackUpdate,
  groupTextUpdate,
  photoUpdate,
  TEST_BOT_INFO,
  TelegramStub,
  textUpdate,
} from './harness';

const stub = new TelegramStub();
let uid = 9500;
let upd = 1;
beforeAll(async () => {
  await applyTestSchema(env.paynow_db);
});
beforeEach(() => stub.reset());
afterEach(() => vi.restoreAllMocks());

/** A queue binding that records what is put on it, or refuses. */
function fakeQueue(refuse = false) {
  const queued: SplitQrMessage[] = [];
  const queue = {
    async sendBatch(messages: Array<{ body: SplitQrMessage }>) {
      if (refuse) throw new Error('queue down');
      queued.push(...messages.map((m) => m.body));
    },
    async send(body: SplitQrMessage) {
      if (refuse) throw new Error('queue down');
      queued.push(body);
    },
  };
  return { queued, queue: queue as unknown as Queue<SplitQrMessage> };
}

const RECEIPT = {
  merchant: 'Huevos',
  items: [
    { name: 'Chilli crab', price: 30 },
    { name: 'Rice', price: 10 },
  ],
  serviceCharge: 8,
  total: 48,
};

const makeBot = (qrQueue?: Queue<SplitQrMessage>) =>
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
    {
      reader: { read: async () => RECEIPT },
      download: async () => new Uint8Array([1]),
      ...(qrQueue ? { qrQueue } : {}),
    }
  );
type B = ReturnType<typeof makeBot>;
const say = (b: B, u: number, text: string) => b.handleUpdate(textUpdate(u, text, upd++));
const tap = (b: B, u: number, data: string) =>
  b.handleUpdate(callbackUpdate(u, data, stub.lastMessageId(), upd++));

async function customSplit(b: B, u: number) {
  await say(b, u, '/split_custom');
  await say(b, u, '91234567');
  await say(b, u, '100');
  await say(b, u, 'Lunch');
  await say(b, u, 'Ann 60\nBob 40');
  await tap(b, u, 'split_confirm');
}

describe('Split_PayNow_Bot QR queue: producer', () => {
  it('Confirm queues one message per distinct amount and posts nothing itself', async () => {
    const { queued, queue } = fakeQueue();
    const u = uid++;
    await customSplit(makeBot(queue), u);
    expect(stub.sentPhotos).toHaveLength(0);
    expect(queued).toHaveLength(2);
    expect(queued[0]).toMatchObject({
      v: 1,
      chatId: u,
      lines: ['Lunch', 'SGD 60.00', 'Ann'],
      label: 'SGD 60.00 Ann',
    });
    expect(queued[0]!.payload).toContain('540560.00');
    expect(queued[0]!.caption).toContain('Lunch\nSGD 60.00\nAnn');
    expect(queued[0]!.caption).not.toContain('91234567');
    expect(queued[1]!.label).toBe('SGD 40.00 Bob');
    expect(queued[0]).not.toHaveProperty('threadId'); // not in a forum topic
  });

  it('sends directly when the queue refuses', async () => {
    const { queued, queue } = fakeQueue(true);
    await customSplit(makeBot(queue), uid++);
    expect(queued).toHaveLength(0);
    expect(stub.sentPhotos).toHaveLength(2);
  });

  it('Get my QR queues the member QR and says it is on its way', async () => {
    const { queued, queue } = fakeQueue();
    const b = makeBot(queue);
    const chat = -uid++;
    const [org, ann] = [uid++, uid++];
    const gsay = (text: string) =>
      b.handleUpdate(groupTextUpdate(chat, org, text, undefined, upd++));
    const gtap = (user: number, data: string, msg = stub.lastMessageId()) => {
      const u = callbackUpdate(user, data, msg, upd++) as unknown as {
        callback_query: { from: Record<string, unknown>; message: Record<string, unknown> };
      };
      u.callback_query.from = {
        id: user,
        is_bot: false,
        first_name: user === ann ? 'Ann' : 'Olive',
      };
      u.callback_query.message.chat = { id: chat, type: 'group' };
      return b.handleUpdate(u as unknown as Update);
    };
    await gsay('/split_receipt');
    await gsay('91234567');
    await b.handleUpdate(photoUpdate(chat, org, 'f', upd++));
    await gtap(org, 'split_scan:use');
    await gtap(org, 'split_skip_description');
    await gtap(org, 'split_how:claim');
    const msg = stub.lastMessageId();
    await gtap(ann, 'split_claim:0', msg);
    await gtap(ann, 'split_claim:qr', msg);
    expect(stub.callbackAnswers.at(-1)).toBe('Your QR will be posted in the chat in a moment.');
    expect(stub.sentPhotos).toHaveLength(0);
    expect(queued).toHaveLength(1);
    // 30.00 of 40.00 items on a 48.00 receipt: 36.00, with the merchant as the description
    expect(queued[0]).toMatchObject({ chatId: chat, lines: ['Huevos', 'SGD 36.00', 'Ann'] });
  });
});

describe('Split_PayNow_Bot QR queue: consumer', () => {
  const body = (label = 'SGD 30.00 Bob'): SplitQrMessage => ({
    v: 1,
    chatId: -42,
    payload: buildPayNowPayload({
      proxyType: 'mobile',
      proxyValue: '+6591234567',
      amountCents: 3000,
      editable: false,
    }),
    lines: ['SGD 30.00', 'Bob'],
    caption: 'SGD 30.00\nBob',
    label,
  });
  const message = (attempts = 1) => {
    const m = {
      body: body(),
      attempts,
      acked: false,
      retried: undefined as { delaySeconds?: number } | undefined,
      ack() {
        m.acked = true;
      },
      retry(options?: { delaySeconds?: number }) {
        m.retried = options ?? {};
      },
    };
    return m;
  };
  const withToken = { ...env, SPLIT_BOT_TOKEN: 'split-token' } as never;
  /** Telegram answers sendPhoto with `failure` (or the stub's success when undefined). */
  const telegram =
    (failure?: { error_code: number; description: string; retry_after?: number }) =>
    async (url: RequestInfo | URL, init?: RequestInit) => {
      if (failure && String(url).endsWith('/sendPhoto')) {
        return new Response(
          JSON.stringify({
            ok: false,
            error_code: failure.error_code,
            description: failure.description,
            ...(failure.retry_after ? { parameters: { retry_after: failure.retry_after } } : {}),
          }),
          { status: failure.error_code }
        );
      }
      return stub.fetch(String(url), init);
    };

  it('posts the QR as a PNG, acks it and counts it', async () => {
    const before = await new D1UsageRepository(env.paynow_db).splitSnapshot();
    const m = message();
    await handleSplitQrBatch({ messages: [m] }, withToken, telegram() as typeof fetch);
    expect(m.acked).toBe(true);
    expect(m.retried).toBeUndefined();
    expect(stub.sentPhotos).toHaveLength(1);
    expect(stub.sentPhotos[0]).toMatchObject({ chatId: '-42', filename: 'paynow-qr.png' });
    expect(stub.sentPhotos[0]!.caption).toBe('SGD 30.00\nBob');
    const after = await new D1UsageRepository(env.paynow_db).splitSnapshot();
    expect(after.qrs.chat - before.qrs.chat).toBe(1);
  });

  it('waits as long as Telegram asks after a 429', async () => {
    const m = message();
    await handleSplitQrBatch(
      { messages: [m] },
      withToken,
      telegram({
        error_code: 429,
        description: 'Too Many Requests: retry after 7',
        retry_after: 7,
      }) as typeof fetch
    );
    expect(m.retried).toEqual({ delaySeconds: 7 });
    expect(m.acked).toBe(false);
  });

  it('backs off after another temporary error', async () => {
    const m = message(2);
    await handleSplitQrBatch(
      { messages: [m] },
      withToken,
      telegram({ error_code: 500, description: 'Internal Server Error' }) as typeof fetch
    );
    expect(m.retried).toEqual({ delaySeconds: 4 });
  });

  it('gives up for good when the bot was removed from the chat', async () => {
    const m = message();
    await handleSplitQrBatch(
      { messages: [m] },
      withToken,
      telegram({ error_code: 403, description: 'Forbidden: bot was kicked' }) as typeof fetch
    );
    expect(m.acked).toBe(true);
    expect(m.retried).toBeUndefined();
    expect(stub.sentMessages).toHaveLength(0); // no notice either: it could not be posted
  });

  it('after the last attempt, stops and names the QR in the chat, logging no QR data', async () => {
    const errors: string[] = [];
    vi.spyOn(console, 'error').mockImplementation((...args) => void errors.push(args.join(' ')));
    const m = message(5);
    await handleSplitQrBatch(
      { messages: [m] },
      withToken,
      telegram({ error_code: 500, description: 'Internal Server Error' }) as typeof fetch
    );
    expect(m.acked).toBe(true);
    expect(m.retried).toBeUndefined();
    expect(stub.lastText()).toBe(
      'Could not send the QR for SGD 30.00 Bob. Please send /split_even or /split_custom to try again.'
    );
    expect(errors.join('\n')).toContain('500');
    expect(errors.join('\n')).not.toContain('91234567');
    expect(errors.join('\n')).not.toContain('Bob');
  });
});
