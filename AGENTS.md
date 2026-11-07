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

**Workflow commands:**

- `/opsx-propose` — Create a new change with all planning artifacts
- `/opsx-apply` — Implement tasks from a change
- `/opsx-archive` — Archive a completed change

**Artifacts location:** `openspec/changes/archive/<date>-<change-name>/`

- `proposal.md` — What and why
- `specs/<capability>/spec.md` — Behavioral specifications
- `design.md` — Technical design decisions
- `tasks.md` — Implementation checklist

**Main specs:** `openspec/specs/<capability>/spec.md` (6 capabilities)

## Key Design Decisions

1. **SGQR payload builder is runtime-agnostic** — No Node APIs, runs in both vitest and Workers isolate. CRC16-CCITT-FALSE, uppercase hex, computed over payload + "6304".
2. **QR rendering uses BMP in Workers, PNG in Node** — `qrcode-generator` is pure JS (works in Workers), outputs BMP via custom builder. Node tests use `qrcode` + `pngjs` + `jsqr` for PNG round-trip verification. QR codes overlay a PayNow logo in the center using error correction level H (30% recovery).
3. **Conversation state lives in Durable Objects** — Per-chat DO holds FSM state, 10-min alarm expiry, survives cold starts and deploys. The `alarm()` lifecycle method is required by workerd (not a fetch route).
4. **Drizzle ORM over D1** — Schema in `src/db/schema.ts`, migrations in `drizzle/`, repository layer abstracts queries behind infra-neutral interfaces.
5. **Secret validation before bot creation** — Webhook handler validates `X-Telegram-Bot-Api-Secret-Token` against the separate `TELEGRAM_WEBHOOK_SECRET` binding before instantiating grammY bot.
6. **Inline-button UX pattern** — Confirm/cancel steps use `InlineKeyboard` with callback data instead of text input. Outcomes update the original message in place via `editMessageText` (no extra chat bubbles). QR photos carry action buttons (✓ Received / Payback); marking received replaces the photo with a text summary.
7. **Payback bounds count all statuses** — `SUM(paybacks)` (pending + sent) inside a single D1 batch via compare-and-set guarded INSERT.
8. **Biome for lint + format** — Single quotes, 2-space indent, 100-col line width, semicolons, es5 trailing commas.
9. **npm audit: 0 vulnerabilities** — zod 4.6.7, drizzle-orm 0.45.4, vitest 5.1, wrangler 4.158, drizzle-kit 0.31, eslint 10; overrides force minimatch ≥11 and esbuild ≥0.25.
10. **D1 binding: `paynow_db`** — renamed from `DB`; `migrations_dir = "drizzle"` in wrangler.toml.
11. **GitHub Actions CI** — Two jobs (checks + tests) on PRs and main pushes; branch protection on main (2 required checks, linear history, enforce admins).

## Conventions

- **Biome for lint + format** — single quotes, 2-space indent, 100-col line width,
  semicolons, es5 trailing commas; `style/noNonNullAssertion` off (the `ctx.chat!` /
  `calls[0]!` pattern is deliberate under strict + `noUncheckedIndexedAccess`);
  `noExplicitAny` off in `test/**` (mock casts). Run `npm run check` before committing.
- **Strict TypeScript** — `strict: true`, `noUncheckedIndexedAccess`, `exactOptionalPropertyTypes`
- **ESM modules** — `"type": "module"` in package.json
- **Integer cents for amounts** — Never floats. `parseAmount` / `formatCents` in `src/sgqr/amount.ts`.
- **Proxy validation is format-only** — Mobile: `+65XXXXXXXX` (6/8/9 prefix). UEN: 9–13 alphanumeric.
- **Infra-neutral interfaces** — Service layer depends on repository interfaces, not Drizzle types.
- **No Node APIs in core** — `src/sgqr/` must run in Workers isolate.

## Blocked Tasks

(none — task 1.3 completed: D1 provisioned, BotFather commands registered, live webhook set, all 29 tasks done)

## What's Working

