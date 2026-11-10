## Why

While a group waits for members to claim receipt items, the organiser naturally talks to the group ("@Ann @Bob please tap 3 or 4"). Every such message from the organiser makes the bot answer "Please tap one of the buttons above (or /cancel)." Two chat messages in a row each got that reply in real use. The bot is nagging the person it is waiting on, in a chat where the organiser is mostly talking to other people.

## What Changes

- In a **group chat**, while the split is at a step that only takes button taps (claiming, how to share the items, the review, the summary, and every other button-only question), free text from the organiser is **ignored silently**: no reply, the split carries on unchanged.
- In a **private chat** the hint stays, because the organiser is talking only to the bot there.
- Steps that expect typed text (total, list, assignment, payee, description, the missing items) are unchanged. Commands such as `/cancel` are unchanged.

Assumption recorded: the request names the claiming step, but the same nagging happens at every button-only step in a group, so the fix covers them all. Narrowing it to claiming alone is a one-line change if preferred.

No new step, command, table or secret.

## Capabilities

### New Capabilities

(none)

### Modified Capabilities

- `bill-split-bot`: a new requirement that the organiser's chatter at a button-only step in a group gets no reply.

## Impact

- `src/commands/split-handler.ts`: `handleText`, where the "Please tap…" reply is sent.
- Tests: `test/workers/split-bot.test.ts`. Docs: none beyond the specs.
