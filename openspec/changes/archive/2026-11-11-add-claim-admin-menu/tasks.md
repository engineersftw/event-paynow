## 1. Claim logic

- [x] 1.1 In `src/commands/receipt.ts` let `assignmentFromClaims` accept claimers with a negative id (no `userId`), items with a number of ways (expanded to share lines with labels, unfilled shares unassigned), and add `resolveTyped(existing, text, textMentions, organiserId)` returning the claimers a typed message names, refusing a name over 20 characters
- [x] 1.2 Extend `test/node/receipt.test.ts`: share lines and amounts for a 3-way item with two holders, odd cents on the first shares, the unfilled share listed as unassigned and given to the organiser or shared evenly, an item without ways unchanged, each kind of typed name, reuse of an existing claimer by name and by username, and the too-long name

## 2. Handler

- [x] 2.1 In `src/commands/split-handler.ts` extract the read-toggle-write loop of `claimTap` into `toggleClaim(ctx, item, who, mode)` with the share cap for items shared N ways, and keep member taps on it
- [x] 2.2 On the organiser's tap post the menu (Mine, existing claimers with ✓ for holders, Someone else, Shared by all, Close), record `menu`, delete a previous menu, and handle `split_who:*` (people toggle through `toggleClaim` and the menu updates; Remove all claims clears the item and is offered only when it has holders; stale taps answered "That step is over."; member taps answered "That is the organiser's button.")
- [x] 2.3 Handle Someone else and Shared by all: force-reply prompts, `handleText` for `menu.awaiting` (names resolved with `resolveTyped`; a number from 2 to 20 not below the holders; bad input refused and asked again), number buttons 2 to 6, change and remove the ways from the menu
- [x] 2.4 Merge a typed @username into the real claimer when that member taps, show ways and shares left in the claim message, and at Done pass the ways to `assignmentFromClaims`, keep the labelled `shareItems` for the unassigned prompt, and remove the menu on Done and Keep claiming

## 3. Tests and docs

- [x] 3.1 Extend `test/workers/split-bot.test.ts`: the organiser's tap opens the menu and members' taps do not, Mine and un-Mine, adding and removing a claimer, Someone else with a plain name, several names, an @mention, an existing claimer and a too-long name, a typed @username merging with a later tap, the 20-person limit, Shared by all with a valid and an invalid number, shares claimed up to the cap and the refusal after, changing and removing the ways, the unfilled share at Done and its choice, amounts that add up, Remove all claims (offered only with holders, empties the item, keeps its ways, keeps a person's other items), removing a single person, a member tapping the menu, and a stale menu
- [x] 3.2 Update README (the claiming paragraph), `docs/architecture.md` and `AGENTS.md`
- [x] 3.3 Run `npm run build`, `npm run check` and `npm test`; fix anything they report
