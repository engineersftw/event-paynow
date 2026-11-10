# AGENTS.md

This file describes the project structure, conventions, and development workflow for AI agents working on this codebase.

## Project Overview

**event-paynow** — A Telegram bot on Cloudflare Workers that generates SGQR PayNow QR codes for collecting payments, tracks receipts, and supports paybacks.

**Stack:**

- TypeScript on Cloudflare Workers (webhook transport)
- grammY (Telegram Bot framework)
- D1 (serverless SQLite) for persistence
- Durable Objects for per-chat conversation state
- Drizzle ORM for database access
- Pure-JS QR rendering (qrcode-generator + custom BMP builder)

## Architecture

See `docs/architecture.md` for full details. Key components:

- `src/worker.ts` — Fetch handler, routing
- `src/bot.ts` — grammY bot factory, webhook handler
- `scripts/explainer/` — `npm run video` renders the explainer video into the gitignored `out/explainer/` (scenes page + `captions.json`; frames piped to ffmpeg; Playwright + ffmpeg required, run by hand, never in CI; the CC0 music slice is described in `music.json`, fetched into `out/` and mixed in, `--silent` skips it)
- `src/commands/stats-handler.ts` + `src/db/usage-repository.ts` — the hidden `/stats` command (private chats, Telegram ids listed in the `STATS_USER_IDS` secret; silent for everyone else) and its read-only usage queries
- `src/simple-bot.ts` + `src/commands/simple-handler.ts` — Simple_PayNow_Bot (QR-only; stores no payee, amount, description or identity, only anonymous daily counts in `usage_counters` via `src/db/usage-repository.ts`), `POST /webhook/simple` with `SIMPLE_BOT_TOKEN` / `SIMPLE_WEBHOOK_SECRET` (secrets) and `SIMPLE_BOT_USERNAME` (var); its DO key is `simple-<id>`, flow `simple`; private chats only; ends in a Confirm / Cancel summary before the QR; the route is 404 until configured
- `src/split-bot.ts` + `src/commands/split-handler.ts` + `src/commands/split-math.ts` — Split_PayNow_Bot (equal split with a QR for one share rounded up to the cent, or custom amounts per person with leftover handling and one QR per distinct amount; commands `/split` and `/split_custom`; stores nothing; every answer goes into the DO context and `nextNeed` decides what is still missing, so the first run, the summary's Amend button and edited answer messages (`edited_message:text`, found through the recorded `answerMsgs`) share the same rules; only the latest summary message can be confirmed), `POST /webhook/split` with `SPLIT_BOT_TOKEN` / `SPLIT_WEBHOOK_SECRET` (secrets) and `SPLIT_BOT_USERNAME` (var); DO key `split-<id>`, flow `split`; private chats and groups (group: owner-only answers via the DO owner stamp, force-reply prompts so privacy mode can stay on, member-count button, payee masked and its message deleted if allowed); the route is 404 until configured
- `src/sgqr/` — SGQR payload builder (TLV + CRC16, runtime-agnostic)
- `src/db/schema.ts` — Drizzle table definitions
- `src/db/repository.ts` — Repository layer (Drizzle queries)
- `src/index.ts` — Worker entry + ChatSessionDO export
- `test/node/` — Node-pool vitest tests (runtime-agnostic core)
- `test/workers/` — Workers-pool vitest tests (D1, DO, integration)

## Development Commands

```bash
npm run build          # TypeScript type-check (tsc --noEmit)
npm run lint           # Biome lint (no writes)
npm run format         # Biome format --write
npm run check          # Biome lint + format + import-organize verification
npm run check:fix      # Biome check --write (safe autofixes; add --unsafe manually if needed)
npm test               # Run all vitest tests (both pools)
npx vitest run --project node      # Node-pool tests only
npx vitest run --project workers   # Workers-pool tests only
npm run dev            # wrangler dev (local Worker)
npm run deploy         # wrangler deploy (production)
npm run web:dev        # Pages dev server for the web admin page (web/)
npm run web:deploy     # Pages deploy (normally done by GitHub Actions from main)
npm run db:generate    # drizzle-kit generate (create SQL migrations)
```

## Testing Strategy

Two vitest pools configured via `vitest.config.ts` projects:

1. **Node pool** (`test/node/`) — Runtime-agnostic core: SGQR TLV/CRC16, amount parsing, proxy validation, QR rendering with jsQR round-trip verification.
2. **Workers pool** (`test/workers/`) — Worker-runtime integration: D1 repository layer, Durable Object conversation FSM, webhook secret validation, concurrent payback serialization.

See `docs/testing.md` for update-fixture replay and live dev bot setup.

## OpenSpec Workflow

This project uses OpenSpec for change management. All changes are archived:

1. `add-paynow-qr-telegram-bot` (29 tasks) — archived 2026-11-07
2. `add-event-management` (22 tasks) — archived 2026-11-07
3. `add-payer-details-to-start` (14 tasks) — archived 2026-11-07
4. `add-payback-confirm-and-cancel` (12 tasks) — archived 2026-11-08
5. `show-payer-name-in-messages` (11 tasks) — archived 2026-11-08
6. `add-start-confirmation-step` (9 tasks) — archived 2026-11-08
7. `add-void-payment-request` (13 tasks) — archived 2026-11-08
8. `add-qr-image-payment-details` (6 tasks) — archived 2026-11-08
9. `add-web-admin-event-view` (7 tasks) — archived 2026-11-08
10. `payments-net-of-paybacks` (8 tasks) — archived 2026-11-08
11. `admin-payment-actions` (16 tasks) — archived 2026-11-08
12. `web-payment-requests` (7 tasks) — archived 2026-11-08
13. `redesign-web-admin-ui` (12 tasks) — archived 2026-11-08
14. `web-admin-polish` (11 tasks) — archived 2026-11-08
15. `web-admin-list-controls` (11 tasks) — archived 2026-11-08
16. `qr-bot-logo-and-font` (8 tasks) — archived 2026-11-08
17. `restore-paynow-qr-logo` (6 tasks) — archived 2026-11-08
18. `ignore-irrelevant-messages` (9 tasks) — archived 2026-11-08
19. `event-default-amount` (13 tasks) — archived 2026-11-08
20. `add-edit-event-command` (6 tasks) — archived 2026-11-08
21. `payer-page-history-and-dm` (8 tasks) — archived 2026-11-08
22. `optional-payer-sign-in` (7 tasks) — archived 2026-11-09
23. `web-signed-in-user` (7 tasks) — archived 2026-11-09
24. `attendee-check-in` (14 tasks) — archived 2026-11-09
25. `row-check-in` (5 tasks) — archived 2026-11-09
26. `add-landing-page` (6 tasks) — archived 2026-11-09
27. `add-simple-paynow-bot` (9 tasks) — archived 2026-11-09
28. `add-simple-bot-confirmation` (5 tasks) — archived 2026-11-09
29. `add-explainer-video` (7 tasks) — archived 2026-11-09
30. `add-explainer-soundtrack` (7 tasks) — archived 2026-11-09
31. `add-landing-video` (5 tasks) — archived 2026-11-09
32. `add-site-footer` (5 tasks) — archived 2026-11-09
33. `add-usage-stats` (10 tasks) — archived 2026-11-09
34. `squash-migrations` (8 tasks) — archived 2026-11-09
35. `add-social-previews` (8 tasks) — archived 2026-11-10
36. `add-event-website-link` (12 tasks) — archived 2026-11-10
37. `add-bill-split-bot` (11 tasks) — archived 2026-11-10
38. `add-uneven-bill-split` (11 tasks) — archived 2026-11-10
39. `add-split-amend` (12 tasks) — in progress

**Workflow commands:**

- `/opsx-propose` — Create a new change with all planning artifacts
- `/opsx-apply` — Implement tasks from a change
- `/opsx-archive` — Archive a completed change

**Artifacts location:** `openspec/changes/archive/<date>-<change-name>/`

- `proposal.md` — What and why
- `specs/<capability>/spec.md` — Behavioral specifications
- `design.md` — Technical design decisions
- `tasks.md` — Implementation checklist

**Main specs:** `openspec/specs/<capability>/spec.md` (18 capabilities)

## Key Design Decisions

1. **SGQR payload builder is runtime-agnostic** — No Node APIs, runs in both vitest and Workers isolate. CRC16-CCITT-FALSE, uppercase hex, computed over payload + "6304".
2. **QR rendering uses BMP in Workers, PNG in Node** — `qrcode-generator` is pure JS (works in Workers), outputs BMP via custom builder. Node tests use `qrcode` + `pngjs` + `jsqr` for PNG round-trip verification. QR codes overlay the PayNow logo (1-bit mask in `src/sgqr/paynow-logo.ts`, generated by `scripts/generate-paynow-logo.mjs`) in the center using error correction level H (30% recovery). `renderQrPng(payload, lines)` also appends a text band below the QR (anti-aliased DejaVu Sans glyph atlas in `src/sgqr/font-atlas.ts`, laid out by `text-band.ts`; non-ASCII → `?`, long lines shortened with an ellipsis by measured width). The atlas is generated by `scripts/generate-font.py` and committed; the web admin page uses the bot logo (`web/public/logo.png`), not the QR carrying the payment/payback details; names only, never PayNow numbers.
3. **Conversation state lives in Durable Objects** — Per-chat DO holds FSM state, 10-min alarm expiry, survives cold starts and deploys. The `alarm()` lifecycle method is required by workerd (not a fetch route).
4. **Drizzle ORM over D1** — Schema in `src/db/schema.ts`, migrations in `drizzle/`, repository layer abstracts queries behind infra-neutral interfaces. The migration history is squashed into one baseline, `drizzle/0000_initial_schema.sql` (the schema of the original migrations 0000 to 0008, verified identical): **never rename it**, because the live D1 database recorded that file name as applied and would try to run a renamed file again; new migrations start at `0001`. The status CHECK constraints (`events`, `payments`, `paybacks`) live only in the SQL, not in `schema.ts`, so `drizzle-kit generate` does not know them and any table rebuild must be hand-written with its CHECKs.
5. **Secret validation before bot creation** — Webhook handler validates `X-Telegram-Bot-Api-Secret-Token` against the separate `TELEGRAM_WEBHOOK_SECRET` binding before instantiating grammY bot.
6. **Inline-button UX pattern** — Confirm/cancel steps use `InlineKeyboard` with callback data instead of text input. Outcomes update the original message in place via `editMessageText` (no extra chat bubbles). Payment QR photos carry ✓ Received / ✖ Void (no Payback — paybacks need a received payment); payback QR photos carry ✓ Sent / ✖ Cancel. Received, Void, Sent and Cancel replace the photo with a text status line.
7. **Payback bounds count pending + sent** — `SUM(paybacks)` excluding `cancelled`, inside a single D1 batch via compare-and-set guarded INSERT. Cancelling a pending payback releases its amount.
8. **Biome for lint + format** — Single quotes, 2-space indent, 100-col line width, semicolons, es5 trailing commas.
9. **npm audit: 0 vulnerabilities** — zod 4.6.7, drizzle-orm 0.45.4, vitest 5.1, wrangler 4.159, drizzle-kit 0.31, eslint 10; overrides force minimatch ≥11 and esbuild ≥0.25.
10. **D1 binding: `paynow_db`** — renamed from `DB`; `migrations_dir = "drizzle"` in wrangler.toml.
11. **GitHub Actions CI** — Two jobs (checks + tests) on PRs and main pushes; branch protection on main (2 required checks, linear history, enforce admins).
12. **Deploys run from GitHub Actions on main** — `.github/workflows/deploy.yml` diffs the push and deploys the Worker (`src/` except `src/web/`, `wrangler.toml`, `package*.json`, `tsconfig.json`) and/or Pages (`web/`, `src/{web,db,sgqr,payments,access}/`, `src/commands/payer-label.ts`, `package*.json`, `tsconfig.json` — everything the Pages Function bundles; when the Function starts importing a new `src/` folder, add it to the filter) only when their files changed; run it manually to deploy both. Needs repo secrets `CLOUDFLARE_API_TOKEN` + `CLOUDFLARE_ACCOUNT_ID`. A `migrate` job runs `wrangler d1 migrations apply paynow-db --remote` when `drizzle/` changed, before the Worker and Pages deploys (they are skipped if it fails), so migrations must be backward compatible. `npm run deploy` / `web:deploy` remain for manual use from main.

## Conventions

- **Biome for lint + format** — single quotes, 2-space indent, 100-col line width,
  semicolons, es5 trailing commas; `style/noNonNullAssertion` off (the `ctx.chat!` /
  `calls[0]!` pattern is deliberate under strict + `noUncheckedIndexedAccess`);
  `noExplicitAny` off in `test/**` (mock casts). Run `npm run check` before committing.
- **Keep README.md current** — update it in the same change when something significant changes: bot commands or user-facing features, setup/deploy steps, environment variables or secrets, workflows (CI/deploy), or the project structure. Also refresh the `/help` text, the BotFather command list and the specs count it mentions.
- **Strict TypeScript** — `strict: true`, `noUncheckedIndexedAccess`, `exactOptionalPropertyTypes`
- **ESM modules** — `"type": "module"` in package.json
- **Integer cents for amounts** — Never floats. `parseAmount` / `formatCents` in `src/sgqr/amount.ts`.
- **Proxy validation is format-only** — Mobile: `+65XXXXXXXX` (6/8/9 prefix). UEN: 9–13 alphanumeric.
- **Infra-neutral interfaces** — Service layer depends on repository interfaces, not Drizzle types.
- **No Node APIs in core** — `src/sgqr/` must run in Workers isolate.
- **Names in messages** — captions and the text lines that replace photos carry the payer name only (`Payer: <name>` / `To: <name>`, segment omitted when unknown) and never a PayNow number, because they get forwarded; owner-facing messages show `Name (proxy)`. A payback recipient has a name only if its proxy equals the payment's stored payer (`recipientName()` in `src/commands/payer-label.ts`). Use `payerLabel` (Markdown-escaped) only with `parse_mode: 'Markdown'`, `plainPayerLabel` otherwise.

## Blocked Tasks

(none — task 1.3 completed: D1 provisioned, BotFather commands registered, live webhook set, all 29 tasks done)

## What's Working

- All SGQR payload generation (CRC16, TLV, PayNow templates, amount handling)
- QR rendering (BMP in Workers, PNG round-trip verified in Node) with PayNow logo overlay and anti-aliased detail text
- Webhook secret validation (separate `TELEGRAM_WEBHOOK_SECRET` binding)
- Project scaffolding (wrangler 4, vitest 5, Biome, TypeScript)
- Database schema with Drizzle ORM (users, payments, paybacks tables with CHECK constraints)
- Repository layer with infra-neutral interfaces (D1Repository, 38 passing tests)
- Proxy validation and normalization (mobile → +65XXXXXXXX, UEN validation)
- 10-char base32 reference generator using crypto.getRandomValues
- Payment service with markPaymentReceived transition logic
- Conversation Durable Object with FSM state, 10-min alarm expiry, eviction survival; the state records its `owner` (user + topic), stamped by `POST /owner` right after a flow command or the Payback button and dropped when the flow ends; `GET /peek` is a read-only view
- public `alarm()` lifecycle method (workerd requirement, not a fetch route)
- /init command with mobile/UEN validation, inline Confirm/Cancel buttons, in-place message updates, creates events
- /start payment issuance with event picker, required payer PayNow proxy + optional payer name (snapshotted on the payment; the name — never the number — appears in the shareable QR caption), amount, then a Confirm/Cancel summary (event, payer, pay-to, amount) — nothing is persisted or rendered until Confirm, which takes the conversation via the DO's atomic `POST /claim {flow, step}` (200 = winner, 409 = loser) so double taps create one payment; payee snapshot, SGQR payload + BMP QR uploaded via sendPhoto
- Payment QR photo carries ✓ Received / ✖ Void; Void is a pending-only compare-and-set (`voidPayment`), refused when the payment is received, already voided or has paybacks. `voided` payments stay as history (🚫), can't be marked received or paid back, and are excluded from event payment counts/totals. Received is also a pending-only CAS, so Received vs Void taps have one winner. Migration 0004 rebuilt `payments` to widen the status CHECK. The Payback button (list/stale messages) is refused unless the payment is received, and `/payments` shows it only for received payments
- mark_received replaces QR photo with text summary (deleteMessage + reply)
- /payments listing with pagination (5 per page), inline buttons, payment detail view
- /payback 4-step conversation with inline buttons at payer and amount confirmation steps; a payment with a stored payer proposes it (Confirm / Change recipient — a changed recipient applies to that payback only), legacy payments without one prompt for the payer. `/payback <ref>` and the QR Payback button share `PaybackCommandHandler.beginFlow`
- /edit_event command (chat admins; flow `edit`): pick event → field → value, saved at once via the open-only `updateEvent`, replies with every final value; existing payments keep their own snapshot
- /end_event command: close event with CAS, summary of payments collected/pending
- Events scoped by (chat_id, topic_id) for chat+topic isolation
- Payback bounds: `createPaybackBounded()` enforces `SUM(paybacks) <= payment.amount_cents`
  (all statuses — pending and sent) inside one D1 batch via a compare-and-set guarded
  `INSERT ... SELECT`
- Payback QR: real SGQR payload encoding the PAYER as payee proxy, delivered via sendPhoto
- Payback QR photo carries ✓ Sent / ✖ Cancel; Sent or Cancel replaces the photo with a text status line (same UX as ✓ Received); also available per payback in the payment detail view (re-render in place)
- Mark payback sent / cancel: guarded pending-only CAS transitions, duplicate and racing taps handled; `cancelled` status (added originally by a table rebuild, now part of the baseline)
- `src/bot.ts` wires all commands (/init, /start, /payments, /payback <ref>, /cancel, /help, /ping),
  inline-button callbacks (init_*, payments:N, payback_*, view/mark_received/payback/pb_sent),
  and free-text conversation routing; bot cached per isolate. Free text is answered only when the chat has an active conversation owned by the sender in the same topic; everything else (ordinary chatter, other members, other topics) is ignored silently, and `/cancel` only acts on your own conversation
- `ChatSessionDO` binding serves the real conversation FSM
- GitHub Actions CI: type-check + lint/format + both vitest pools on PRs and main pushes
- Branch protection on `main` (2 required checks, linear history, enforce admins)
- D1 provisioned on Cloudflare with migrations applied
- Live webhook at `https://event-paynow.mcheng-work.workers.dev/webhook`
- All 29 tasks in `add-paynow-qr-telegram-bot` complete

## Workers e2e Bot Harness (task 5.3 stage a)

`test/workers/start-flow.test.ts` drives real grammY updates through `bot.handleUpdate` with
real D1 + real CHAT_SESSION DO. Non-obvious requirements discovered (keep in mind for 8.1):

1. **Stub fetch via `client: { fetch }`** in the `Bot` constructor — grammY's web bundle resolves
   `fetch` at import time, so patching `globalThis.fetch` later has no effect.
2. **Pass `botInfo`** in Bot config to skip the `getMe` bootstrap (the stub never serves it).
3. **`bot.command()` only matches updates carrying a `bot_command` MessageEntity** — synthetic
   test updates must include `entities: [{ type: 'bot_command', offset: 0, length }]`.
4. **File uploads use `attach://` indirection**: grammY hand-rolls a multipart byte stream where
   the `photo` part contains `attach://<token>` and the actual bytes arrive as a separate stream
   part named `<token>`; capture by parsing the `ReadableStream` body.
5. **Drain DO responses**: handler POSTs to a DO stub must consume or cancel the response body
   (`await response?.body?.cancel()`), otherwise vitest-pool-workers' stacked-storage isolation
   fails when popping DO snapshots ("Expected .sqlite, got …sqlite-shm").

## Payback Bounds (tasks 7.2 + 7.4)

`D1Repository.createPaybackBounded()` runs a single `d1.batch([...])` transaction:

1. Guarded insert — `INSERT INTO paybacks ... SELECT ... WHERE (SUM paybacks) + amount <= payment.amount`
   (materializes only if the in-transaction re-check holds; fail-closed for missing payments)
2. Totals read — payment amount + paid-back sum inside the same transaction
3. Row read-back by ref

Returns `{ ok, payback, remainingCents }` or `{ ok: false, reason: 'over_bound' | 'payment_not_found', ..., paidBackCents }`.
The bound counts **pending + sent** paybacks: marking a payback sent never frees room for another
(decision 2026-11: "include sent in the bound"), but **cancelling** a pending payback does
(`status != 'cancelled'` in `sumPaybacks()` and the guard/totals SQL). `updatePaybackStatus` is a
pending-only compare-and-set for both `sent` and `cancelled`, so Sent vs Cancel taps have one winner. The handler pre-checks the bound
for UX; the transaction re-check is authoritative. Per-chat DO serialization covers same-chat writes;
this CAS guard closes cross-chat races (design §5). Tests: `test/workers/payback-bounds.test.ts`
(spec scenarios 5+3 of 12.50 → remaining 4.50, blocked-over, concurrent races via `Promise.all`,
sent-still-counts regression).

## Repository Layer

The repository layer provides infra-neutral interfaces for database operations:

**Key files:**

- `src/db/types.ts` — Plain TypeScript types (User, Payment, Payback, etc.)
- `src/db/repository.ts` — Repository interface definition
- `src/db/drizzle-repository.ts` — D1Repository implementation using Drizzle ORM

**Operations:**

- Users: upsertUser, getUser
- Payments: createPayment, getPaymentByRef, listPaymentsByUser, updatePaymentStatus
- Paybacks: createPayback, createPaybackBounded (transactional bound enforcement), getPaybackByRef, updatePaybackStatus (guarded pending→sent CAS, task 7.4), listPaybacksByPayment, sumPaybacks (pending + sent — the bounded quantity; cancelled excluded)

**Testing:**

- 27 tests in `test/workers/repository.test.ts` cover all operations (incl. payback transitions + duplicate-tap race)
- 11 tests in `test/workers/payback-bounds.test.ts` cover bounded payback creation incl. concurrency
- Tests verify cross-user isolation, read-back-after-write consistency, and status transitions
- Tests run in Workers pool with real D1 bindings

## Chat admin access and audit

`src/commands/payment-access.ts`: `createPaymentAccess(events, isChatAdmin)` decides whether a user may act on a
payment (view, received, void, payback, sent, cancel) — the owner always (no network call), otherwise an
administrator/owner of the payment's event chat via live `getChatMember` (`src/access/chat-admin.ts`, shared with
the web page); no event → owner only; a failed check denies. `createBot` injects it into `PaymentCallbackHandler` and
`PaybackCommandHandler` (default `ownerOnly`, which is what unit tests use) and the admin check into
`PaymentsCommandHandler`, where admins see every payment of the event in the drill-down. The acting user id
(`ctx.from.id`) is passed to `updatePaymentStatus`, `voidPayment`, `updatePaybackStatus` and `createdBy` of
paybacks, and stored in the same guarded statement (audit columns, part of the baseline), so a lost race records nobody.
Tests that tap buttons from a group chat stub `globalThis.fetch` for `getChatMember` (grammY uses the injected client).

