## 1. Order

- [x] 1.1 In `src/commands/split-handler.ts` move the payee and payee-is-me checks to the top of `nextNeed`, return `RECEIPT` instead of `TOTAL` when the total is missing and the context has `entry: 'receipt'`, and drop `entry` in the "Type the total instead" branch
- [x] 1.2 In `start()` begin at step `PAYEE` for `/split`, `/split_custom`, `/split_receipt` and `/start`, keeping the receipt availability check and the `custom` marker, and ask the payee question
- [x] 1.3 Update `SPLIT_HELP` to describe the new order

## 2. Tests and docs

- [x] 2.1 Update every flow in `test/workers/split-bot.test.ts` to the new order (payee, tap Yes or No, then the rest), keeping each test's intent
- [x] 2.2 Add tests: the first question of each command is the payee, then the payee-is-me question, then the total (or the photo for `/split_receipt`); amending the payee asks the payee-is-me question and returns to the summary; an edited payee message while the total is awaited is accepted and the total is still asked
- [x] 2.3 Update the README (the split paragraphs and the receipt paragraph), `docs/architecture.md` and `AGENTS.md`
- [x] 2.4 Run `npm run build`, `npm run check` and `npm test`; fix anything they report
