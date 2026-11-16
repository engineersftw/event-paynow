# Tasks

## 1. The organiser taps like a member

- [x] 1.1 In `claimTap` (`src/commands/split-handler.ts`) remove the organiser branch so every tap runs the member path; verify with a new test in `test/workers/split-bot.test.ts`: the organiser taps item 3 and is shown on it, a second tap takes it back, and no menu message is posted
- [x] 1.2 Make `claimText` take the optional app link (`claimText(c, appUrl?)`), drop the sentence about tapping an item to assign it, add "The organiser can fix who had what with Edit in app." only when the link is given, and pass the link at the first post, the refresh after a tap (`this.appUrl(ctx)`) and the refresh in `src/split-app/api.ts`; verify with tests for the wording with and without the app, and that the app's refresh still shows the link button

## 2. Remove the menu

- [x] 2.1 Delete `openMenu`, `menuView`, `refreshMenu`, `menuTap`, `menuText`, the `Menu` type, the menu branch of the text handler in step CLAIM, the menu clean-up on Done and `menu` from the fields dropped when the split moves on; keep `resolveTyped`, `applyClaim`, `MAX_WAYS` and the other imports the app still needs; verify with `npm run build` and `npx tsc --noEmit --noUnusedLocals` showing no new unused code
- [x] 2.2 Answer a `split_who:` tap with "That menu is gone. Use Edit in app." (a member still gets the organiser-button message first); verify with a test that an old menu button changes nothing and is answered, and that a conversation holding a stored `menu` still claims, closes and continues normally
- [x] 2.3 Remove the `the organiser menu` group from `test/workers/split-bot.test.ts` and turn the `orgClaim` helper into a plain tap; verify the rest of the file passes unchanged and that the rules those tests covered are covered in `test/workers/split-app-api.test.ts` (toggle, clear, typed names, ways, locks, limits), adding any case that is missing

## 3. Docs

- [x] 3.1 Update README, AGENTS.md and `docs/architecture.md` (the claim description, the removed `split_who:*` buttons and typed replies, the organiser's tap, the Mini App as the only place to change others' claims and what that needs configured); verify with a search that none still describes the menu (`split_who`, "opens a menu", "Someone else")
- [x] 3.2 Run `npm run build`, `npm run check` and `npm test`; fix anything they report; the Mini App page is not changed, so its page and interface tests must pass untouched

## 4. Rollout

- [x] 4.1 Deploy, then in a real group run one claim split: the organiser's tap claims for them and a second tap takes it back, no menu appears, the claim message names Edit in app, and Edit in app still edits who had what

## Workflow follow-up

- Archive the change after 4.1 is confirmed on a real group.
