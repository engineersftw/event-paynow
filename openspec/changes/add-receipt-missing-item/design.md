## Context

`parseScan` already compares the items with the subtotal and warns ("the items do not add up to the subtotal"), but it only warns. The live test showed the arithmetic is reliable even when the item list is not: the subtotal and total were read correctly in every run while one or two item lines were dropped. The share maths already trusts the receipt total, so an item added to the list changes who owes what correctly, whereas a dropped item gets spread across everyone as "charges".

## Goals / Non-Goals

**Goals:** tell the user exactly how much is missing; let them put the item (or an "Unread items" line) back in a couple of taps; keep numbering stable.

**Non-Goals:** removing or editing scanned items, adding items during the assignment step, a smarter model call.

## Decisions

1. **`missingCents(receipt)`** returns the amount the items fall short by, or 0. Expected items total is `subtotalCents` when read; otherwise `totalCents − serviceCents − gstCents + discountCents`, but only when at least a service charge or GST was read (without either, the gap cannot be told apart from charges). A shortfall of two cents or less counts as zero, matching the existing subtotal tolerance. Items above the expected amount return 0 (the existing warning covers that).
2. **Warnings in one place.** The warning rules now in `parseScan` move into `receiptWarnings(receipt)` so they can be worked out again after items are added. When `missingCents > 0` the generic "do not add up to the subtotal" warning is replaced by the specific one: "The items add up to SGD x but the subtotal is SGD y: SGD z looks missing." The "items exceed the total" and "charges do not add up" warnings stay.
3. **Review buttons.** `reviewButtons(receipt)` is today's three buttons plus a top row **➕ Add a missing item** (`split_scan:add`) only when `missingCents > 0`.
4. **New step `ADD_ITEM`** (15). `split_scan:add` moves from REVIEW to ADD_ITEM and asks, with the missing amount: "SGD 9.50 looks missing. Send the missing item(s), one per line: name then price (for example Sapporo Black 9.50)." Buttons: `split_scan:oneline` (**Add as one line**: an "Unread items" item for exactly `missingCents`) and `split_scan:back`. In a group the prompt carries a hint to reply to it, like the other buttoned prompts.
5. **Parsing added lines** (`parseAddedItems(text, room)`): one item per non-empty line; the last whitespace-separated token is the price (via `parseAmount`), the rest is the name (cleaned, at most 30 characters); a line with no name gets "Item n"; positive prices only; at most 40 items in total (`room` is how many more fit). The first bad line is named and nothing is added.
6. **After adding:** the new items go on the end of `scan.receipt.items` (so earlier numbers stay), `scan.warnings` is recomputed with `receiptWarnings`, and the review is shown again as a fresh message (the old review's buttons are removed), back in step REVIEW. Use this, Send another photo and Type the total instead work as today; a new photo discards the added items because it is a new scan.
7. **Only at review.** Once the user taps Use this, items are fixed; correcting later means starting the scan again. This keeps the assignment steps unchanged.

## Risks / Trade-offs

- [The user adds a wrong price] → the warnings are worked out again and flag a mismatch; the review is shown before anything is used.
- [An "Unread items" line cannot be assigned to one person meaningfully] → it is one numbered item like any other and can be shared (`all`) or given to the organiser; the user can also add real names instead.
- [No gap can be worked out when neither a subtotal nor charges were read] → no button; send another photo or type the total, as before.
- [An extra step in the receipt flow] → it appears only when something looks missing.

## Migration Plan

None: no data or configuration. A scan in progress during the deploy simply lacks the button.
