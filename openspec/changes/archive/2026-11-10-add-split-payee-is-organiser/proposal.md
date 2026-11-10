## Why

Split_PayNow_Bot assumes the person running the split is also the one being paid. After a receipt scan the organiser's own items are shown as "your own share, not collected" and no QR is made for them. That is wrong whenever somebody else paid the bill and the organiser also owes their share: the organiser has nothing to scan. The same assumption sits in the custom split ("the organiser covers the leftover") and the equal split ("everyone else pays you this").

## What Changes

- After the payee is entered, the bot asks **"Is this payee you?"** with **Yes, it's me** and **No, someone else** buttons, in every split type (equal, custom and receipt). The answer is stored with the split and asked again whenever the payee is changed.
- **Yes** keeps today's behaviour exactly: the organiser is the one being paid, their own amount is shown but not collected.
- **No** means the organiser pays too:
  - **Receipt and custom splits:** the organiser's own amount (their `me` items and any unassigned items they cover, or the custom leftover that was left out) is collected like everyone else's. The organiser gets their own QR for it, by direct message from the bot, or through a **Get my QR** button if the bot cannot message them yet. A QR is only made when that amount is above zero.
  - **Equal split:** all people pay the payee, and the summary says so ("everyone pays this") instead of "everyone else pays you". The single shared QR already serves the organiser, so no extra QR is sent.
- The summary wording follows the answer: "Your own share, not collected" becomes "Your own share, which you pay the payee (you get a QR)", and the custom leftover line says it is yours to pay.
- Amend → Payee asks for the payee and then the question again.

Out of scope: remembering the answer between splits, letting a different person than the payee be named as the one who paid, splitting the organiser's QR into a separate message in groups, and `/stats`.

## Capabilities

### New Capabilities

(none)

### Modified Capabilities
- `bill-split-bot`: a payee-is-you question in every flow; the organiser's own share is collected, with their own QR, when the payee is someone else; wording that no longer assumes the organiser is paid.

## Impact

- Changed: `src/commands/split-handler.ts` (new step `PAYEE_ME`, `nextNeed`, summary wording, adding the organiser's own share to the QR delivery), tests.
- No database change, no new dependency or configuration. Uses the existing direct-message and waiting-QR code for the organiser's QR.
- Cost: one more tap in every split. Existing tests that go from the payee to the description gain that tap.
- Docs: README (Split_PayNow_Bot paragraphs), `AGENTS.md`, `docs/architecture.md`.
- The planned `add-split-claim-items` change builds on this: its organiser, who may also claim items, is collected the same way when the payee is someone else.
