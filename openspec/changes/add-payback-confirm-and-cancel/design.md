# Design

## Context

Received payments already behave as the user wants for paybacks: the QR photo carries `mark_received:<ref>`, and `handleMarkReceived` replies with a text summary and deletes the photo. Paybacks differ today: the payback QR photo (`PaybackCommandHandler.createPaybackRecord`) has no buttons; `pb_sent:<paymentRef>:<paybackRef>` exists only in the payment detail view, which re-renders in place. `paybacks.status` is `pending | sent`, enforced by a CHECK that exists only in the SQL migration (not in `schema.ts`). The payback bound counts every payback: `createPaybackBounded`'s guarded `INSERT ... SELECT`, its totals subquery, and `sumPaybacks` have no status filter. See proposal.md for scope and assumptions.

## Goals / Non-Goals

**Goals:**
- Sent/Cancel from the QR photo with the same replace-photo UX as received payments.
- A real `cancelled` status that frees the amount and keeps an audit trail.
- Race-safe transitions (Sent vs Cancel vs duplicates).

**Non-Goals:** un-sending, cancel timestamps, payer notification, amount edits.

## Decisions

1. **`cancelled` status instead of deleting the row.** Keeps history visible (❌ in detail) and matches the "update the message with the status" ask. *Alternative:* hard-delete the payback — needs no migration but loses the record and any later audit. Rejected.

2. **Migration rebuilds `paybacks`.** SQLite cannot alter a CHECK, and `drizzle-kit generate` cannot see it (the constraint isn't in `schema.ts`), so `drizzle/0003_*.sql` is hand-written: create `paybacks_new` with `CHECK(status IN ('pending','sent','cancelled'))`, copy all rows, drop `paybacks`, rename, recreate `paybacks_ref_unique`. Add the matching journal entry/snapshot so drizzle-kit stays consistent. The production schema declares no foreign keys, so the rebuild is safe; ids are copied verbatim to keep `AUTOINCREMENT` sequences stable. Verified with the existing better-sqlite3 migration test extended to run 0003 and assert existing rows survive and `cancelled` inserts succeed. Update the hand-written test schemas (`harness.ts` and the other test files) too.

3. **Cancelled paybacks don't count toward the bound.** Add `status != 'cancelled'` to the guarded insert's SUM, the totals subquery in `createPaybackBounded`, and `sumPaybacks`. Sent still counts (existing decision), so only the new status changes behavior; the in-transaction CAS guard remains authoritative. *Alternative:* keep cancelled in the sum — makes cancel pointless.

4. **Guarded transitions.** `updatePaybackStatus(ref, 'sent' | 'cancelled', ts)` applies `WHERE status = 'pending'` for both targets, so Sent and Cancel taps race to exactly one winner (the existing CAS pattern). A loser reads the current row to answer "already sent" / "already cancelled". `sentAt` is set only for `sent`.

5. **One handler, two surfaces.** `pb_sent` / new `pb_cancel` stay in `PaymentCallbackHandler` with the same `<paymentRef>:<paybackRef>` payload (≤ 64-byte limit: ~28 bytes). When the tapped message is a photo (`ctx.callbackQuery.message.photo`), reply with the summary text and `deleteMessage` the photo — identical to `handleMarkReceived`; otherwise (detail view) re-render in place as today. `bot.ts` already falls unknown prefixes through to this handler, so only the router test for `pb_cancel` is new.

6. **No confirm step for Cancel.** Consistent with ✓ Received, and a cancelled payback is cheap to recreate. The summary text makes the outcome obvious.

7. **Detail rendering.** Cancelled paybacks show `❌ ... (cancelled)`, are excluded from *Total Payback* and *Remaining*, and get no buttons; pending ones get both **Mark sent** and **Cancel** per row.

## Risks / Trade-offs

- [Table rebuild on a live D1] → small table, one migration run; apply the migration *before* deploying the code that writes `cancelled` (the widened CHECK is harmless to old code). Rollback: redeploy the previous code; any `cancelled` rows would then count toward the bound under the old SQL — acceptable and noted.
- [Mis-tap on Cancel] → recoverable by creating a new payback.
- [Bound change reopens allowance] → intended; covered by regression tests (cancel frees, sent still counts, concurrent create vs cancel).
- [Photo already deleted / message too old to delete] → `deleteMessage` failure is non-fatal: the DB transition has committed and the text summary has been sent; log and continue.

## Migration Plan

1. Hand-write `0003` + journal/snapshot; extend migration test.
2. Apply remotely (`wrangler d1 migrations apply paynow-db --remote`), then deploy.