## Web Admin (Cloudflare Pages)

Attendee check-in (`payments.checked_in_at` / `checked_in_by`): `POST /api/events/:ref/scan` takes `{ payload }` (decoded QR text; must equal the payment's stored `qr_payload`, whose reference `paymentReferenceFromPayload` reads from tag 26.05) or `{ ref }` (typed), admin-only, and returns the payment view from `paymentViews()` (also used by the list; names only); `POST .../payments/:paymentRef/check-in` is the guarded one-time write (`checkInPayment`, 409 `already_checked_in` with the first time, 409 `voided`; allowed on closed events). Payment rows that are not voided or checked in also carry a one-tap **Check-In** button (`rowCheckIn`, using the same `checkInRequest` as the scan dialog; the list always reloads afterwards, and any error text is set after the reload because `show()` clears the message line). The top-bar Check-In button opens the scan dialog in `src/web/page.ts`, which decodes with `BarcodeDetector` or the vendored `web/public/vendor/jsqr.js` (excluded from the Pages catch-all in `web/public/_routes.json`). `KEEP_QR_REMINDER` (`src/payments/payment-request.ts`) is in every payment QR caption and beside the QR on the payer page.

The payer page `/pay/<event-ref>` (same top bar and light/dark toggle as the admin page; no sign-in needed: `payerAccess` treats a missing/invalid session as anonymous, `userId` null, and only an unknown event is refused; `GET /api/pay/:ref` returns `signedIn`; `GET|POST /api/pay/:ref/payments`, `GET .../payments/:paymentRef/qr`) shows a fixed default amount as plain text (the server still ignores any submitted amount), creates owner-`0` payments for anonymous visitors (capped at 30 per event per 10 minutes via `countRecentAnonymousPayments`, then 429 `rate_limited`; signed-in users exempt) and returns the QR inline as `payment.qr` (PNG data URL). For signed-in users only it lists their own requests for the event (`listPaymentsByUserAndEvent`, newest first, max 50, no PayNow numbers; history and `GET .../payments/:paymentRef/qr` need a session) and, after creating one, sends them a private `sendPhoto` copy via `sendPaymentDm` in `src/web/telegram.ts` (no buttons; best-effort, `dm: false` in the response when Telegram refuses, e.g. the user never started the bot). It never posts to the event chat.

`/web_admin` (`src/commands/web-admin-handler.ts`) sends url buttons to `${WEB_ADMIN_URL}/events/<ref>`.
The landing page and the payment pages carry Open Graph / Twitter card tags in their server-rendered head (`socialMeta()` in `src/web/page.ts`; URLs from the request origin; the image is the committed `web/public/explainer-poster.jpg`, excluded from the Function in `_routes.json`; the payment page's event name is looked up in `handleWeb`, escaped, and falls back to generic wording; the admin page has none). Every web page (landing, event admin, payer) ends with the shared attribution footer (`FOOTER_HTML`, links in `LINKEDIN_URL` / `REPO_URL`, `src/web/page.ts`).
The site root `/` is a public landing page (`renderLandingPage` in `src/web/page.ts`, linking to `https://t.me/${BOT_USERNAME}`, with a click-to-play YouTube explainer card (`videoCard`, id in `EXPLAINER_VIDEO_ID`; the player is loaded from `youtube-nocookie.com` only on click); no static `index.html`).
The Pages project in `web/` has one catch-all Function (`web/functions/[[path]].ts`) delegating to
`handleWeb()` in `src/web/handler.ts` (testable without Pages): `GET /events/:ref` (HTML shell from `src/web/page.ts`: shadcn-style CSS tokens, compact payment cards, a native `<dialog>` for new requests, paybacks and pending QR/actions behind tap-to-expand buttons so no QR loads with the page; a top bar (`TOPBAR_HTML`, shared with the payer page) with the signed-in name, Sign out and the light/dark toggle (`data-theme`, saved in `localStorage` under one key for both pages; the toggle stays when signed out), then the logo (`web/public/logo.png`) with `Event: <name>`, then one row of Check-In, Pay and New request buttons (mobile layout checked down to 320 px), status-coloured pills and `dd-MMM-YYYY` dates; data
written with `textContent`), `GET /api/events/:ref?status=&q=&limit=&cursor=` (JSON; pages of 20 via `searchPaymentsByEvent` with a `created_at|id` keyset cursor and `nextCursor`, literal case-insensitive search on payer name or reference, status filter, event-wide totals from `getEventStats`; the page has a search box, status buttons and "Load more", and refreshes the rows already loaded after an action), `GET /api/login` (Telegram Login Widget
redirect target; HMAC check in `src/web/auth.ts`, then a 12 h signed HttpOnly `session` cookie plus a display-only `tg_name` cookie holding the Telegram name, never used for access). `GET /api/me` returns `{ user: { name } | null }` and same-origin `POST /api/logout` clears both cookies; both pages show the name with a Sign out button (`ME_HTML`/`ME_JS` in `src/web/page.ts`), also on the admin page's 403. Sessions are stateless, so sign out does not revoke a copied cookie. Access =
signed-in user is chat admin/creator via live `getChatMember` (`src/web/access.ts`), or the private-chat
owner; any failure denies. The API returns payer names only, never PayNow numbers, and voided
payments are listed but excluded from totals. Admins can also pay received payments back from the page:
`POST /api/events/:ref/payments/:paymentRef/paybacks` (via the shared `createPaybackFor` in
`src/db/payback-service.ts`, same validation and transactional bound as the bot), `GET .../paybacks/:ref/qr`
(PNG from `bmpToPng` in `src/sgqr/png.ts`; Telegram keeps the BMP) and `POST .../paybacks/:ref/sent|cancel`
(pending-only CAS). Every POST must be same-origin JSON, then session → event → live admin check; the actor id
is recorded in the audit columns (`payments.received_by` / `voided_by` / `checked_in_by`, `paybacks.created_by` / `sent_by` /
`cancelled_by`, written in the same guarded UPDATE so a lost race records nobody). Payment requests are created
with `POST /api/events/:ref/payments` (shared `createPaymentRequest` / `paymentCaption` / `paymentImageLines` in
`src/payments/payment-request.ts`, also used by `/start`; open events only; the signed-in admin owns the payment),
the QR comes from `GET .../payments/:ref/qr` and is also posted to the event's chat by `postPaymentQr`
(`src/web/telegram.ts`, direct `sendPhoto` with the bot token, `posted: false` on failure — the payment is kept),
and pending payments are settled with `POST .../payments/:ref/received|void` (pending-only CAS, so web and
Telegram taps have one winner; the chat message keeps stale buttons, which the bot already answers).
Type-checked by `tsc -p web` (part of `npm run build`).
Pages secrets: `TELEGRAM_BOT_TOKEN`, `SESSION_SECRET`; the Login Widget needs BotFather `/setdomain`.

## Command Handlers

### /init Command

**Key files:**

- `src/commands/init-handler.ts` — /init command implementation
- `test/node/init-handler.test.ts` — 13 tests covering all flows

**Flow:**

1. User sends /init
2. Step 1: event name (≤ 50 chars)
3. Step 2: payee mobile number or UEN (mobile → +65XXXXXXXX, UEN format check)
4. Step 3: optional default amount to collect (`parseAmount`, or a Skip button `init_skip_amount:<userId>`); stored as `events.default_amount_cents`, offered by `/start` ("Use SGD x.xx", `start_use_default`) and pre-filled in the web admin dialog; typing another amount always works
5. Step 4: optional event website (typed address or a Skip button `init_skip_website:<userId>`); `normalizeWebsiteUrl()` in `src/commands/website-url.ts` accepts only http/https addresses (host with a dot, no credentials or spaces, at most 200 characters, `https://` added when missing) and the stored form is the parsed URL; stored as `events.website_url` and shown as "Event website: <host>" under the title on the admin and payment pages (the link is rebuilt client-side only for http/https values, `rel="noopener noreferrer nofollow"`); the success message escapes it for Markdown
6. Step 5: echoes name + payee (+ amount, website) with Confirm/Cancel buttons (the Confirm/Cancel step guards check step 5; `bot.ts` routes `init_skip_website:` taps to the handler)
7. On "confirm", creates the `events` row; on "cancel", resets state without saving
8. On conversation expiry (alarm), state resets

**Testing:**

- Mobile number validation and normalization
- UEN validation
- Invalid input rejection with re-prompt
- Confirmation before save
- Cancel operation (preserves existing user data)
- Database error handling
- Reference update on re-run (existing user gets updated)
- Cancel after new input preserves previous stored value
- Conversation expiry preserves existing user data
- 13 tests passing

## What's Next

- Automated payment notification webhook (bank-side transaction correlation)
- Multi-currency support, payment expiry, export history, admin dashboard
