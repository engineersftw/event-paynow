## 1. Assignment maths

- [x] 1.1 In `src/commands/receipt.ts` make `parseAssignments` return the unassigned item indexes instead of failing, and add `applyUnassigned(assignment, choice)` (`'me'` gives the gaps to the organiser, creating `me` if needed; `'even'` gives each gap to everyone named, including `me` when named)
- [x] 1.2 Update `test/node/receipt.test.ts`: the old "has nobody" case now returns the gap, both choices, a gap with only `me` named, the amounts still adding up to the receipt total for both choices, and the errors that stay (twice, unknown number, no people, too long)

## 2. Conversation

- [x] 2.1 In `split-handler.ts` store `partial`, `gap` and `unassignedChoice` from `readAnswer('assign')`: complete the assignment at once when there is no gap or when the stored choice was made for the same gap, otherwise wait for the choice
- [x] 2.2 Add the `UNASSIGNED` step: `nextNeed` returns it for a partial assignment without a choice; the prompt names the unassigned items and their combined price with `split_unassigned:even|me` buttons (and Keep as is while amending); the callback applies the choice, sets `entries`, `leftover: 'omit'` and the choice, and continues
- [x] 2.3 Make Amend → Items and edits of the assignment message follow the same-gap rule

## 3. Tests and docs

- [x] 3.1 Update and extend `test/workers/split-bot.test.ts`: the gap question replaces the "has nobody" error, split evenly, leave out, the question names the items, no question when all are assigned, edit with the same gap keeps the choice, a different gap asks again, Amend → Items, and the remaining errors
- [x] 3.2 Update README (receipt paragraph), `AGENTS.md` and `docs/architecture.md`
- [x] 3.3 Run `npm run build`, `npm run check` and `npm test`; fix anything they report
