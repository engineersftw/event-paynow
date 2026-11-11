## Context

`claimTap` reads the state, toggles the tapper's claim and writes with `ifRev` (retrying on a conflict). Claims are `claims[item] = holder ids`; claimers are `{ id, name, username? }`. `assignmentFromClaims` produces the same assignment shape as the typed parser, `assignmentPatch` turns it into entries, and unclaimed items go through the existing `UNASSIGNED` step. `shareReceipt` splits each item equally between its holders and shares the extras in proportion.

## Decisions

**Menu for the organiser, no new step.** `claimTap` branches on `ctx.from.id === owner.userId`: a member's tap keeps the existing path; the organiser's tap posts the menu and stores `menu: { item, msg }` with the same retried conditional write. The conversation stays in step `CLAIM`, so members keep claiming while the organiser works. Menu callbacks are `split_who:<item>:mine|<claimerId>|else|all|ways<N>|noways|clear|close`, owner-only, valid only while `menu.msg` is the tapped message (else "That step is over.").

**One toggle function for every claim change.** Extract the read-toggle-write loop into `toggleClaim(ctx, item, who, mode)` (`toggle` for taps and menu buttons, `add` for typed names). The 20-claimer limit, pruning of people who hold nothing, `ifRev` retries and the message refresh stay in one place. The refresh edits the claim message through `ctx.api.editMessageText(chat, claimMsg, …)`, because the tap may have come from the menu message.

**Remove all claims.** `clear` sets `claims[item] = []` through the same retried write (a new `mode: 'clear'` of `toggleClaim`), then prunes people who now hold nothing, refreshes the claim message and re-renders the menu without the button. The button is offered only when the item has holders, and an item's `ways` is left untouched. A person who held several items keeps the others. When `add-early-claim-qr` is also in place, a locked item refuses `clear` as it refuses every other change.

**Typed names and numbers.** `menu.awaiting` is `names` or `ways`, set when Someone else… or Shared by all… is tapped; the bot sends a force-reply prompt (so privacy mode can stay on). In `handleText`, in step `CLAIM` with `menu.awaiting`, the owner's text is read: names are split on commas and resolved (`me` is the organiser; a text mention is a Telegram account; an `@username` is matched case-insensitively to an existing claimer's username, else becomes a claimer with that username and no id; a plain name of at most 20 characters is matched case-insensitively to an existing claimer's name, else becomes a claimer with no id); a number must be a whole number from 2 to 20 and at least the current holder count. Other text from the owner is ignored (no nagging, as in the quiet-chatter rule). Buttons 2 to 6 are also offered for the number.

**Claimers without a Telegram id.** A typed person with no id gets a negative synthetic id (the next unused). `assignmentFromClaims` sets `userId` only for positive ids. When a member with a Telegram id taps and a claimer with the same username (case-insensitive) holds a negative id, the id is replaced everywhere in `claims`, so typed and tapped claims merge.

**N ways.** `ways[item] = N` in the context. In `toggleClaim` a claim on an item is refused when `holders.length >= N` ("All N shares are taken."), and a person cannot hold two shares (they already toggle). At Done, an item with `ways` is expanded into N share lines for the maths: the item's cents are split into N parts (floor, odd cents on the first shares) and stored as `shareItems` with labels such as "Sirloin (share 2 of 3)"; each holder gets one share line; unfilled shares are unassigned lines. `assignmentPatch` and `shareReceipt` then run unchanged on `shareItems`, `applyUnassigned` gives unfilled shares to the organiser or evenly to claimers, and the unassigned prompt lists them by label. Items without `ways` expand to themselves, so the normal path is identical to today.

**Display.** The claim message line for such an item reads `3. Sirloin SGD 30.80 (3 ways): Ann, Bob, 1 left`; the item's button shows the ways.

**Cleanup.** Done, Keep claiming and opening another menu delete the old menu message (best effort) and clear `menu`; a stale menu tap answers "That step is over.".

## Risks

- The organiser's own claim now takes two taps (item, then Mine). Accepted: the menu is the point.
- Typos in typed names create new people; they show in the claim message and can be removed from the menu.
- `add-early-claim-qr` (planned) locks items: when both exist, a locked item must also refuse menu changes and `ways` edits.
- A cent difference per share is possible for items that do not divide evenly; odd cents go to the first shares, as with equal sharing.
