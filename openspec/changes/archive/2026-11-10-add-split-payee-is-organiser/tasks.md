## 1. The question

- [x] 1.1 In `src/commands/split-handler.ts` add step `PAYEE_ME`, the `split_payee:me|other` buttons and callback, store `payeeIsMe`, clear it whenever the payee changes (typed, edited or amended), and make `nextNeed` ask it after the payee and before the description

## 2. The organiser's own share

- [x] 2.1 Compute the organiser's own amount (the left-out leftover; for a receipt, the `me` shares) and, when `payeeIsMe` is false and it is above zero, add the organiser as a person to receive a QR (`userId` from the sender) in `finish`
- [x] 2.2 Give the organiser's own QR its own caption ("Your share: …") and make `deliverMentioned` fall back to a Get my QR button when the direct message fails; without a directory, add it to the chat QRs labelled "Your share"
- [x] 2.3 Reword the summary for all three flows by the answer (receipt, custom leftover, equal "everyone else pays you" versus "all N people pay the payee")

## 3. Tests and docs

- [x] 3.1 Update the existing split tests for the new tap (one helper) so their old meaning is kept
- [x] 3.2 Add tests: the question appears after the payee and again after a payee change; receipt split with someone else paid sends the organiser a QR of the right amount; custom split with a left-out leftover; equal split wording both ways; Yes keeps the old behaviour with no organiser QR; zero own amount makes no QR; the organiser who never started the bot gets a Get my QR button and can collect; only the organiser answers in a group
- [x] 3.3 Update README, `SPLIT_HELP`, `AGENTS.md` and `docs/architecture.md`
- [x] 3.4 Run `npm run build`, `npm run check` and `npm test`; fix anything they report
