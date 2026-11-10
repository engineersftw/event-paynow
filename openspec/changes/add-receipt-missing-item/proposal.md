## Why

Vision models misread receipts, and the bot found out how in a real test: on a photographed 10-item receipt, the model it used read nine items and silently dropped the tenth (SGD 9.50). The bot did warn that the items "do not add up to the subtotal", but the only ways out were to send another photo and hope, or to type the total and lose the item breakdown. The arithmetic already says exactly what is missing: the printed subtotal was read correctly in every run, and the gap was exactly the lost item. The bot should use that and let the user put the item back.

Switching the default model to Llama 4 Scout (done separately) fixed that photo, but no model is perfect, so the safety net is still needed.

## What Changes

- The review message now says **how much looks missing** when the items add up to less than the printed subtotal (or, with no subtotal read, less than the total minus service charge and GST plus any discount): for example "The items add up to SGD 107.60 but the subtotal is SGD 117.10: SGD 9.50 looks missing."
- When something looks missing, the review gains an **➕ Add a missing item** button.
- Tapping it asks for the missing item or items, one per line as a name and a price (`Sapporo Black 9.50`), and offers **Add as one line** (a single "Unread items" line for exactly the missing amount) and **Back**. Added items are put at the end of the list so the existing item numbers do not change.
- The review is shown again with the new items and the warnings worked out again. The user can add more, use the scan, send another photo, or type the total.
- Nothing else changes: when the numbers add up there is no new button, and a gap in the other direction (items add up to more than the subtotal) keeps today's warning only.

Out of scope: removing or correcting a scanned item (send another photo or type the total), adding items later during the assignment step, editing an added item by editing the message, other currencies, and `/stats`.

## Capabilities

### New Capabilities

(none)

### Modified Capabilities
- `bill-split-bot`: the receipt review shows the missing amount and lets the user add the items a scan missed.

## Impact

- Changed: `src/commands/receipt.ts` (a `missingCents` check, warnings worked out in one place, a parser for added lines), `src/commands/split-handler.ts` (a new step, the button and prompt, the review message), tests.
- No database change, no new dependency, no configuration.
- Docs: README (receipt paragraph), `AGENTS.md`, `docs/architecture.md`.
- Builds on the already-made switch of the default receipt model to Llama 4 Scout; it does not depend on it.
