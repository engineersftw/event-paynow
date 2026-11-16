## Why

When the organiser has finished fixing who had what in the Claims Mini App, the only way to close the claiming is to dismiss the app, go back to the chat and tap Done on the claim message. That interrupts the work the app was made for: the organiser has to leave the screen they are on, find the claim message in a busy group chat, and tap a button there.

## What Changes

- The Mini App gets a **Done** button, always in view at the bottom of the screen. It closes the claiming with exactly the same result as Done in the chat: the claim message is closed, and the chat then asks what to do with items nobody claimed, or posts the summary.
- It is refused for the same reason as in the chat ("Someone other than you must claim an item first."), and the reason is shown in the app.
- When it succeeds the app closes itself, because the next step (the unassigned-items question, or the summary with Confirm) is in the chat and the organiser is going there. Where the app cannot close itself it says "Claiming is closed. Finish in the chat."
- The **Done button in the chat stays**, unchanged, for splits where the members claim for themselves and the organiser works from the chat. Either one closes the claiming; whichever comes second finds it already closed and says so.
- The app's hint no longer tells the organiser to go to the chat to tap Done.

Out of scope: the unassigned-items choice, the summary, Confirm and Amend (they stay in the chat); a confirmation question before closing (the chat button has none, and the summary's Amend is the way back); changing who may close (only the organiser, as now).

## Capabilities

### New Capabilities

(none)

### Modified Capabilities

- `split-claim-app`: the app can close the claiming. The requirement that said the app never closes it is replaced by two: one for closing, one stating what is still left to the chat.

## Impact

- `src/commands/split-handler.ts`: the body of the Done branch (check, build the assignment, close the claim message, move on) becomes one method that the chat's Done tap and the app both call; the chat's behaviour does not change. The claim message is edited by its id (`c.claimMsg`) instead of through the tapped message, so it also works without a button tap.
- `src/split-app/api.ts` and a small new helper: `POST /split-app/api/done`, which builds a grammY `Context` for the organiser's chat (as the Workflow's delivery already does) and runs that method.
- `src/split-app/page.ts`: a sticky Done button with the same busy handling as other changes; on success the page closes the app.
- Tests: the interface (closes with everything claimed, asks about unclaimed items, refuses when nobody else claimed, refuses a member, answers over when already closed, leaves the claim message closed); the chat's Done tests run unchanged; page tests; a browser check.
- Docs: README, AGENTS.md, `docs/architecture.md`.
- Deploy: Worker only; no migration.
