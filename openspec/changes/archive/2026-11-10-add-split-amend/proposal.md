## Why

Once the Split_PayNow_Bot summary is on screen, the only choices are Confirm or Cancel. A typo in the total, a wrong payee or a forgotten person means cancelling and typing everything again. People also expect to fix a message by editing it in Telegram, which the bot ignores today.

## What Changes

- The summary gains an **✏️ Amend** button next to Confirm and Cancel. It opens a short menu: **Total**, **Split** (equal or custom, and its details), **Payee**, **Description**, and **Back**. The user picks one, answers only that question (with a **Keep as is** button), and gets the updated summary. Nothing else is asked again unless the change makes it necessary.
- A change that breaks another answer sends the user to the question that needs fixing: a new total that is smaller than the listed amounts asks for the list again; a total that leaves a gap in a custom list asks what to do with the leftover; a new total with fewer cents than people asks for the number of people again.
- **Editing a sent message amends too.** When the user edits the text of an answer they already sent (total, number of people, list, payee, description), the bot re-reads it, applies the same checks and shows the updated summary. An invalid edit is refused with the reason and the earlier value is kept.
- Both routes work in private chats and in groups, with the same owner-only rule, and a new summary replaces the old one so only one Confirm button is live.
- Telegram may not deliver message edits in groups while bot privacy mode is on, so the Amend button is the dependable route there.

Out of scope: editing after Confirm (the QRs are already sent; start `/split` again), editing the bot's own prompts, amending individual lines of a custom list (send the whole list again), and `/stats`.

## Capabilities

### New Capabilities

(none)

### Modified Capabilities
- `bill-split-bot`: the summary offers Amend; users can change any answer from it or by editing the message they sent.

## Impact

- Changed: `src/commands/split-handler.ts` (a `settle()` step that decides what is still needed, Amend menu, edit handling), `src/split-bot.ts` (route `edited_message:text` to the handler), `test/workers/split-bot.test.ts`, `test/workers/harness.ts` (an edited-message update builder).
- No database, route, secret or dependency change. The conversation context gains small fields (which message holds which answer, the summary message id).
- Docs: README (Split_PayNow_Bot section; a note that the webhook must not restrict `allowed_updates` away from `edited_message`), `AGENTS.md`, `docs/architecture.md`.
- Conversations in progress during the deploy may need restarting with `/split` (they expire after 10 minutes).
