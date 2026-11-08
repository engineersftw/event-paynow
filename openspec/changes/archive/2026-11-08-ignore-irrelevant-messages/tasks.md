# Tasks

## 1. Conversation owner in the Durable Object

- [x] 1.1 Add an optional `owner: { userId, topicId }` to `ConversationStateSchema` in `src/worker/conversation-do.ts`; add `POST /owner` (sets it when `flow !== 'idle'`, no-op when idle)
- [x] 1.2 In `updateState`, carry the stored owner over while the new flow is not `idle` and the incoming state has none; drop it when the flow becomes `idle`; make sure `/claim` and `/reset` clear it
- [x] 1.3 Workers-pool DO tests: owner set and kept across step updates, cleared on idle/claim/reset/expiry, `/owner` ignored when idle, old states without an owner still parse

## 2. Bot routing

- [x] 2.1 In `src/bot.ts` add a helper that stamps the owner (`ctx.from.id`, `message_thread_id ?? 0`) and call it after `/start`, `/init`, `/payback` and `/end_event`
- [x] 2.2 Add the relevance guard at the top of the `message:text` handler (idle or another owner or another topic means return silently) and remove the final "No active conversation" reply
- [x] 2.3 Change `/cancel` to act, and reply, only when a conversation is active and owned by the sender (or has no owner); otherwise return without a reply

## 3. Tests and docs

- [x] 3.1 Update `test/workers/bot-wiring.test.ts`: the idle free-text test now expects no reply and no state change; add cases for a private chat, another user mid-flow, another topic, the owner continuing, `/cancel` by the owner, by another user and with nothing to cancel, and `/help` while someone else is mid-flow
- [x] 3.2 Run each flow (`/start`, `/init`, `/payback`, `/end_event`) end to end in a group chat with a second user posting in between, and check the first user's flow is unaffected
- [x] 3.3 Update `AGENTS.md` (conversation state and the free-text routing note) and `README.md` if it mentions the hint; run `npm run check`, `npm run build` and `npm test`
