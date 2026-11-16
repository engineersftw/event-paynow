## Why

In the Claims Mini App, tapping Add (or a person, Everyone, the ways list or Remove all) sends a request and waits for the answer, which takes a moment: the interface reads the chat's state, writes the change and edits the claim message in the chat before it answers. During that wait the page shows nothing. A second tap is ignored without any sign, so the organiser sees an app that looks stuck and taps again.

## What Changes

- While a change the organiser made, or the first load, is waiting for an answer, the app shows a small spinner with the words "Updating…" in its header, so there is always a visible sign that something is happening.
- While it waits, the items are dimmed and cannot be tapped, so a second tap is visibly refused instead of silently ignored. The spinner and the dimming go as soon as the answer or an error arrives.
- The background refresh every few seconds stays silent: no spinner, no dimming, so the screen does not flicker while nobody is doing anything.
- A refused change still shows its reason, and the spinner is gone by then.

Out of scope: making the interface faster (it answers only after the chat's claim message has been edited; answering first and editing in the background would shorten the wait and is left as a follow-up); optimistic updates that show the change before the server confirms it; any change to the interface, the data or the chat.

## Capabilities

### New Capabilities

(none)

### Modified Capabilities

- `split-claim-app`: the app shows when it is waiting for the server.

## Impact

- `src/split-app/page.ts`: spinner markup and styles in the header, a `setBusy` that shows it and makes the list inert, used by the first load and by every change; the poll stays silent.
- Tests: the page test checks the new markup and script; a browser check with a slowed interface shows the spinner during the wait and not for the poll.
- Docs: one sentence in `docs/architecture.md` where the page's polling is described.
- Deploy: Worker only; no migration. The Mini App page is served by the Worker with `no-store`, so the new version is picked up on the next open.
