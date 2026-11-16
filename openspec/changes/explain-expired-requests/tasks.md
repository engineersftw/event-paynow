# Tasks

## 1. Shared wording

- [x] 1.1 Export `DEFAULT_IDLE_MINUTES` from `src/worker/conversation-do.ts` (and use it for the alarm's default), and add `src/commands/closed-request.ts` with `closedRequestText`, `closedRequestTap` (popup, then remove the buttons, errors ignored) and the two hints (Simple and Event); verify with a node test that the text names the command and the minutes from the constant, and that the tap answers an alert and clears the keyboard even when removing it fails

## 2. Simple bot

- [x] 2.1 In `src/commands/simple-handler.ts` answer a tap with the popup and remove the buttons when no request is open, keep "That step is over." when one is, and reply with the hint to typed text when no request is open; verify with `npm run build`
- [x] 2.2 Tests in `test/workers/simple-bot.test.ts` (and the node tests if they assert the old toast): Confirm tapped after the request was reset, after the QR was made and after Cancel gets the popup and the buttons go, an earlier step's button while a request is open keeps the short notice, typed text with no request gets the hint, a command is not answered by it, a request that is open still reads text as the answer; verify the suites pass

## 3. Event bot buttons

- [x] 3.1 In `start-handler.ts` and `payback-handler.ts` replace the "Session expired" toasts, and the Confirm and Cancel cases where the claim finds nothing, with `closedRequestTap` naming the command; verify with `npm run build`
- [x] 3.2 In `init-handler.ts`, `end-event-handler.ts` and `edit-event-handler.ts` keep the message edit and also answer the tap with the popup; verify with `npm run build`
- [x] 3.3 Update the unit tests that assert the old toast text or answer shape (`payback-handler`, `init-handler`, `start-handler`, `event-default-amount` and any other the full run reports) and add Workers tests that a dead button of each of the five commands gets the popup and loses its buttons while a payments-list button and a payment action still work; verify with `npm test`

## 4. Event bot typed text in a private chat

- [x] 4.1 In the free-text router in `src/bot.ts` send the hint when `ownActiveConversation` is false and the chat is private; groups, topics and other people's conversations stay silent; verify with `npm run build`
- [x] 4.2 Tests: a private chat with no conversation gets the hint once, the same text after the conversation was reset gets it, a group gets nothing, another member's text in a group is still ignored, a command is not answered by the hint, and a conversation that is open still reads the text as the answer; update the existing "private chat gets no message" and "expired conversation gets no message" tests to the new rule; verify the suites pass

## 5. Docs and checks

- [x] 5.1 Update README, AGENTS.md and `docs/architecture.md` (the three bots' behaviour for a dead button and for typed text; the shared helper; the exception to the relevance rule); verify with a search that nothing still says text is ignored "in private chats alike" or describes the old toast for these bots
- [x] 5.2 Run `npm run build`, `npm run check` and `npm test`; fix anything they report

## 6. Rollout

- [ ] 6.1 Deploy, then in a real chat: finish or cancel a Simple bot request and tap a button on one of its old messages, type a number to the Simple bot and to the Event bot in private chats with nothing open (the hints), run `/start` in the Event bot and tap a button on a summary that was already confirmed (the popup), and confirm a group stays silent and the payments list still works

## Workflow follow-up

- Archive the change after 6.1 is confirmed on a real chat.
