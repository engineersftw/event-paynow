## Why

When the organiser makes a change in the Claims Mini App, the interface records it and then edits the claim message in the chat (a call to Telegram's Bot API) before it answers the page. The page waits for both. The spinner added earlier makes that wait visible, but the wait itself is still the length of the chat edit on top of the change. The edit does not affect what the organiser sees in the app, so the app can show the new claims as soon as the change is recorded and let the chat message catch up a moment later.

## What Changes

- The interface answers a change as soon as it is recorded. It no longer waits for the claim message in the chat to be edited.
- The chat message is brought up to date after the answer has gone, in the background, using the Worker's own way of finishing work after a response (`waitUntil`). Where that is not available (tests, local runs), the edit is awaited as today.
- The edit shows the newest claims, not the ones from the change that triggered it: it reads the conversation again just before editing, and edits again if the claims changed while it was running. So several quick changes, and a slow edit finishing after a faster one, still leave the message showing the latest claims.
- The edit is skipped when the claiming has been closed in the meantime, so a late edit never puts the claim buttons back on a message the chat has already closed.

Out of scope: the page (it already shows the spinner and uses the answer it gets); the chat taps (members' taps edit the message through the bot as before); the number of reads and writes the interface makes to the conversation; optimistic updates in the page.

## Capabilities

### New Capabilities

(none)

### Modified Capabilities

- `split-claim-app`: a change is answered when it is recorded, and the claim message in the chat is brought up to date afterwards with the newest claims.

## Impact

- `src/split-app/api.ts`: `refreshClaimMessage` becomes the background refresh (re-read, edit, check, repeat up to a small limit) and is started through an optional `waitUntil` in the interface's dependencies, falling back to awaiting it.
- `src/worker.ts`: passes `ctx.waitUntil` to the interface for the Mini App routes.
- Tests: the response arrives before a slow chat edit finishes; the edit shows the newest claims after quick changes and after out-of-order finishes; no edit once the claiming is closed; the Worker route hands the refresh to `waitUntil`; the existing tests that await the edit keep working through the fallback.
- Docs: one sentence in `docs/architecture.md`.
- Deploy: Worker only; no migration. The chat message may now lag the app by the length of the edit (one call to Telegram, not measured here).
