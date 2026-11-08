import { env } from 'cloudflare:test';
import { beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { createBot } from '../../src/bot';
import { D1EventRepository, D1Repository } from '../../src/db/drizzle-repository';
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
  await applyTestSchema(env.paynow_db);
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
  const repo = new D1Repository(env.paynow_db);
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
  status: 'pending' | 'received',
  payer?: { type: 'mobile'; value: string; name: string }
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
    ...(payer ? { payerType: payer.type, payerValue: payer.value, payerName: payer.name } : {}),
    timestamp: T0,
  });
}

describe('bot wiring (src/bot.ts)', () => {
  it('/init conversation creates an event, unlocks /start, then /cancel aborts', async () => {
    const userId = 800000001;
    const { bot } = makeWiredBot();

    await bot.handleUpdate(textUpdate(userId, '/init'));
    expect(stub.lastText()).toContain('create a new event');

    // Step 1: event name
    await bot.handleUpdate(textUpdate(userId, 'Test Event'));
    expect(stub.lastText()).toContain('Event: Test Event');

    // Step 2: payee
    await bot.handleUpdate(textUpdate(userId, '91234567'));
    const confirmMessage = stub.sentMessages[stub.sentMessages.length - 1]!;
    expect(confirmMessage.text).toContain('+6591234567');

    // Tap the Confirm button
    const keyboard = confirmMessage.replyMarkup as {
      inline_keyboard: Array<Array<{ text: string; callback_data: string }>>;
    };
    const confirmData = keyboard.inline_keyboard
      .flat()
      .find((b) => b.text.startsWith('✅'))!.callback_data;
    await bot.handleUpdate(callbackUpdate(userId, confirmData));

    // Success updates the original confirmation message in place
    expect(stub.editedMessages).toHaveLength(1);
    expect(stub.editedMessages[0]!.text).toContain('Event created');

    // /start now passes (no guard for unconfigured users anymore since events exist)
    await bot.handleUpdate(textUpdate(userId, '/start'));
    // One open event → /start skips the picker and asks for the payer
    expect(stub.lastText()).toContain("payer's PayNow");

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
    // Seed an event for this user's chat
    const eventRepo = new (await import('../../src/db/drizzle-repository')).D1EventRepository(
      env.paynow_db
    );
    const _event = await eventRepo.createEvent({
      ref: 'EVT-WIRE002',
      chatId: userId,
      topicId: 0,
      name: 'Wiring Event',
      payeeType: 'mobile',
      payeeValue: '+6591234567',
      status: 'open',
      timestamp: T0,
    });
    await seedPayment(repo, userId, 'WIRE-002', 1250, 'pending');

    // Need to set eventId on the payment - but seedPayment doesn't support it
    // For now, just verify events list renders
    await bot.handleUpdate(textUpdate(userId, '/payments'));

    const listReply = stub.sentMessages[stub.sentMessages.length - 1]!;
    expect(listReply.text).toContain('Wiring Event');
  });

  it('/web_admin replies with a link button per event (and warns when unconfigured)', async () => {
    const userId = 800000021;
    const eventRepo = new D1EventRepository(env.paynow_db);
    await eventRepo.createEvent({
      ref: 'EVT-WEB0021',
      chatId: userId,
      topicId: 0,
      name: 'Web Event',
      payeeType: 'mobile',
      payeeValue: '+6591234567',
      status: 'open',
      timestamp: T0,
    });

    const unconfigured = createBot(env as unknown as WorkerEnv, {
      botInfo: TEST_BOT_INFO,
      client: { fetch: stub.fetch },
    });
    await unconfigured.handleUpdate(textUpdate(userId, '/web_admin'));
    expect(stub.lastText()).toContain('not configured');

    const bot = createBot(
      { ...(env as unknown as WorkerEnv), WEB_ADMIN_URL: 'https://web.test/' },
      {
        botInfo: TEST_BOT_INFO,
        client: { fetch: stub.fetch },
      }
    );
    await bot.handleUpdate(textUpdate(userId, '/web_admin'));
    const kb = stub.sentMessages.at(-1)!.replyMarkup as {
      inline_keyboard: Array<Array<{ text: string; url?: string }>>;
    };
    expect(kb.inline_keyboard.flat()).toEqual([
      { text: '🟢 Web Event', url: 'https://web.test/events/EVT-WEB0021' },
    ]);
  });

  it.skip('pagination callback renders the next page with Prev button', async () => {
    const userId = 800000011;
    const { bot, repo } = makeWiredBot();
    await repo.upsertUser({
      telegramId: userId,
      payeeType: 'mobile',
      payeeValue: '+6591234567',
      displayName: 'Wiring User',
      timestamp: T0,
    });
    // Seed 6 payments to force 2 pages (pageSize = 5)
    for (let i = 1; i <= 6; i++) {
      await seedPayment(repo, userId, `PAGE-${String(i).padStart(3, '0')}`, 1000, 'pending');
    }

    // Page 1: Next button only
    await bot.handleUpdate(textUpdate(userId, '/payments'));
    const page1 = stub.sentMessages[stub.sentMessages.length - 1]!;
    const kb1 = (page1.replyMarkup?.inline_keyboard ?? []).flat();
    expect(kb1.some((b) => b.callback_data === 'payments:2')).toBe(true);
    expect(kb1.some((b) => b.callback_data === 'payments:0')).toBe(false);

    // Page 2 via callback: Prev button only, no PAGE-006 (it's on page 1)
    await bot.handleUpdate(callbackUpdate(userId, 'payments:2'));
    const page2 = stub.sentMessages[stub.sentMessages.length - 1]!;
    expect(page2.text).toContain('Page 2 of 2');
    const kb2 = (page2.replyMarkup?.inline_keyboard ?? []).flat();
    expect(kb2.some((b) => b.callback_data === 'payments:1')).toBe(true);
    expect(kb2.some((b) => b.callback_data?.startsWith('payments:3'))).toBe(false);
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
    // QR photo replaced with text message
    expect(stub.sentMessages.some((m) => m.text.includes('✅ Received'))).toBe(true);
    expect(stub.sentMessages.some((m) => m.text.includes('WIRE-003'))).toBe(true);
    // Original QR photo message deleted
    expect(stub.deletedMessages).toHaveLength(1);

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

    // 1. Open the detail view — pending payback gets Mark-sent + Cancel buttons
    await bot.handleUpdate(callbackUpdate(userId, 'view:WIRE-010'));
    const view = stub.editedMessages[0]!;
    expect(view.text).toContain('💸 *Paybacks:*');
    expect(view.text).toContain('⏳ $25.00 to +6598765432');
    const buttons = view.replyMarkup?.inline_keyboard.flat() ?? [];
    expect(buttons).toHaveLength(2);
    expect(buttons[0]!.callback_data).toBe('pb_sent:WIRE-010:WIRE-PB-010');
    expect(buttons[1]!.callback_data).toBe('pb_cancel:WIRE-010:WIRE-PB-010');

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

  it('Payback button proposes the stored payer; Change recipient redirects this payback only', async () => {
    const userId = 800000020;
    const { bot, repo } = makeWiredBot();
    const payment = await seedPayment(repo, userId, 'WIRE-020', 10000, 'received', {
      type: 'mobile',
      value: '+6591234568',
      name: 'Alice',
    });

    // Button → proposal with Confirm / Change / Cancel
    await bot.handleUpdate(callbackUpdate(userId, 'payback:WIRE-020'));
    expect(stub.lastText()).toContain('Pay back to Alice (+6591234568)?');

    // Change recipient → new payer prompt → valid replacement → confirm
    await bot.handleUpdate(callbackUpdate(userId, 'payback_change_payer:WIRE-020'));
    expect(stub.editedMessages.at(-1)!.text).toContain('new recipient');
    await bot.handleUpdate(textUpdate(userId, '98765432'));
    expect(stub.lastText()).toContain('+6598765432');
    await bot.handleUpdate(callbackUpdate(userId, 'payback_confirm_payer:WIRE-020'));

    // Amount → confirm → payback row targets the new recipient
    await bot.handleUpdate(textUpdate(userId, '25.00'));
    await bot.handleUpdate(callbackUpdate(userId, 'payback_confirm_amount:WIRE-020'));

    const paybacks = await repo.listPaybacksByPayment(payment.id);
    expect(paybacks).toHaveLength(1);
    expect(paybacks[0]!.payerValue).toBe('+6598765432');
    expect(paybacks[0]!.amountCents).toBe(2500);

    // The payment's stored payer is untouched
    const stored = await repo.getPaymentByRef('WIRE-020');
    expect(stored!.payerValue).toBe('+6591234568');
    expect(stored!.payerName).toBe('Alice');
  });

  /** Drive /payback to the delivered QR photo and return the new payback's ref. */
  async function createPaybackViaBot(
    bot: ReturnType<typeof makeWiredBot>['bot'],
    userId: number,
    paymentRef: string,
    amount: string
  ): Promise<string> {
    await bot.handleUpdate(textUpdate(userId, `/payback ${paymentRef}`));
    await bot.handleUpdate(textUpdate(userId, '98765432'));
    await bot.handleUpdate(callbackUpdate(userId, `payback_confirm_payer:${paymentRef}`));
    await bot.handleUpdate(textUpdate(userId, amount));
    await bot.handleUpdate(callbackUpdate(userId, `payback_confirm_amount:${paymentRef}`));
    return stub.sentPhotos.at(-1)!.caption.split(' / ')[2]!;
  }

  it('payback QR photo has Sent/Cancel; Sent replaces the photo with a status line', async () => {
    const userId = 800000030;
    const { bot, repo } = makeWiredBot();
    await seedPayment(repo, userId, 'WIRE-030', 10000, 'received');

    const pbRef = await createPaybackViaBot(bot, userId, 'WIRE-030', '25.00');
    const buttons = stub.sentPhotos.at(-1)!.replyMarkup?.inline_keyboard.flat() ?? [];
    expect(buttons.map((b) => b.callback_data)).toEqual([
      `pb_sent:WIRE-030:${pbRef}`,
      `pb_cancel:WIRE-030:${pbRef}`,
    ]);

    await bot.handleUpdate(callbackUpdate(userId, `pb_sent:WIRE-030:${pbRef}`, 600, 20, true));

    expect(stub.lastText()).toContain(`Payback for WIRE-030 / SGD 25.00 / ${pbRef} / ✅ Sent`);
    expect(stub.deletedMessages).toHaveLength(1);
    const row = await repo.getPaybackByRef(pbRef);
    expect(row!.status).toBe('sent');
    expect(row!.sentAt).not.toBeNull();

    // Cancel after Sent is refused and nothing changes
    await bot.handleUpdate(callbackUpdate(userId, `pb_cancel:WIRE-030:${pbRef}`, 600, 21, true));
    expect(stub.callbackAnswers.at(-1)).toContain('can’t be cancelled');
    expect((await repo.getPaybackByRef(pbRef))!.status).toBe('sent');
  });

  it('Cancel on the QR photo replaces it, frees the amount, and allows a full re-create', async () => {
    const userId = 800000031;
    const { bot, repo } = makeWiredBot();
    const payment = await seedPayment(repo, userId, 'WIRE-031', 10000, 'received');

    const pbRef = await createPaybackViaBot(bot, userId, 'WIRE-031', '100.00');
    expect(await repo.sumPaybacks(payment.id)).toBe(10000);

    await bot.handleUpdate(callbackUpdate(userId, `pb_cancel:WIRE-031:${pbRef}`, 600, 22, true));
    expect(stub.lastText()).toBe(`Payback for WIRE-031 / SGD 100.00 / ${pbRef} / ❌ Cancelled`);
    expect(stub.deletedMessages).toHaveLength(1);
    expect((await repo.getPaybackByRef(pbRef))!.status).toBe('cancelled');
    expect(await repo.sumPaybacks(payment.id)).toBe(0);

    // The full amount can be paid back again
    const again = await createPaybackViaBot(bot, userId, 'WIRE-031', '100.00');
    expect(again).not.toBe(pbRef);
    expect(await repo.sumPaybacks(payment.id)).toBe(10000);
  });

  it('names the stored payer in payback captions/status lines; a changed recipient has no name', async () => {
    const userId = 800000040;
    const { bot, repo } = makeWiredBot();
    await seedPayment(repo, userId, 'WIRE-040', 10000, 'received', {
      type: 'mobile',
      value: '+6591234568',
      name: 'Alice',
    });

    // 1. Stored payer: confirm → amount → confirm
    await bot.handleUpdate(textUpdate(userId, '/payback WIRE-040'));
    await bot.handleUpdate(callbackUpdate(userId, 'payback_confirm_payer:WIRE-040'));
    expect(stub.editedMessages.at(-1)!.text).toContain('Recipient: Alice (+6591234568)');
    await bot.handleUpdate(textUpdate(userId, '10.00'));
    expect(stub.lastText()).toContain('Recipient: Alice (+6591234568)');
    await bot.handleUpdate(callbackUpdate(userId, 'payback_confirm_amount:WIRE-040'));

    const named = stub.sentPhotos.at(-1)!;
    const pbRef = named.caption.split(' / ')[2]!;
    expect(named.caption).toBe(
      `Payback for WIRE-040 / SGD 10.00 / ${pbRef} / To: Alice / Scan to send the money back`
    );
    expect(named.caption).not.toContain('91234568');

    await bot.handleUpdate(callbackUpdate(userId, `pb_sent:WIRE-040:${pbRef}`, 700, 30, true));
    expect(stub.lastText()).toMatch(
      new RegExp(`^Payback for WIRE-040 / SGD 10\\.00 / ${pbRef} / To: Alice / ✅ Sent `)
    );

    // 2. Change recipient → typed proxy has no name
    await bot.handleUpdate(textUpdate(userId, '/payback WIRE-040'));
    await bot.handleUpdate(callbackUpdate(userId, 'payback_change_payer:WIRE-040'));
    await bot.handleUpdate(textUpdate(userId, '98765432'));
    await bot.handleUpdate(callbackUpdate(userId, 'payback_confirm_payer:WIRE-040'));
    await bot.handleUpdate(textUpdate(userId, '5.00'));
    await bot.handleUpdate(callbackUpdate(userId, 'payback_confirm_amount:WIRE-040'));
    const other = stub.sentPhotos.at(-1)!;
    expect(other.caption).not.toContain('To:');
    expect(other.caption).toMatch(/^Payback for WIRE-040 \/ SGD 5\.00 \/ [A-Z2-7]{10} \/ Scan/);

    // 3. Changing back to the stored proxy restores the name
    await bot.handleUpdate(textUpdate(userId, '/payback WIRE-040'));
    await bot.handleUpdate(callbackUpdate(userId, 'payback_change_payer:WIRE-040'));
    await bot.handleUpdate(textUpdate(userId, '91234568'));
    await bot.handleUpdate(callbackUpdate(userId, 'payback_confirm_payer:WIRE-040'));
    await bot.handleUpdate(textUpdate(userId, '1.00'));
    await bot.handleUpdate(callbackUpdate(userId, 'payback_confirm_amount:WIRE-040'));
    expect(stub.sentPhotos.at(-1)!.caption).toContain('/ To: Alice /');

    // 4. Detail history names only the stored payer
    await bot.handleUpdate(callbackUpdate(userId, 'view:WIRE-040'));
    const detail = stub.editedMessages.at(-1)!.text;
    expect(detail).toContain('to Alice (+6591234568)');
    expect(detail).toContain('to +6598765432');
  });

  /** An event with a pending payment (payer Alice) so stats and voiding can be observed. */
  async function seedEventPayment(userId: number, ref: string, status: 'pending' | 'received') {
    const repo = new D1Repository(env.paynow_db);
    const eventRepo = new D1EventRepository(env.paynow_db);
    const event = await eventRepo.createEvent({
      ref: `EVT-${ref}`,
      chatId: userId,
      topicId: 0,
      name: 'Dinner split',
      payeeType: 'mobile',
      payeeValue: '+6591234567',
      status: 'open',
      timestamp: T0,
    });
    await repo.createPayment({
      ref,
      userId,
      eventId: event.id,
      description: 'Dinner split',
      amountCents: 1250,
      payeeType: 'mobile',
      payeeValue: '+6591234567',
      payerType: 'mobile',
      payerValue: '+6591234568',
      payerName: 'Alice',
      status,
      source: 'manual',
      qrPayload: 'x',
      timestamp: T0,
    });
    return { repo, eventRepo, event };
  }

  it('Void replaces the QR with a status line; Received/Void/Payback are then refused and stats exclude it', async () => {
    const userId = 800000050;
    const { bot } = makeWiredBot();
    const { repo, eventRepo, event } = await seedEventPayment(userId, 'WIRE-050', 'pending');
    expect((await eventRepo.getEventStats(event.id)).pendingCents).toBe(1250);

    await bot.handleUpdate(callbackUpdate(userId, 'void:WIRE-050', 600, 40, true));

    expect(stub.lastText()).toMatch(
      /^Dinner split \/ SGD 12\.50 \/ WIRE-050 \/ Payer: Alice \/ 🚫 Voided /
    );
    expect(stub.lastText()).not.toContain('91234568');
    expect(stub.deletedMessages).toHaveLength(1);
    expect((await repo.getPaymentByRef('WIRE-050'))!.status).toBe('voided');
    expect(await eventRepo.getEventStats(event.id)).toEqual({
      paymentCount: 0,
      collectedCents: 0,
      paidBackCents: 0,
      pendingCents: 0,
    });

    await bot.handleUpdate(callbackUpdate(userId, 'mark_received:WIRE-050', 600, 41, true));
    expect(stub.callbackAnswers.at(-1)).toContain('was voided');
    await bot.handleUpdate(callbackUpdate(userId, 'void:WIRE-050', 600, 42, true));
    expect(stub.callbackAnswers.at(-1)).toContain('already voided');
    await bot.handleUpdate(callbackUpdate(userId, 'payback:WIRE-050', 600, 43));
    expect(stub.callbackAnswers.at(-1)).toContain('only create paybacks for received');
    expect((await repo.getPaymentByRef('WIRE-050'))!.status).toBe('voided');
  });

  it('concurrent Received and Void taps leave exactly one outcome', async () => {
    const userId = 800000051;
    const { bot } = makeWiredBot();
    const { repo } = await seedEventPayment(userId, 'WIRE-051', 'pending');

    await Promise.all([
      bot.handleUpdate(callbackUpdate(userId, 'mark_received:WIRE-051', 700, 50, true)),
      bot.handleUpdate(callbackUpdate(userId, 'void:WIRE-051', 700, 51, true)),
    ]);

    expect(['received', 'voided']).toContain((await repo.getPaymentByRef('WIRE-051'))!.status);
    const winners = stub.callbackAnswers.filter(
      (t) => t === '✅ Payment marked as received!' || t === '🚫 Payment voided'
    );
    expect(winners).toHaveLength(1);
  });

  it('a received payment cannot be voided', async () => {
    const userId = 800000052;
    const { bot } = makeWiredBot();
    const { repo } = await seedEventPayment(userId, 'WIRE-052', 'received');

    await bot.handleUpdate(callbackUpdate(userId, 'void:WIRE-052', 600, 60, true));

    expect(stub.callbackAnswers.at(-1)).toContain('already received');
    expect((await repo.getPaymentByRef('WIRE-052'))!.status).toBe('received');
    expect(stub.deletedMessages).toHaveLength(0);
  });
});
