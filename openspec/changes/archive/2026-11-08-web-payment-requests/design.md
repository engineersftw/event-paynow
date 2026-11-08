# Design

## Context

`/start` builds a payment in `StartCommandHandler.createPaymentAndSendQr`: `generateRef`, `buildPayNowPayload` (event payee, event name as merchant and description), `createPayment` (pending, `manual`, payer snapshot), the QR image lines and caption (name only, never the number), and `replyWithPhoto` with ✓ Received / ✖ Void buttons. The web handler (`src/web/handler.ts`) already has `eventAccess` (session, event, live chat-admin check), the same-origin JSON guard for POSTs, `createPaybackFor`, `bmpToPng` and a QR route for paybacks. The Pages project already has `TELEGRAM_BOT_TOKEN`. Today the web spec forbids creating, receiving and voiding payments.

## Goals / Non-Goals

**Goals:**
- Create a payment request from the page with identical results to `/start` (same payload, caption, image text, buttons).
- Post the QR to the event's chat and show it on the page.
- Settle (Received / Void) pending payments from the page with the same guarded transitions as the bot.

**Non-Goals:**
- Changing `/start` or its confirmation step; custom descriptions; editing a payment; keeping the chat message in step with web changes (stale buttons are already handled by the bot); new tables or migrations.

## Decisions

1. **Shared helper `src/payments/payment-request.ts`**: `createPaymentRequest(repo, event, { payer, payerName, amountCents, userId })` (ref, payload, pending `manual` payment), `paymentCaption(payment)` and `paymentImageLines(event, payment)` (names only), plus the share hint. `StartCommandHandler` switches to it (pure extraction; its tests must pass unchanged). Alternative: duplicate the payload and caption in the web handler — rejected, the forwarded caption and the payload must not drift.
2. **Routes** (all POSTs: same-origin JSON guard, then session → event → live admin check, via the existing `eventAccess`):
   - `POST /api/events/:ref/payments` `{payer, name?, amount}` → 201 `{payment: {ref, amountCents, status, posted}}`; 400 `invalid_payer` / `invalid_amount`; 409 `event_closed`; 404. Validation reuses `detectProxyType` and `parseAmount`; the signed-in user id is the owner.
   - `GET /api/events/:ref/payments/:paymentRef/qr` → `image/png` (`bmpToPng(renderQrPng(qrPayload, paymentImageLines(...)))`); 404 unless the payment belongs to the event. Used right after creation and for pending payments in the list.
   - `POST /api/events/:ref/payments/:paymentRef/received` and `/void` → pending-only compare-and-set (`updatePaymentStatus(..., 'received', 'manual', ts, userId)` / `voidPayment(ref, userId)`), 409 `{error: 'not_pending', status}` for losers. A pending payment cannot have paybacks, so no extra void guard is needed.
3. **Posting to the chat from the Pages Function**: `src/web/telegram.ts` calls Telegram's `sendPhoto` with the existing bot token: multipart `chat_id`, `message_thread_id` (only when the event's topic is not 0), `caption`, `reply_markup` with the two callback buttons (`mark_received:<ref>` / `void:<ref>`, handled by the bot webhook exactly as for `/start` messages) and the BMP as the photo (what the bot sends today). It returns true/false and never throws; failure leaves the payment recorded and `posted: false` in the response. Alternatives: a service binding to the Worker (new infra and secrets) or voiding on failure like `/start` (rejected here: the QR is still usable from the page).
4. **Page UI**: a "New payment request" form (payer, optional name, amount) shown only while the event is open; after success it displays the QR `<img>` and either "Posted to the chat" or "Could not post to the chat". Pending payments get a QR `<img>` plus **Received** / **Void** buttons in a sub-row (like paybacks); the page re-fetches after each action; buttons disable while a request is in flight; all text via `textContent`.
5. **Spec shape**: the "Event page lists all payments" requirement drops its "no create/receive/void" sentence and its "Read only" scenario is reworded (the scenario name is kept); the rest is new requirements.

## Risks / Trade-offs

- [Telegram call from the Pages Function can fail or be slow] → bounded to one call, failure reported as `posted: false`, payment kept; the admin can still share the QR from the page or void it.
- [Duplicate requests on a double submit] → the UI disables the button; a stray duplicate is a pending payment that can be voided.
- [Web settlement leaves the chat message's buttons in place] → the bot already answers stale taps with the current status; editing the message would need its message id stored (out of scope).
- [Admins can now create and settle payments for any payer] → same trust level as the bot's admin access; every settlement records the actor in the audit columns, and creation records the owner.
- [BMP photo upload from a Pages Function] → the bot already uploads the same BMP; a stubbed-fetch test checks the request shape, and the first real post is part of the manual check.

## Migration Plan

No schema change. Merge deploys the Worker (`/start` refactor) and the Pages app via GitHub Actions; roll back by reverting the merge. After deploying, try one request on the page and confirm the QR arrives in the chat.
