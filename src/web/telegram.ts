import type { Event, Payment } from '../db/repository';
import { paymentCaption } from '../payments/payment-request';

/** Upload the payment's QR as a photo with the standard caption; false on any failure, never throws. */
async function sendQrPhoto(
  botToken: string,
  fields: Record<string, string>,
  payment: Payment,
  bmp: Uint8Array,
  fetchFn: typeof fetch
): Promise<boolean> {
  try {
    const form = new FormData();
    for (const [key, value] of Object.entries(fields)) form.append(key, value);
    form.append('caption', paymentCaption(payment));
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

/**
 * Post a payment's QR photo to the event's chat with the same caption and ✓ Received / ✖ Void
 * buttons `/start` uses (the bot webhook handles the taps). Returns whether Telegram accepted it;
 * never throws, so a failure leaves the payment recorded and only changes the page's message.
 */
export function postPaymentQr(
  botToken: string,
  event: Pick<Event, 'chatId' | 'topicId'>,
  payment: Payment,
  bmp: Uint8Array,
  fetchFn: typeof fetch = fetch
): Promise<boolean> {
  const fields: Record<string, string> = {
    chat_id: String(event.chatId),
    reply_markup: JSON.stringify({
      inline_keyboard: [
        [
          { text: '✓ Received', callback_data: `mark_received:${payment.ref}` },
          { text: '✖ Void', callback_data: `void:${payment.ref}` },
        ],
      ],
    }),
  };
  if (event.topicId !== 0) fields.message_thread_id = String(event.topicId);
  return sendQrPhoto(botToken, fields, payment, bmp, fetchFn);
}

/**
 * Send a payment's QR to its owner in the private chat with the bot (a Telegram user id is also
 * the private chat id), without buttons: the payer is not necessarily an admin. False when
 * Telegram refuses, e.g. the user never started the bot; never throws.
 */
export function sendPaymentDm(
  botToken: string,
  userId: number,
  payment: Payment,
  bmp: Uint8Array,
  fetchFn: typeof fetch = fetch
): Promise<boolean> {
  return sendQrPhoto(botToken, { chat_id: String(userId) }, payment, bmp, fetchFn);
}
