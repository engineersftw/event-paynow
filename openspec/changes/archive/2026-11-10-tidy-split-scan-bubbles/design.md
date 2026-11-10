## Context

All changes are in `src/commands/split-handler.ts`, plus tests. `reviewButtons` builds the keyboard; the photo handler replies "Reading your receipt…" before downloading and reading the photo, then calls `showReview` on success. The header parser in `parseAssignments` already strips an optional trailing `:` and compares names in lower case, so `All` works today.

## Decisions

**Buttons.** Add `.row()` after "Send another photo" in `reviewButtons`; nothing else about the keyboard changes.

**Reading notice.** Keep the returned message id from the `ctx.reply` and, after the scan has been parsed and before the review is sent, call `ctx.api.deleteMessage(chatId, id)` with the error ignored. On every failure path the notice stays, because the failure text refers to it and the stage that failed is visible. Deleting before the review keeps the chat order clean (the review then arrives where the notice was).

**Colon.** No parser change. Change the prompt example from `All:` to `All` and add "(a colon after a name is optional)". Add a parser test asserting `All`, `All:`, `ALL :` give the same result, so the behaviour cannot regress.

## Risks

- A group bot without delete rights leaves the notice in place; the error is ignored and the flow is unaffected.
