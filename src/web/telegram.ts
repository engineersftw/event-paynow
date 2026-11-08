import type { Event, Payment } from '../db/repository';
import { paymentCaption } from '../payments/payment-request';

/**
 * Post a payment's QR photo to the event's chat with the same caption and ✓ Received / ✖ Void
 * buttons `/start` uses (the bot webhook handles the taps). Returns whether Telegram accepted it;
 * never throws, so a failure leaves the payment recorded and only changes the page's message.
 */
export async function postPaymentQr(
  botToken: string,
  event: Pick<Event, 'chatId' | 'topicId'>,
  payment: Payment,
  bmp: Uint8Array,
  fetchFn: typeof fetch = fetch
): Promise<boolean> {
  try {
    const form = new FormData();
    form.append('chat_id', String(event.chatId));
    if (event.topicId !== 0) form.append('message_thread_id', String(event.topicId));
    form.append('caption', paymentCaption(payment));
    form.append(
      'reply_markup',
      JSON.stringify({
        inline_keyboard: [
          [
            { text: '✓ Received', callback_data: `mark_received:${payment.ref}` },
            { text: '✖ Void', callback_data: `void:${payment.ref}` },
          ],
        ],
      })
    );
    form.append('photo', new Blob([bmp], { type: 'image/bmp' }), 'paynow-qr.bmp');

    const res = await fetchFn(`https://api.telegram.org/bot${botToken}/sendPhoto`, {
      method: 'POST',
      body: form,
    });
    return res.ok;
  } catch {
    return false;
  }
}
