## Context

A member's amount in a receipt split is their items plus extras (an item shared N ways is split into N share lines, one per holder), where extras = receipt total minus all items, shared in proportion to each person's items by largest remainder (`shareReceipt`). Once every item has an owner, the denominator (the sum of all items) is the receipt's item total, a constant. So a member's exact amount depends only on their own items and who shares those items. Two things can still move it: another member joining one of their items, and the rounding bonus cents that largest remainder hands out across everyone. Locking the member's items removes the first; flooring removes the second.

## Decisions

**Amount for an early QR.** `memberAmount(items, claims, ways, memberId, receiptTotal)`: items = Σ over the member's items of the item's cents split equally between its current holders (odd cents to the first listed, as now), or, for an item shared N ways, the share line at the member's position among its holders (`expandShares`); extras = floor(extras_total × items / allItemsTotal), where `allItemsTotal` is the sum of every receipt item and `extras_total` is the receipt total minus that sum. Floors never exceed the exact share by rounding up, so the cents left over are handed out later.

**Lock.** On Get my QR the handler writes, with the existing retried `ifRev` write, `locked: [claimerId…]` and `served: { [claimerId]: cents }` into the context, in the same write that reads the claims, so the amount on the QR is computed from the very claims being locked. An item is locked when any of its holders is locked. `applyClaim` refuses every change to a locked item ("That item is locked"), whoever makes it: member taps, the organiser's menu choices (Mine, a person, Someone else, Remove all claims, the number of ways) and typed names all go through it, so the rule lives in one place. The menu marks locked items and leaves the buttons that cannot work out. A locked member cannot take a second QR (their `served` entry is the answer). Co-holders of a locked shared item stay on it; their own later QR (after their other items are final) uses the same rule.

**Final amounts.** `shareReceipt(lines, assignment, total, locked?)`, where `lines` are the share lines of `assignmentFromClaims` (the same ones the unclaimed-items choice uses), takes the set of locked person indexes: their `extrasCents` is the floor only; the bonus cents from largest remainder are given to unlocked people by remainder, and to the organiser (`me`, added to the people when absent) when everyone is locked. Floors are exactly what the early QR used, so a locked amount in the summary equals its QR. The unclaimed-items choice "split evenly between those who claimed" excludes locked members; with only locked claimers it is not offered and the organiser covers the gap.

**Who can take one.** Only claimers with a positive id (a Telegram account) hold a QR button. People the organiser typed by name have a negative id and no account: they are served by the shared chat QR at Done. A typed @username who taps becomes the real member (ids merged in `applyClaim`) and can take their QR from then on.

**Delivery.** The tap tries `sendPhoto` to the member's Telegram user id with `renderQrPng(payload, directMessage(organiserName, cents, description).lines)`, where the payload uses the payee from the context and no amount edit. The description is the receipt's merchant name (truncated to the QR limit) when scanned, otherwise none. On failure it creates a waiting-claim record like `postWaiting`, but instead of posting a message it answers the callback with a start link: `answerCallbackQuery({ url: https://t.me/<bot>?start=claim_<token> })`. The record is bound to the member's user id, so only they can collect it (existing rule). The organiser as payee gets an alert instead of a QR.

**Closing.** `Done` and final delivery treat `served` members as already delivered: their entries stay in the summary (amounts as sent, marked "QR already sent") and the final delivery skips them, so nothing is sent twice. The summary's "Your own share" line for a served organiser likewise.

**Claim message.** A held, locked item shows 🔒 and a served member shows "(QR sent)" after their name. A **Get my QR** row sits above Done.

## Risks

- A member who took their QR cannot take items back; a shared locked item is final for its co-holders. Stated in the claim message text.
- The leftover cents can land on the organiser; at most a few cents.
- The organiser must have chosen the payee before claiming starts (guaranteed now that the payee is asked first).
- `answerCallbackQuery` with `url` only works for t.me start links to this bot, which is what is used.
