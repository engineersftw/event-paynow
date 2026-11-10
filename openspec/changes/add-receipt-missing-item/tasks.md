## 1. Missing amount and added items

- [x] 1.1 In `src/commands/receipt.ts` add `missingCents(receipt)` (subtotal, or total minus charges when a service charge or GST was read; two-cent tolerance; zero when items exceed), move the warning rules into `receiptWarnings(receipt)` with the specific "SGD z looks missing" warning replacing the generic subtotal one, and add `parseAddedItems(text, room)` (name then price per line, cleaned names, positive prices, the 40-item cap, the first bad line named)
- [x] 1.2 Add node tests: the 107.60 against 117.10 example, no subtotal with charges, no subtotal and no charges, within tolerance, items above expected, each parsing error, the cap, and warnings after adding

## 2. Conversation

- [x] 2.1 In `split-handler.ts` show the specific missing-amount warning and an **➕ Add a missing item** button (`split_scan:add`) on the review only when `missingCents > 0`
- [x] 2.2 Add step `ADD_ITEM`: the prompt with the missing amount, **Add as one line** (`split_scan:oneline`) and **Back** (`split_scan:back`), and the text answer parsed with `parseAddedItems`
- [x] 2.3 After adding, append the items to the scan, recompute the warnings, remove the old review's buttons and show the review again in step REVIEW; keep existing numbers; a new photo discards added items

## 3. Tests and docs

- [x] 3.1 Extend `test/workers/split-bot.test.ts`: the missing amount and button appear for a scan short of its subtotal, none when it adds up, add a named item, add as one line, several items, an invalid line, Back, still short keeps the button, the added item is asked about in the assignment, and a new photo discards the additions
- [x] 3.2 Update README (receipt paragraph), `AGENTS.md` and `docs/architecture.md`
- [x] 3.3 Run `npm run build`, `npm run check` and `npm test`; fix anything they report
