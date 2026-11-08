import { describe, expect, it } from 'vitest';
import type { Payment } from '../../src/db/repository';
import { postPaymentQr } from '../../src/web/telegram';

const payment = {
  ref: 'ABC123DEFG',
  description: 'Team Lunch',
  amountCents: 1250,
  payerName: 'Alice',
} as Payment;

function capture(ok = true) {
  const calls: Array<{ url: string; form: FormData }> = [];
  const fetchFn = (async (url: string, init: RequestInit) => {
    calls.push({ url, form: init.body as FormData });
    return new Response('{}', { status: ok ? 200 : 400 });
  }) as unknown as typeof fetch;
  return { calls, fetchFn };
}

describe('postPaymentQr', () => {
  it('sends the photo, caption and Received/Void buttons to the event chat and topic', async () => {
    const { calls, fetchFn } = capture();
    const ok = await postPaymentQr(
      'TOKEN',
      { chatId: -100, topicId: 9 },
      payment,
      new Uint8Array([66, 77, 1]),
      fetchFn
    );

    expect(ok).toBe(true);
    const { url, form } = calls[0]!;
    expect(url).toBe('https://api.telegram.org/botTOKEN/sendPhoto');
    expect(form.get('chat_id')).toBe('-100');
    expect(form.get('message_thread_id')).toBe('9');
    expect(form.get('caption')).toBe(
      'Team Lunch / SGD 12.50 / ABC123DEFG / Payer: Alice / Forward this message to share'
    );
    expect(JSON.parse(form.get('reply_markup') as string).inline_keyboard[0]).toEqual([
      { text: '✓ Received', callback_data: 'mark_received:ABC123DEFG' },
      { text: '✖ Void', callback_data: 'void:ABC123DEFG' },
    ]);
    const photo = form.get('photo') as File;
    expect(photo.name).toBe('paynow-qr.bmp');
    expect(photo.size).toBe(3);
  });

  it('omits the topic when the event has none', async () => {
    const { calls, fetchFn } = capture();
    await postPaymentQr('T', { chatId: 5, topicId: 0 }, payment, new Uint8Array(1), fetchFn);
    expect(calls[0]!.form.has('message_thread_id')).toBe(false);
  });

  it('returns false for a rejected response or a thrown error, never throwing', async () => {
    const { fetchFn } = capture(false);
    expect(
      await postPaymentQr('T', { chatId: 5, topicId: 0 }, payment, new Uint8Array(1), fetchFn)
    ).toBe(false);
    const boom = (async () => {
      throw new Error('network');
    }) as unknown as typeof fetch;
    expect(
      await postPaymentQr('T', { chatId: 5, topicId: 0 }, payment, new Uint8Array(1), boom)
    ).toBe(false);
  });
});
