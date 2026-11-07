import { describe, it, expect, beforeAll, beforeEach } from 'vitest';
import { env } from 'cloudflare:test';
import { Bot } from 'grammy';
import jsQR from 'jsqr';
import { D1Repository } from '../../src/db/drizzle-repository';
import { PaybackCommandHandler } from '../../src/commands/payback-handler';
import type { ConversationDO } from '../../src/worker/conversation-do';
import {
  applyTestSchema,
  bmpToRgba,
  TelegramStub,
  TEST_BOT_INFO,
  textUpdate,
} from './harness';

/**
 * Task 7.3: payback QR generation end-to-end in the Workers runtime.
 *
 * Drives the full /payback conversation against real D1 + real CHAT_SESSION DO
 * with a stubbed Telegram API: the confirmed payback creates the bounded row
 * (task 7.2) with a real SGQR payload encoding the PAYER as payee proxy, and
 * the delivered sendPhoto bytes jsQR-decode back to exactly the stored
 * qr_payload — the same verification shape as task 5.3.
 *
 * Also covers the spec's partial-payback scenario across the live path:
 * 5.00 + 3.00 of 12.50 leaves 4.50, then a 5.00 request is blocked.
 */

beforeAll(async () => {
  await applyTestSchema(env.DB);
});

const T0 = '2024-01-01T00:00:00Z';
const stub = new TelegramStub();

beforeEach(() => {
  stub.reset();
});

interface Harness {
  repo: D1Repository;
  bot: Bot;
}

function makeHarness(userId: number): Harness {
  const repo = new D1Repository(env.DB);
  const doStub = env.CHAT_SESSION.get(env.CHAT_SESSION.idFromName(`chat-${userId}`));
  const handler = new PaybackCommandHandler(doStub as unknown as ConversationDO, repo);

  const bot = new Bot('test-secret-token', {
    botInfo: TEST_BOT_INFO,
    client: { fetch: stub.fetch },
  });
  bot.command('payback', (ctx) => {
    const arg = typeof ctx.match === 'string' ? ctx.match.trim() : '';
    return handler.start(ctx, arg || undefined);
  });
  bot.on('message:text', (ctx) => {
    return handler.handleInput(ctx) as Promise<void>;
  });

  return { repo, bot };
}

/** Seed a configured payee user plus one received payment; returns its row. */
async function seedReceivedPayment(
  repo: D1Repository,
  userId: number,
  paymentRef: string,
  amountCents: number
) {
  await repo.upsertUser({
    telegramId: userId,
    payeeType: 'mobile',
    payeeValue: '+6591234567',
    displayName: 'ACME PTE LTD',
    timestamp: T0,
  });
  return repo.createPayment({
    ref: paymentRef,
    userId,
    description: 'Dinner split',
    amountCents,
    payeeType: 'mobile',
    payeeValue: '+6591234567',
    status: 'received',
    source: 'manual',
    qrPayload: '000201010212ORIGINALPAYLOAD6304ABCD',
    timestamp: T0,
  });
}

/** Run the 4-step payback conversation to confirmation with the given payer+amount. */
async function runPaybackConversation(
  bot: Bot,
  userId: number,
  paymentRef: string,
  payerMobile: string,
  amount: string
): Promise<void> {
  await bot.handleUpdate(textUpdate(userId, `/payback ${paymentRef}`));
  await bot.handleUpdate(textUpdate(userId, payerMobile));
  await bot.handleUpdate(textUpdate(userId, 'confirm'));
  await bot.handleUpdate(textUpdate(userId, amount));
  await bot.handleUpdate(textUpdate(userId, 'confirm'));
}

