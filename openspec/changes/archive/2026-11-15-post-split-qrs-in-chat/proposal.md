## Why

Three things in the Split bot's flow cause trouble in practice.

- Every QR that is sent by direct message depends on the bot knowing who a person is and being allowed to message them. When that fails (a person never started the bot, or the bot has not learnt their id yet), the QR is not delivered, or a Get my QR button has to be tapped later. In a real group split all the QRs ended up with the organiser, and direct-message QRs carry no payer name.
- The description is the last question, so a QR taken early with Get my QR cannot carry it (it only uses the receipt's merchant name).
- "Is the payee you?" is an extra question that only changes wording and whether the organiser gets a QR for their own share.

## What Changes

- **Description earlier.** The description is asked as soon as the bill total is known (after a typed total, or after the receipt scan is accepted), before the split type, the list, the assignment or the claiming. Every QR, including Get my QR, then carries it.
- **Receipt default.** When the split comes from a receipt and the user skips the description, it becomes the merchant name read from the receipt (cut to 25 characters). A typed description always wins.
- **No payee question.** The "Is this payee you?" step is removed everywhere (`/split`, `/split_custom`, `/split_receipt`, Amend, edits). The organiser always gets a QR for their own share, whether or not they are the payee. Equal-split wording becomes "everyone, the organiser included, pays this".
- **All QRs in the chat.** Every payer's QR (plain names, @mentions, member-list mentions, claimers, the organiser, and Get my QR) is posted in the chat where the split is confirmed, one QR per distinct amount, with the payer names on the image and caption. Nothing is sent by direct message any more, and no Get my QR waiting button is created. The organiser's own QR is merged into the same grouping under their first name.
- Updated: `/help`, the Split landing page text, README, AGENTS.md, docs/architecture.md.

Out of scope: dropping the `split_contacts` and `split_claims` tables, `/forget` and `/start claim_<token>` (waiting QRs created before this change stay collectable until they expire; removing the rest is a follow-up); changing how amounts are rounded; new stats counters.

## Capabilities

### New Capabilities

(none)

### Modified Capabilities

- `bill-split-bot`: description order and receipt default, no payee question, organiser always gets a QR, every QR posted in the chat, Get my QR posted in the chat.
- `split-landing-page`: the page text no longer says QRs are sent by direct message, and shows the new order of a split.

## Impact

- `src/commands/split-handler.ts`: `nextNeed`, the DESCRIPTION step, removal of `PAYEE_ME` and `payeeIsMe`, the summary wording, `finish`, `deliverEarly`, removal of `deliverMentioned` and the waiting-claim creation.
- `src/commands/split-claim.ts`, `src/db/split-repository.ts`: no new claims are created; `collectClaim`, `findContacts` and the tables stay for now.
- `src/web/page.ts` (landing text), `SPLIT_HELP`, README, AGENTS.md, docs/architecture.md.
- Tests: many in `test/workers/split-bot.test.ts`, `test/node/split-*.test.ts` and `test/node/web-page.test.ts` pin the payee question and the direct messages; they are rewritten for the new flow.
- Behaviour change for conversations in progress at deploy: a split waiting on the old payee question ignores that button and is cleared by the 10-minute idle expiry or `/cancel`.
- The chat can receive more QR messages (one per distinct amount plus one per early QR), and every member of a group can see every QR and amount.
