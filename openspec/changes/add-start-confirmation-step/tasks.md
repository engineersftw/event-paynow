## 1. Atomic claim

- [x] 1.1 Add `POST /claim` to `ConversationDO` (`{ flow, step }` match ⇒ reset to idle and return the previous state; otherwise 409)
- [x] 1.2 Workers tests (`test/workers/conversation-do.test.ts`): claim succeeds once, repeat and mismatched flow/step return 409, state is idle after a claim, concurrent claims have one winner

## 2. /start confirmation step

- [x] 2.1 `start-handler.ts`: after a valid amount store `amountCents`, move to step 5 and send the summary (event, payer `Name (proxy)`, pay-to proxy, amount) with Confirm / Cancel buttons; re-check the event is open when building it
- [x] 2.2 Handle `start_confirm`: claim via the DO, edit the summary to "confirmed", then create the payment and send the QR using the claimed amount; losers get an "already processed / expired" answer; creation failure tells the user to re-run `/start`
- [x] 2.3 Handle `start_cancel` (reset, edit summary to cancelled) and keep typed `cancel`/`/cancel`; text at step 5 nudges to tap a button
- [x] 2.4 `bot.ts`: route `start_confirm` and `start_cancel` to the start handler

## 3. Tests

- [x] 3.1 Update existing flow tests (`test/node/start-handler.test.ts`, `test/workers/start-flow.test.ts`, `e2e-event-flow.test.ts`, `bot-wiring.test.ts`) so amounts are followed by a Confirm tap
- [x] 3.2 New tests: summary content and no payment/QR before Confirm; Confirm creates one payment and the QR; Cancel button and typed cancel create nothing; double Confirm creates exactly one payment; closed event at Confirm; text at the summary; stale Confirm after expiry

## 4. Docs and verification

- [x] 4.1 Update `AGENTS.md` (`/start` flow, `/claim` route); run `npm run build`, `npm run check`, `npm test`
