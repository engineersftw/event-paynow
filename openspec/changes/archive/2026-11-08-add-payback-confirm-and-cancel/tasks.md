## 1. Data model

- [x] 1.1 Hand-write `drizzle/0003_*.sql`: rebuild `paybacks` with `CHECK(status IN ('pending','sent','cancelled'))`, copy rows, drop/rename, recreate `paybacks_ref_unique`; add the journal entry and snapshot
- [x] 1.2 Extend `test/node/migration.test.ts`: run 0003 on seeded 0000–0002 data, assert rows preserved and a `cancelled` row inserts
- [x] 1.3 Add `'cancelled'` to `PaybackStatus` (`repository.ts`) and the schema comment; update the hand-written `paybacks` CHECK in `test/workers/harness.ts` and the other test schemas

## 2. Bound and transitions

- [x] 2.1 Exclude `cancelled` in `sumPaybacks` and in the guarded insert and totals SQL of `createPaybackBounded`
- [x] 2.2 Make `updatePaybackStatus` accept `'cancelled'` with the pending-only compare-and-set; set `sentAt` only for `sent`
- [x] 2.3 Repository tests: cancel frees allowance, sent still counts, cancel-vs-sent race has one winner, cancelled cannot become sent, concurrent create after cancel respects the bound

## 3. Handlers

- [x] 3.1 Attach **✓ Sent** (`pb_sent:<pay>:<pb>`) and **✖ Cancel** (`pb_cancel:<pay>:<pb>`) buttons to the payback QR photo in `payback-handler.ts`
- [x] 3.2 In `payment-callback-handler.ts`, make `pb_sent` on a photo message reply with a `✅ Sent <time>` summary and delete the photo (keep in-place re-render for the detail view); tolerate `deleteMessage` failure
- [x] 3.3 Add `pb_cancel`: ownership check, pending-only CAS, `❌ Cancelled` summary replacing the photo (or in-place re-render in detail), "already sent / already cancelled" answers for losers
- [x] 3.4 Detail view: **Cancel** button per pending payback, ❌ marker for cancelled, exclude cancelled from *Total Payback* and *Remaining*
- [x] 3.5 Update `test/node/payback-handler.test.ts`, `payment-callback-handler.test.ts`, and add a workers wiring test: payback → Sent from photo; payback → Cancel from photo then re-create at full amount

## 4. Docs and verification

- [x] 4.1 Update `AGENTS.md` (payback bound excludes cancelled; Sent/Cancel on QR photo); run `npm run build`, `npm run check`, `npm test`
