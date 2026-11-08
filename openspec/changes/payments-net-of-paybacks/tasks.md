# Tasks

## 1. Data layer

- [x] 1.1 Extend `EventStats` and `getEventStats` with `paidBackCents` and a net `collectedCents` (received amounts minus sent paybacks; pending and cancelled excluded); verify with a workers-pool test for no paybacks, sent, pending and cancelled paybacks, and a voided payment.
- [x] 1.2 Add `sentPaybackTotalsByEvent(eventId)` to `Repository` and `D1Repository`; verify with a workers-pool test covering several payments, multiple sent paybacks on one payment, and pending/cancelled being ignored.

## 2. Messages

- [x] 2.1 Show collected (net), paid back and pending in the top-level `/payments` event line and in the `/end_event` summary; verify with node tests (including the spec's "Sent payback reduces collected" scenario).
- [x] 2.2 Show net amount, original amount and paid back in the event drill-down entries that have sent paybacks, leaving other entries unchanged; verify with a node test of both entry shapes.
- [x] 2.3 Update the payment detail view: `Paid back` (sent), `Net`, optional `Pending paybacks`, unchanged `Remaining`; update the existing `Total Payback` assertions and add the pending-only scenario.

## 3. Web admin

- [x] 3.1 In `src/web/handler.ts`, add per-payment `paidBackCents` / net and the totals `collectedCents` (net), `paidBackCents`, `pendingCents` to the API using `sentPaybackTotalsByEvent`; verify in `test/workers/web-admin.test.ts` with sent, pending and cancelled paybacks and that no PayNow numbers appear in the JSON.
- [x] 3.2 Add `Paid back` and `Net` columns and a `Paid back` total to the page; verify the page shell still has no forms and renders values via `textContent` (existing page test) and update the page test for the new columns.

## 4. Wrap-up

- [x] 4.1 Update README.md and `docs/architecture.md` where they describe `/payments` and web admin totals; run `npm run check`, `npm run build` and `npm test` and confirm all pass.
