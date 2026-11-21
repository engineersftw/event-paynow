# Tasks

## 1. Commands and flow

- [x] 1.1 In `src/split-bot.ts` register `/split_even` (starting an even split) instead of `/split`, and make `/start` in a private chat reply with `SPLIT_HELP`; verify with `npm run build`
- [x] 1.2 In `src/commands/split-handler.ts` start with `mode: 'equal'` for `/split_even`, keep `mode: 'custom'` in the `split_scan:manual` fallback, remove the MODE step (prompt, `split_mode:` handler, its stale-step mapping) and send Amend → Split to PEOPLE or LIST by the current mode; verify with `npm run build`
- [x] 1.3 Replace "send /split" in every message (cancel, expired popup, `NO_SPLIT_OPEN`, `SPLIT_CLOSED`, QR captions and failure notices in `split-handler.ts` and `src/split-qr-queue.ts`, the receipt-unavailable reply) and rewrite `SPLIT_HELP` around `/split_even`, `/split_custom` and `/split_receipt`; verify with a search that no `/split` command text is left in `src/`

## 2. Tests

- [x] 2.1 Update `test/workers/split-bot.test.ts` (and any other suite the full run reports) from `/split` plus the `split_mode:` taps to `/split_even` or `/split_custom`
- [x] 2.2 New tests: `/split_even` goes from the description straight to the number of people; `/split` gets no reply and starts nothing; `/start` in a private chat replies with the help naming the three commands and starts nothing, and in a group says nothing; Amend → Split on an even split asks for people with no type buttons, and on a custom split asks for the list; the receipt "type the total instead" path reaches the custom list; an old `split_mode:equal` tap gets the stale answer; verify the suites pass

## 3. Docs and checks

- [x] 3.1 Update the Split landing page line in `src/web/page.ts` (and its test), README (commands, BotFather list, a note that `/split` was renamed), AGENTS.md and `docs/architecture.md`; verify with a search for `/split ` and "Equally"
- [x] 3.2 Run `npm run build`, `npm run check` and `npm test`; fix anything they report

## 4. Rollout

- [ ] 4.1 After deploy, update the Split bot's command list in BotFather (`split_even`, `split_custom`, `split_receipt`, `cancel`, `help`), then in a private chat: `/start` shows the help, `/split_even` goes from the description straight to the number of people and makes the QR, `/split` gets no reply; in a group run `/split_even` with the member-count button

## Workflow follow-up

- Archive the change after 4.1 is confirmed.
