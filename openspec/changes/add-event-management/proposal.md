# Proposal

## Why

The current bot models PayNow around a single per-user payee and a per-payment description. Real use is event-based: one chat topic, one shared PayNow receiver, many payments against that event. Today you'd have to re-run `/init` per event or retype the description every time. Adding first-class **events** lets a group run one event (one payee, one description) with multiple `/start` payments against it, and an `/end_event` to cleanly close collections.

## What Changes

- **New `events` table**: per-chat (and per-topic when in a supergroup topic) entity with `ref`, `name`, `payee_type`, `payee_value`, `status` (`open` | `closed`), `created_at`, `closed_at`.
- **`/init` reworked**: collects **event name + mobile/UEN** instead of a user-level reference; creates an open `events` row and echoes the event `ref`.
- **`/start` reworked**: lists open events → pick one → enter **amount only** (event name becomes the fixed description in tag 62.01; per-payment description is removed) → QR.
- **`/end_event` added**: lists open events → pick one → confirm → sets `status = 'closed'`, stamps `closed_at`. Closed events reject new `/start`.
- **`/payments` scoped by event**: top-level lists open + recently-closed events; drilling into one shows its payments (existing detail/mark-received/payback buttons preserved).
- **`payments` table** gains `event_id` (FK to `events.id`, NOT NULL). Payee snapshot on the payment row stays for audit immutability. Existing `description` column becomes the event name at creation time (still present in the row for reporting).
- **Payback flow unchanged**: still per-payment; bounded by `payments.amount_cents`.
- **Conversation DO**: new flow states (`init-event-name`, `init-payee`, `init-confirm`, `start-pick-event`, `start-amount`, `end-pick-event`, `end-confirm`).
- **No change to SGQR payload builder or QR rendering** — event name is just the `description` option passed through to tag 62.01.

## Capabilities

### New Capabilities

- `event-management`: creating an event (`/init`), listing open events, closing an event (`/end_event`). Covers the `events` table, its lifecycle, and the chat-scoped isolation (chat_id + topic_id).
- `event-scoped-payments`: `/start` producing a payment row linked to a chosen event with the event name as the fixed description, and `/payments` drilling from event → payments → existing per-payment actions.

### Modified Capabilities

- `payment-tracking` (implicit via the new `event_id` FK and `/payments` event-first flow): the payment row now has an event parent, and the listing UI is event-scoped.

## Impact

- **DB**: new `events` table, new `event_id` column on `payments`. Drizzle schema change → `drizzle-kit generate` produces a migration.
- **Repository**: new `EventRepository` methods (`createEvent`, `listOpenEventsByChat`, `closeEvent`, `getEventByRef`, etc.); payments queries filtered by `event_id`.
- **Command handlers**: rewrite `init-handler.ts`, `start-handler.ts`, `payments-handler.ts`; new `end-event-handler.ts`.
- **Conversation DO**: new flow states; existing `/init`/`/start` states retired.
- **Bot routing**: wire `/end_event` (Telegram only allows underscores in command names).
- **Tests**: Node pool unaffected (SGQR/amount/TLV unchanged). Workers pool: `repository.test.ts` adds event CRUD + event-scoped payment queries; `conversation-do.test.ts` + handler tests rework to the new flows.
- **Existing `users` table**: kept for `/payments` per-user listing (a user's payment history). The per-user PayNow reference column is no longer the source of truth for payment QRs — event payee is. `users` may be deprecated in a later change once events fully cover the user-payee case.
- **Breaking change to bot UX**: running `/init` now creates an event; the old "set my payee" meaning is gone. Private chats that relied on the old single-payee model get a new `/init` experience; the QR payload and /payback flow are otherwise unchanged.
