# Design

## Context

D1 already records, with timestamps: `events` (`created_at`, `chat_id`, `status`, `closed_at`), `payments` (`created_at`, `status`, `received_at`, `checked_in_at`, `user_id`, with `0` meaning an anonymous submission from the public payment page, `amount_cents`) and `paybacks` (`created_at`, `status`). So the event bot's usage can be reported with queries alone. Simple_PayNow_Bot keeps nothing and, until now, has no D1 access; its handler (`SimpleCommandHandler.finish`) knows the three facts the owner wants (amount given or skipped, payer may change it) at the moment the QR is sent. `events` has no creator id, only the chat, so "different organizers" is measured as different chats. There is no per-channel marker on payments, so Telegram, admin-web and public-page requests are only distinguishable as anonymous (`user_id = 0`) or not.

## Goals / Non-Goals

**Goals:** a quick view of usage from the phone for a short list of authorized users; reuse existing data; count the simple bot's choices without storing anything personal.

**Non-Goals:** a dashboard, charts, per-user or per-chat detail, funnel and drop-off metrics, description-choice counts, exports, alerts.

## Decisions

1. **`/stats` in Event PayNow Bot, hidden and restricted to a list of authorized users.** `bot.command('stats', ...)` checks `ctx.chat.type === 'private'` and that `ctx.from.id` is in the list parsed from `env.STATS_USER_IDS`; otherwise it returns without replying (no hint that the command exists). Not added to `HELP_TEXT` or the BotFather list. `STATS_USER_IDS` is a Worker secret (`wrangler secret put`) holding comma-separated Telegram user ids, optional in `Env`. A small pure function `parseUserIds(value)` splits on commas, trims, keeps only whole positive numbers and ignores the rest, so a missing, empty or malformed value means nobody is authorized. A secret rather than a `[vars]` entry keeps the ids out of the public repository.
2. **One read-only repository method** `D1UsageRepository.snapshot(nowIso)` in `src/db/usage-repository.ts` returning a plain object of numbers, built from a handful of aggregate SQL statements (COUNT with `CASE`/`WHERE created_at >= ?` for the 7- and 30-day windows, `SUM(amount_cents)` over `status = 'received'`, `COUNT(DISTINCT chat_id)`), run in one `d1.batch`. The time windows use ISO timestamps (UTC), as stored. The report text is formatted by `src/commands/stats-handler.ts` (pure formatter, unit tested).
3. **Counters table** `usage_counters (day TEXT NOT NULL, metric TEXT NOT NULL, count INTEGER NOT NULL DEFAULT 0, PRIMARY KEY (day, metric))`, migration `0008_usage_counters.sql` (additive; the deploy `migrate` job runs it before the Worker). `increment(metric, day)` is one `INSERT ... ON CONFLICT(day, metric) DO UPDATE SET count = count + 1`, so concurrent QRs cannot lose a count. Day is the Singapore date (`UTC+8`, `YYYY-MM-DD`), because that is where the audience is; the report states the windows are by Singapore day for the simple bot and by UTC timestamp for the event bot.
4. **Counting happens in `SimpleCommandHandler.finish()` only after the QR photo was sent successfully**, so cancelled, abandoned and failed conversations are not counted. It calls `increment` for `simple_qr` and for exactly one of `simple_amount_skipped` / `simple_amount_fixed` / `simple_amount_editable`, inside a `try/catch` that swallows the error without logging (no payee data is in scope, but nothing is logged anyway). The handler takes an optional `UsageCounter` (interface with `increment`), so unit tests inject a stub and a throwing stub; `createSimpleBot` builds the D1 implementation from `env.paynow_db`.
5. **The report shows the simple bot's shares** (skipped / fixed / payer can change) as whole-number percentages of `simple_qr`, with the 7- and 30-day totals from the day rows (`day >= date('now','+8 hours','-6 days')` style cutoffs computed in code and passed as parameters).
6. **Spec wording:** the simple bot's "Nothing is stored" requirement is modified, not dropped: it still forbids storing payees, amounts, descriptions, QR codes and identities, and allows only anonymous daily counts.
7. **Pointers, not code, for the rest:** landing page visits and referrers come from Cloudflare Web Analytics (a one-click toggle in the Pages project, no code and no cookies); video views and watch time come from YouTube Studio. The README lists both.
8. **Testing:** a workers test seeds events, payments (received, voided, anonymous, checked in) and paybacks and asserts every figure and window; formatter unit tests; the access rules (a listed user in a private chat, a second listed user, a user not on the list, a group, a missing or empty list, a list with junk entries) through the real grammY pipeline with the stubbed Telegram client; counter tests that run the simple bot flows and read `usage_counters` (skipped, fixed, editable, cancelled counts nothing, a throwing counter still sends the QR, and no row contains anything but day, metric, count).

## Risks / Trade-offs

- **The simple bot now touches D1.** Counts are anonymous, but the bot's promise changes from "writes nothing" to "writes only anonymous counts"; the spec and README say so.
- **A list of ids in a secret** is a light access control: anyone controlling an authorized Telegram account sees the report. Acceptable for aggregate numbers with no personal data. Adding or removing a person means updating the secret and redeploying the Worker (the new value is picked up on the next deploy).
- **"Distinct chats" is a stand-in for organizers**, because events do not store the creator.
- **Channel split is limited:** only the public payment page is separable (anonymous payments); Telegram versus admin-web requests cannot be told apart without a new column, which this change does not add.
- **Counts only start when this ships:** there is no history for the simple bot before the migration.
- **Best-effort counting** can undercount if D1 errors; the QR comes first by design.
