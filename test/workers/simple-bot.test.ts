import { env } from 'cloudflare:test';
import jsQR from 'jsqr';
import { beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { createSimpleBot } from '../../src/simple-bot';
import worker from '../../src/worker';
import type { ConversationDO } from '../../src/worker/conversation-do';
import {
  applyTestSchema,
  bmpToRgba,
  callbackUpdate,
  groupTextUpdate,
  TEST_BOT_INFO,
  TelegramStub,
  textUpdate,
} from './harness';

const stub = new TelegramStub();
let uid = 7000;
let upd = 1;

beforeAll(async () => {
  await applyTestSchema(env.paynow_db);
});
beforeEach(() => stub.reset());

function bot() {
  return createSimpleBot(env, 'simple-token', {
    botInfo: TEST_BOT_INFO,
    client: { fetch: stub.fetch },
  });
}
const say = (b: ReturnType<typeof bot>, user: number, text: string) =>
  b.handleUpdate(textUpdate(user, text, upd++));
const tap = (b: ReturnType<typeof bot>, user: number, data: string) =>
  b.handleUpdate(callbackUpdate(user, data, 500, upd++));

function peek(key: string) {
  const s = env.CHAT_SESSION.get(env.CHAT_SESSION.idFromName(key)) as unknown as ConversationDO;
  return s.fetch(new Request('http://localhost/peek')).then((r) => r.json()) as Promise<{
    flow: string;
    step: number;
    context: Record<string, unknown>;
  }>;
}

function decode() {
  expect(stub.sentPhotos).toHaveLength(1);
  const photo = stub.sentPhotos[0]!;
  const { data, width, height } = bmpToRgba(photo.bytes);
  const result = jsQR(data, width, height);
  expect(result).not.toBeNull();
  return { payload: result!.data, caption: photo.caption };
}

async function rows(): Promise<number> {
  let n = 0;
  for (const t of ['users', 'events', 'payments', 'paybacks']) {
    const r = await env.paynow_db.prepare(`SELECT COUNT(*) AS n FROM ${t}`).first<{ n: number }>();
    n += r?.n ?? 0;
  }
  return n;
}

describe('Simple_PayNow_Bot conversation', () => {
  it('full run, payer may not change: fixed amount, description, no payee number in the caption', async () => {
    const u = uid++;
    const b = bot();
    const before = await rows();
    await say(b, u, '/start');
    expect(stub.lastText()).toContain('Who should be paid');
    await say(b, u, '91234567');
    expect(stub.lastText()).toContain('How much');
    await say(b, u, '12.50');
    expect(stub.lastText()).toContain('Can the payer change the amount?');
    await tap(b, u, 'simple_edit_no');
    expect(stub.lastText()).toContain('short description');
    await say(b, u, 'Lunch');

    // the summary shows every answer (payee number included) and no QR exists yet
    expect(stub.sentPhotos).toHaveLength(0);
    const summary = stub.lastText();
    expect(summary).toContain('Payee: Mobile +6591234567');
    expect(summary).toContain('Amount: SGD 12.50');
    expect(summary).toContain('Payer can change the amount: No');
    expect(summary).toContain('Description: Lunch');
    expect(
      stub.sentMessages
        .at(-1)
        ?.replyMarkup?.inline_keyboard.flat()
        .map((k) => k.callback_data)
    ).toEqual(['simple_confirm', 'simple_cancel']);
    await tap(b, u, 'simple_confirm');

    const { payload, caption } = decode();
    expect(payload).toContain('+6591234567');
    expect(payload).toContain('540512.50');
    expect(payload).toContain('03010'); // not editable
    expect(payload).toContain('Lunch');
    expect(caption).toContain('Lunch');
    expect(caption).toContain('SGD 12.50');
    expect(caption).not.toContain('91234567');
    // nothing kept: state wiped, no rows written
    const after = await peek(`simple-${u}`);
    expect(after.flow).toBe('idle');
    expect(after.context).toEqual({});
    expect(await rows()).toBe(before);
  });

  it('payer may change: editable flag set and the amount is still in the QR', async () => {
    const u = uid++;
    const b = bot();
    await say(b, u, '/start');
    await say(b, u, '201234567A');
    await say(b, u, '5');
    await tap(b, u, 'simple_edit_yes');
    await tap(b, u, 'simple_skip_description');
    expect(stub.lastText()).toContain('Payer can change the amount: Yes');
    expect(stub.lastText()).toContain('Description: none');
    await tap(b, u, 'simple_confirm');
    const { payload, caption } = decode();
    expect(payload).toContain('03011');
    expect(payload).toContain('54045.00');
    expect(caption).toContain('payer can change');
    expect(caption).not.toContain('Lunch');
  });

  it('amount skipped: no "can the payer change" question, QR left to the payer', async () => {
    const u = uid++;
    const b = bot();
    await say(b, u, '/start');
    await say(b, u, '91234567');
    await tap(b, u, 'simple_skip_amount');
    expect(stub.lastText()).toContain('short description');
    expect(stub.lastText()).not.toContain('change the amount');
    await tap(b, u, 'simple_skip_description');
    expect(stub.lastText()).toContain('Amount: set by payer');
    expect(stub.lastText()).not.toContain('Payer can change');
    await tap(b, u, 'simple_confirm');
    const { payload, caption } = decode();
    expect(payload).toContain('03011');
    expect(payload).not.toContain('Lunch');
    expect(caption).toContain('Amount: set by payer');
  });

  it('re-asks on invalid payee, amount and over-long description without moving on', async () => {
    const u = uid++;
    const b = bot();
    await say(b, u, '/start');
    await say(b, u, 'hello');
    expect(stub.lastText()).toContain('not a valid payee');
    expect((await peek(`simple-${u}`)).step).toBe(1);
    await say(b, u, '91234567');
    await say(b, u, '-3');
    expect(stub.lastText()).toContain('positive amount');
    expect((await peek(`simple-${u}`)).step).toBe(2);
    await say(b, u, '3');
    await tap(b, u, 'simple_edit_no');
    await say(b, u, 'x'.repeat(26));
    expect(stub.lastText()).toContain('25 characters');
    expect(stub.sentPhotos).toHaveLength(0);
    await say(b, u, 'x'.repeat(25));
    expect(stub.sentPhotos).toHaveLength(0); // confirmation first
    await tap(b, u, 'simple_confirm');
    expect(stub.sentPhotos).toHaveLength(1);
  });

  it('stale buttons are refused and a double tap makes one QR', async () => {
    const u = uid++;
    const b = bot();
    await say(b, u, '/start');
    await tap(b, u, 'simple_edit_yes'); // payee step: not this button's step
    expect(stub.callbackAnswers).toContain('That step is over.');
    await say(b, u, '91234567');
    await tap(b, u, 'simple_skip_amount');
    await tap(b, u, 'simple_skip_description');
    await tap(b, u, 'simple_skip_description'); // the step is over now
    expect(stub.callbackAnswers.filter((a) => a === 'That step is over.')).toHaveLength(2);
    await Promise.all([tap(b, u, 'simple_confirm'), tap(b, u, 'simple_confirm')]);
    expect(stub.sentPhotos).toHaveLength(1);
  });

  it('Cancel on the summary generates nothing and clears the state; text there changes nothing', async () => {
    const u = uid++;
    const b = bot();
    await say(b, u, '/start');
    await say(b, u, '91234567');
    await tap(b, u, 'simple_skip_amount');
    await tap(b, u, 'simple_skip_description');
    await say(b, u, 'hello');
    expect(stub.lastText()).toContain('tap Confirm or Cancel');
    expect((await peek(`simple-${u}`)).step).toBe(5);
    await tap(b, u, 'simple_cancel');
    expect(stub.lastText()).toContain('Nothing was created');
    expect(stub.sentPhotos).toHaveLength(0);
    const after = await peek(`simple-${u}`);
    expect(after.flow).toBe('idle');
    expect(after.context).toEqual({});
    await tap(b, u, 'simple_confirm'); // stale button after cancel
    expect(stub.callbackAnswers).toContain('That step is over.');
    expect(stub.sentPhotos).toHaveLength(0);
  });

  it('/cancel clears the conversation', async () => {
    const u = uid++;
    const b = bot();
    await say(b, u, '/start');
    await say(b, u, '91234567');
    await say(b, u, '/cancel');
    expect((await peek(`simple-${u}`)).flow).toBe('idle');
    expect(stub.sentPhotos).toHaveLength(0);
  });

  it("keeps its conversation apart from the event bot's key", async () => {
    const u = uid++;
    await say(bot(), u, '/start');
    expect((await peek(`simple-${u}`)).flow).toBe('simple');
    expect((await peek(`chat-${u}`)).flow).toBe('idle');
  });

  it('asks group users to message the bot directly and ignores other group messages', async () => {
    const b = bot();
    await b.handleUpdate(groupTextUpdate(-900, 5, '/start', undefined, upd++));
    expect(stub.lastText()).toContain('message me directly');
    stub.reset();
    await b.handleUpdate(groupTextUpdate(-900, 5, '91234567', undefined, upd++));
    expect(stub.sentMessages).toHaveLength(0);
  });
});

describe('POST /webhook/simple', () => {
  const call = (e: Record<string, unknown>, secret?: string) =>
    worker.fetch(
      new Request('https://x.test/webhook/simple', {
        method: 'POST',
        headers: secret ? { 'X-Telegram-Bot-Api-Secret-Token': secret } : {},
        body: '{}',
      }),
      { ...env, ...e } as never,
      {} as ExecutionContext
    );

  it('is 404 until configured, and 403 without the right secret', async () => {
    // .dev.vars may hold real values: blank them to test the unconfigured case
    expect(
      (await call({ SIMPLE_BOT_TOKEN: undefined, SIMPLE_WEBHOOK_SECRET: undefined })).status
    ).toBe(404);
    const cfg = { SIMPLE_BOT_TOKEN: 't', SIMPLE_WEBHOOK_SECRET: 's' };
    expect((await call(cfg)).status).toBe(403);
    expect((await call(cfg, 'wrong')).status).toBe(403);
    // the event bot's secret does not open the simple route
    expect((await call(cfg, env.TELEGRAM_WEBHOOK_SECRET)).status).toBe(403);
  });
});
