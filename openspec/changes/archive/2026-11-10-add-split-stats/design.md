## Context

Event PayNow Bot's `/stats` is a hidden command: it checks `ctx.chat.type === 'private'` and the sender's id against `parseUserIds(env.STATS_USER_IDS)`, and replies with a text built by `formatStats` from `D1UsageRepository.snapshot()`. Simple_PayNow_Bot is counted with `usage_counters(day, metric, count)` through `UsageCounter.increment`, best effort. Split_PayNow_Bot counts nothing today, so its figures can only be gathered going forward, except two live numbers that already sit in tables (`split_contacts`, `split_claims`).

## Goals / Non-Goals

**Goals:** the same ACL; a split-only report; anonymous daily counters; no new secret, migration or dependency.

**Non-Goals:** merging the split figures into Event bot's report, per-user or per-chat breakdowns, retroactive history.

## Decisions

1. **ACL reused, not re-implemented.** The Split bot registers `bot.command('stats', …)` with the same three checks (private chat, sender known, id in `parseUserIds(env.STATS_USER_IDS)`) and no reply otherwise. The Split bot is the same Worker, so `STATS_USER_IDS` is already in its `env`. The command is not added to `SPLIT_HELP` or the BotFather list.
2. **Metric names** (all in `usage_counters`, lowercase, prefixed `split_`): `split_confirmed`, `split_type_equal`, `split_type_custom`, `split_type_receipt`, `split_place_private`, `split_place_group`, `split_payee_other`, `split_qr_chat`, `split_qr_dm`, `split_scan_ok`, `split_scan_failed`, `split_claim_created`, `split_claim_collected`. Exported as constants from `usage-repository.ts` next to the Simple ones, so tests and the report share the names.
3. **Where counts are made** (each wrapped so an error is swallowed, like `SimpleCommandHandler.count`):
   - at Confirm, after the DO claim succeeds: `split_confirmed`, the type (`receipt` when a receipt is in use, `custom` when the split has a list, else `equal`), the place (private or group by `ctx.chat.type`), and `split_payee_other` when `payeeIsMe === false`;
   - each chat QR photo sent: `split_qr_chat`; each direct message sent: `split_qr_dm` (including the organiser's own QR);
   - a receipt scan that reaches the review message: `split_scan_ok`; any failure (download, model, reply, unusable receipt): `split_scan_failed`;
   - a waiting QR row created: `split_claim_created`; one collected: `split_claim_collected`.
   The handler and `collectClaim` receive the `UsageCounter` the way `SimpleCommandHandler` does (optional, so tests without one still work).
4. **Snapshot:** `D1UsageRepository.splitSnapshot(now)` returns the counter totals with last-7 and last-30 windows (same Singapore-day windows as Simple) plus two live numbers read from tables: `COUNT(*)` of `split_contacts` and of `split_claims` whose `expires_at` is in the future. One batch of two statements, like `snapshot()`.
5. **Report text** (`src/commands/split-stats-handler.ts`, `formatSplitStats(snapshot, now)`): a header with the time, then `Split_PayNow_Bot`, splits confirmed (total, 7, 30), by type with percentages, by place, someone else paid, QRs (chat, direct message), receipt scans (read, failed, success rate), waiting QRs (created, collected, waiting now), people remembered. With no confirmed splits and no scans it says "No splits counted yet." and still shows the live numbers. A line says counting started when the feature shipped.
6. **Privacy:** only counts leave the database. Contact and claim tables contribute a number, never a row. The report is plain text with no names.
7. **Tests:** the workers tests must set `STATS_USER_IDS` explicitly (`{ ...env, STATS_USER_IDS: '…' }`), including for the "no list" case, because a developer's `.dev.vars` may define it.

## Risks / Trade-offs

- [No history before this ships] → the report states that counting started now.
- [Counting adds writes to D1 per split] → a handful of upserts per confirmed split, best effort; negligible next to the QR work.
- [Metric names are a contract with the report] → shared constants.
- [Waiting-QR numbers count expiry only by time, not by deletion events] → "waiting now" reads the live table; created and collected come from counters, so they need not add up (expired ones are the difference).

## Migration Plan

No schema change; the counters table exists. Deploy, then send `/stats` to Split_PayNow_Bot from an authorized account. Early numbers will be small because counting starts at deploy.
