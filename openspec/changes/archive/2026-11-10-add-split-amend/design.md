## Context

`SplitCommandHandler` is a straight-line flow: each answer handler validates, stores and asks the next question. Amending needs the opposite shape: change one answer, then work out what is still wrong or missing. Messages already carry everything needed to do that (context fields `totalCents`, `mode`, `people`, `entries`, `leftover`, `payeeType/Value`, `description`). The DO state is replaced wholesale on each `/state` write, so context is the single source of truth.

## Goals / Non-Goals

**Goals:** change any answer from the summary; accept edited answer messages; never leave two live Confirm buttons; the existing questions and tests keep working.

**Non-Goals:** editing after Confirm; per-line list edits; amending the bot's own messages; `/stats`.

## Decisions

1. **`settle(ctx, context)` decides the next step.** One function inspects the context and returns the first thing that is missing or invalid, in order: total, split type, then for equal the number of people (2–100 and at most the cents), for custom the list (sum not above the total) and the leftover choice (only when the sum is below the total and no choice is stored), payee, description (a `described` flag, set by an answer or Skip), then the summary. Every answer handler stores its value and calls `settle`, so the first run through the flow, an amendment and an edit all use the same rules. This also replaces the hand-written "what comes next" branches in each handler. The step constants stay as they are.
2. **Amend menu:** a new step AMEND (9) with `split_amend:total|split|payee|description|back`. Choosing a field sets `amending: field` and moves to that field's step with the question text plus a **Keep as is** button (`split_keep`), which returns to `settle`. Choosing Split clears `mode`, `people`, `entries` and `leftover` only after the user picks a type, so Keep as is before choosing leaves the split intact; the Equally / Custom buttons are the first prompt. `amending` is cleared whenever `settle` reaches the summary.
3. **What each amendment stores:** a new total keeps everything else and lets `settle` re-check (a list now over the total goes back to the list step with the overage message; a list now short with no leftover choice goes to the leftover question; a leftover choice already stored is kept, so an even split is recomputed with the new total automatically because the maths run from the context at summary and send time). A new list clears nothing but replaces `entries`, and clears `leftover` only if the sum is now exact (a stale choice is harmless but is dropped to avoid surprise). A new payee replaces the type and value. A new description replaces the text or clears it via Skip.
4. **Edited messages:** `bot.on('edited_message:text')` calls `handler.handleEdit(ctx)`. While answering, the handler records `answerMsgs: { [messageId]: 'total'|'people'|'list'|'payee'|'description' }` in the context (the id of the user's message). On an edit it looks up the field, validates the new text with the same parser as the live step (factored into small `parseTotal/parsePeople/parseList/parsePayee/parseDescription` helpers that return a value or an error), stores it and calls `settle`. Ignored silently: no recorded field, flow not `split`, not the owner (group), anything after Confirm (the claim wipes the state). Invalid edits reply with the reason and keep the earlier value.
5. **After an edit, what the user sees:** if `settle` returns the summary, the bot sends a fresh summary; otherwise if `settle` returns the step the conversation is already on, it replies "Updated." and does not repeat the question; otherwise it asks the step it returned (for example the list, after a total edit made it too small).
6. **One live summary:** the context stores `summaryMsg` (the message id of the latest summary). A new summary removes the buttons from the old one (`editMessageReplyMarkup` by id, best effort) before it is stored. Button taps compare the tapped message id with `summaryMsg` for the summary actions; a mismatch is answered "That step is over." and changes nothing. Questions with buttons (mode, leftover, people) rely on the existing step check.
7. **Payee in groups:** an edit of the payee message is deleted again like the original (best effort), and the Amend path asks for the payee as a force-reply like the first time. The summary keeps masking all but the last four characters.
8. **Edits in groups under privacy mode:** Telegram documents which messages a privacy-mode bot receives, and an edit of a reply is not guaranteed to arrive. The design does not depend on it: the Amend button needs only button taps and replies, which already work. The README says so. The webhook must not restrict `allowed_updates` to exclude `edited_message`; the documented `setWebhook` call does not set it.
9. **Tests:** the harness gets an `editedTextUpdate(chatId, userId, messageId, text)` builder. Existing tests keep passing because the straight-line flow now runs through `settle` with the same outcomes.

## Risks / Trade-offs

- [Refactoring every answer handler to use `settle` can change the straight-line flow] → the existing tests are the guard and run unchanged; new tests cover amend and edit.
- [A user edits a message from a long time ago] → only recorded answers of the active split count; others are ignored.
- [Message ids can be recorded wrongly if two answers arrive at once] → the DO serialises requests per chat, and the owner rule limits who can answer.
- [Edited messages may not arrive in groups with privacy mode on] → documented; the Amend button covers it.

## Migration Plan

None: no data or configuration. A split in progress during the deploy lacks the new context fields; the next summary tap may say "That step is over" and the user restarts with `/split` (10-minute expiry).
