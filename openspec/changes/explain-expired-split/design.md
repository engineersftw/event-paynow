## Context

See proposal.md - Why. A split's state lives in the chat's Durable Object with an idle time (`idleMs`): 10 minutes (`IDLE_MS` in `src/commands/split-handler.ts`), one hour while items are claimed (`CLAIM_IDLE_MS`). When the alarm finds the state idle for that long it deletes it. A deleted conversation reads as `flow: 'idle'`, the same as after a confirm or a cancel, so from the bot's side "timed out", "finished" and "cancelled" are one case: no split is open.

Today that case reaches the user in five places, all as a toast (`answerCallbackQuery({ text })` without `show_alert`): the step check in `handleCallback` ("That step is over."), a member's claim tap and Get my QR when the conversation is not at CLAIM (the same words), the voice button ("That voice note is no longer waiting."), and an old menu button ("That menu is gone. Use Edit in app."). A typed message with no split open returns `false` from `handleText` and the bot says nothing. The webhook's own fallback (`bot.on('callback_query:data')`) only answers an empty query for buttons that are not the Split bot's.

## Goals / Non-Goals

**Goals:**
- Whoever taps a dead button, or types into a dead split in a private chat, is told what happened and how to start again.
- A longer wait outside claiming, without changing what is deleted or when it is deleted afterwards.

**Non-Goals:**
- Recovering a forgotten split, warning before the time runs out, and the Simple and Event bots (see proposal).

## Decisions

**Tell expired from stale by whether a split is open.** One helper, `expiredTap(ctx)`, answers the popup and clears the tapped message's buttons. Each of the five sites calls it when the conversation is not a `split` flow, and keeps its short notice when it is (an old summary that was replaced, a step that moved on): there the conversation is alive, the notice is true, and "no longer open" would be wrong. `handleCallback` already holds the state for the step check and the voice and menu cases; the claim tap and Get my QR learn it only on their stale path, from one read-only `/peek` there, so the hot path of a working claim tap gets no extra read.

**A popup, not a toast, and the buttons go.** `show_alert: true` makes Telegram show a dialog that stays until dismissed, which is the point: the toast was the problem. The text names the three ways a split ends (finished, cancelled, timed out) because the bot cannot tell them apart, says how long a waiting split is kept, and says what to do. `editMessageReplyMarkup` with an empty keyboard removes the buttons from the tapped message so it cannot be tapped again; an error (message too old or gone) is ignored. Alternative: reply with a message in the chat: noisier, in a group everyone sees it, and the popup reaches only the person who tapped.

**A hint only in a private chat.** In `handleText`, when no split is open: a private chat gets one reply, a group stays silent (nobody there is talking to the bot, and an expired split in a group would otherwise answer every message). The reply is sent from the handler, which then reports the text as handled, so the webhook needs no change. Commands are not affected: they never reach `handleText`. Alternative: also reply in groups to a message that replies to a bot prompt: more code for a rarer case.

**30 minutes outside claiming, from one constant.** `IDLE_MS` becomes 30 minutes and an `IDLE_MINUTES` next to it feeds the text of the popup and the hint, so changing the time changes what the user reads. The Durable Object's own default (10 minutes) stays, because the Event and Simple bots and any state written without an `idleMs` still use it; the Split bot passes its time on every write. Claiming stays at an hour. Why 30: long enough to go and ask who ordered what, short enough that a forgotten bill is gone soon after; it is a number to change, not a promise the code depends on. Alternative: an Extend button on each prompt: the person who is slow is by definition not tapping anything, so it cannot be used when it matters.

**Specs: the time moves with the code.** The two requirements that state 10 minutes (what the bot stores; receipt photos are not kept) are modified with every scenario kept, the "Conversation expires" scenario now says what a later tap or private message gets, and two requirements are added for the popup and for the hint.

## Risks / Trade-offs

- A longer wait keeps a bill's answers in the Durable Object for up to 30 minutes instead of 10 → they are still deleted, never logged and never copied; the landing page and the specs say 30.
- A typed message in a private chat after a finished split also gets the hint ("thanks", for example) → one short reply that explains the bot, in a chat that is only with the bot; acceptable.
- "Finished, was cancelled, or timed out" is vaguer than "timed out" → it is honest: the bot has no record to tell them apart, by design.
- A split open at the time of the deploy has the old 10-minute `idleMs` stored → it gets 30 minutes from its next answer; nothing breaks.

## Migration Plan

Deploy the Worker and the landing page (the Pages deploy runs because `src/web/page.ts` changes); no migration. Rollback: revert the commit; popups and hints go, and the time returns to 10 minutes from the next answer.
