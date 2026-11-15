## Context

`SplitCommandHandler` (`src/commands/split-handler.ts`) derives the next question from the conversation context in `nextNeed`: payee, then `PAYEE_ME`, then the total (or the receipt photo), then the mode and its details, then the description, then the summary. `finish` posts one QR per distinct amount for people the bot cannot identify, sends mentioned people and claimers a direct message (`deliverMentioned`, with a waiting `split_claims` row and a Get my QR button on failure), and sends the organiser's own QR by direct message when `payeeIsMe === false`. `deliverEarly` sends an early QR by direct message or a start link and takes its description from `receipt.merchant`. See proposal.md for the motivation.

## Goals / Non-Goals

**Goals:**
- One delivery path: every QR is a photo posted in the chat of the split.
- The description is settled before anything that can produce a QR, so all QRs agree.
- Fewer questions: no payee question; the organiser's share is handled like anyone's.

**Non-Goals:**
- Removing the contact and waiting-claim tables, `/forget` and `/start claim_<token>` (still needed for claims created before the deploy; remove in a follow-up once they have expired).
- Changing rounding, the claim flow, or who may answer in a group.

## Decisions

**Description right after the total.** In `nextNeed` the description check moves from the end to straight after the total check. For `/split_receipt` the total is set when the user accepts the scan (Use this), so the question follows the review and comes before HOW, ASSIGN and CLAIM. Alternative: ask before the scan. Rejected: the receipt's merchant is only known after the scan, and the default needs it.

**The default is applied at the answer, not at display.** On Skip, and on an empty answer, `description` becomes the merchant cut with `truncateAnsi` to `MAX_DESCRIPTION` (as `deliverEarly` already did) when the context holds a receipt with a merchant; otherwise it stays unset. The prompt names the default ("or tap Skip to use "Huevos""). A typed description is stored as is. `described` stays the flag that the question is done, so Amend, edited messages and the summary behave as before. Only the merchant is used; date and total are not (25 characters is the QR limit, and the merchant is the part people recognise).

**Remove `PAYEE_ME` completely.** The step constant, the `payeeIsMe` reads, the `split_payee:*` callback branch and its prompt go. A stale `split_payee:*` tap falls into the generic "not expected now" reply, as any stale button does. The organiser is always one of the people paying: in an equal split they are already one of the N; in a custom or receipt split their own amount is `own` (receipt) or the left-out remainder (custom, mode `omit`). Wording that said "not collected" or "you pay the payee" is dropped; the organiser's line reads "Your own share: SGD x (you get a QR)". If the organiser is the payee they can ignore their QR; asking was never needed to make that safe.

**One QR path, grouped by amount.** `finish` builds one list of payers: every entry not already served (`sent`), plus the organiser as an entry named by their first name when their own amount is above zero (custom with `leftover: 'omit'`, or receipt `own`). It groups by amount with `groupByAmount` and posts one photo per group with `lines = [description?, amount, names]` and the same caption as chat QRs today. Mention and claimer identities (`username`, `userId`) are no longer read at send time; they remain only so a claimer's early QR can be matched and shown. `deliverMentioned`, the `mentioned`/`ownJob` branches and the `createClaim` call are deleted. Alternative: keep the organiser's QR by direct message. Rejected: it keeps the "does the bot know this person" dependency this change removes (decided with the user).

**Early QR posted in the chat.** `deliverEarly` renders the QR with `[description?, amount, name]` and posts it with `ctx.replyWithPhoto` in the claim chat; the description is `c.description`, not the merchant. On failure the existing rollback of `served` stays and the tap answer says to try again; the start-link result type is removed.

**Old claims keep working.** `collectClaim` and the `/start claim_<token>` handler are untouched so a waiting QR created before the deploy can still be collected for 48 hours. Nothing creates new ones. `SPLIT_QR_DM` and `SPLIT_CLAIM_COLLECTED` keep counting those; `SPLIT_PAYEE_OTHER` is no longer written (the stats read stays, so history shows).

**Tests follow the flow.** Fake-stub tests that assert direct messages, waiting messages, start links or the payee buttons are rewritten to assert chat photos and the new order. A test per rule: order of questions in all three commands, receipt default and typed override, claim flow with the description before HOW, early QR in the chat with the description and name, organiser's QR merged into an equal amount, no `sendPhoto` to any user id.

## Risks / Trade-offs

- **Privacy.** Every group member sees every QR and amount. Chat QRs already showed names and amounts for plain-name payers; this extends it to everyone. The payee number is still never shown. Accepted by the request.
- **Chat noise.** One message per distinct amount, plus one per early QR. Mitigated by grouping equal amounts.
- **Organiser who is the payee gets a pointless QR.** Harmless, and they ignore it; the alternative is the removed question.
- **Conversations in progress at deploy.** One waiting on the payee question ignores its button; the 10-minute expiry or `/cancel` clears it.
- **Amend description after QRs were taken early.** Early QRs already sent keep the earlier description; the spec says QRs sent afterwards carry the new one.
- **Private chat.** All QRs go to the private chat, as before for plain names.
