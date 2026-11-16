## Why

The Split bot now explains an expired split: a tap on an old button gets a popup that says why and how to start again, and a typed answer in a private chat gets a hint. The Simple bot and the Event bot still behave the way the Split bot did before. In the Simple bot a tap on an old button gets a toast, "That step is over.", that vanishes at once, and typed text gets no reply. In the Event bot the picture is mixed: `/start` and `/payback` answer a stale button with a short toast ("Session expired. Run /start again.") and leave the dead buttons on the message; `/init`, `/end_event` and `/edit_event` replace the message text but never answer the tap, so the button keeps spinning; and typed text after the conversation is gone gets no reply. Someone who comes back after a pause still cannot tell what happened.

## What Changes

- **Simple bot.** A tap on a button of a request that is no longer open (finished, cancelled or timed out) gets a popup that stays until dismissed: "This request is no longer open: it finished, was cancelled, or timed out after 10 minutes without an answer. Send /start to make a new QR." The buttons go from the tapped message. A request that is still open but moved on keeps "That step is over." Typed text with no request open gets one hint: "No QR is being made. Send /start to make one. (A request is forgotten after 10 minutes without an answer.)" The bot already works only in private chats.
- **Event bot, buttons.** A tap on a button of a conversation that is no longer open (`/init`, `/start`, `/payback`, `/end_event`, `/edit_event`) gets the same kind of popup, naming the command to run again, and the buttons go. `/start` and `/payback` stop using a toast that leaves the buttons live; `/init`, `/end_event` and `/edit_event` keep replacing the message text and now also answer the tap, so it stops spinning. Buttons that do not belong to a conversation (the `/payments` list and payment actions) are not touched: they work from stored data at any time.
- **Event bot, typed text, in private chats only.** Typed text that is not a command, with no conversation open, gets one hint: "Nothing is waiting for an answer. Send /help to see what I can do. (A request is forgotten after 10 minutes without an answer.)" Groups, topics and other people's conversations stay silent, as now. **This reverses a written decision:** the `conversation-relevance` capability says text outside a conversation gets no reply "in group chats, topics and private chats alike", and that an expired conversation gets none either. It is a separate group of tasks, so it can be dropped without touching the rest.
- The 10-minute wait stays for both bots (see the design for why the Event bot must not wait longer). The wording comes from one shared helper, with the minutes read from the Durable Object's default, so the text cannot disagree with the real time.

Out of scope: the Split bot (done); bringing a timed-out conversation back (answers are deleted on purpose); the web admin and payer pages; a longer wait.

## Capabilities

### New Capabilities

(none)

### Modified Capabilities

- `simple-paynow-bot`: a dead button is answered with a popup and loses its buttons; typed text with no request open gets a hint.
- `conversation-relevance` (Event bot): the "ignored" rule now has an exception for typed text in a private chat; a dead button of a conversation is answered with a popup and loses its buttons.

## Impact

- New `src/commands/closed-request.ts`: the popup text for a command, a function that answers the tap with the popup and removes the buttons, and the two hints; `src/worker/conversation-do.ts` exports the default wait (`DEFAULT_IDLE_MINUTES`) that the DO also uses for its alarm.
- `src/commands/simple-handler.ts`: the stale-button branch and typed text with no request.
- `src/commands/start-handler.ts`, `payback-handler.ts`, `init-handler.ts`, `end-event-handler.ts`, `edit-event-handler.ts`: the places that answer "Session expired" (and Confirm and Cancel when the claim finds nothing). `src/bot.ts`: the private-chat hint in the free-text router.
- Tests: the Simple bot (popup, buttons removed, notice kept while open, hint); the Event bot's five handlers (unit tests that assert the old toast text change to the popup) and the hint in a private chat, silence in a group, the owner check unchanged.
- Docs: README, AGENTS.md, `docs/architecture.md`.
- Deploy: Worker only; no migration; no change to what is stored or for how long.
