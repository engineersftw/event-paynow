# Proposal

## Why

The QR photo sent by `/start` offers **✓ Received** and **Payback**. Payback makes no sense on a payment that hasn't been received (the `/payback <ref>` command already refuses it), yet the button starts the flow anyway. Meanwhile there is no way to retract a payment request created by mistake (wrong amount, wrong payer): the QR just sits there as a pending payment that skews the event's pending total.

## What Changes

- The `/start` QR photo drops **Payback** and gains **✖ Void**. Buttons: **✓ Received**, **✖ Void**.
- Tapping **Void** voids a *pending* payment: the photo is replaced by a text status line (`<desc> / SGD <amt> / <ref> / Payer: <name> / 🚫 Voided <time>`) and the QR is removed, mirroring ✓ Received.
- New payment status **`voided`** (history kept, not deleted). Voided payments cannot be marked received or paid back, and are excluded from an event's payment count and collected/pending totals (so `/payments` and the `/end_event` summary stay accurate).
- Void is refused if the payment already has a pending/sent payback, and is race-safe against ✓ Received (only one wins).
- `/payments` event lists show voided payments with a 🚫 marker and a **View** button only. The list's **Payback** button is shown only for *received* payments (the existing spec already says so; the code shows it for every payment). The payment detail view renders the voided status.
- **Payback by button is refused unless the payment is received**, matching `/payback <ref>`.
- **BREAKING (data):** migration rebuilds `payments` to widen its status CHECK to include `voided`.

Assumptions (recorded, not asked): "remove the payment request" means void-with-history rather than hard delete; only `pending` payments can be voided (a received payment is money in hand — use paybacks); no confirmation step (a voided request can simply be re-issued with `/start`); Void is offered on the QR photo only — a Void button in the `/payments` list is a possible follow-up; voiding does **not** invalidate a QR already shared, so a payer who still pays it won't be recorded by the bot.

Out of scope: un-voiding, a `voided_at` column, notifying the payer, bank-side invalidation.

## Capabilities

### New Capabilities

(none)

### Modified Capabilities

- `payment-qr-issuance`: QR message actions are ✓ Received and ✖ Void (no Payback).
- `payment-tracking`: a pending payment can be voided; voided payments can't be marked received.
- `event-management`: `/payments` list shows voided payments with 🚫/View only, and Payback only for received payments.
- `event-scoped-payments`: voided payments are excluded from the per-event count and totals.
- `payback-qr`: payback from a button is refused for non-received payments.

## Impact

- `src/db/schema.ts`, hand-written migration `drizzle/0004_*.sql` (rebuild `payments`, all columns incl. `event_id`, `payer_*`), journal/snapshot.
- `src/db/repository.ts`, `drizzle-repository.ts`: `PaymentStatus`, guarded `pending→voided` and `pending→received` transitions, `getEventStats`.
- `src/commands/start-handler.ts`, `payment-callback-handler.ts`, `payments-handler.ts`, `src/bot.ts` (callback routing).
- Test harness/hand-written `payments` schemas and affected tests; `AGENTS.md`.
