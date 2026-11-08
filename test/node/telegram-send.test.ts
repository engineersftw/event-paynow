import { describe, expect, it, vi } from 'vitest';
import type { Payment } from '../../src/db/repository';
import { postPaymentQr, sendPaymentDm } from '../../src/web/telegram';

const payment = {
  ref: 'PAYREF0001',
  description: 'Dinner',
  amountCents: 2300,
  payerName: 'Alice',
} as Payment;
const bmp = new Uint8Array([1, 2, 3]);

const okFetch = () => vi.fn(async () => new Response('{}', { status: 200 }));
const formOf = (f: ReturnType<typeof okFetch>) => (f.mock.calls[0] as any)[1].body as FormData;

describe('Telegram senders', () => {
  it('sendPaymentDm targets the user’s private chat with the caption and no buttons', async () => {
    const f = okFetch();
    expect(await sendPaymentDm('T', 42, payment, bmp, f as any)).toBe(true);
    const form = formOf(f);
    expect(form.get('chat_id')).toBe('42');
    expect(form.get('caption')).toContain('Payer: Alice');
    expect(form.get('reply_markup')).toBeNull();
    expect((f.mock.calls[0] as any)[0]).toContain('/sendPhoto');
  });

  it('returns false when Telegram refuses or the call throws', async () => {
    const refused = vi.fn(async () => new Response('{}', { status: 403 }));
    expect(await sendPaymentDm('T', 42, payment, bmp, refused as any)).toBe(false);
    const boom = vi.fn(async () => {
      throw new Error('down');
    });
    expect(await sendPaymentDm('T', 42, payment, bmp, boom as any)).toBe(false);
  });

  it('postPaymentQr still sends the buttons and the topic', async () => {
    const f = okFetch();
    await postPaymentQr('T', { chatId: -100, topicId: 7 }, payment, bmp, f as any);
    const form = formOf(f);
    expect(form.get('chat_id')).toBe('-100');
    expect(form.get('message_thread_id')).toBe('7');
    expect(String(form.get('reply_markup'))).toContain('mark_received:PAYREF0001');
  });
});
