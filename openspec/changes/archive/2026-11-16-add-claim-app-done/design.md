## Context

See proposal.md - Why. Done in the chat is the `split_claim:done` tap in `SplitCommandHandler`. The router first checks that someone other than the tapper has claimed something (an alert if not); the branch then builds the assignment from the claims (`assignmentFromClaims`, `assignmentPatch`), replies with the error if that fails, edits the tapped message to "Claiming is closed." (which also removes its buttons), and calls `proceed`, which either stores the unassigned-items question (step UNASSIGNED) and posts it, or posts the summary (step CONFIRM). Everything it posts goes through a grammY `Context` (`ctx.reply`, `ctx.editMessageText`, `ctx.answerCallbackQuery`). The Mini App's interface runs in the Worker with no `Context`. The Workflow's delivery (`deliverJob` in `src/split-ai-workflow.ts`) already solves the same problem: it builds a `Context` from a synthetic update (chat, thread, user) and an `Api`, and runs a `SplitCommandHandler` method on it.

## Goals / Non-Goals

**Goals:**
- Done from the app has exactly the chat's result, by running the same code, not a copy of it.
- The chat's Done keeps working and keeps its behaviour.

**Non-Goals:**
- Moving the next steps into the app, a confirmation question, and any change to who may close (see proposal).

## Decisions

**One method for closing, called by both.** The branch body becomes `closeClaiming(ctx, c, organiserId)`, which returns the reason the claiming cannot be closed or `null` when it was. It does the check that someone else has claimed (so the app gets the same text; the router's alert stays for the chat), builds the assignment, edits the claim message and calls `proceed`. The chat's tap calls it with the state it already read and replies with a returned error as it does now. A public `closeClaimingFor(ctx, organiserId)` reads the conversation, answers "over" unless it is at step CLAIM of the `split` flow, and then calls the same method. Alternative: a second implementation in the interface: it would drift from the chat the first time the chat's Done changes.

**Edit the claim message by its id.** The branch used `ctx.editMessageText`, which edits the message the tap came from. With no tap there is none, so it becomes `ctx.api.editMessageText(chatId, c.claimMsg, ...)`. For the chat this is the same message (the claim message carries the Done button). Without `reply_markup` the buttons go, as before.

**A synthetic `Context` for the organiser's chat.** A small helper next to the interface builds an `Api` from `SPLIT_BOT_TOKEN` (with the test's `fetch` when given), a `Context` from an update shaped like a message from the organiser in the chat and topic taken from the signed launch data (the chat type is a supergroup when the id is negative, which is the only place claiming happens), and a `SplitCommandHandler` over the chat's Durable Object with the usage counter. This repeats the few lines of `deliverJob`; sharing them would mean changing the Workflow in a change about the app, so it is left for later.

**`POST /split-app/api/done`, answered after the work.** It authorises as every other call (valid launch data, the organiser of this chat's open claiming), calls `closeClaimingFor`, and answers 200, 409 `over` when the claiming is not open, or 422 with the reason. Unlike the chat refresh it is not sent to `waitUntil`: the organiser needs to know whether it worked, and it is a few Telegram calls.

**The page closes itself on success.** The next question is in the chat, where the organiser is going, so on a 200 the page calls `Telegram.WebApp.close()`. If that is not available it stops and shows "Claiming is closed. Finish in the chat." The button sits in a sticky footer so it is in view however far the list is scrolled, is disabled while any request waits (the busy handling already covers the list), and is hidden once the claiming is over. A refusal shows its reason in the message line, like other refusals. The page's hint stops telling the organiser to go to the chat.

**No confirmation.** The chat's Done asks nothing, and a closed claiming can be reopened (the summary's Amend asks how to share the items again, and the unclaimed-items question offers Keep claiming).

## Risks / Trade-offs

- The refactor touches the chat's Done → its existing tests run unchanged against the shared method, and the chat keeps its alert and its reply.
- Done in the app and Done in the chat at the same instant could both pass the check before either has moved the conversation on, as two chat taps could today → the app is inert while waiting and closes itself; the second finds the claiming over. No new guard is added.
- The background update that follows an app change (from the earlier change) could land on the claim message after Done has closed it, because the app now lets the organiser reach Done a moment after a change → the window is the length of one Telegram edit; if it happens the message shows buttons that answer "That step is over." and the chat has already moved on.
- A synthetic `Context` has no tapped message or callback → the shared method uses only `ctx.api`, `ctx.reply`, `ctx.chat` and `ctx.from`, which the synthetic update provides; a test runs the whole flow through it.

## Migration Plan

Deploy the Worker; no migration. Rollback: revert the commit (the chat's Done is unchanged in behaviour either way).
