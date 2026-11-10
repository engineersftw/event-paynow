## Why

Typing `1,3 Ann` style lines means working out item numbers by hand. People already have the item list in front of them (the bot prints it). Letting them copy that list, put a name above each group of lines and paste it back is faster and easier to check by eye.

## What Changes

- The assignment message in `/split_receipt` accepts a second format: header lines naming who, each followed by item lines copied from the list (`1. Chefs Pizza SGD 18.80`). A header is a person, a comma-separated group, an @mention, `me` or `All`, with an optional trailing colon. Blank lines are ignored.
- Item lines are matched by their number only; the name and price after it are ignored, so a pasted list may be reworded or its prices trimmed.
- An item under several headers is shared by those people. An item under no header is unassigned and goes through the existing organiser choice.
- The old `1,3 Ann` format keeps working. The bot detects the format from the message.
- The assignment prompt shows both formats.

No new step, command, table or secret.

## Capabilities

### New Capabilities

(none)

### Modified Capabilities

- `bill-split-bot`: the "Items are assigned to people in one message" requirement accepts the header format as well.

## Impact

- `src/commands/receipt.ts`: `parseAssignments` handles both formats (shared people and sharing logic stay as they are).
- `src/commands/split-handler.ts`: the assignment prompt text.
- Tests: `test/node/receipt.test.ts`, `test/workers/split-bot.test.ts`.
- Docs: README, `AGENTS.md`, `docs/architecture.md`.
