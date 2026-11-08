# Tasks

## 1. Shared logic

- [x] 1.1 Add `src/payments/payment-request.ts` (`createPaymentRequest`, `paymentCaption`, `paymentImageLines`, share hint) and switch `StartCommandHandler.createPaymentAndSendQr` to it; verify the existing start-handler and bot-wiring tests pass unchanged and new node tests cover the payload (payee, event name, payer snapshot), the caption and image lines (name only, no payer number, no name segment when absent).

## 2. Posting to the chat

- [x] 2.1 Add `src/web/telegram.ts` (`sendPhoto` multipart with `chat_id`, optional `message_thread_id`, `caption`, Received/Void `reply_markup`, BMP photo) returning true/false and never throwing; verify with node tests using a stubbed `fetch` for the request shape (URL, fields, topic omitted when 0), a non-ok response and a thrown error.

## 3. Endpoints

- [x] 3.1 `POST /api/events/:ref/payments`: validate payer and amount, open event only, create via `createPaymentRequest` owned by the session user, post to the chat, return `posted`; verify with workers tests for success (with and without name), invalid payer/amount, closed event, unknown event, a failing chat post that keeps the payment (`posted: false`), the access/safeguard cases (401, 403 non-admin, 403 cross-origin, nothing recorded) and that no payer number appears in the response.
- [x] 3.2 `GET /api/events/:ref/payments/:paymentRef/qr` (PNG, details below the QR); verify `image/png`, 404 for another event's payment, 403 for a non-admin.
- [x] 3.3 `POST /api/events/:ref/payments/:paymentRef/received` and `/void` (pending-only CAS recording the session user, 409 `not_pending` for losers); verify totals move from pending to collected on received and out of totals on void, actors recorded, a repeat is refused, a racing Received and Void have one winner, and a payment of another event is 404.

## 4. Page

- [x] 4.1 Add the New payment request form (open events only), the QR and posted/not-posted message after creation, and QR plus Received / Void buttons for pending payments, built with `textContent`; verify the page-shell node test (script parses, controls present, still no `<form>` or `innerHTML`; update its assertions that previously required the absence of received/void controls) and a workers test that the closed-event page data lets the UI hide the form (`event.status`).

## 5. Wrap-up

- [x] 5.1 Update README.md, AGENTS.md and `docs/architecture.md` (the web page can now create, receive and void payments; new routes; the Telegram post from the Pages Function; shared payment-request helper) and remove the statements that payments cannot be created, received or voided from the web; run `npm run check`, `npm run build` and `npm test` and confirm all pass.

## Workflow follow-up

- After deploying, create one request on the page and confirm the QR arrives in the event's chat with working Received / Void buttons.
