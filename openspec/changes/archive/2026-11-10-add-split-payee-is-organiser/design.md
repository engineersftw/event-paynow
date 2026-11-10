## Context

The bot's flows all end the same way: the organiser's own money is never moved. Receipt splits drop the `me` amount (`toEntries` skips `isMe`), custom splits leave the remainder with the organiser (`leftover: 'omit'`), and the equal summary says "everyone else pays you this". Those are right only if the payee is the organiser. The delivery code already knows how to send a QR to a person with a Telegram id (`deliverMentioned`: direct message, else a Get my QR claim), so the new work is the question, the organiser's amount, and wording.

## Goals / Non-Goals

**Goals:** ask once per split; collect the organiser's own amount with a real QR when someone else is paid; correct wording in all three flows; no behaviour change when the answer is Yes.

**Non-Goals:** remembering the answer, naming who paid, changing the QR image layout.

## Decisions

1. **New step `PAYEE_ME`** (after `PAYEE`, before `DESCRIPTION`) with `split_payee:me|other`. `nextNeed` returns it when a payee exists and `payeeIsMe` is undefined. Changing the payee (a typed answer, an edit or Amend → Payee) clears `payeeIsMe`, so the question is asked again for the new payee. The callback sets `payeeIsMe` and calls `proceed`.
2. **The organiser's own amount** is `applyLeftover(entries, total, 'omit').leftoverCents` when `leftover === 'omit'`. For a receipt this equals the `me` shares (the receipt always uses `omit`), and for a custom list it is the left-out remainder. It is not collected when `payeeIsMe` is true. When `payeeIsMe` is false and the amount is above zero, `finish` adds one entry `{ name: first name, cents: own, userId: ctx.from.id }` to the people who get a QR. When the leftover was split evenly there is nothing left over, so nothing is added.
3. **Delivery reuses the mentioned-person path.** The organiser entry has a `userId`, so `deliverMentioned` sends a direct message to them; if that fails (the organiser has never started the bot, which is common in groups) a `split_claims` row with `userId` is created and the waiting message shows Get my QR, which `collectClaim` already checks against the tapper's id. The caption for the organiser's own QR says "Your share: SGD x. Scan with your banking app. Check the payee name before you pay." instead of "<organiser> asks you for …". When no directory is available (plain tests), the organiser's QR is added to the chat jobs labelled "Your share".
4. **Equal split needs no extra QR.** The one shared QR is already posted in the chat for all N people, the organiser included. Only the summary line changes: payee is the organiser → "everyone else pays you this"; otherwise "all N people pay the payee this".
5. **Summary wording:** receipt → "Your own share, not collected: X" (Yes) or "Your own share, which you pay the payee: X (you get a QR)" (No); custom leftover → "Leftover X left out: you cover it" (Yes) or "Leftover X is yours to pay: you get a QR" (No). Entries sent by direct message keep their "(by direct message)" mark; the organiser's own line is not listed among entries, only in the sentence above.
6. **Group behaviour:** the question is owner-only like every split button. The organiser's QR may therefore appear as a Get my QR button in the chat rather than a DM; that is stated in the summary sentence.
7. **Tests:** the many existing flows that go payee → description gain one tap, `split_payee:me`, to keep their old meaning; a helper keeps this to one line. New tests cover No in each flow.

## Risks / Trade-offs

- [One more tap in every split] → accepted by request; a default or memory can come later.
- [The organiser never started the bot and ignores the Get my QR button] → they get no QR, but the button is in the chat and the amount is in the summary.
- [Amend → Payee now asks two questions] → the second is one tap.
- [Equal split with someone else paid: the organiser relies on the shared QR] → the summary says everybody pays, so it is clear.

## Migration Plan

None: no data or configuration. A split in progress during the deploy has no `payeeIsMe`; at its next step the bot simply asks the question.
