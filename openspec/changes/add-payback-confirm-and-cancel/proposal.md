# Proposal

## Why

Paying someone back mirrors collecting a payment, but only the collecting side is handled well: a received payment's QR photo carries a **✓ Received** button and is replaced by a text status once confirmed. The payback QR photo has no buttons at all. The only way to confirm that the money was sent is to open the payment detail view, and a wrongly created payback cannot be cancelled, so it keeps consuming the payment's payback allowance.

## What Changes

- The payback QR photo carries **✓ Sent** and **✖ Cancel** buttons.
- Tapping **✓ Sent** marks the payback sent and, as for received payments, replaces the QR photo with a text status line (`… / ✅ Sent <time>`) — the QR is removed.
- New payback status **`cancelled`**: tapping **✖ Cancel** (pending paybacks only) cancels the payback, replaces the QR photo with a text status line (`… / ❌ Cancelled`), and **releases its amount** from the payment's payback allowance.
- The payment detail view also offers **Cancel** next to **Mark sent** for pending paybacks, shows cancelled paybacks with a ❌ marker, and excludes them from *Total Payback* and *Remaining*.
- Payback bound: `cancelled` paybacks no longer count; `pending` and `sent` still do.
- **BREAKING (data):** migration rebuilds `paybacks` to widen its status CHECK constraint to include `cancelled`.

Assumptions (recorded, not asked): "cancel a Payback event" means cancelling a single payback; only `pending` paybacks can be cancelled (a `sent` payback cannot be undone); cancelling does not ask for a second confirmation because a cancelled payback can be recreated with `/payback`.

Out of scope: un-sending a sent payback, a `cancelled_at` timestamp, notifying the payer, editing a payback's amount.

## Capabilities

### New Capabilities

(none)

### Modified Capabilities

- `payback-qr`: payback QR message gains Sent/Cancel actions with in-place status replacement; payback statuses gain `cancelled`; the payback bound excludes cancelled paybacks.

## Impact

- `src/db/schema.ts`, new hand-written migration `drizzle/0003_*.sql` (table rebuild; `drizzle-kit` cannot generate it because the CHECK lives only in SQL) plus journal/snapshot entries.
- `src/db/repository.ts`, `src/db/drizzle-repository.ts`: `PaybackStatus`, `updatePaybackStatus` (guarded cancel), `sumPaybacks`, and the guard/totals SQL in `createPaybackBounded`.
- `src/commands/payback-handler.ts`: keyboard on the QR photo.
- `src/commands/payment-callback-handler.ts`, `src/bot.ts`: `pb_sent` on a photo message, new `pb_cancel`, detail rendering.
- Test harness `test/workers/harness.ts` and other hand-written `paybacks` schemas; affected unit/integration tests; `AGENTS.md` bound description.
