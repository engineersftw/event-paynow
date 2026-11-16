## Why

A split the Split bot is waiting on is forgotten after 10 minutes without an answer (an hour while items are being claimed): the conversation is deleted, which is what the bot promises about the bill it handles. When someone comes back later and taps a button on an old message, the bot answers with a short toast, "That step is over.", that disappears in a moment and says neither why nor what to do. A typed answer, such as the total or the payee, gets no reply at all in a private chat. Either way it looks as if the bot is broken, and the person has to guess that they should send `/split` again.

## What Changes

- A tap on a button of a split that is no longer open (it timed out, was cancelled, or already finished) now gets a popup that stays until dismissed: "This split is no longer open: it finished, was cancelled, or timed out after 30 minutes without an answer. Send /split to start a new one." The buttons are also removed from the message that was tapped, so a dead button cannot be tapped again.
- A split that is still open but has moved on (an old summary that was replaced, a button of an earlier step) keeps the short "That step is over." notice: it is true there, and the conversation is still alive.
- In a private chat, a typed message when no split is open now gets one reply: "No split is open. Send /split to start one. (A split is forgotten after 30 minutes without an answer.)" In a group the bot stays silent, as now, because group chatter is not for it.
- The time a split may wait for an answer outside the claiming step goes from 10 to 30 minutes (claiming stays at an hour). A longer wait is the "extend the session" that can be offered safely: the answers are still deleted afterwards, nothing is kept beyond it, and the three places that state the time (the specs, the landing page, the docs) say 30 minutes.

Out of scope: bringing a timed-out split back (the answers are deleted on purpose, so there is nothing to bring back; the bill would have to be typed again); a warning before the time runs out (the bot would have to send messages nobody asked for); the Simple and Event bots, which have the same quiet behaviour and can follow later if wanted.

## Capabilities

### New Capabilities

(none)

### Modified Capabilities

- `bill-split-bot`: buttons and typed answers for a split that is no longer open are answered with an explanation and how to start again; the time a split waits outside claiming is 30 minutes.

## Impact

- `src/commands/split-handler.ts`: an `expiredTap` that answers with a popup and removes the buttons, used wherever a tap finds no open split (the step check, a member's claim tap, Get my QR, the voice button, an old menu button); a reply to typed text in a private chat when no split is open; the wait outside claiming becomes 30 minutes, with the minutes taken from one constant so the messages cannot drift.
- Tests: expired and finished splits, a tap by a member on an expired claim message, the buttons removed, typed text in a private chat and in a group, the still-open case unchanged, and the new wait.
- `src/web/page.ts` (the `/split` landing page) and its test, README, AGENTS.md and `docs/architecture.md`: "10 minutes" becomes 30 where it describes the Split bot.
- Deploy: Worker and Pages (the landing page text); no migration. A split waiting at the time of the deploy keeps the time it was given and gets the longer one from its next answer.
