## 1. Data model

- [x] 1.1 Add nullable `payerType`, `payerValue`, `payerName` to `payments` in `src/db/schema.ts`; run `npm run db:generate` and commit `drizzle/0002_*.sql`
- [x] 1.2 Add `payerType?`, `payerValue?`, `payerName?` to `Payment` (`src/db/repository.ts`); persist in `createPayment` and map in `toPayment` (`src/db/drizzle-repository.ts`)
- [x] 1.3 Extend `test/workers/repository.test.ts`: create/read payment with and without payer fields

## 2. /start payer steps

- [x] 2.1 In `start-handler.ts`, route event selection (auto-advance and `start_pick`) to step 2 (payer proxy) and renumber amount to step 4
- [x] 2.2 Implement step 2: validate with `detectProxyType`, re-prompt on invalid, store normalized payer in DO context
- [x] 2.3 Implement step 3: optional name text input (trimmed, length-capped) with Skip button (`start_skip_name`); handle Skip in `handleCallback` and route it in `src/bot.ts`
- [x] 2.4 Pass payer fields into `createPayment`; keep QR caption unchanged
- [x] 2.5 Update `test/node/start-handler.test.ts`, `test/workers/start-flow.test.ts`, `test/workers/e2e-event-flow.test.ts` for new steps; add cases: invalid proxy, name skipped, cancel at each new step

## 3. Payback confirms / changes recipient

- [x] 3.1 Extract shared payback-start state seeding (paymentRef/Id/amount/description) and use it from both `/payback <ref>` and the **Payback** button (`payment-callback-handler.ts`)
- [x] 3.2 When the payment has a payer, set `pendingPayer` and show the step-2 confirm message with Confirm / Change recipient / Cancel; otherwise keep the step-1 prompt
- [x] 3.3 Add `payback_change_payer:` callback (step 2 → step 1 prompt, edit message in place) and route it in `src/bot.ts`; changed recipient flows through existing validation and confirm and is not persisted to the payment
- [x] 3.4 Update `test/node/payback-handler.test.ts` and `payment-callback-handler.test.ts`: confirm stored payer, change recipient (valid and invalid), stored payer unchanged, legacy fallback, button path reaches the same steps, bound pre-check still applies

## 4. Display and docs

- [x] 4.1 Show "Payer: name (proxy)" / "Payer: proxy" in payment detail (`payment-callback-handler.ts` `renderDetails`) with a test
- [x] 4.2 Update `AGENTS.md` /start and /payback descriptions; run `npm run build`, `npm run check`, `npm test`
