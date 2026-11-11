## Context

The conversation is driven by `nextNeed(context)`, which returns the first missing answer in question order; every command, amend and edit goes through it. The payee and "is it you?" are the last two checks in it. `start()` begins at the total, or at the receipt photo for `/split_receipt`, and writes the first step itself.

## Decisions

**Reorder `nextNeed`.** Put the payee check and the payee-is-me check at the top. The rest of the order is unchanged. Because the order lives in one function, an edit of a total or an amend of the payee both behave correctly with no other change.

**Remember the receipt start.** `/split_receipt` must reach the photo step after the payee, not the total step. Store `entry: 'receipt'` in the context at start; when the total is missing and `entry` is `receipt`, `nextNeed` returns the photo step (`RECEIPT`) instead of `TOTAL`. The "Type the total instead" tap drops `entry` so a typed total follows.

**Start at the payee.** `start()` writes step `PAYEE` for all three commands (still `RECEIPT` availability check first) and asks that question. The `/split_custom` marker (`mode: 'custom'`) is kept in the context as now.

**Wording.** The payee prompt stays "Who should be paid? Send a Singapore mobile number or a UEN." The `/help` and README text change to the new order.

**Amend is unchanged.** Changing the payee clears `payeeIsMe`, so `nextNeed` asks the payee-is-me question next and the flow returns to its place. Choosing Total still re-asks only the total.

## Risks

- About 50 test sequences drive the old order; they are updated mechanically (payee, tap Yes or No, then the rest).
- Users used to the old order meet a different first question; the question is self-explanatory.
- A split abandoned after the payee leaves the payee in the conversation state until the usual 10-minute expiry, as every other answer does.
