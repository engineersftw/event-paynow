# Design

## Context

Events have `name`, `payee_type`, `payee_value` and `default_amount_cents` columns, all created in `/init`. Payments copy the description and payee at creation (`payments.description`, `payee_*`), so changing the event never rewrites them. `/end_event` is the model for a pick-an-event flow (`EndEventHandler`, flow `end`); `/init` holds the validation to reuse (`detectProxyType`, `parseAmount`). Conversation ownership (`stampOwner`, `ownActiveConversation`) already keeps other members' chatter out of a flow. `isChatAdmin` already exists and is used by the web admin and payment access. See proposal.md for motivation.

## Goals / Non-Goals

**Goals:**
- A small flow in the style of `/end_event`, reusing existing validators and the admin check.
- A single guarded write so an edit never touches a closed event.

**Non-Goals:**
- Reopening, deleting or moving events; editing several fields in one run; changing existing payments.

## Decisions

1. **One field per run, applied immediately, no confirm step.** The result message lists all final values (name, payee, default amount or "none", with the edited field marked) read back from the updated row, and a mistake is fixed by running the command again. A confirm step would add a round trip to every edit. Alternative: batch edit with a final confirmation, rejected as more state for little gain.
2. **New flow `edit` with steps 1 pick event, 2 pick field, 3 await value.** Context carries `eventRef` and `field`. Callback data: `edit_pick:<ref>`, `edit_field:<name|payee|amount>`, `edit_clear_amount`, `edit_cancel`. Alternative: reuse the `end` flow, rejected because the handler's `handleInput` returns true for any text.
3. **Admin check at start and at write.** Start gives a fast refusal; the write-time check covers demotion between the two. A callback tapped by someone else cannot write, because the text value is only accepted from the conversation owner and the write re-checks the sender. Alternative: allow any member, rejected because the payee decides where money goes.
4. **`updateEvent(ref, patch)` on `EventRepository`:** a single `UPDATE … WHERE ref = ? AND status = 'open' RETURNING`, patch limited to `name`, `payeeType`/`payeeValue` and `defaultAmountCents` (`number | null`). Returns the updated event or `null` (closed or missing). No migration needed.
5. **Cross-chat guard like `/end_event`:** the picked event must belong to the current chat, otherwise it reads as not found.

## Risks / Trade-offs

- A payee change affects only new payments → the success message says existing payments keep their original payee.
- The conversation expires after 10 minutes → the existing expiry message path applies, nothing is written before the final value.
- The `GET /state` DO shape gains a flow value → old stored states are unaffected because `edit` is only added to the enum.
