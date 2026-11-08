# Design

## Context

The payer page (`renderPayerPage`, `/api/pay/:ref*` in `src/web/handler.ts`) already authenticates with Telegram Login, creates a payment owned by the signed-in user, and serves its QR at `/api/pay/:ref/payments/:paymentRef/qr` for the owner only. `postPaymentQr` in `src/web/telegram.ts` uploads the QR photo to the event chat with ✓ Received / ✖ Void buttons and never throws. A Telegram login id equals the private chat id with the bot, and `payments.user_id` already holds it. See proposal.md for motivation.

## Goals / Non-Goals

**Goals:**
- Reuse the existing owner-only QR route for history, the existing photo upload for the message, and `paymentCaption` for the caption.
- Keep payment creation independent of message delivery.

**Non-Goals:**
- History across events, actions on past requests, retries or queues for failed messages, changes to the admin dialog.

## Decisions

1. **Amount as plain text:** when `defaultCents` is set the page hides the input and shows a text row ("Amount (SGD)" with the value). The create call still omits the amount, and the server keeps using the event's default, so the enforcement does not change. Alternative: an editable pre-filled field, rejected by the user.
2. **History endpoint:** `GET /api/pay/:ref/payments` returns `{ payments: [{ ref, amountCents, status, payerName, createdAt }] }` for the session user and event, newest first, capped at 50, via a repository method `listPaymentsByUserAndEvent(userId, eventId)` (SQL filter on both, not a filter after `listPaymentsByUser`). The page loads it with the event data, renders rows, and shows the QR of a pending row through the existing QR route. Rows built with `textContent`, like the admin page.
3. **Direct message:** split the photo upload in `telegram.ts` so `postPaymentQr` (chat, with buttons) and a new `sendPaymentDm` (chat id = user id, no buttons, no thread) share it. The DM has no buttons because the payer is not an admin and marking their own request received would be wrong. It is sent inside `createPayerPayment` after the payment exists; the response gains `dm: boolean` and the page shows the hint when false. `createPayerPayment` takes the same injectable `fetchFn` as the admin handlers so tests can stub Telegram.
4. **No retries or storage of delivery state:** one attempt, result returned to the page only.

## Risks / Trade-offs

- Payers who never started the bot get no message → the page says so and the QR is still shown.
- The extra Telegram call adds latency to create → the call is awaited once and never throws; a slow Telegram delays the QR slightly. Acceptable for one call; revisit with `waitUntil` if it hurts.
- History shows voided and received requests too → status is shown, only pending rows offer a QR.
