# Design

## Context

`/start` sends the QR photo with `mark_received:<ref>` and `payback:<ref>` buttons. `handleMarkReceived` replies with a text summary and deletes the photo. `payments.status` is `pending | received`, enforced by a CHECK that exists only in SQL (`0000`). `updatePaymentStatus` is an *unguarded* `UPDATE ... WHERE ref = ?` — the pending check happens only in the handler beforehand. `getEventStats` counts every payment row. `/payments` renders status with a two-way ternary (anything not `pending` shows as received) and adds a Payback button to every row; the `payback:` button path (`beginFlow`) does not check `received`, unlike `/payback <ref>`. This is the same pattern the earlier `cancelled` payback change followed. See proposal.md for scope and assumptions.

## Goals / Non-Goals

**Goals:** Void on the QR photo with the ✓ Received UX; race-safe, history-preserving; accurate event stats; remove the invalid Payback paths.

**Non-Goals:** un-void, `voided_at`, Void in the `/payments` list, invalidating an already-shared QR.

## Decisions

1. **`voided` status, not row deletion.** Keeps an audit trail and any ref the payer might still quote, and matches how payback cancellation works. *Alternative:* hard delete — simplest and needs no migration, but the ref vanishes from the bot while the QR it identifies can still be paid. Rejected.

2. **Migration `0004` rebuilds `payments`.** SQLite can't alter a CHECK and drizzle-kit can't see it, so: `drizzle-kit generate --custom`, then hand-write `payments_new` (all 16 columns in current order: id, ref, user_id, description, amount_cents, payee_type, payee_value, status CHECK in ('pending','received','voided'), source, qr_payload, created_at, received_at, event_id, payer_type, payer_value, payer_name), copy by explicit column names, drop, rename, recreate `payments_ref_unique`. No FKs are declared in prod so the rebuild is safe; ids copied verbatim. Extend the node migration test to run 0000–0004 on seeded data and assert rows survive and `voided` inserts. Update the hand-written `payments` test schemas. Apply remotely *before* deploying.

3. **Guarded transitions for both outcomes.** New `voidPayment(ref)`: `UPDATE ... SET status='voided' WHERE ref=? AND status='pending'` (null for a loser). `updatePaymentStatus(..., 'received', ...)` gains `AND status = 'pending'`, so ✓ Received vs ✖ Void (and duplicate taps) have exactly one winner; existing handler pre-checks stay for friendly messages, and the loser re-reads the row to say "already received / voided". `PaymentService.markPaymentReceived` also treats `voided` as non-transitionable (returns null like received).

4. **No void with active paybacks.** Before voiding, `sumPaybacks(paymentId) > 0` ⇒ refuse. (Paybacks on a *pending* payment are only reachable through the buggy Payback button; with decision 6 it can no longer be created, but legacy data may exist.) This is a pre-check, not transactional; the window is a Payback created between check and void on a pending payment, which decision 6 makes impossible.

5. **Same surface logic as received/payback:** `void:<ref>` handled in `PaymentCallbackHandler`; on a photo message reply `desc / SGD amt / ref / [Payer: name /] 🚫 Voided <time>` and delete the photo (non-fatal on failure), otherwise (detail view) re-render in place. Ownership is already enforced centrally.

6. **Payback only for received payments.** Remove the button from the QR photo; in `PaymentsCommandHandler` render Payback only when `status === 'received'` (matches the existing event-management spec); in `handlePayback` refuse non-received payments with the same message as `/payback <ref>`, which also neutralises stale buttons in old messages.

7. **Stats and rendering.** `getEventStats`: `paymentCount = COUNT(CASE WHEN status != 'voided' ...)`; collected/pending sums already key on status and ignore `voided`. List and detail use an explicit status→icon/label map (⏳ Pending, ✅ Received, 🚫 Voided) instead of the ternary; voided rows get View only.

## Risks / Trade-offs

- [Rebuilding `payments` on live D1] → one migration run, explicit column copy, post-migration row count/sum check (as for `paybacks`); apply before deploy. Rollback: redeploy previous code — old code would render `voided` rows as "Received" and count them in stats, so avoid leaving voided rows in place after a rollback.
- [Voiding doesn't invalidate the shared QR] → documented; recorded as manual-only tracking.
- [Tightened received transition may break callers that relied on an unguarded update] → only `PaymentService`/handler use it; repository + service tests updated.
- [No confirmation on Void] → recoverable by re-issuing `/start`.

## Migration Plan

1. `drizzle-kit generate --custom --name=payments_voided_status`, hand-write SQL, extend migration test.
2. Apply remotely, verify counts and CHECK, then deploy.
