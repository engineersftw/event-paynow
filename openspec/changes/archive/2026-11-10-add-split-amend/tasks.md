## 1. Settle and parsing

- [x] 1.1 In `src/commands/split-handler.ts` factor small parse helpers (`parseTotal`, `parsePeopleAnswer`, `parseListAnswer`, `parsePayeeAnswer`, `parseDescriptionAnswer`) that return a value or an error text, reused by the live steps
- [x] 1.2 Add `settle(context)` returning the first missing or invalid piece (total, split type, people or list, leftover, payee, description, summary) and switch every answer handler and callback to store its value and call it; the existing tests must pass unchanged
- [x] 1.3 Record each accepted text answer's message id in `answerMsgs` and the latest summary's id in `summaryMsg`; when a new summary is sent, remove the buttons from the previous one (best effort)

## 2. Amend button

- [x] 2.1 Add the Amend button to the summary and the Amend menu (Total, Split, Payee, Description, Back) with `split_amend:*` callbacks and a step guard
- [x] 2.2 Ask the chosen question with a Keep as is button (`split_keep`); Split re-asks Equally / Custom and clears the old split details only when a type is chosen; clear `amending` when the summary is reached
- [x] 2.3 Make stale summary buttons harmless: compare the tapped message with `summaryMsg` and answer "That step is over." on a mismatch

## 3. Edited messages

- [x] 3.1 Add `handleEdit(ctx)`: owner check, look up the field by message id, validate with the shared parsers, store, call `settle`; refuse invalid edits with the reason and keep the old value; ignore unrecorded messages, other users and ended splits; delete an edited payee message in a group
- [x] 3.2 After a valid edit send a fresh summary, or "Updated." when the open question is still the right one, or the question `settle` returns
- [x] 3.3 In `src/split-bot.ts` route `edited_message:text` to `handleEdit` and keep ignoring edited commands

## 4. Tests and docs

- [x] 4.1 Add `editedTextUpdate` to `test/workers/harness.ts` and extend `test/workers/split-bot.test.ts`: Amend total / payee / description / split type, Keep as is, Back, total drops below the list, total leaves a gap, leftover choice kept, edit the total at the summary, edit while a later question is open, invalid edit, edit after the QR, another member's edit, stale Confirm button, a group amend flow
- [x] 4.2 Update README (Split_PayNow_Bot section: Amend and edited messages, the privacy-mode caveat, and keep `edited_message` in `allowed_updates`), `AGENTS.md` and `docs/architecture.md`
- [x] 4.3 Run `npm run build`, `npm run check` and `npm test`; fix anything they report
