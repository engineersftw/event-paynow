## 1. Maths and parsing

- [x] 1.1 In `src/commands/split-math.ts` add `parseCustomList(text)` (lines of `name amount`, 1–20 people, names 1–20 characters and unique ignoring case, amounts via `parseAmount`, error naming the first bad line), `applyLeftover(entries, totalCents, mode)` (integer; `even` adds `ceil(leftover / n)` to each; reports collected and over) and `groupByAmount(entries)` (distinct amounts, names in first-appearance order)
- [x] 1.2 Extend `test/node/split-math.test.ts`: valid list, multi-word names, each kind of bad line, duplicate names ignoring case, 21 people, leftover even (10.00 over 3 people → 3.34 each, 0.02 over), leftover omit, exact sum, grouping by amount

## 2. Conversation

- [x] 2.1 In `src/commands/split-handler.ts` add the Equally / Custom amounts question after the total (`split_mode:equal|custom`), renumber the steps, keep the equal path unchanged, and update the callback-step table and the `/claim` step to the new confirm constant
- [x] 2.1b Add `/split_custom`: `start(ctx, 'custom')` stores the mode, the total step then skips the Equally / Custom question and goes to the list step; register `bot.command('split_custom', ...)` in `src/split-bot.ts`; mention it in `SPLIT_HELP`
- [x] 2.2 Add the custom list step: prompt with an example (force-reply in groups), parse with `parseCustomList`, re-ask with the bad-line message, reject a sum above the total with the overage, skip ahead on an exact sum
- [x] 2.3 Add the leftover question (`split_leftover:even|omit`, only when the sum is below the total), store the choice, then continue to the payee and description questions as before
- [x] 2.4 Extend `summary()` for custom splits: each person's final amount, how the leftover was handled (and that the organiser covers it when left out), and any rounding over-collection
- [x] 2.5 On Confirm for a custom split send one fixed-amount QR per distinct amount with the names in the image lines and the full names in the caption; stop on the first failed send and report sent and unsent counts without logging answers

## 3. Tests and docs

- [x] 3.1 Extend `test/workers/split-bot.test.ts`: custom split with a distinct-amount grouping (Ann 40, Bob 25, Cy 25 → 2 QRs decoded with the right amounts), leftover omit, leftover even with rounding, over-sum rejected, bad line and duplicate name re-asked, group flow with another member ignored, a failing send part way, and the equal flow still working after the mode question, and `/split_custom` skipping the mode question (private and group, and restarting over a split in progress)
- [x] 3.2 Update README (Split_PayNow_Bot section, including `split_custom` in the BotFather command list), `AGENTS.md` and `docs/architecture.md`
- [x] 3.3 Run `npm run build`, `npm run check` and `npm test`; fix anything they report
