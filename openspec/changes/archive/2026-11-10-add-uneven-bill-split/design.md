## Context

The equal flow lives in `SplitCommandHandler` (steps total → people → payee → description → confirm) with the maths in `split-math.ts`. Conversation answers sit in the chat's Durable Object context; Confirm claims the state once and sends the QR. The group rules (owner-only answers, force-reply prompts, member-count button, masked payee) already wrap every step and must keep working for the new steps.

## Goals / Non-Goals

**Goals:** custom per-person amounts with explicit leftover handling; one QR per distinct amount; the equal flow untouched.

**Non-Goals:** item, weight or percentage splits; remembering who paid; editing a single entry; `/stats`.

## Decisions

1. **New step after the total: split type.** Steps become TOTAL(1), MODE(2), PEOPLE(3) for equal or LIST(4) for custom, LEFTOVER(5, only when the list is short), PAYEE(6), DESCRIPTION(7), CONFIRM(8). Step numbers are only compared inside the handler and the DO's `/claim`, so renumbering is safe, but the confirm step number changes from 5 to 8; the claim body and the callback-step table use the constant.
2. **Buttons for mode and leftover, text for the list.** Mode: `split_mode:equal|custom`. Leftover: `split_leftover:even|omit`. In a group these are inline-button messages, so the prompt says "reply to this message" like the existing buttoned prompts. The list prompt is a force-reply in groups.
3. **List format: one person per line, name then amount** (`Ann 40`). The amount is the last whitespace-separated token and parsed with `parseAmount`; the rest of the line is the name, so `Mary Ann 12.50` works. Lines only, no commas or semicolons, to keep parsing unambiguous (Telegram keeps newlines). Names 1–20 characters, unique ignoring case, 1–20 people. An invalid line reports its number and text. `parseCustomList(text)` returns `{ people: {name, cents}[] } | { error }` and lives in `split-math.ts`.
4. **Organiser is not listed.** Entries are the people who pay the organiser. This matches the equal flow, where the organiser is one of N and pays no one. The leftover left out is therefore "the organiser covers it", and the prompt and summary say so.
5. **Leftover maths:** `leftover = total − sum`. Check order: sum > total rejects (shows the overage), sum == total skips the question, sum < total asks. "Split it evenly" adds `ceil(leftover / n)` cents to each person, using integers, so the organiser is never short; the total collected can exceed the bill by less than `n` cents, shown in the summary exactly as in the equal flow. "Leave it out" adds nothing. Evenly means among everyone listed (not "the rest"), because there is no other group to define.
6. **One QR per distinct amount.** `groupByAmount(people)` returns `{ cents, names[] }[]` in first-appearance order. Each QR: fixed, not editable, description if given. Image lines: description, `SGD x.xx`, then the names joined by commas (the text band shortens long lines with an ellipsis); the caption carries the full name list, so nothing is lost. Names are free text from the organiser, not PayNow numbers, so the existing rule against numbers in captions still holds.
7. **Sending:** QRs go out one after another after the single `/claim`. If one send throws, the handler stops, says how many went out and how many did not, and tells the user to send `/split` again; the state is already wiped by the claim, so a retry starts a fresh split. Telegram allows about 20 messages a minute in a group, and the cap of 20 people is chosen to sit at that limit.
8. **State:** the context holds `mode`, `people` (array, for custom) and `leftover` (`even|omit`). Total size is tiny (20 names).
9. **Equal flow regression:** the only visible change is the extra Equally/Custom question before the people question. That is a deliberate cost; skipping it would need a guess about intent.

10. **`/split_custom` shortcut:** `start(ctx, mode?)` stores `mode: 'custom'` in the context when called from `/split_custom` and asks for the total as usual; once the total is accepted the handler checks the stored mode and moves to the list step instead of the Equally / Custom question. `bot.command('split_custom', ...)` is added next to `split` in `src/split-bot.ts`; the group owner stamp and force-reply prompts apply as for `/split`. Telegram command names allow underscores, so no special handling is needed. The mode question also stores its answer in the same field, so the rest of the flow does not care how custom was reached. No `/split_equal` is added; `/split` already starts the equal path in one tap.

## Risks / Trade-offs

- [Typing a list is clumsy on a phone] → one example in the prompt, per-line error messages, and the list can be pasted whole; item and weight splits are left for later.
- [Many QRs flood the chat] → one per distinct amount, cap of 20 people, stop and report on a failed send.
- [Names in captions can be forwarded] → they are the organiser's own labels; no numbers are shown.
- [An extra tap for everyone using the equal flow] → accepted; one button.

## Migration Plan

None: no data, no configuration. A conversation in progress during the deploy may find its step numbers shifted; it expires after 10 minutes and the user restarts with `/split`.
