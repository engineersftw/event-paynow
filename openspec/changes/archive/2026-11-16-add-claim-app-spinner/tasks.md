# Tasks

## 1. The spinner

- [x] 1.1 In `src/split-app/page.ts` add the sticky header row with the `Updating…` spinner (`#spin`, hidden by default, `.spin[hidden]` rule, a rotating ring that stops for `prefers-reduced-motion`), the `busy` style for the item list, and `setBusy(on)`; use it in `change()` (cleared in a `finally`) and make `load(loud)` use it for the first load and the reload after a refused change while the poll and the visibility refresh stay silent; verify with `npm run build` and `npx vitest run test/node/split-app-page.test.ts`
- [x] 1.2 Extend `test/node/split-app-page.test.ts`: the markup has `id="spin"` inside a `role="status"` element, the stylesheet hides `.spin[hidden]` and respects `prefers-reduced-motion`, the script has `setBusy`, and the poll and the visibility handler call `load()` without the loud flag while the first load calls `load(true)`; verify the file passes
- [x] 1.3 Browser check in Chromium (the scratch script from the Mini App change, kept out of the repository) with the interface slowed by about a second: after a tap on Add the spinner is visible and the list is dimmed and inert, a second tap does nothing, both are gone after the answer and the field is empty; a refused name shows its reason with no spinner; an aborted request shows "No connection" with no spinner; during nine idle seconds of slowed polling the spinner never shows; the first load shows it; the spinner stays visible when the list is scrolled to the last item, and the layout holds at 320 px

## 2. Docs and checks

- [x] 2.1 Add to `docs/architecture.md`, where the page's polling is described, that a change in flight shows a spinner and dims the list while the poll stays silent; verify with a search for the sentence
- [x] 2.2 Run `npm run build`, `npm run check` and `npm test`; fix anything they report

## 3. Rollout

- [x] 3.1 Deploy, then in a real group open the app, tap Add on a name and confirm the spinner appears at once and goes when the name is added, and that the idle app shows no spinner

## Workflow follow-up

- Archive the change after 3.1 is confirmed on a real group.
