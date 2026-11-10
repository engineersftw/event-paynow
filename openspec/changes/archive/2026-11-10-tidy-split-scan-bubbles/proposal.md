## Why

Three more rough edges in the receipt scan flow, from real use:

- The review's second row holds two buttons ("📷 Send another photo" and "Type the total instead"), and on a phone the first label is cut off ("Send another p...").
- The "Reading your receipt… this takes a few seconds." message stays in the chat after the scan has worked.
- The assignment prompt shows the header `All:` with a colon, which suggests the colon is required. The parser already accepts `All`, `All:`, `all :` and `ALL` alike (checked), so only the wording and a test for it are missing.

## What Changes

- The review's buttons are one per row: (Add a missing item when offered), Use this, Send another photo, Type the total instead.
- The "Reading your receipt…" message is deleted once the scan has been read successfully. On a failure it stays, and the failure message follows it as today.
- The assignment prompt writes the example as `All` and says a trailing colon is optional on any name. A test pins that `All` and `All:` are the same.

No new step, command, table or secret.

## Capabilities

### New Capabilities

(none)

### Modified Capabilities

- `bill-split-bot`: new requirements for the review's button layout, for removing the "Reading your receipt" message, and for the optional colon on name lines.

## Impact

- `src/commands/split-handler.ts`: `reviewButtons`, the photo handler (keep the id of the "Reading…" message and delete it on success), the assignment prompt example.
- Tests: `test/workers/split-bot.test.ts`, `test/node/receipt.test.ts`.
