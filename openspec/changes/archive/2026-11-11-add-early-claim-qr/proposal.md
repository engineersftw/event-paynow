## Why

In a group receipt split, nobody can pay until the organiser taps Done, and the organiser waits for the slowest member. Members who have already claimed their items could pay at once: the payee is known (it is asked first now) and a member's amount does not depend on what others claim, as long as their own items stay fixed. The organiser's menu (merged) can now also assign items and share one N ways, which makes fixing a member's items more important: without a lock the organiser could change what a member already paid for.

## What Changes

- The claim message gets a **Get my QR** button. A member who holds items taps it and receives a PayNow QR for their own amount straight away, by direct message; if the bot cannot message them yet, the tap opens the bot with a start link (the existing Get my QR flow).
- Taking the QR **locks the member's items**: nobody can add or remove people on them, and the member's amount is final. That includes the organiser's menu (Mine, a person, Someone else, Remove all claims and the number of ways), which refuses a locked item. Locked items and members show in the claim message and in the menu.
- The amount is the member's items (each item split equally between its holders; an item shared N ways costs the holder one fixed share) plus their share of the service charge, GST and discount in proportion to the receipt's total of all items, so it does not depend on what others claim. Any cent left over by rounding goes to people who have not taken a QR, or to the organiser.
- When the organiser taps Done, the locked amounts are used as sent, the unclaimed-items choice does not offer to share with locked members, and members who already have their QR are not sent another.
- Only people with a Telegram account can take an early QR. People the organiser typed by name have none, so they stay with the shared chat QR at Done; a typed @username who later taps themselves becomes a real member and can take theirs.
- The early QR carries the receipt's merchant name as its description when the scan read one (the description question comes last, so a typed one is not known yet).

Out of scope: early QRs in private chats or for typed assignments, for people typed by the organiser without a Telegram account, unlocking a member's items, and changing a QR after it was sent.

## Capabilities

### New Capabilities

(none)

### Modified Capabilities

- `bill-split-bot`: two new requirements (the early QR, and the lock with fixed amounts) and a change to the claiming requirement so locked items cannot be edited.

## Impact

- `src/commands/receipt.ts`: `shareReceipt` takes a set of locked people whose amounts use floors only, with the leftover cents going to the others; a helper for one member's early amount.
- `src/commands/split-handler.ts`: the button and its callback, delivery by DM or start link (reusing `directMessage`, `renderQrPng`, the waiting-claim records), the lock check in `applyClaim` (the one pure function every tap, menu choice and typed reply goes through), the claim message and menu markings, and skipping already-served members at Done and at final delivery (Done now works on the share lines of `assignmentFromClaims`).
- Context only: new `locked` and `served` lists (next to `claims`, `claimers`, `ways`, `menu` and `shareItems`); no new step, table, secret or dependency. Counters: the existing DM and waiting-claim counters count early QRs.
- Tests: `test/node/receipt.test.ts`, `test/workers/split-bot.test.ts`. Docs: README, `docs/architecture.md`, `AGENTS.md`.
- Risks: the organiser can no longer fix a mistake on a locked item; a member with a locked shared item cannot back out of it (the item is final for everyone on it); the rounding cent can land on the organiser.
