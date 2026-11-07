import { env } from 'cloudflare:test';
import { beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { createBot } from '../../src/bot';
import { D1Repository } from '../../src/db/drizzle-repository';
import type { Env as WorkerEnv } from '../../src/env';
import {
  applyTestSchema,
  callbackUpdate,
  TEST_BOT_INFO,
  TelegramStub,
  textUpdate,
} from './harness';

/**
 * Wiring test for the production bot factory (src/bot.ts): commands, inline
 * button callbacks, free-text conversation routing, /cancel, and the idle
 * fallback — all driven through createBot(env) with the harness stubs, so the
 * routing table itself is verified, not just the individual handlers.
 */

beforeAll(async () => {
  await applyTestSchema(env.DB);
});

const T0 = '2024-01-01T00:00:00Z';
const stub = new TelegramStub();

beforeEach(() => {
  stub.reset();
});

function makeWiredBot() {
  const bot = createBot(env as unknown as WorkerEnv, {
    botInfo: TEST_BOT_INFO,
    client: { fetch: stub.fetch },
  });
  const repo = new D1Repository(env.DB);
  return { bot, repo };
}

async function readDoFlow(userId: number): Promise<string> {
  const doStub = env.CHAT_SESSION.get(env.CHAT_SESSION.idFromName(`chat-${userId}`));
  const res = await doStub.fetch(new Request('http://localhost/state', { method: 'GET' }));
  const state = (await res.json()) as { flow: string };
  return state.flow;
}

async function seedPayment(
  repo: D1Repository,
  userId: number,
  ref: string,
  amountCents: number,
  status: 'pending' | 'received'
) {
  return repo.createPayment({
    ref,
    userId,
    description: 'Wiring payment',
    amountCents,
    payeeType: 'mobile',
    payeeValue: '+6591234567',
    status,
    source: 'manual',
    qrPayload: '000201010212WIRING6304ABCD',
    timestamp: T0,
  });
}

describe('bot wiring (src/bot.ts)', () => {
  it('/init conversation persists the payee, unlocks /start, then /cancel aborts', async () => {
    const userId = 800000001;
    const { bot, repo } = makeWiredBot();

    await bot.handleUpdate(textUpdate(userId, '/init'));
    expect(stub.lastText()).toContain('set up your PayNow reference');

    await bot.handleUpdate(textUpdate(userId, '91234567'));
    expect(stub.lastText()).toContain('+6591234567');

    await bot.handleUpdate(textUpdate(userId, 'confirm'));
    expect(stub.lastText()).toContain('reference has been saved');

    // users row persisted
    const user = await repo.getUser(userId);
    expect(user).not.toBeNull();
    expect(user!.payeeValue).toBe('+6591234567');
    expect(await readDoFlow(userId)).toBe('idle');

    // /start now passes the 5.1 guard
    await bot.handleUpdate(textUpdate(userId, '/start'));
    expect(stub.lastText()).toContain('Enter a short description');

    // /cancel resets the active start flow
    await bot.handleUpdate(textUpdate(userId, '/cancel'));
    expect(stub.lastText()).toContain('Conversation cancelled');
    expect(await readDoFlow(userId)).toBe('idle');
  });

  it('/payments renders the list with inline buttons', async () => {
    const userId = 800000002;
    const { bot, repo } = makeWiredBot();
    await repo.upsertUser({
      telegramId: userId,
      payeeType: 'mobile',
      payeeValue: '+6591234567',
      displayName: 'Wiring User',
      timestamp: T0,
    });
    await seedPayment(repo, userId, 'WIRE-002', 1250, 'pending');

    await bot.handleUpdate(textUpdate(userId, '/payments'));

    const listReply = stub.sentMessages[stub.sentMessages.length - 1]!;
    expect(listReply.text).toContain('WIRE-002');
    expect(listReply.text).toContain('$12.50');

    const keyboard = listReply.replyMarkup as
      | {
          inline_keyboard?: Array<Array<{ text: string; callback_data?: string }>>;
        }
      | undefined;
    expect(keyboard?.inline_keyboard).toBeDefined();
    const flattened = (keyboard!.inline_keyboard ?? []).flat();
    expect(flattened.some((b) => b.callback_data === 'view:WIRE-002')).toBe(true);
    expect(flattened.some((b) => b.callback_data === 'mark_received:WIRE-002')).toBe(true);
    expect(flattened.some((b) => b.callback_data === 'payback:WIRE-002')).toBe(true);
  });

  it('callback_query mark_received transitions the payment through the wired bot', async () => {
    const userId = 800000003;
    const { bot, repo } = makeWiredBot();
    await repo.upsertUser({
      telegramId: userId,
      payeeType: 'mobile',
      payeeValue: '+6591234567',
      displayName: 'Wiring User',
      timestamp: T0,
    });
    await seedPayment(repo, userId, 'WIRE-003', 2500, 'pending');

    await bot.handleUpdate(callbackUpdate(userId, 'mark_received:WIRE-003'));

    expect(stub.callbackAnswers).toContain('✅ Payment marked as received!');
    expect(stub.editedMessages).toHaveLength(1);
    const payment = await repo.getPaymentByRef('WIRE-003');
    expect(payment!.status).toBe('received');
    expect(payment!.receivedAt).not.toBeNull();
  });

  it('callback_query view shows payment details', async () => {
    const userId = 800000004;
    const { bot, repo } = makeWiredBot();
    await repo.upsertUser({
      telegramId: userId,
      payeeType: 'mobile',
      payeeValue: '+6591234567',
      displayName: 'Wiring User',
      timestamp: T0,
    });
    await seedPayment(repo, userId, 'WIRE-004', 990, 'pending');

    await bot.handleUpdate(callbackUpdate(userId, 'view:WIRE-004'));

    expect(stub.callbackAnswers).toContain('📋 Payment details loaded');
    expect(stub.editedMessages[0]!.text).toContain('Payment Details');
    expect(stub.editedMessages[0]!.text).toContain('WIRE-004');
  });

  it('callback for another user\u2019s payment is rejected', async () => {
    const ownerId = 800000005;
    const intruderId = 800000006;
    const { bot, repo } = makeWiredBot();
    await repo.upsertUser({
      telegramId: ownerId,
      payeeType: 'mobile',
      payeeValue: '+6591234567',
      displayName: 'Owner',
      timestamp: T0,
    });
    await seedPayment(repo, ownerId, 'WIRE-005', 500, 'pending');

    await bot.handleUpdate(callbackUpdate(intruderId, 'mark_received:WIRE-005'));

    expect(stub.callbackAnswers).toContain('❌ You do not own this payment');
    const payment = await repo.getPaymentByRef('WIRE-005');
    expect(payment!.status).toBe('pending'); // unchanged
  });

  it('/payback without an argument shows usage; /payback <ref> starts the flow', async () => {
    const userId = 800000007;
    const { bot, repo } = makeWiredBot();
    await repo.upsertUser({
      telegramId: userId,
      payeeType: 'mobile',
      payeeValue: '+6591234567',
      displayName: 'Wiring User',
      timestamp: T0,
    });
    await seedPayment(repo, userId, 'WIRE-007', 1250, 'received');

    await bot.handleUpdate(textUpdate(userId, '/payback'));
    expect(stub.lastText()).toContain('Please provide a payment reference');

    await bot.handleUpdate(textUpdate(userId, '/payback WIRE-007'));
    expect(stub.lastText()).toContain('Payback for Payment');
    expect(stub.lastText()).toContain('WIRE-007');
    expect(await readDoFlow(userId)).toBe('payback');

    await bot.handleUpdate(textUpdate(userId, '/cancel'));
    expect(await readDoFlow(userId)).toBe('idle');
  });

  it('free text outside any flow gets the idle fallback hint', async () => {
    const userId = 800000008;
    const { bot } = makeWiredBot();

    await bot.handleUpdate(textUpdate(userId, 'just chatting'));

    expect(stub.lastText()).toContain('No active conversation');
  });

  it('/ping still answers and /help lists the commands', async () => {
    const userId = 800000009;
    const { bot } = makeWiredBot();

    await bot.handleUpdate(textUpdate(userId, '/ping'));
    expect(stub.lastText()).toContain('pong');

    await bot.handleUpdate(textUpdate(userId, '/help'));
    expect(stub.lastText()).toContain('/payback');
    expect(stub.lastText()).toContain('/payments');
  });

  it('detail view renders Mark-sent buttons; tapping transitions the payback and re-renders (task 7.4)', async () => {
    const userId = 800000010;
    const { bot, repo } = makeWiredBot();
    await repo.upsertUser({
      telegramId: userId,
      payeeType: 'mobile',
      payeeValue: '+6591234567',
      displayName: 'Wiring User',
      timestamp: T0,
    });
    const payment = await seedPayment(repo, userId, 'WIRE-010', 10000, 'received');
    await repo.createPayback({
      ref: 'WIRE-PB-010',
      paymentId: payment.id,
      payerType: 'mobile',
      payerValue: '+6598765432',
      amountCents: 2500,
      status: 'pending',
      qrPayload: 'payback-payload',
      timestamp: T0,
    });

    // 1. Open the detail view — pending payback gets a Mark-sent button
    await bot.handleUpdate(callbackUpdate(userId, 'view:WIRE-010'));
    const view = stub.editedMessages[0]!;
    expect(view.text).toContain('💸 *Paybacks:*');
    expect(view.text).toContain('⏳ $25.00 to +6598765432');
    const buttons = view.replyMarkup?.inline_keyboard.flat() ?? [];
    expect(buttons).toHaveLength(1);
    expect(buttons[0]!.callback_data).toBe('pb_sent:WIRE-010:WIRE-PB-010');

    // 2. Tap "Mark sent"
    await bot.handleUpdate(callbackUpdate(userId, 'pb_sent:WIRE-010:WIRE-PB-010'));
    expect(stub.callbackAnswers).toContain('✅ Payback marked as sent');

    // 3. DB transition + timestamp recorded
    const row = await repo.getPaybackByRef('WIRE-PB-010');
    expect(row!.status).toBe('sent');
    expect(row!.sentAt).toMatch(/^\d{4}-\d{2}-\d{2}T/);
    // Sent paybacks still count toward the bound
    expect(await repo.sumPaybacks(payment.id)).toBe(2500);

    // 4. Re-rendered detail: sent marker + timestamp, remaining refreshed,
    //    no stale buttons
    const refresh = stub.editedMessages[1]!;
    expect(refresh.text).toContain('✅ $25.00 to +6598765432');
    expect(refresh.text).toContain('(sent');
    expect(refresh.text).toContain('*Remaining:* $75.00');
    expect(refresh.replyMarkup?.inline_keyboard.flat() ?? []).toHaveLength(0);

    // 5. Duplicate tap is refused and changes nothing
    await bot.handleUpdate(callbackUpdate(userId, 'pb_sent:WIRE-010:WIRE-PB-010'));
    expect(stub.callbackAnswers).toContain('⚠️ Payback already marked as sent');
    expect(stub.editedMessages).toHaveLength(2);
  });
});
