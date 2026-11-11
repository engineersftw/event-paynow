## Why

In group claiming, a tap always claims the item for whoever tapped. The organiser often needs more: to take an item themselves without it being just another tap, to put an item on someone who is slow, absent or not on Telegram, and to mark a dish that several people shared (a starter for the table) without every one of them having to find and tap it. These are the organiser's own admin actions on the scanned items.

## What Changes

- When the **organiser** taps an item in the claim message, the bot posts a small menu for that item: **Mine**, each person who has already claimed (tap to add or remove them), **Someone else…** and **Shared by all…**, plus **Close**, and, when the item already has claims, **Remove all claims**, which empties the item in one tap (tapping one person still removes only them). The menu stays open for several choices. Members' taps are unchanged: they claim only for themselves.
- **Mine** claims or un-claims the item for the organiser.
- **Remove all claims** (shown only when the item has claimants) clears every holder from the item; a number of ways set on the item is kept.
- **Someone else…** asks for names or @mentions (comma separated) and adds each to the item. A person picked from the member list is identified by Telegram account, an @username is matched to an existing claimer or kept for delivery, a plain name has no identity. These people count towards the 20-person limit and are paid for like any claimer; a typed @username who later taps becomes the same person.
- **Shared by all…** asks **how many ways** to split the item (2 to 20). The item becomes that many equal shares; each person who claims it holds one share and pays it; claims stop when all shares are held; the claim message shows the ways and the shares left. Shares still unfilled at Done are treated like unclaimed items (the organiser covers them or splits them evenly between those who claimed). The number can be changed (not below the holders) or removed from the same menu.

Out of scope: anyone but the organiser using the menu, a Telegram Mini App form, listing group members (the Bot API does not provide it), and early QRs (a separate change, `add-early-claim-qr`).

## Capabilities

### New Capabilities

(none)

### Modified Capabilities

- `bill-split-bot`: three new requirements (the organiser's menu, claiming for someone else, sharing an item N ways) and a change to how claimed amounts are computed so shared-N-ways items work.

## Impact

- `src/commands/split-handler.ts`: the organiser branch of the claim tap, the menu message and `split_who:*` callbacks, the typed names and typed number replies (no new step: the conversation stays in `CLAIM`), cleanup on Done, Keep claiming and a new menu, the per-item ways and share cap in the shared toggle, the claim message wording.
- `src/commands/receipt.ts`: `assignmentFromClaims` accepts people without a Telegram id and items with a number of ways (an item shared N ways is turned into N share lines so the existing maths and unassigned choice apply); a helper that resolves typed names.
- Context only: new `menu` (`item`, `msg`, `awaiting`: `names` or `ways`), `ways` (item index to N) and `shareItems` fields; no new step, table, secret or dependency.
- Tests: `test/node/receipt.test.ts`, `test/workers/split-bot.test.ts`. Docs: README, `docs/architecture.md`, `AGENTS.md`.
- Interaction: `add-early-claim-qr` (planned, not built) also changes the claim tap and locks items; whichever is applied second must keep the other's rules (a locked item cannot be changed from the menu either).
- Risk: the organiser's own one-tap claim becomes two taps (item, then Mine).
