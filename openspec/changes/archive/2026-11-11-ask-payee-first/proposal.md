## Why

Every split ends with the same two questions about who is paid, and the payee is something the user already knows before looking at the bill. Asking it first gets the one thing that must be right (the PayNow number) out of the way, matches how people think ("I'm collecting for me, at this number"), and lets the rest of the conversation follow the bill. It also removes the odd "Is this payee you?" question that now appears after all the bill detail.

## What Changes

- `/split`, `/split_custom`, `/split_receipt` (and `/start` in a private chat) ask first: **who should be paid** (mobile number or UEN), then **is this payee you?** (Yes / No), and only then the bill total (or the receipt photo), the split type and the rest. The description stays last.
- Everything after that keeps its behaviour: totals, equal and custom splits, receipts, claiming, the summary, QR delivery. Amending and editing work as before; changing the payee later asks again whether it is the user, then returns to where the split was.
- The first message of a group split is now the payee number, which the bot already tries to delete (and masks in the summary) in groups.

Out of scope: Simple_PayNow_Bot and the Event PayNow Bot flows (this is about bill splitting only).

## Capabilities

### New Capabilities

(none)

### Modified Capabilities

- `bill-split-bot`: a new requirement for payee-first ordering, and the requirements that spelled out the old order (the question sequence, `/split_custom`, the receipt start, the list check, the receipt continuation, the payee-is-organiser timing, claiming's Done, and one edit scenario).

## Impact

- `src/commands/split-handler.ts`: `nextNeed` asks for the payee and the payee answer first; `start` begins at the payee step and remembers a receipt start; the receipt "Type the total instead" path forgets that start marker; the `/help` text.
- Tests: `test/workers/split-bot.test.ts` (about 50 places drive the old order, so they all move to payee first).
- Docs: README, `docs/architecture.md`, `AGENTS.md`.
