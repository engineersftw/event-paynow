## 1. Amounts

- [x] 1.1 In `src/commands/receipt.ts` add `memberAmount(items, claims, ways, memberId, receiptTotal)` (items split equally between holders, an N-way item costs one share, extras floored against the receipt's item total) and let `shareReceipt` take a set of locked people whose extras are floored, giving the left-over cents to unlocked people by largest remainder, or to the organiser when everyone is locked
- [x] 1.2 Extend `test/node/receipt.test.ts`: the early amount equals the final amount for a locked member whatever the others claim later, a shared item, an item shared N ways, a discount, all members locked, an organiser who holds nothing, and that all amounts still add up to the receipt total

## 2. Handler

- [x] 2.1 Add the **Get my QR** button to the claim message and handle it: claim state read and `locked` / `served` written in one retried conditional write, refusals (nothing held, already taken, organiser is the payee), amount from `memberAmount`
- [x] 2.2 Deliver by direct message, else a waiting-claim record and `answerCallbackQuery` with the start link; description is the receipt's merchant name or none; count with the existing DM and claim counters
- [x] 2.3 Refuse every change to a locked item in `applyClaim` (member taps, the organiser's menu choices and typed names), mark locked items and served members in the claim message and the menu, and say in the claim text that taking a QR locks the items; Get my QR is refused for claimers without a Telegram account
- [x] 2.4 At Done, pass the locked set to `shareReceipt`, leave locked members out of "split evenly between those who claimed" (not offered when only locked members claimed), mark served people in the summary, and skip them in final delivery

## 3. Tests and docs

- [x] 3.1 Extend `test/workers/split-bot.test.ts`: early QR by direct message with the right amount while claiming stays open, the start link when the bot cannot message the member, nothing-claimed and second-tap refusals, the organiser-as-payee notice, locked item taps refused for everyone, a shared locked item, an N-way item, the organiser's menu refused on a locked item, a typed person without an account, a typed @username merged and then taking a QR, the summary amount equals the QR amount, no second QR at confirmation, the unclaimed-items choice without locked members, and totals that add up
- [x] 3.2 Update README (group claiming), `docs/architecture.md` and `AGENTS.md`
- [x] 3.3 Run `npm run build`, `npm run check` and `npm test`; fix anything they report
