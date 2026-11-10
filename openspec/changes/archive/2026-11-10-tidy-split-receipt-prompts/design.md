## Context

All three changes sit in `src/commands/split-handler.ts`. Taps arrive in the callback dispatcher, which already checks the step and that the tapped message is the latest one, then branches on the callback data.

## Decisions

**Delete the review on `split_scan:use` only.** The branch currently calls `setButtons(ctx, new InlineKeyboard())` for every `split_scan:*` tap. For `use` it will call `ctx.deleteMessage()` instead and fall back to removing the buttons if that fails. The other taps are untouched because the review is still the visible record when the user scans again or types the total.

**Rewrite the payee bubble with `editMessageText`.** In the `split_payee:*` branch, before `proceed`, call `ctx.editMessageText(answer)` (no `reply_markup`, which removes the keyboard), best effort. `proceed` then continues as before. A stale tap is already rejected earlier, so only the live question is rewritten. When the payee is amended later, `askStep(PAYEE_ME)` sends a fresh question message, so the old answered bubble is left as history.

**Assignment wording.** Replace the closing sentence with: `"me" is you. If you are the one being paid, your share is not collected; otherwise I send you a QR for it.` The payee question comes after the assignment, so the text cannot know which case applies.

**People count in the summary.** In `summary()` the count is `listed.length`, plus one when `r.leftoverCents > 0 && r.extraCents === 0`, which is exactly when a line for the organiser's own amount is printed (own share, leftover covered, or leftover paid). An even leftover (`extraCents > 0`) goes to the listed people only, so the organiser is not added.

## Risks

- A deleted review means the item list is no longer visible above the assignment prompt; the list is already repeated in its own message there.
- `editMessageText` on a message older than 48 hours fails in Telegram; the failure is ignored and the flow continues.
