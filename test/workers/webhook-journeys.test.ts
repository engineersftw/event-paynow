import { env } from 'cloudflare:test';
import { beforeAll, describe, expect, it } from 'vitest';
import { createBot } from '../../src/bot';
import { D1EventRepository, D1Repository } from '../../src/db/drizzle-repository';
import { createSimpleBot } from '../../src/simple-bot';
import { createSplitBot } from '../../src/split-bot';
import { applyTestSchema } from './harness';
import { qrAmount, webhookChat } from './webhook-harness';

beforeAll(async () => {
  await applyTestSchema(env.paynow_db);
});

describe('signed bot webhook journeys', () => {
  it('Simple confirms and sends one QR for the specified amount', async () => {
    const chat = webhookChat('simple', env, 910001, (bindings, config) =>
      createSimpleBot(bindings, bindings.SIMPLE_BOT_TOKEN!, config)
    );
    await chat.say('/start');
    expect(chat.lastText()).toContain('Who should be paid');
    await chat.say('91234567');
    await chat.say('12.50');
    await chat.tap('simple_edit_no');
    await chat.say('Lunch');
    expect(chat.lastText()).toContain('Amount: SGD 12.50');
    expect(chat.telegram.sentPhotos).toHaveLength(0);

    await chat.tap('simple_confirm');
    expect(chat.telegram.sentPhotos.map(qrAmount)).toEqual([1250]);
  });

  it('Event issues a payment and marks it received from the QR message', async () => {
    const userId = 910002;
    const event = await new D1EventRepository(env.paynow_db).createEvent({
      ref: 'WEBHOOK-EVENT',
      chatId: userId,
      topicId: 0,
      name: 'Webhook dinner',
      payeeType: 'mobile',
      payeeValue: '+6591234567',
      status: 'open',
      timestamp: '2026-01-01T00:00:00.000Z',
    });
    const payments = new D1Repository(env.paynow_db);
    const chat = webhookChat('event', env, userId, createBot);

    await chat.say('/start');
    expect(chat.lastText()).toContain("payer's PayNow");
    await chat.say('91234568');
    await chat.tap('start_skip_name');
    await chat.say('10.00');
    expect(await payments.listPaymentsByUser(userId)).toHaveLength(0);
    await chat.tap('start_confirm');

    expect(chat.telegram.sentPhotos.map(qrAmount)).toEqual([1000]);
    const [photo] = chat.telegram.sentPhotos;
    const rows = await payments.listPaymentsByUser(userId);
    expect(rows).toHaveLength(1);
    const [payment] = rows;
    expect(payment).toMatchObject({ eventId: event.id, amountCents: 1000, status: 'pending' });

    await chat.tap(`mark_received:${payment!.ref}`, photo);
    expect(chat.lastText()).toContain(`${payment!.ref} / ✅ Received`);
    expect(chat.telegram.deletedMessages).toContainEqual({
      chatId: String(userId),
      messageId: photo!.messageId,
    });
    expect(await payments.getPaymentByRef(payment!.ref)).toMatchObject({
      amountCents: 1000,
      status: 'received',
    });
  });

  it('Split requires receipt reconciliation before generating the item-only QRs', async () => {
    const chat = webhookChat('split', env, 910003, (bindings, config) =>
      createSplitBot(bindings, bindings.SPLIT_BOT_TOKEN!, config, {
        download: async () => new Uint8Array([1, 2, 3]),
        reader: {
          read: async () => ({
            items: [
              { name: 'Tea', price: 1.8 },
              { name: 'Milo', price: 3.8 },
            ],
            gst: 0,
            total: 5.8,
          }),
        },
      })
    );

    await chat.say('/split_receipt');
    await chat.say('91234567');
    await chat.uploadPhoto();
    expect(chat.lastText()).toContain('SGD 0.20 (short)');
    expect(chat.buttons()).not.toContain('split_scan:use');
    expect(chat.telegram.sentPhotos).toHaveLength(0);

    await chat.tap('split_scan:add');
    await chat.say('Cup modifier 0.20');
    expect(chat.lastText()).toContain('3. Cup modifier');
    await chat.tap('split_scan:use');
    await chat.tap('split_skip_description');
    await chat.say('1,3 Ann\n2 Bob');
    expect(chat.lastText()).toContain('Ann: SGD 2.00');
    expect(chat.lastText()).toContain('Bob: SGD 3.80');
    expect(chat.telegram.sentPhotos).toHaveLength(0);

    await chat.tap('split_confirm');
    expect(chat.telegram.sentPhotos.map(qrAmount).sort((a, b) => a - b)).toEqual([200, 380]);
  });
});
