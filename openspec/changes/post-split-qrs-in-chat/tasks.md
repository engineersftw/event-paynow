## 1. Description earlier, with a receipt default

- [x] 1.1 In `src/commands/split-handler.ts` move the description check in `nextNeed` to straight after the total check (before the mode, the people, the list, HOW, ASSIGN and CLAIM), keeping `described` as the flag; check the receipt, `/split_custom` and group-claim orders
- [x] 1.2 Make the DESCRIPTION prompt name the receipt default when there is one, and make Skip (and an empty answer) store the merchant cut to `MAX_DESCRIPTION` with `truncateAnsi` for receipt splits, or nothing otherwise; a typed description always wins
- [x] 1.3 Make `deliverEarly` and `finish` use `c.description` only (no `receipt.merchant`); check Amend Description and an edited description message still work
- [x] 1.4 Tests: description comes right after the total in `/split`, `/split_custom` and `/split_receipt` (before HOW/ASSIGN/CLAIM); receipt default on Skip; typed description wins; no default without a merchant or without a receipt

## 2. Remove the payee question

- [x] 2.1 Remove the `PAYEE_ME` step, its prompt, the `split_payee:*` callback branch, every `payeeIsMe` read and write (including the reset when the payee changes), and the group-claim refusal for an organiser who is the payee
- [x] 2.2 Reword the summary: equal split "Each share: SGD x (everyone pays this)", the organiser's line "Your own share: SGD x (you get a QR)" for receipt and custom splits, leftover wording without the payee branches; keep the "shared by N people" count and the over-the-total line
- [x] 2.3 Update the assignment prompt (`me` is you, and your share also gets a QR) and `SPLIT_HELP`; stop writing `SPLIT_PAYEE_OTHER`
- [x] 2.4 Tests: no payee-question step in any command, Amend payee and edited payee do not ask it, summary wording for equal, receipt and custom splits

## 3. Every QR in the chat

- [x] 3.1 Rewrite `finish`: one list of payers (every entry not already served, plus the organiser's first name with their own amount when above zero), grouped by amount with `groupByAmount`, one chat photo per group with description, amount and names; keep the "Already sent their QR" note and the partial-failure message; delete `deliverMentioned`, the `mentioned` and `ownJob` branches and `isMentioned`
- [x] 3.2 Rewrite `deliverEarly` to post the member's QR in the chat with their name and the description, keeping the rollback of `served` on failure and dropping the start-link result; answer the tap with a short "posted below" note
- [x] 3.3 Stop creating waiting claims (`createClaim`, `postWaiting`, `newToken` call sites); leave `collectClaim`, `/start claim_<token>`, `findContacts`, `/forget` and the tables for claims created earlier, and note the follow-up removal
- [x] 3.4 Tests: rewrite the tests that assert direct messages, waiting messages, start links or Get my QR buttons; add: mentions, claimers and the organiser all get chat QRs and nobody gets a `sendPhoto`; an equal amount of the organiser and another person is one merged QR; early QR in the chat with the description and name; failed early QR rolls back; private chat gets everything

## 4. Text, docs and checks

- [x] 4.1 Update the landing page text in `src/web/page.ts` (and its tests), the README Split section, AGENTS.md and docs/architecture.md for the new order and chat-only QRs
- [x] 4.2 Run `npm run build`, `npm run check` and `npm test`; fix anything they report
- [ ] 4.3 After deploy, run one real group split with a receipt (skip the description, let two people claim, take one QR early, confirm) and check: the description defaults to the merchant, every QR is in the chat with names, no direct messages, no payee question
