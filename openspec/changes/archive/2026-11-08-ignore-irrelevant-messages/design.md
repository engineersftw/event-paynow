# Design

## Context

`createBot` in `src/bot.ts` routes every `message:text` through the four flow handlers (`PaybackCommandHandler`, `StartCommandHandler`, `InitCommandHandler`, `EndEventHandler`), each of which returns `false` unless the per-chat Durable Object's `flow` is its own. If none claims the message, a final `ctx.reply("❓ No active conversation...")` runs; that is the unwanted reply. The DO is keyed `chat-<chatId>` (one conversation per chat, not per user or topic) and its state is `{ flow, step, context, lastActivity }`. `context` is written differently by each flow (some keep `userId` and `topicId`, others drop them, for example the end flow), so the handlers cannot be relied on to say who owns a conversation. `/cancel` resets the chat's state for anyone and always replies.

## Goals / Non-Goals

**Goals:** no reply to ordinary chat; only the owner (same user, same topic) can continue or cancel a flow; no behaviour change for commands, buttons or flow messages.

**Non-Goals:** one conversation per user (a second command in the same chat still replaces the first, as today); changes to the flows' own prompts; access rules for buttons (already handled elsewhere); muting commands sent to other bots.

## Decisions

1. **Silent fallback.** Delete the final `ctx.reply` in the `message:text` handler. A message no flow claims is simply not answered. Non-text messages are already ignored (the route only handles `message:text`).
2. **Owner lives at the top of the state, not in `context`.** Add an optional `owner: { userId, topicId }` to `ConversationStateSchema` (optional, so existing stored states still parse). Putting it beside `flow` means the flows keep writing their own `context` untouched and cannot drop it.
3. **Who sets it.** A new `POST /owner` route on the DO sets `owner` on the current state when `flow !== 'idle'`, and is a no-op when idle. `bot.ts` calls it right after each flow-starting command (`/start`, `/init`, `/payback`, `/end_event`) and after the Payback button (`payback:<ref>`), with the sender's id and `message_thread_id ?? 0`. Alternative: add the owner to each handler's `start()`; rejected because there are four handlers and several state writes each.
4. **Who keeps and clears it.** In the DO's `updateState`, when the incoming state has no `owner`, carry over the stored owner while the new `flow` is not `idle`; when the new `flow` is `idle` (confirm, cancel, expiry, `/claim`, `/reset`), the owner is dropped. A new flow started by a command writes state and then is re-stamped by decision 3, so a stale owner never survives a new command.
5. **The relevance guard.** At the top of `message:text`: read the state with a new read-only `GET /peek` (`GET /state` creates state, bumps `lastActivity` and schedules an alarm on every read, which would let chatter in a busy group keep a stale conversation alive and write storage for every random message); if `flow` is `idle`, return; if `owner` is set and differs from `(ctx.from.id, thread id)`, return; otherwise dispatch to the handlers exactly as today. A state with no owner (a conversation that began before this deploy) is treated as relevant to everyone for its remaining life (at most 10 minutes), which is the old behaviour.
6. **`/cancel`.** Peek at the state; if the flow is not idle and the sender is the owner (or the state has no owner), reset and reply as before; otherwise return without a reply. Commands other than `/cancel` do not consult ownership.
7. **Cost.** One read-only DO read per text message; it writes nothing and sets no alarm, so ordinary chatter costs less than before (the old path ran each flow handler's `GET /state` and then replied).

## Risks / Trade-offs

- Two people who share a chat cannot both be mid-flow (unchanged); now the second person's text is silently ignored instead of corrupting the first person's flow.
- Silence can look like a hang if someone types an answer to a flow that expired. The conversation expires after 10 minutes and its prompts say how to restart (`/start`); acceptable, and it is what was asked.
- A message sent in the 100 ms gap between a command writing state and the owner stamp is treated as ownerless (relevant to all); negligible.
- Topic id 0 means the chat's general area; an owner stamped with 0 only matches messages with no thread id.
