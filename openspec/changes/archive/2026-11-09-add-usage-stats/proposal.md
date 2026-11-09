# Proposal

## Why

The owner has no view of how the bots are used: how many events are created, how many QR codes are made, whether anyone completes a payment or checks in. Most of that is already in the database (every event, payment request, payback and check-in has a timestamp), but nothing reads it. Simple_PayNow_Bot stores nothing by design, so its use is invisible, and the owner specifically wants to know whether people skip the amount and whether they let the payer change it.

## What Changes

- **`/stats` in Telegram, for authorized users only.** In a private chat, any user whose Telegram id is on a configured list (a comma-separated secret, `STATS_USER_IDS`) sends `/stats` to Event PayNow Bot and gets a short report; anyone else gets no reply. The command is not listed in `/help` or the BotFather command list.
- **The report reads existing data** (no new tracking for the event bot): events (total, open, closed, created in the last 7 and 30 days, and how many different Telegram chats have made one), payment requests/QR codes (total, last 7 and 30 days, by status, and how many came from the public payment page without sign-in), total received SGD, check-ins, and paybacks (total, sent).
- **Simple_PayNow_Bot gets anonymous daily counters**: a tiny table `usage_counters (day, metric, count)` records, each time a QR is sent, one count for `simple_qr` and one of `simple_amount_skipped`, `simple_amount_fixed` or `simple_amount_editable`. No payee, amount, description, user or chat id is stored. The `/stats` report shows these totals and shares (for example "amount skipped 40%, fixed 35%, payer can change 25%").
- The simple bot's "Nothing is stored" requirement is reworded to: nothing about a person or payment is stored, only anonymous daily counts.
- Counting is best effort: if the counter write fails, the QR is still sent.
- Additive migration `0008` (new table only).
- Docs: how to set the list of authorized ids and find a Telegram id, what the report shows, and pointers for the numbers this change does not cover (landing page visits via Cloudflare Web Analytics, video views in YouTube Studio).

Out of scope: a web dashboard, charts, per-user or per-chat breakdowns, counting funnel drop-off (started or cancelled conversations), counting the description choice, alerts, exporting data.

## Capabilities

### New Capabilities

- `usage-stats`: the `/stats` report for authorized users and the anonymous daily usage counters.

### Modified Capabilities

- `simple-paynow-bot`: it records anonymous daily counts of QRs made and of its amount choices, instead of recording nothing.

## Impact

- New: migration `drizzle/0008_usage_counters.sql`, `src/db/usage-repository.ts`, `src/commands/stats-handler.ts`; changed: `src/db/schema.ts`, `src/bot.ts` (the hidden `/stats` command), `src/simple-bot.ts` and `src/commands/simple-handler.ts` (count after the QR is sent), `src/env.ts` (`STATS_USER_IDS`), the test schema harness, tests, README, AGENTS.md, `docs/architecture.md`.
- Worker deploy plus a migration (additive; the migrate job runs first). One new secret, `STATS_USER_IDS` (a comma-separated list of Telegram user ids).
- The simple bot now reads and writes D1, for the counters only.
