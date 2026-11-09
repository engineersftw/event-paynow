# Tasks

## 1. Data

- [x] 1.1 Add the `usage_counters` table to `src/db/schema.ts`, generate migration `0008_usage_counters` with `npm run db:generate -- --name usage_counters` (additive only), and add the table to the test schema in `test/workers/harness.ts`
- [x] 1.2 `src/db/usage-repository.ts`: `UsageCounter` interface with `increment(metric, day)` (single upsert `count = count + 1`) and `D1UsageRepository.snapshot(nowIso)` returning the event, payment, check-in, payback and simple-bot figures (totals, last 7 and 30 days, by status, anonymous payments, total received cents, distinct chats, amount-choice counts), computed with aggregate SQL in one batch

## 2. Simple_PayNow_Bot counting

- [x] 2.1 In `SimpleCommandHandler.finish()` count after the photo was sent: `simple_qr` plus exactly one of `simple_amount_skipped`, `simple_amount_fixed`, `simple_amount_editable`, by Singapore day, inside a swallowing try/catch; inject the counter through the constructor and build the D1 one in `createSimpleBot`

## 3. The /stats command

- [x] 3.1 `src/commands/stats-handler.ts`: format the snapshot as a short plain-text report (events, payment requests by status and window, public-page requests, SGD received, check-ins, paybacks, simple-bot QRs with the skipped / fixed / payer-can-change shares, or "no use yet")
- [x] 3.2 Wire the hidden `/stats` in `src/bot.ts`: private chat and an id on the list only, otherwise silent; add `STATS_USER_IDS?: string` to `src/env.ts` and a pure `parseUserIds()` (comma-separated, trimmed, whole numbers only); do not add the command to `HELP_TEXT`

## 4. Tests

- [x] 4.1 Workers test for `snapshot` with seeded events, payments (pending, received, voided, anonymous, checked in) and paybacks, including the 7 and 30 day windows and the no-personal-data property of the report text
- [x] 4.2 Workers tests for the simple bot counters: skipped, fixed and editable each count correctly, a cancelled or abandoned conversation counts nothing, a throwing counter still sends the QR, and the counter rows hold only day, metric and count
- [x] 4.3 Tests for `/stats` access: `parseUserIds` (spaces, junk entries, empty and missing values); a listed user in a private chat gets the report, a second listed user too; a user not on the list, a group and a missing or empty list get no reply

## 5. Docs and verification

- [x] 5.1 Update `README.md` (what `/stats` shows, `wrangler secret put STATS_USER_IDS` (comma-separated Telegram ids) and how to find a Telegram id, the simple bot's anonymous counts, and pointers to Cloudflare Web Analytics and YouTube Studio), `AGENTS.md` (the simple bot now writes anonymous counters; the new `STATS_USER_IDS` secret and its format) and `docs/architecture.md`
- [x] 5.2 Run `npm run check`, `npm run build`, the full test suite and `openspec validate --specs`
