## Context

See proposal.md - Why. In `claimTap` (`src/commands/split-handler.ts`) the organiser's tap on an item takes a separate path: it opens `menuView` in a new message, records `c.menu = { item, msg, awaiting? }` in the conversation, and from then on three more pieces serve it: `menuTap` (the `split_who:<item>:<action>` buttons), `menuText` (the organiser's typed names or number of ways, read in step CLAIM while `menu.awaiting` is set) and `refreshMenu`. Done and Keep claiming delete the menu message and drop `menu` from the context. Every change goes through `applyClaim` and the conditional write, the same code the Mini App's interface uses (`src/commands/split-claims.ts`), so the rules live in one place already; only the chat surface is duplicated.

The claim message text (`claimText`) tells the organiser they can tap an item to assign it or share it.

## Goals / Non-Goals

**Goals:**
- One surface for changing other people's claims (the app), and the organiser behaving like every other member in the chat.
- Delete the menu code, its stored state and its tests, without changing a rule the app relies on.

**Non-Goals:**
- Changing `applyClaim`, `resolveTyped`, the conditional write or the app.
- A chat fallback for splits where the Mini App is not configured.

## Decisions

**The organiser's tap is the member's tap.** `claimTap` drops its organiser branch and always runs the member path (`mutateClaims` with `applyClaim(c, item, { kind: 'toggle', from })`). The organiser is identified by Telegram id like everyone, so their claim is an ordinary claim, and "Mine" is simply a tap. Alternative: make the organiser's tap do nothing or point at the app: it would leave the organiser unable to claim for themselves in the chat, which every other member can do.

**Delete, not hide.** Remove `openMenu`, `menuView`, `refreshMenu`, `menuTap`, `menuText`, the `Menu` type, the `menu.awaiting` branch in the text handler for step CLAIM (the organiser's text there is then simply quiet, as the "not answered in a group" requirement already says), the menu clean-up on Done, and `menu` from the list of fields dropped when the split moves on. Keep `MAX_WAYS` (moved to `split-claims.ts` already), `resolveTyped`, `applyClaim` and all its operations: the app's interface uses them.

**Old menu buttons are answered, not ignored.** A claim can stay open for an hour, so at deploy time a menu message may exist whose buttons are `split_who:*`. Keep one line in the callback router: a `split_who:` tap answers "That menu is gone. Use Edit in app." (as a toast) and changes nothing; the owner check above it stays, so a member still gets "That is the organiser's button." A `menu` left in a stored conversation is ignored (it is never read again) and disappears when the conversation ends. Alternative: let the tap fall through to the router's default: it answers a generic "unknown button", which reads like a bug.

**The message wording follows the configuration.** `claimText(c, appUrl?)` takes the same optional link as `claimButtons` and adds "The organiser can fix who had what with Edit in app." only when it is given; the sentence about tapping an item to assign it is removed. The three call sites (the first post, the refresh after a tap, the refresh from the app's interface) already compute the link for the buttons, so they pass the same value; the Done message (`Claiming is closed.`) passes none. Alternative: always mention the app: wrong when it is not configured.

**Specs: the rules stay, their home changes.** `bill-split-bot` loses the two menu requirements and the two claim and N-way requirements that mention them (a MODIFIED block cannot drop a scenario, so each is replaced by new ones), and states that the organiser taps like a member; N-way sharing keeps its behaviour in two requirements (what a share is; the claim message line and unfilled shares) and the typed-person rule ("a typed `@username` becomes the same person when that user taps") becomes its own requirement, because both still hold and only their trigger moved to the app. `split-claim-app` is edited so it no longer points at "the chat menu's rules": it states them directly, and gains the invalid-number and organiser-claims-for-themselves scenarios the removed requirements covered.

**Tests: the app's tests already cover the rules.** The `the organiser menu` group in `test/workers/split-bot.test.ts` goes. The rules it exercised (toggle a person, clear, typed names, number of ways, locks, the 20-person limit) are covered at the interface level by `test/workers/split-app-api.test.ts`. New chat tests: the organiser's tap claims and un-claims, no menu message is posted, an old `split_who:` button gets the answer above, and the claim message wording with and without the app. The `orgClaim` helper (a tap, then Mine) becomes a plain tap.

## Risks / Trade-offs

- Without the Mini App configured the organiser can no longer give a member's item to someone else in the chat → the app is configured in production; the typed or voice assignment remains for splits that need it; the proposal records this as accepted.
- The organiser used to be able to tap an item and have a menu; muscle memory now claims the item for them → the claim message says where the tools are, and a second tap undoes it.
- A claim in progress at deploy time may hold a `menu` and an old menu message → handled as above; at most one hour of an old button answering politely.
- Removing about 250 lines from the handler touches the claim flow's most tested part → the app's interface tests and the existing member-tap tests run unchanged against the same `applyClaim`.

## Migration Plan

1. Deploy the Worker; no migration, no configuration change.
2. In a group, run one claim split: the organiser's tap claims for them, there is no menu, Edit in app still works.
3. Rollback: revert the commit; no data changes.
