# Proposal

## Why

Payment requests can only be created through the `/start` conversation in Telegram. An admin working on the event page has to leave it to create a request, and a request created elsewhere can't be settled from the page. Creating, settling and voiding payment requests on the web page, with the QR also posted to the event's chat, makes the page a complete admin tool for an event.

## What Changes

- The event page gets a **New payment request** form, with the same inputs as `/start`: payer PayNow mobile/UEN (required), payer display name (optional), amount. The payee and description come from the event, as in the bot; the signed-in admin is recorded as the payment's owner. Only **open** events accept requests.
- On success the page shows the payment's **QR as a PNG** (details below the QR, names only) and the bot **posts the QR photo to the event's chat** (same caption and **Received / Void** buttons as `/start`, in the event's topic). If posting to the chat fails, the payment is kept and the page says so (the page QR is still usable).
- Pending payments get **Received** and **Void** buttons on the page (pending-only compare-and-set, the acting admin recorded in the audit columns); losers of a race get a clear message. This relaxes the earlier rule that payments cannot be received or voided from the web.
- Safeguards as for the payback actions: signed-in session, live chat-admin check, same-origin JSON.
- Shared logic: payment-request creation (payload, record, caption, image lines) is extracted from the `/start` handler so the bot and the web build identical requests.
- Not changed: the `/start` flow and its confirmation step, schema (no migration), paybacks.

## Capabilities

### New Capabilities

### Modified Capabilities
- `web-admin`: the page can create payment requests (QR on the page and in the chat) and mark pending payments received or void.

## Impact

- `src/web/handler.ts` (new routes, QR endpoint for payments, form and buttons), a shared payment-request helper used by `src/commands/start-handler.ts` and the web handler, a small Telegram `sendPhoto` helper for the Pages Function (uses the existing `TELEGRAM_BOT_TOKEN`).
- Merging deploys both the Worker (start-handler refactor) and the Pages app. No migration.
- Tests: web handler (workers pool, stubbed Telegram), shared helper and `/start` tests (node pool).
- Stale buttons: when a payment is settled on the web, the QR message in Telegram keeps its buttons until tapped; the bot already answers stale taps with the current status.
