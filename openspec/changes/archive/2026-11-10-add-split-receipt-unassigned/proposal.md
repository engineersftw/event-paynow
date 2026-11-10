## Why

When the organiser types who had which item after a receipt scan, leaving any item out is an error ("Item 3 has nobody") and the whole message has to be sent again. Real bills have items nobody owns up to, or that the organiser simply forgot. The custom split already handles the same situation well: when the amounts fall short of the bill, it asks whether to split the remainder evenly or leave it out. The receipt flow should behave the same way instead of refusing.

## What Changes

- An assignment message no longer has to cover every item. Items that appear in no line are **unassigned**, and the bot asks what to do with them, like the custom split's leftover question:
  - **Split evenly**: each unassigned item is shared equally between everyone named in the assignment (including `me` if the organiser named themselves).
  - **Leave them out**: the organiser covers them; they are assigned to `me`, so they are shown but not collected.
- The question names the unassigned items and what they cost before charges, so the choice is informed.
- The charges (service charge, GST, discount) are still shared in proportion, so the amounts still add up to the receipt total to the cent.
- The choice is remembered. If the assignment is edited or amended and the same items are still unassigned, the earlier choice is kept; if a different set of items is unassigned, the bot asks again. When nothing is unassigned, no question is asked.
- Mistakes that stay errors: an item named twice, an item number that does not exist, a line without people, a message that names only `me` (nobody to collect from).

Out of scope: letting members claim items (that is the separate change `add-split-claim-items`, which will reuse the same choices), choosing a different person to cover the remainder, and `/stats`.

## Capabilities

### New Capabilities

(none)

### Modified Capabilities
- `bill-split-bot`: unassigned receipt items no longer cause an error; the organiser chooses between sharing them evenly and covering them.

## Impact

- Changed: `src/commands/receipt.ts` (`parseAssignments` can return the unassigned items; a helper that applies the choice), `src/commands/split-handler.ts` (new UNASSIGNED step and buttons, `nextNeed`, edit and amend behaviour), tests.
- No database change, no new dependency, no configuration.
- Docs: README (Split_PayNow_Bot receipt paragraph), `AGENTS.md`, `docs/architecture.md`.
- Interaction with `add-split-claim-items` (planned, not built): its "unclaimed items" prompt offers the same two choices plus Keep claiming. The two changes should share the wording and the code for applying the choice; whichever is built second reuses the helper.
