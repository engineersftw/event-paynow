# Proposal

## Why

A receipt with zero GST and no service charge produced inflated item shares because missing receipt items were implicitly treated as charges. The resulting breakdown misrepresents what each person owes.

## What Changes

- Allocate only explicitly identified charges and discounts, and do not invent GST or service charges.
- Surface unexplained differences for correction before amounts or early QRs are finalized.
- Apply the same calculation to typed assignments, claims and early QRs.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `bill-split-bot`: Receipt reconciliation and proportional allocation.

## Impact

Receipt scanning, review, share calculation, claim flows, tests and user-facing documentation.
