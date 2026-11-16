# Tasks

## 1. Closing, in the handler and the interface

- [x] 1.1 In `src/commands/split-handler.ts` move the body of the `split_claim:done` branch into `closeClaiming(ctx, c, organiserId)` (returns the reason it cannot close, or `null`), edit the claim message by `c.claimMsg` through `ctx.api`, and add `closeClaimingFor(ctx, organiserId)` (answers "over" unless the flow is `split` at CLAIM); the chat's tap calls the shared method and keeps its alert and its reply; verify with `npm run build` and the whole `test/workers/split-bot.test.ts` passing without a test edited
- [x] 1.2 Add the helper that builds the synthetic `Context` and handler for an organiser's chat and topic, and `POST /split-app/api/done` in `src/split-app/api.ts` (200, 409 `over`, 422 with the reason; authorised like the other calls; awaited, not sent to `waitUntil`); verify with `npm run build`
- [x] 1.3 Tests in `test/workers/split-bot.test.ts`, through a real claiming started in a group: Done from the app with everything claimed posts the summary in the chat, closes the claim message without buttons and moves the conversation to the summary step; with an unclaimed item the chat asks the unclaimed-items question; with nobody else claimed it answers 422 with the chat's reason, posts nothing and leaves the claiming open; a member and a stranger are refused; Done in the chat first and then in the app (and the reverse) changes nothing the second time and answers 409; the topic of the chat is kept; a refused Done leaves the claim buttons working; verify the file passes

## 2. The page

- [x] 2.1 In `src/split-app/page.ts` add the sticky Done footer (always in view, disabled while a request waits, hidden once the claiming is over), the call to `/done` with the existing busy and refusal handling, closing the app through `Telegram.WebApp.close()` on success with the "Claiming is closed. Finish in the chat." fallback, bottom padding so the last item is not covered, and a hint that no longer sends the organiser to the chat; verify with `npm run build`
- [x] 2.2 Extend `test/node/split-app-page.test.ts` (the Done button and footer markup, the call to `done`, `close()` with its fallback, the hint text, the button disabled by `setBusy`); verify the file passes
- [x] 2.3 Browser check in Chromium (the scratch script from the earlier Mini App changes, outside the repository) with the interface's `done` answered by the test: the button is in view when the list is scrolled to the last item and does not cover it, a tap shows the spinner and calls `close()` on success, a 422 shows its reason and leaves the app usable, a 409 shows that the claiming is over, a second tap while waiting does nothing, and the layout holds at 320 px

## 3. Docs and checks

- [x] 3.1 Update README, AGENTS.md and `docs/architecture.md` (the app can close the claiming; Done stays in the chat; what stays with the chat; the new route and the synthetic `Context`); verify with a search that nothing still says the app never closes the claiming or that Done is only in the chat
- [x] 3.2 Run `npm run build`, `npm run check` and `npm test`; fix anything they report

## 4. Rollout

- [ ] 4.1 Deploy, then in a real group: tap Done in the app with everything claimed (the app closes, the claim message shows it is closed, the summary is in the chat); repeat with an unclaimed item (the chat asks about it); try it with nobody else claimed (the reason shows in the app); and confirm Done in the chat still works on another split

## Workflow follow-up

- Archive the change after 4.1 is confirmed on a real group.
