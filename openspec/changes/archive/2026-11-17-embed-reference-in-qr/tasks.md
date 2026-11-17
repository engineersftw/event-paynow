# Tasks

## 1. QR payload

- [x] 1.1 In `createPaymentRequest` set the QR description to `truncateAnsi(`${ref} ${event.name}`, 25).trim()` (import `truncateAnsi` from `src/sgqr/paynow.ts`), leaving the stored description, caption and image text unchanged; verify with `npm run build`
- [x] 1.2 Tests: in `test/node/payment-request.test.ts` decode the payload's tag 62.01 and assert the reference then the event name for a normal name, a name longer than 14 characters (reference whole, total 25), and a non-ASCII-only name (reference alone, no trailing space); assert 26.05 still holds the reference; add the same 62.01 check to the `/start` decode test in `test/workers/start-flow.test.ts` and confirm a web-created payment's payload matches; verify the suites pass

## 2. Docs and checks

- [x] 2.1 Update `docs/architecture.md` and AGENTS.md where they describe the QR payload (reference in 26.05, description in 62.01) to say 62.01 starts with the reference for event payments
- [x] 2.2 Run `npm run build`, `npm run check` and `npm test`; fix anything they report

## 3. Rollout

- [x] 3.1 After deploy, create a payment with `/start` and scan it with the banking app: the chip or reference line under the amount reads the reference then the event name; complete a test payment and confirm the reference shows in the app's transaction history or statement, and that a check-in scan of the new QR still works

## Workflow follow-up

- Archive the change after 3.1 is confirmed with a real banking app.
