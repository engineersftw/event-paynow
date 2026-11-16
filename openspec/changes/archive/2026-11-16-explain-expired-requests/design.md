## Context

See proposal.md - Why. The Split bot's fix (the archived `explain-expired-split`) answers a tap on a dead button with a popup (`show_alert`), removes the buttons from the tapped message, and replies once to typed text in a private chat. The same situation, "no conversation is open", reads as `flow: 'idle'` in the chat's Durable Object whether the conversation timed out, finished or was cancelled, so the bots cannot tell those apart and the wording names all three.

What the other two bots do today:
- **Simple bot** (`simple-handler.ts`): `handleCallback` answers a toast "That step is over." when the step does not match, with no regard to whether any request is open; `handleText` returns without a word when there is no request. The bot already serves private chats only.
- **Event bot**: `/start` and `/payback` answer "❌ Session expired. Run /start again." as a toast and leave the buttons; Confirm and Cancel on a `/start` summary answer "⚠️ Already processed or expired." when the atomic claim finds nothing. `/init`, `/end_event` and `/edit_event` replace the message with "❌ Session expired. Run /init again." and no buttons, but never answer the tap. Buttons of the payments list and of a payment (`event_view:`, `payments:`, `mark_received`, `void`, `payback:`, `pb_sent`, ...) read stored data and have no expiry. Typed text goes through `ownActiveConversation`, which is false when no conversation is open, and then the bot says nothing; the `conversation-relevance` spec requires that in groups, topics and private chats alike.

## Goals / Non-Goals

**Goals:**
- Both bots tell whoever taps a dead conversation button what happened and how to start again, with the same popup and the same removal of buttons as the Split bot.
- Typed text in a private chat with no conversation open is not met with silence.

**Non-Goals:**
- A longer wait, bringing a conversation back, and anything outside the conversation buttons (see proposal).

## Decisions

**One small shared module.** `src/commands/closed-request.ts` holds `closedRequestText(command, then?)` (the popup text, with the minutes from the Durable Object's default), `closedRequestTap(ctx, command, then?)` (answer the popup, then remove the buttons, errors ignored) and the two hints. The Split bot keeps its own inline copy for now: moving it is a refactor that touches the largest handler and is not needed here. The minutes come from `DEFAULT_IDLE_MINUTES`, exported from `src/worker/conversation-do.ts` and used there for the alarm's default, so the text and the real time cannot drift.

**Event bot: one rule per site, keeping each handler's own wording where it is already explicit.** Where the handler used a toast and left the buttons (`/start`, `/payback`), it now calls `closedRequestTap`. Where it replaced the message text (`/init`, `/end_event`, `/edit_event`), it keeps that edit (it is the existing, tested behaviour) and additionally answers the tap with the popup, so the button stops spinning and the explanation is the same everywhere. Confirm and Cancel on a `/start` summary use `closedRequestTap` when the claim finds nothing: this includes a double tap on Confirm, whose second tap now gets a popup, not a toast; it is true ("it finished") and cheap, and the buttons are already gone after the first tap.

**Simple bot: the popup when no request is open, the notice when one is.** `handleCallback` already reads the state; with `state.flow !== 'simple'` it calls `closedRequestTap(ctx, '/start', 'make a new QR')`, else it keeps "That step is over." `handleText` replies with the hint when no request is open and returns that it handled the text.

**The Event bot's typed-text hint is private chats only, and is its own task group.** In the free-text router in `src/bot.ts`, when `ownActiveConversation` is false and the chat is private, the bot sends the hint; groups and topics stay silent, as does text from someone who does not own the open conversation (that is a group case). The `conversation-relevance` requirement is modified to say so, with all its scenarios kept and the two private-chat scenarios reworded. This is the one place the change reverses a written decision; the reason for that decision was noisy replies to group chatter, which stays silent.

**The wait stays 10 minutes in both.** The Event bot must not wait longer: while a conversation is open in a group, other people's flow commands are refused ("Someone else is in the middle of a request"), so a longer wait would block them for longer when someone walks away. The Simple bot is private and could wait longer, but nobody has asked, and the Split bot's longer wait was a separate decision about a flow where people go and ask who ordered what.

## Risks / Trade-offs

- A double tap on Confirm now shows a popup on the second tap → accurate and harmless; the first tap already removed the buttons.
- A hint to every typed message in a private chat with the Event bot when nothing is open (even "thanks") → one short reply in a one-to-one chat, and it can be dropped as a unit; groups are untouched.
- Several unit tests assert the old toast text and exact answer shapes (the `/payback` tests, `event-default-amount`, `/init`'s mocks) → they are updated to the popup; the behaviour they protect (nothing is created, nothing changes) is unchanged and still asserted.
- Two handlers show the explanation twice (the edited message and the popup) → the message stays as a record in the chat after the popup is dismissed.

## Migration Plan

Deploy the Worker; no migration, no configuration. Rollback: revert the commit.
