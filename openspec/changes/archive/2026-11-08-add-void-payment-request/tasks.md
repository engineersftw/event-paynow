## 1. Data model

- [x] 1.1 Generate `drizzle/0004_*` via `drizzle-kit generate --custom` and hand-write the `payments` rebuild (explicit columns, CHECK incl. `'voided'`, recreate `payments_ref_unique`)
- [x] 1.2 Extend `test/node/migration.test.ts`: run 0000–0004 on seeded data, assert rows (incl. `event_id`, `payer_*`) survive and a `voided` insert succeeds
- [x] 1.3 Add `'voided'` to `PaymentStatus` and the schema comment; update the hand-written `payments` CHECK in `test/workers/harness.ts` and every other test schema

## 2. Repository

- [x] 2.1 Add `voidPayment(ref)` (pending-only compare-and-set, returns the updated payment or null) to `Repository` and `D1Repository`
- [x] 2.2 Guard `updatePaymentStatus(..., 'received', ...)` with `AND status = 'pending'`; make `PaymentService.markPaymentReceived` return null for `voided`
- [x] 2.3 `getEventStats`: exclude `voided` from `paymentCount` (totals already ignore it)
- [x] 2.4 Repository/service tests: void pending, void received/voided → null, Received-vs-Void race has one winner, stats exclude voided, received after void rejected

## 3. Handlers

- [x] 3.1 `start-handler.ts`: QR photo buttons become ✓ Received (`mark_received:`) and ✖ Void (`void:<ref>`); remove Payback
- [x] 3.2 `payment-callback-handler.ts`: handle `void:<ref>` (refuse received / voided / active paybacks; CAS; photo → `🚫 Voided` status line with optional `Payer:` segment + delete photo, detail → re-render); make `mark_received` answer "was voided" for voided payments; refuse `payback:` for non-received payments
- [x] 3.3 `payments-handler.ts` and detail view: explicit status→icon/label map with 🚫 Voided; Payback button only for received; voided rows View only
- [x] 3.4 `bot.ts`: route the `void:` callback
- [x] 3.5 Tests: button set on the QR photo, void happy path and every refusal, voided/refused Received, Payback refused on pending/voided, list/detail rendering, `/payments` and `/end_event` figures exclude voided, workers end-to-end (`/start` → Void → Received refused → stats)

## 4. Docs and verification

- [x] 4.1 Update `AGENTS.md` (QR photo actions, `voided` status, guarded transitions, payback only for received); run `npm run build`, `npm run check`, `npm test`
