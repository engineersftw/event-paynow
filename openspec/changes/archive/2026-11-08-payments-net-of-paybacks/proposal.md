# Proposal

## Why

`/payments` shows each payment's full amount and the event's collected total as if no money had gone back. Once a payback is sent, the amount that actually stays with the organiser is lower, but nothing in the list says so, so the totals overstate what was kept.

## What Changes

- A payment's **net amount** is its amount minus its **sent** paybacks. Pending and cancelled paybacks do not reduce it.
- Event payment list (drill-down): each payment shows its net amount, the original amount, and the total paid back when any payback has been sent.
- Payment detail view: shows the total paid back (sent) and the net amount; a separate line shows pending paybacks when there are any.
- Top-level `/payments` event summary: "collected" becomes net of sent paybacks, and a new "paid back" total is shown. The `/end_event` summary uses the same figures.
- Web admin page: the payments table gains `Paid back` and `Net` columns per payment, and the totals show collected (net of sent paybacks), paid back and pending, so the page matches the bot.
- Not changed: the payback bound (pending + sent still count against the payment's amount), payback creation, captions, QR images, schema (no migration).

## Capabilities

### New Capabilities

### Modified Capabilities
- `event-scoped-payments`: the per-event summary's collected total is net of sent paybacks and adds a paid-back total.
- `payment-tracking`: payment entries and the detail view show the net amount and total paid back.
- `web-admin`: the event page lists per-payment paid back and net amounts and net-of-paybacks totals.

## Impact

- `src/db/drizzle-repository.ts` / `repository.ts` (event stats gain `paidBackCents` and a net `collectedCents`; a per-event sent-payback totals query), `src/commands/payments-handler.ts`, `src/commands/payment-callback-handler.ts` (detail view), `src/commands/end-event-handler.ts` (summary wording), `src/web/handler.ts` (API payload and page table).
- Tests: event stats and per-payment totals (workers pool), handler output (node pool); existing tests asserting `Total Payback` / collected figures are updated.
- The web admin API adds `paidBackCents` per payment and a `paidBackCents` total; `collectedCents` in the API becomes net, so the page and bot show the same figures. Tests: `test/workers/web-admin.test.ts`.
