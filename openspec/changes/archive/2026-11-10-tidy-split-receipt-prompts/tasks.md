## 1. Handler

- [x] 1.1 In the `split_scan:*` branch of `src/commands/split-handler.ts`, delete the review message on `split_scan:use` (falling back to removing its buttons if the delete fails) and keep the current button removal for the other taps
- [x] 1.2 In the `split_payee:*` branch, rewrite the tapped bubble with `editMessageText` to "Payment was made by you." or "Payment was made by someone else." (no keyboard, best effort) before continuing
- [x] 1.3 Reword the end of the assignment prompt as in the design, and check that no other prompt says the organiser's share is not collected before the payee is known

- [x] 1.4 In `summary()` count the organiser in "shared by N people" by the rule in the design

## 2. Tests and docs

- [x] 2.1 Extend `test/workers/split-bot.test.ts` (and the harness if needed): the review is deleted on Use this and kept on Scan again, the payee bubble is edited for both answers with no buttons, the assignment prompt has the new wording and not the old, and the people count is 3 for a receipt split with an own share, 3 when a custom leftover is covered, and 2 for an exact list or an even leftover
- [x] 2.2 Update the README or `docs/architecture.md` only where they quote this wording
- [x] 2.3 Run `npm run build`, `npm run check` and `npm test`; fix anything they report
