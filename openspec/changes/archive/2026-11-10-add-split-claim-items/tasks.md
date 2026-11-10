## 1. Conversation state support

- [x] 1.1 In `src/worker/conversation-do.ts` add optional `rev` (incremented on every write) and `idleMs` to the state schema, let `POST /state` take `ifRev` (409 on mismatch, no write), and make the alarm and its scheduling use `state.idleMs ?? 10 minutes`
- [x] 1.2 Extend the DO tests: `ifRev` accepted, `ifRev` stale gives 409 and writes nothing, `idleMs` of one hour survives the ten-minute mark and expires after the hour

## 2. Claim logic

- [x] 2.1 In `src/commands/receipt.ts` add `assignmentFromClaims(items, claims, claimers, organiserId, unclaimed)` returning the same `Assignment` the typed parser returns (claimers with `userId` and `username`, the organiser as `isMe`, unclaimed items given to `me` or to everyone who claimed), plus the display-name rules for duplicate names
- [x] 2.2 Extend `test/node/receipt.test.ts`: shared items, organiser claims, unclaimed to me, unclaimed shared, duplicate first names, 20-person limit helper, and amounts equal to the typed assignment for the same claims

## 3. Handler

- [x] 3.1 In `split-handler.ts` add steps HOW (16) and CLAIM (17) and the `assignHow` rule in `nextNeed` (private chats choose type automatically); ask HOW with `split_how:type|claim`; the Use this branch (which now deletes the review) continues to it
- [x] 3.2 Post the claim message (items with claimers, one button per item, Done) and handle `split_claim:<i>` from any member: toggle with an `ifRev` write and bounded retries, 20-person limit, callback answers, message edits that ignore "not modified" and rate-limit errors
- [x] 3.3 Handle `split_claim_done` (organiser only, others get a notice, refused until someone else has claimed), the existing `UNASSIGNED` prompt (claim wording and a Keep claiming button) with its choices, then build the assignment, set `entries` and `leftover: 'omit'`, close the claim message and continue to the payee question
- [x] 3.4 Write `idleMs` (one hour for HOW, CLAIM and a claim-originated UNASSIGNED, ten minutes otherwise) in the handler's state writes, and make stale claim buttons answer "That step is over."
- [x] 3.5 Amend → Items asks HOW again; reposting claim mode keeps the earlier claims and retires the old message's buttons

## 4. Tests and docs

- [x] 4.1 Extend `test/workers/split-bot.test.ts` with group updates from several users: choice offered in a group and not in private, claim, un-claim, shared item, simultaneous taps all kept, Done with everything claimed, unclaimed covered by me, unclaimed shared, keep claiming, the organiser's own claimed share collected when someone else is the payee, nobody else claimed, a member tapping Done, 21st claimer, claimers receiving DMs or a Get my QR button, stale buttons, and Amend → Items reopening claims
- [x] 4.2 Review `edited_message` and `/forget`/`/stats` paths for any step-number assumptions, then update README (group claiming, the one-hour limit, anonymous admins), `SPLIT_HELP`, `AGENTS.md` and `docs/architecture.md`
- [x] 4.3 Run `npm run build`, `npm run check` and `npm test`; fix anything they report
