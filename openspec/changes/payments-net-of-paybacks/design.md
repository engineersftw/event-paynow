# Design

## Context

`getEventStats(eventId)` (`drizzle-repository.ts`) returns `paymentCount`, `collectedCents` (received sum) and `pendingCents`, and feeds both the top-level `/payments` list and the `/end_event` summary. The event drill-down lists the caller's payments (`listPaymentsByUser` filtered by event) with no payback data. The detail view (`renderPaymentDetail`) already loads a payment's paybacks and prints `Total Payback` (pending + sent, cancelled excluded) and `Remaining` (the payback bound). Paybacks exist only for received payments, and a payment with paybacks cannot be voided.

## Goals / Non-Goals

**Goals:**
- One definition of "net": amount minus **sent** paybacks, used by the list, the detail view and the event totals.
- No extra query per payment in the list.

**Non-Goals:**
- Changing the payback bound (still pending + sent), payback flows, captions or QR images.
- Showing per-payment pending paybacks in the list (only in the detail view).

## Decisions

1. **Sent-only net, as requested.** This differs from the bound (pending + sent); the detail view therefore keeps a pending line and the existing `Remaining` (payable-back room) so both ideas stay visible and distinct. Alternative: reuse the bound figure — rejected, the user chose sent only.
2. **Extend `getEventStats`**: add `paidBackCents` (sum of sent paybacks of the event's payments) and make `collectedCents` = received amounts − `paidBackCents`, in one query with a subquery over `paybacks JOIN payments`. Both `/payments` and `/end_event` read it, so they cannot disagree.
3. **New `Repository.sentPaybackTotalsByEvent(eventId): Promise<Map<number, number>>`** (paymentId → sent cents) via `paybacks JOIN payments WHERE payments.event_id = ? AND paybacks.status = 'sent' GROUP BY payment_id`. The drill-down makes one call per render. Alternative: `listPaybacksByPayment` per payment (N+1) or an `IN (...)` list (D1 caps bound parameters).
4. **Detail view** computes `paidBack = sum(sent)`, `net = amount − paidBack`, `pending = sum(pending)` from the paybacks it already loads; the `Total Payback` line becomes `Paid back` (sent only), followed by `Net`, an optional `Pending paybacks`, and the unchanged `Remaining`.
5. **Web admin** (`src/web/handler.ts`) already loads the event's payments; it calls `sentPaybackTotalsByEvent(event.id)` once and derives per-payment `paidBackCents` and `netCents`, plus totals (`collectedCents` = received − sent paybacks of received payments, `paidBackCents`, `pendingCents`) from the rows it already holds (same rule as `getEventStats`, covered by tests on both sides). The JSON gains `paidBackCents` per payment and in `totals`; the page adds `Paid back` and `Net` columns and a `Paid back` total, still written with `textContent`. Voided payments stay excluded from totals, and no PayNow numbers are added to the payload.
6. **List entry format**: when sent paybacks exist, the headline shows the net amount with the original in parentheses, and the second line gains `Paid back $X`; entries without sent paybacks are byte-identical to today.

## Risks / Trade-offs

- [Two meanings of "paid back" (sent vs pending+sent) confuse users] → label them explicitly (`Paid back` vs `Pending paybacks`, `Remaining`).
- [The API's `collectedCents` changes meaning (gross → net)] → the only consumer is the bundled page, updated in the same change; no external clients.
- [Existing tests assert `Total Payback`] → updated with the change.
