# Tasks

## 1. Explain a dead button

- [x] 1.1 In `src/commands/split-handler.ts` add `expiredTap(ctx)` (an alert popup with the "no longer open" text, then `editMessageReplyMarkup` with an empty keyboard on the tapped message, errors ignored) and call it, when no split is open, at the step check in `handleCallback`, in the voice button's "not waiting" case, for an old menu button, and on the stale path of a member's claim tap and of Get my QR (one `/peek` there to tell expired from stale); the short notices stay when a split is open; verify with `npm run build`
- [x] 1.2 Extend the Telegram stub in `test/workers/harness.ts` to record whether an answer was an alert, and add tests in `test/workers/split-bot.test.ts`: Confirm tapped after the split was reset (time ran out), after Confirm and after Cancel, an old Confirm tapped after a new split started stays "That step is over.", a member's claim tap and Get my QR on an expired claim message, the voice and old-menu buttons, and the buttons removed from the tapped message; verify the file passes and that the existing stale-button tests pass unchanged

## 2. Explain a typed answer to a dead split

- [x] 2.1 In `handleText` reply, in a private chat, once with the "No split is open" hint when no split is open and report the text as handled; leave groups silent; verify with `npm run build`
- [x] 2.2 Tests: typed total in a private chat after the split was reset gets the hint, the same text in a group gets nothing, a text while a split is open is still the answer to the question, a command is not answered by the hint; verify the file passes

## 3. A longer wait

- [x] 3.1 Make `IDLE_MS` 30 minutes, add `IDLE_MINUTES` next to it and use it in the popup and the hint; verify with a test that a new split's conversation holds `idleMs` of 30 minutes, that the claiming still holds an hour, and that the alarm is set 30 minutes ahead
- [x] 3.2 Change "10 minutes" to "30 minutes" where it describes the Split bot: the `/split` landing page (`src/web/page.ts`) and its test, README, AGENTS.md and `docs/architecture.md`; leave the Simple and Event bots' statements as they are; verify with a search that no Split description still says 10 minutes

## 4. Checks

- [x] 4.1 Run `npm run build`, `npm run check` and `npm test`; fix anything they report

## 5. Rollout

- [x] 5.1 Deploy, then in a real chat: finish or cancel a split and tap a button on one of its old messages (the popup appears and the buttons go), type the total into a private chat with no split open (the hint), and start a split to confirm the normal flow is unchanged

## Workflow follow-up

- Archive the change after 5.1 is confirmed on a real chat.