- All SGQR payload generation (CRC16, TLV, PayNow templates, amount handling)
- QR rendering (BMP in Workers, PNG round-trip verified in Node) with PayNow logo overlay
- Webhook secret validation (separate `TELEGRAM_WEBHOOK_SECRET` binding)
- Project scaffolding (wrangler 4, vitest 5, Biome, TypeScript)
- Database schema with Drizzle ORM (users, payments, paybacks tables with CHECK constraints)
- Repository layer with infra-neutral interfaces (D1Repository, 38 passing tests)
- Proxy validation and normalization (mobile → +65XXXXXXXX, UEN validation)
- 10-char base32 reference generator using crypto.getRandomValues
- Payment service with markPaymentReceived transition logic
- Conversation Durable Object with FSM state, 10-min alarm expiry, eviction survival
- public `alarm()` lifecycle method (workerd requirement, not a fetch route)
- /init command with mobile/UEN validation, inline Confirm/Cancel buttons, in-place message updates, creates events
- /start payment issuance with event picker, required payer PayNow proxy + optional payer name (snapshotted on the payment; kept out of the shareable QR caption), payee snapshot, SGQR payload + BMP QR uploaded via sendPhoto
- QR photo carries action buttons (✓ Received / Payback)
- mark_received replaces QR photo with text summary (deleteMessage + reply)
- /payments listing with pagination (5 per page), inline buttons, payment detail view
- /payback 4-step conversation with inline buttons at payer and amount confirmation steps; a payment with a stored payer proposes it (Confirm / Change recipient — a changed recipient applies to that payback only), legacy payments without one prompt for the payer. `/payback <ref>` and the QR Payback button share `PaybackCommandHandler.beginFlow`
- /end_event command: close event with CAS, summary of payments collected/pending
- Events scoped by (chat_id, topic_id) for chat+topic isolation
- Payback bounds: `createPaybackBounded()` enforces `SUM(paybacks) <= payment.amount_cents`
  (all statuses — pending and sent) inside one D1 batch via a compare-and-set guarded
  `INSERT ... SELECT`
- Payback QR: real SGQR payload encoding the PAYER as payee proxy, delivered via sendPhoto
- Mark payback as sent: guarded CAS transition, duplicate taps handled, history re-render
- `src/bot.ts` wires all commands (/init, /start, /payments, /payback <ref>, /cancel, /help, /ping),
  inline-button callbacks (init_*, payments:N, payback_*, view/mark_received/payback/pb_sent),
  and free-text conversation routing; bot cached per isolate
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
The bound counts **all** paybacks (pending + sent): `updatePaybackStatus` marks delivery only, so
marking a payback sent never frees room for another (decision 2026-11: "include sent in the bound";
`sumPaybacks()` has no status filter and the guard SQL matches). The handler pre-checks the bound
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
- Paybacks: createPayback, createPaybackBounded (transactional bound enforcement), getPaybackByRef, updatePaybackStatus (guarded pending→sent CAS, task 7.4), listPaybacksByPayment, sumPaybacks (all statuses — the bounded quantity)

**Testing:**

- 27 tests in `test/workers/repository.test.ts` cover all operations (incl. payback transitions + duplicate-tap race)
- 11 tests in `test/workers/payback-bounds.test.ts` cover bounded payback creation incl. concurrency
- Tests verify cross-user isolation, read-back-after-write consistency, and status transitions
- Tests run in Workers pool with real D1 bindings

## Command Handlers

### /init Command

**Key files:**

- `src/commands/init-handler.ts` — /init command implementation
- `test/node/init-handler.test.ts` — 13 tests covering all flows

**Flow:**

1. User sends /init
2. Bot prompts for mobile number or UEN
3. Validates input (mobile → +65XXXXXXXX, UEN format check)
4. Echoes normalized value for confirmation
5. On "confirm", persists to users table via repository (creates or updates)
6. On "cancel", resets state without saving (preserves existing data)
7. On conversation expiry (alarm), state resets but existing user data remains intact

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

- README quick-start (BotFather setup, secrets, deploy commands)
- Automated payment notification webhook (bank-side transaction correlation)
- Multi-currency support, payment expiry, export history, admin dashboard
