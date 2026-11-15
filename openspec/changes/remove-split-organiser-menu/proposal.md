## Why

When everyone claims their own items in a group, the organiser has two ways to change who holds what for someone else: the menu that opens when they tap an item in the chat, and the Mini App. The Mini App does everything the menu does and more (it shows every item and person at once, adds everyone in one tap, and keeps the claim message free of extra bubbles). Keeping both means two implementations of the same rules, a second set of buttons and replies to maintain (`split_who:*`, typed replies for names and ways), a stored menu state in the conversation, and an organiser who gets a different result from a tap than every other member does.

## What Changes

- **BREAKING (for the organiser's tap):** in the claim message the organiser's tap on an item no longer opens a menu. It claims the item for the organiser, and a second tap takes it back, exactly as for any member.
- Removed from the chat: the per-item menu (Mine, a button per person, Someone else, Shared by all, Remove all claims, Close), its typed replies (names, number of ways), the menu message and its clean-up, and the `split_who:*` buttons. A button of a menu posted before this change is answered with "That menu is gone. Use Edit in app." and does nothing else.
- The claim message text no longer says the organiser can tap an item to assign it; when the Mini App is configured it says the organiser can fix who had what with Edit in app.
- Everything the menu did for other people (add or remove a person, add by name or `@username`, share an item N ways, remove all claims) is done in the Mini App only. The rules do not change; their wording moves into the Mini App's requirements, and the rules about how an item shared N ways behaves stay with the claim message.
- Not changed: members' taps, Get my QR, Done and the unassigned choice, the Mini App itself, typed and voice assignment (the other way to share out a receipt), N-way sharing as a feature.

Out of scope: any change to the Mini App's screens; moving the typed-name and N-way rules out of `applyClaim`; a chat fallback when the Mini App is not configured (without it the organiser can claim only for themselves in the chat; the typed or voice assignment is the alternative for a split that needs more).

## Capabilities

### New Capabilities

(none)

### Modified Capabilities

- `bill-split-bot`: the organiser's tap on an item claims it for them like any member's; the item menu and the organiser claiming for someone else in the chat are removed; N-way sharing and typed claimers are described without the menu.
- `split-claim-app`: the app becomes the only place the organiser changes other people's claims, so its requirements state their rules directly instead of pointing at the chat menu.

## Impact

- `src/commands/split-handler.ts`: remove `openMenu`, `menuView`, `refreshMenu`, `menuTap`, `menuText`, the `Menu` type, the menu branch of the organiser's text handling and the menu clean-up on Done and Keep claiming; `claimTap` loses its organiser branch; answer old `split_who:` buttons politely.
- `src/commands/split-claims.ts` and `src/split-app/api.ts`: `claimText` takes the app link (like `claimButtons`) so the message wording follows the configuration; `applyClaim`, `resolveTyped`, `MAX_WAYS` stay, now used only by the app's interface.
- Tests: the `the organiser menu` group in `test/workers/split-bot.test.ts` goes (the same rules stay covered by `test/workers/split-app-api.test.ts`); the `orgClaim` helper becomes a plain tap; new tests for the organiser's tap, the old-button answer and the message wording.
- Docs: README, AGENTS.md, `docs/architecture.md`.
- In-flight splits at deploy time (a claim stays open up to an hour): a stored `menu` in the conversation is ignored, and an open menu message answers as above. No migration.
