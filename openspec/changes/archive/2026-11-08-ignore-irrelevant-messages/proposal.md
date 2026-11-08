# Proposal

## Why

In a group chat the bot answers every plain message that is not part of a conversation with "No active conversation. Try /start, /payments, ..." (seen in the Demo Event 1 group, where two ordinary messages between people each got that reply). The bot should stay quiet unless a message is meant for it.

A related gap: a conversation is stored per chat, not per person. While one member is part-way through `/start` or `/init`, any other member's message in that chat is read as an answer to the flow (and can fail validation or advance it).

## What Changes

- Free text with no active conversation is ignored: no reply and no state change, in groups and in private chats. The fallback hint is removed.
- A conversation records its owner (the user who started it and the topic it was started in). While a conversation is active, text from anyone else, or from another topic, is ignored.
- `/cancel` only acts on the sender's own active conversation; otherwise it is ignored silently.
- Commands (`/start`, `/payments`, `/init`, `/payback`, `/web_admin`, `/end_event`, `/help`, `/ping`) and inline buttons behave as before.
- No change to payments, paybacks, the web admin, the database or any message text in a flow.

## Capabilities

### New Capabilities

- `conversation-relevance`: which text messages the bot responds to, and who may continue or cancel an active conversation.

### Modified Capabilities

(none)

## Impact

- `src/bot.ts` (the free-text route, `/cancel`, stamping the owner after each flow command), `src/worker/conversation-do.ts` (optional `owner` on the state, an `/owner` route, owner kept while a flow is active and cleared when it ends).
- Tests: `test/workers/bot-wiring.test.ts` (the idle-hint test changes), the DO tests, plus new cases for other users and other topics.
- `AGENTS.md` (conversation state notes); `README.md` only if it mentions the hint.
