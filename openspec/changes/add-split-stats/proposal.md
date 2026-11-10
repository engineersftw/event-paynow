## Why

Event PayNow Bot has a hidden `/stats` report so the owner can see how the bots are used. Split_PayNow_Bot has grown quickly (equal, custom and receipt splits, group chats, direct messages, claims, receipt scans) and now has no usage visibility at all: nothing is counted, and its own records (contacts, waiting QRs) are only visible in the database. The owner needs the same quick answer: is it used, how, and does the receipt scan work?

## What Changes

- Add a hidden **`/stats`** command to Split_PayNow_Bot with exactly the same access rule as the Event PayNow Bot: only Telegram user ids on the `STATS_USER_IDS` list, only in a private chat, no reply for anyone else, not in `/help` or the BotFather list, nothing when the list is empty. It uses the same list, so no new secret.
- The report shows **Split_PayNow_Bot** figures only (Event bot's `/stats` is unchanged):
  - splits confirmed: total, last 7 and 30 days; by type (equal, custom, receipt); by place (private chat, group); how many had someone else as the payee;
  - QR codes sent: to the chat and by direct message;
  - receipt scans: read successfully and failed, with the success rate;
  - waiting QRs: created, collected, and how many are waiting now;
  - people remembered for direct messages (a count only).
- To make those numbers possible, Split_PayNow_Bot **counts its use anonymously by day**, in the existing `usage_counters` table (a day, a metric name and a number). A count never holds a payee, amount, description, name, user id or chat id, and a failure to count never stops the bot. Counting starts when this ships: there is no history, which the report says.
- No personal data in the report: no names, usernames, PayNow numbers or amounts.

Out of scope: adding the split figures to Event PayNow Bot's report, per-chat or per-user breakdowns, charts, and exporting the numbers.

## Capabilities

### New Capabilities

(none)

### Modified Capabilities
- `usage-stats`: Split_PayNow_Bot answers `/stats` for the same authorized users, shows its own usage report, and counts its use anonymously by day.

## Impact

- New: `src/commands/split-stats-handler.ts` (report text), `D1UsageRepository.splitSnapshot()` and metric names in `src/db/usage-repository.ts`.
- Changed: `src/split-bot.ts` (the `stats` command), `src/commands/split-handler.ts` and `src/commands/split-claim.ts` (counting), tests.
- No migration (the `usage_counters` table exists), no new secret, no new dependency.
- Docs: README (stats paragraph), `AGENTS.md`, `docs/architecture.md`.
- Tests that rely on `STATS_USER_IDS` must set it explicitly, because a developer's local `.dev.vars` may define it.