describe('payback QR end-to-end (task 7.3)', () => {
  it('creates the bounded payback row and uploads a QR encoding the payer as payee', async () => {
    const userId = 730000100;
    const { repo, bot } = makeHarness(userId);
    const payment = await seedReceivedPayment(repo, userId, 'PAY73001', 1250);

    await runPaybackConversation(bot, userId, 'PAY73001', '98765432', '5.00');

    // --- sendPhoto captured -------------------------------------------------
    expect(stub.sentPhotos).toHaveLength(1);
    const photo = stub.sentPhotos[0]!;
    expect(photo.filename).toBe('payback-qr.bmp');

    const captionParts = photo.caption.split(' / ');
    expect(captionParts[0]).toBe('Payback for PAY73001');
    expect(captionParts[1]).toBe('SGD 5.00');
    expect(captionParts[2]).toMatch(/^[A-Z2-7]{10}$/);
    expect(captionParts[3]).toBe('Scan to send the money back');
    const paybackRef = captionParts[2]!;

    // --- QR bytes decode back to the stored payload -------------------------
    const { data, width, height } = bmpToRgba(photo.bytes);
    const decoded = jsQR(data, width, height);
    expect(decoded).not.toBeNull();
    const payload = decoded!.data;

    // Payer proxy is the payee of this QR; fixed amount; payback ref embedded
    expect(payload).toContain('SG.PAYNOW');
    expect(payload).toContain('+6598765432');   // payer becomes payee proxy
    expect(payload).not.toContain('+6591234567'); // original payee NOT in the QR
    expect(payload).toContain('03010');           // 26.03=0 amount locked
    expect(payload).toContain('54045.00');        // tag 54 amount
    expect(payload).toContain(paybackRef);        // 26.05 payback reference
    expect(payload).toContain('Refund PAY73001'); // 62.01 description

    // --- stored payback row matches the delivered QR ------------------------
    const paybacks = await repo.listPaybacksByPayment(payment.id);
    expect(paybacks).toHaveLength(1);
    const row = paybacks[0]!;
    expect(row.ref).toBe(paybackRef);
    expect(row.qrPayload).toBe(payload);          // uploaded QR == stored payload
    expect(row.status).toBe('pending');
    expect(row.amountCents).toBe(500);
    expect(row.payerType).toBe('mobile');
    expect(row.payerValue).toBe('+6598765432');
    expect(row.sentAt).toBeNull();
    expect(await repo.sumPaybacks(payment.id)).toBe(500);

    // Final text reply + conversation reset
    expect(stub.lastText()).toContain('Payback Recorded');
    expect(stub.lastText()).toContain('Remaining payable: $7.50');
  });

  it('5.00 + 3.00 against 12.50 succeeds, then 5.00 is blocked (spec scenario, live path)', async () => {
    const userId = 730000200;
    const { repo, bot } = makeHarness(userId);
    const payment = await seedReceivedPayment(repo, userId, 'PAY73002', 1250);

    await runPaybackConversation(bot, userId, 'PAY73002', '98765432', '5.00');
    await runPaybackConversation(bot, userId, 'PAY73002', '91111111', '3.00');

    expect(stub.sentPhotos).toHaveLength(2);
    expect(await repo.sumPaybacks(payment.id)).toBe(800);
    expect(stub.lastText()).toContain('Remaining payable: $4.50');

    // Third payback of 5.00 exceeds the 4.50 remaining: rejected at the amount
    // step (step 3), so no final confirm is sent and nothing is recorded
    await bot.handleUpdate(textUpdate(userId, '/payback PAY73002'));
    await bot.handleUpdate(textUpdate(userId, '98765432'));
    await bot.handleUpdate(textUpdate(userId, 'confirm'));
    await bot.handleUpdate(textUpdate(userId, '5.00'));

    expect(stub.sentPhotos).toHaveLength(2); // no third upload
    expect(await repo.sumPaybacks(payment.id)).toBe(800);
    expect(stub.lastText()).toContain('exceeds the remaining payable amount ($4.50)');

    // The blocked conversation may continue with a fitting amount
    await bot.handleUpdate(textUpdate(userId, '4.50'));
    await bot.handleUpdate(textUpdate(userId, 'confirm'));
    expect(stub.sentPhotos).toHaveLength(3);
    expect(await repo.sumPaybacks(payment.id)).toBe(1250);

    // Fully paid back: another attempt is refused with the spec message
    await runPaybackConversation(bot, userId, 'PAY73002', '98765432', '1.00');
    expect(stub.sentPhotos).toHaveLength(3);
    expect(stub.lastText()).toContain('fully paid back');
  });

  it('rejects a payback for someone else\u2019s payment', async () => {
    const userId = 730000300;
    const otherId = 730000301;
    const { repo, bot } = makeHarness(userId);
    await seedReceivedPayment(repo, otherId, 'PAY73003', 1250);

    await bot.handleUpdate(textUpdate(userId, '/payback PAY73003'));

    expect(stub.lastText()).toContain('You do not own this payment.');
    expect(stub.sentPhotos).toHaveLength(0);
  });

  it('a pending (unreceived) payment cannot be paid back', async () => {
    const userId = 730000400;
    const { repo, bot } = makeHarness(userId);
    await repo.upsertUser({
      telegramId: userId,
      payeeType: 'mobile',
      payeeValue: '+6591234567',
      displayName: 'ACME PTE LTD',
      timestamp: T0,
    });
    await repo.createPayment({
      ref: 'PAY73004',
      userId,
      description: 'Awaiting',
      amountCents: 1000,
      payeeType: 'mobile',
      payeeValue: '+6591234567',
      status: 'pending',
      source: 'manual',
      qrPayload: 'payload',
      timestamp: T0,
    });

    await bot.handleUpdate(textUpdate(userId, '/payback PAY73004'));

    expect(stub.lastText()).toContain('only create paybacks for received payments');
    expect(stub.sentPhotos).toHaveLength(0);
  });
});
