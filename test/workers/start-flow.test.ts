import { env } from 'cloudflare:test';
import { Bot } from 'grammy';
import jsQR from 'jsqr';
import { beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { StartCommandHandler } from '../../src/commands/start-handler';
import { D1EventRepository, D1Repository } from '../../src/db/drizzle-repository';
import type { ConversationDO } from '../../src/worker/conversation-do';
import {
  applyTestSchema,
  bmpToRgba,
  callbackUpdate,
  TEST_BOT_INFO,
  TelegramStub,
  textUpdate,
} from './harness';

/**
 * Task 5.3 stage (a): end-to-end /start flow inside the Workers runtime with
 * real bindings — D1 (Drizzle riding env.paynow_db), the per-chat conversation DO
 * (real FSM via the CHAT_SESSION binding), and grammY with a stubbed client
 * fetch capturing the outbound sendPhoto.
 *
 * Verifies per task text:
 * - captured photo bytes decode back to the stored payload (jsQR round-trip of
 *   the isolate-rendered QR)
 * - caption = `description / SGD amount / ref / "Forward this message to share"`
 * - the payment row is persisted (status pending, payee snapshot, base32 ref)
 * Plus the 5.1 guard, 5.2 mid-flow /cancel, and the 5.4 payee-snapshot
 * immutability check on the same live path.
 */

beforeAll(async () => {
  await applyTestSchema(env.paynow_db);
});

const T0 = '2024-01-01T00:00:00Z';
const stub = new TelegramStub();

beforeEach(() => {
  stub.reset();
});

function makeStub(userId: number) {
  const repo = new D1Repository(env.paynow_db);
  const eventRepo = new D1EventRepository(env.paynow_db);
  const doStub = env.CHAT_SESSION.get(env.CHAT_SESSION.idFromName(`chat-${userId}`));
  const handler = new StartCommandHandler(doStub as unknown as ConversationDO, repo, eventRepo);

  const bot = new Bot('test-secret-token', {
    botInfo: TEST_BOT_INFO,
    client: { fetch: stub.fetch },
  });
  bot.command('start', (ctx) => handler.start(ctx));
  bot.command('cancel', (ctx) => handler.cancel(ctx));
  // Return the promise (not `void`) so grammY awaits DO/DB work before the update completes
  bot.on('message:text', (ctx) => {
    return handler.handleInput(ctx) as Promise<void>;
  });
  bot.on('callback_query:data', async (ctx) => {
    await handler.handleCallback(ctx);
  });

  return { repo, handler, bot };
}

async function seedEvent(
  _repo: D1Repository,
  chatId: number,
  name: string = 'Dinner split'
): Promise<any> {
  // Need to use the event repository
  const eventRepo = new D1EventRepository(env.paynow_db);
  const ref = `EVT-${chatId}-${Math.random().toString(36).slice(2, 8)}`;
  return eventRepo.createEvent({
    ref,
    chatId,
    topicId: 0,
    name,
    payeeType: 'mobile',
    payeeValue: '+6591234567',
    status: 'open',
    timestamp: T0,
  });
}

/** Read the DO conversation state directly through the binding. */
async function readDoFlow(userId: number): Promise<string> {
  const stubDo = env.CHAT_SESSION.get(env.CHAT_SESSION.idFromName(`chat-${userId}`));
  const res = await stubDo.fetch(new Request('http://localhost/state', { method: 'GET' }));
  const state = (await res.json()) as { flow: string };
  return state.flow;
}

describe('/start end-to-end (task 5.3 stage a)', () => {
  it('prompts when no open events exist', async () => {
    const userId = 500000200;
    const { repo, bot } = makeStub(userId);

    await bot.handleUpdate(textUpdate(userId, '/start'));

    expect(stub.sentPhotos).toHaveLength(0);
    expect(stub.lastText()).toContain('No open events');

    // No payment created, conversation left idle
    expect(await repo.listPaymentsByUser(userId)).toHaveLength(0);
    expect(await readDoFlow(userId)).toBe('idle');
  });

  it('/start → amount creates the payment and uploads a decodable QR (5.3)', async () => {
    const userId = 500000100;
    const { repo, bot } = makeStub(userId);
    await seedEvent(repo, userId);

    await bot.handleUpdate(textUpdate(userId, '/start'));
    expect(stub.lastText()).toContain("payer's PayNow");

    await bot.handleUpdate(textUpdate(userId, '91234568'));
    await bot.handleUpdate(textUpdate(userId, 'Alice'));
    expect(stub.lastText()).toContain('Enter the amount');

    await bot.handleUpdate(textUpdate(userId, '12.50'));

    // Summary first: nothing persisted and no QR until Confirm
    expect(stub.lastText()).toContain('Confirm payment request');
    expect(stub.lastText()).toContain('Payer: Alice (+6591234568)');
    expect(stub.lastText()).toContain('Pay to: +6591234567');
    expect(stub.lastText()).toContain('Amount: SGD 12.50');
    expect(stub.sentPhotos).toHaveLength(0);
    expect(await repo.listPaymentsByUser(userId)).toHaveLength(0);

    await bot.handleUpdate(callbackUpdate(userId, 'start_confirm'));
    expect(stub.editedMessages.at(-1)!.text).toContain('✅ Confirmed');

    // --- outbound sendPhoto captured --------------------------------------
    expect(stub.sentPhotos).toHaveLength(1);
    const photo = stub.sentPhotos[0]!;
    expect(photo.chatId).toBe(String(userId));
    expect(photo.filename).toBe('paynow-qr.bmp');
    expect(photo.bytes[0]).toBe(0x42);
    expect(photo.bytes[1]).toBe(0x4d);

    // Caption: description / SGD amount / ref / share hint
    const captionParts = photo.caption.split(' / ');
    expect(captionParts[0]).toBe('Dinner split');
    expect(captionParts[1]).toBe('SGD 12.50');
    expect(captionParts[2]).toMatch(/^[A-Z2-7]{10}$/);
    // Payer name (never the number) sits after the ref; the hint follows
    expect(captionParts[3]).toBe('Payer: Alice');
    expect(captionParts[4]).toBe('Forward this message to share');
    const ref = captionParts[2]!;

    // --- QR bytes decode back via jsQR (2.4 path) --------------------------
    const { data, width, height } = bmpToRgba(photo.bytes);
    const decoded = jsQR(data, width, height);
    expect(decoded).not.toBeNull();
    const payload = decoded!.data;

    // Fixed-amount QR with the payee proxy, ref, and amount embedded
    expect(payload).toContain('000201010212'); // PFI + dynamic initiation
    expect(payload).toContain('SG.PAYNOW');
    expect(payload).toContain('+6591234567'); // payee proxy
    expect(payload).toContain('03010'); // 26.03=0 amount not editable
    expect(payload).toContain('540512.50'); // tag 54 amount
    expect(payload).toContain(ref); // 26.05 embedded reference

    // --- the persisted payment row matches the delivered QR ---------------
    const payment = await repo.getPaymentByRef(ref);
    expect(payment).not.toBeNull();
    expect(payment!.qrPayload).toBe(payload); // uploaded QR == stored payload
    expect(payment!.status).toBe('pending');
    expect(payment!.source).toBe('manual');
    expect(payment!.amountCents).toBe(1250);
    expect(payment!.payerType).toBe('mobile');
    expect(payment!.payerValue).toBe('+6591234568');
    expect(payment!.payerName).toBe('Alice');
    expect(captionParts.join(' ')).not.toContain('91234568');
    expect(payment!.userId).toBe(userId);
    expect(payment!.description).toBe('Dinner split');
    expect(payment!.eventId).not.toBeNull();
    expect(payment!.payeeType).toBe('mobile');
    expect(payment!.payeeValue).toBe('+6591234567');
    expect(await repo.listPaymentsByUser(userId)).toHaveLength(1);

    // Conversation reset to idle; inline buttons attached to the QR photo
    expect(await readDoFlow(userId)).toBe('idle');
    const photoKeyboard = (
      photo.replyMarkup as {
        inline_keyboard: Array<Array<{ text: string; callback_data?: string }>>;
      }
    ).inline_keyboard;
    const flat = (photoKeyboard ?? []).flat();
    const byText = Object.fromEntries(flat.map((b) => [b.text, b.callback_data]));
    expect(byText['✓ Received']).toBe(`mark_received:${ref}`);
    expect(byText['✖ Void']).toBe(`void:${ref}`);
    expect(Object.keys(byText)).toEqual(['✓ Received', '✖ Void']); // no Payback on a /start QR
  });

  it('re-prompts an invalid amount and creates nothing, then completes on a valid one', async () => {
    const userId = 500000150;
    const { repo, bot } = makeStub(userId);
    await seedEvent(repo, userId);

    await bot.handleUpdate(textUpdate(userId, '/start'));
    await bot.handleUpdate(textUpdate(userId, '91234568'));
    await bot.handleUpdate(callbackUpdate(userId, 'start_skip_name'));
    await bot.handleUpdate(textUpdate(userId, '12.505'));

    expect(stub.lastText()).toContain('Invalid amount');
    expect(stub.sentPhotos).toHaveLength(0);
    expect(await repo.listPaymentsByUser(userId)).toHaveLength(0);

    await bot.handleUpdate(textUpdate(userId, '4.00'));
    await bot.handleUpdate(callbackUpdate(userId, 'start_confirm'));
    expect(stub.sentPhotos).toHaveLength(1);
    expect(await repo.listPaymentsByUser(userId)).toHaveLength(1);
  });

  it('rejects an invalid payer, then stores NULL name when skipped', async () => {
    const userId = 500000160;
    const { repo, bot } = makeStub(userId);
    await seedEvent(repo, userId);

    await bot.handleUpdate(textUpdate(userId, '/start'));
    await bot.handleUpdate(textUpdate(userId, 'abc'));
    expect(stub.lastText()).toContain('Invalid PayNow reference');

    await bot.handleUpdate(textUpdate(userId, '91234568'));
    await bot.handleUpdate(callbackUpdate(userId, 'start_skip_name'));
    await bot.handleUpdate(textUpdate(userId, '4.00'));
    await bot.handleUpdate(callbackUpdate(userId, 'start_confirm'));

    const ref = stub.sentPhotos[0]!.caption.split(' / ')[2]!;
    const payment = await repo.getPaymentByRef(ref);
    expect(payment!.payerValue).toBe('+6591234568');
    expect(payment!.payerName).toBeNull();
    // No name ⇒ caption has no payer segment (identical to the pre-name format)
    expect(stub.sentPhotos[0]!.caption).toBe(
      `Dinner split / SGD 4.00 / ${ref} / Forward this message to share`
    );
  });

  it('/cancel mid-flow ends the conversation and writes nothing (5.2)', async () => {
    const userId = 500000300;
    const { repo, bot } = makeStub(userId);
    await seedEvent(repo, userId);

    await bot.handleUpdate(textUpdate(userId, '/start'));
    await bot.handleUpdate(textUpdate(userId, '91234568'));
    await bot.handleUpdate(textUpdate(userId, '/cancel'));

    expect(stub.lastText()).toContain('Start cancelled. No payment was created.');
    expect(stub.sentPhotos).toHaveLength(0);
    expect(await repo.listPaymentsByUser(userId)).toHaveLength(0);
    expect(await readDoFlow(userId)).toBe('idle');

    // Late amount input after cancel creates nothing (flow ended)
    await bot.handleUpdate(textUpdate(userId, '8.00'));
    expect(await repo.listPaymentsByUser(userId)).toHaveLength(0);
    expect(stub.sentPhotos).toHaveLength(0);
  });
});

describe('/start confirmation step (end-to-end)', () => {
  /** Drive /start up to the summary (single event, payer + skipped name, given amount). */
  async function toSummary(userId: number, amount = '12.50') {
    const ctxs = makeStub(userId);
    const event = await seedEvent(ctxs.repo, userId);
    await ctxs.bot.handleUpdate(textUpdate(userId, '/start'));
    await ctxs.bot.handleUpdate(textUpdate(userId, '91234568'));
    await ctxs.bot.handleUpdate(callbackUpdate(userId, 'start_skip_name'));
    await ctxs.bot.handleUpdate(textUpdate(userId, amount));
    return { ...ctxs, event };
  }

  it('double Confirm (concurrent taps) creates exactly one payment and one QR', async () => {
    const userId = 500000500;
    const { repo, bot } = await toSummary(userId);
    expect(stub.sentPhotos).toHaveLength(0);

    await Promise.all([
      bot.handleUpdate(callbackUpdate(userId, 'start_confirm', 500, 10)),
      bot.handleUpdate(callbackUpdate(userId, 'start_confirm', 500, 11)),
      bot.handleUpdate(callbackUpdate(userId, 'start_confirm', 500, 12)),
    ]);

    expect(await repo.listPaymentsByUser(userId)).toHaveLength(1);
    expect(stub.sentPhotos).toHaveLength(1);
    expect(stub.callbackAnswers.filter((t) => t.includes('Already processed'))).toHaveLength(2);
  });

  it('Cancel button creates nothing and a later Confirm is rejected', async () => {
    const userId = 500000510;
    const { repo, bot } = await toSummary(userId);

    await bot.handleUpdate(callbackUpdate(userId, 'start_cancel'));
    expect(stub.editedMessages.at(-1)!.text).toBe('❌ Start cancelled. No payment was created.');
    expect(await readDoFlow(userId)).toBe('idle');

    await bot.handleUpdate(callbackUpdate(userId, 'start_confirm'));
    expect(stub.callbackAnswers.at(-1)).toContain('Already processed or expired');
    expect(await repo.listPaymentsByUser(userId)).toHaveLength(0);
    expect(stub.sentPhotos).toHaveLength(0);
  });

  it('typed cancel at the summary creates nothing; other text is nudged', async () => {
    const userId = 500000520;
    const { repo, bot } = await toSummary(userId);

    await bot.handleUpdate(textUpdate(userId, '99'));
    expect(stub.lastText()).toContain('tap Confirm or Cancel');
    expect(await readDoFlow(userId)).toBe('start');

    await bot.handleUpdate(textUpdate(userId, 'cancel'));
    expect(stub.lastText()).toContain('Start cancelled');
    expect(await repo.listPaymentsByUser(userId)).toHaveLength(0);
    expect(stub.sentPhotos).toHaveLength(0);
  });

  it('Confirm after the event was closed creates nothing', async () => {
    const userId = 500000530;
    const { repo, bot, event } = await toSummary(userId);
    await new D1EventRepository(env.paynow_db).closeEvent(event.ref, T0);

    await bot.handleUpdate(callbackUpdate(userId, 'start_confirm'));

    expect(stub.lastText()).toContain('event is closed');
    expect(await repo.listPaymentsByUser(userId)).toHaveLength(0);
    expect(stub.sentPhotos).toHaveLength(0);
  });
});

describe('payee snapshot immutability (task 5.4)', () => {
  it('a later /init rewrite leaves the stored payment row and qr_payload unchanged', async () => {
    const userId = 500000400;
    const { repo, bot } = makeStub(userId);
    await seedEvent(repo, userId, 'Team photo');

    // Collect a payment via the live /start flow
    await bot.handleUpdate(textUpdate(userId, '/start'));
    await bot.handleUpdate(textUpdate(userId, '91234568'));
    await bot.handleUpdate(callbackUpdate(userId, 'start_skip_name'));
    await bot.handleUpdate(textUpdate(userId, '25.00'));
    await bot.handleUpdate(callbackUpdate(userId, 'start_confirm'));
    expect(stub.sentPhotos).toHaveLength(1);
    const ref = stub.sentPhotos[0]!.caption.split(' / ')[2]!;

    const before = await repo.getPaymentByRef(ref);
    expect(before).not.toBeNull();

    // Simulate re-running /init: persist a new payee for the same user
    await repo.upsertUser({
      telegramId: userId,
      payeeType: 'uen',
      payeeValue: '201234567B',
      displayName: 'Renamed User',
      timestamp: '2024-02-02T00:00:00Z',
    });

    // The users row changed…
    const updatedUser = await repo.getUser(userId);
    expect(updatedUser!.payeeType).toBe('uen');
    expect(updatedUser!.payeeValue).toBe('201234567B');

    // …but the payment keeps its snapshot: payee columns and embedded payload
    // are byte-for-byte identical
    const after = await repo.getPaymentByRef(ref);
    expect(after!.payeeType).toBe('mobile');
    expect(after!.payeeValue).toBe('+6591234567');
    expect(after!.qrPayload).toBe(before!.qrPayload);
    expect(after!.amountCents).toBe(2500);
    expect(after!.description).toBe('Team photo');
    expect(after!.ref).toBe(ref);

    // And the payload still encodes the ORIGINAL payee + merchant name
    expect(after!.qrPayload).toContain('+6591234567');
    expect(after!.qrPayload).toContain('Team photo');
    expect(after!.qrPayload).not.toContain('201234567B');
    expect(after!.qrPayload).not.toContain('Renamed User');
  });
});
