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
npm test               # Run all vitest tests (both pools)
npx vitest run --project node      # Node-pool tests only
npx vitest run --project workers   # Workers-pool tests only
npm run dev            # wrangler dev (local Worker)
npm run deploy         # wrangler deploy (production)
npm run db:generate    # drizzle-kit generate (create SQL migrations)
```

## Testing Strategy

Two vitest pools configured via `vitest.workspace.ts`:

1. **Node pool** (`test/node/`) — Runtime-agnostic core: SGQR TLV/CRC16, amount parsing, proxy validation, QR rendering with jsQR round-trip verification.
2. **Workers pool** (`test/workers/`) — Worker-runtime integration: D1 repository layer, Durable Object conversation FSM, webhook secret validation, concurrent payback serialization.

See `docs/testing.md` for update-fixture replay and live dev bot setup.

## OpenSpec Workflow

This project uses OpenSpec for change management. The current active change is `add-paynow-qr-telegram-bot`.

**Workflow commands:**
- `/opsx-propose` — Create a new change with all planning artifacts
- `/opsx-apply` — Implement tasks from a change
- `/opsx-archive` — Archive a completed change

**Artifacts location:** `openspec/changes/add-paynow-qr-telegram-bot/`
- `proposal.md` — What and why
- `specs/<capability>/spec.md` — Behavioral specifications
- `design.md` — Technical design decisions
- `tasks.md` — Implementation checklist

## Key Design Decisions

1. **SGQR payload builder is runtime-agnostic** — No Node APIs, runs in both vitest and Workers isolate. CRC16-CCITT-FALSE, uppercase hex, computed over payload + "6304".
2. **QR rendering uses BMP in Workers, PNG in Node** — `qrcode-generator` is pure JS (works in Workers), outputs BMP via custom builder. Node tests use `qrcode` + `pngjs` + `jsqr` for PNG round-trip verification.
3. **Conversation state lives in Durable Objects** — Per-chat DO holds FSM state, 10-min alarm expiry, survives cold starts and deploys.
4. **Drizzle ORM over D1** — Schema in `src/db/schema.ts`, migrations in `drizzle/`, repository layer abstracts queries behind infra-neutral interfaces.
5. **Secret validation before bot creation** — Webhook handler validates `X-Telegram-Bot-Api-Secret-Token` before instantiating grammY bot to avoid "Empty token" errors in tests.

## Conventions

- **Strict TypeScript** — `strict: true`, `noUncheckedIndexedAccess`, `exactOptionalPropertyTypes`
- **ESM modules** — `"type": "module"` in package.json
- **Integer cents for amounts** — Never floats. `parseAmount` / `formatCents` in `src/sgqr/amount.ts`.
- **Proxy validation is format-only** — Mobile: `+65XXXXXXXX` (6/8/9 prefix). UEN: 9–13 alphanumeric.
- **Infra-neutral interfaces** — Service layer depends on repository interfaces, not Drizzle types.
- **No Node APIs in core** — `src/sgqr/` must run in Workers isolate.

## Blocked Tasks

Task 1.3 (D1 provisioning + BotFather setup) requires Cloudflare authentication:
- `wrangler login` or `CLOUDFLARE_API_TOKEN` env var
- BotFather command registration via Telegram

## What's Working

- All SGQR payload generation (CRC16, TLV, PayNow templates, amount handling)
- QR rendering (BMP in Workers, PNG round-trip verified in Node)
- Webhook secret validation
- Project scaffolding (wrangler, vitest 2-pool, TypeScript)
- Database schema with Drizzle ORM (users, payments, paybacks tables with CHECK constraints)
- Repository layer with infra-neutral interfaces (D1Repository implementation, 21 passing tests)
- Proxy validation and normalization (mobile → +65XXXXXXXX, UEN validation)
- 10-char base32 reference generator using crypto.getRandomValues
- Payment service with markPaymentReceived transition logic (routes through `updatePaymentStatus`)
- Conversation Durable Object with FSM state, 10-min alarm expiry, eviction survival
- /init command handler with mobile/UEN validation, confirmation flow, and user persistence
- Reference update on re-run: /init replaces stored value, cancel/alarm expiry preserves existing data
- /payments listing with inline buttons (View / Mark as Received / Payback) and payment detail view
- /payback 4-step conversation (payer proxy → confirm → amount → confirm) recording paybacks
- Payback bounds: `createPaybackBounded()` enforces `SUM(active paybacks) <= payment.amount_cents`
  inside one D1 batch via a compare-and-set guarded `INSERT ... SELECT` (task 7.2)
- /start payment issuance: guard requiring /init first, description + amount collection with
  validation, payment row with payee snapshot, SGQR payload + isolate-rendered BMP QR uploaded
  via sendPhoto (tasks 5.1, 5.2, 5.4 done; 5.3 stage (a) verified e2e in Workers pool)
- `ChatSessionDO` binding serves the real conversation FSM (`src/index.ts` re-exports
  `ConversationDO` from `src/worker/conversation-do.ts`)

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

## Payback Bounds (task 7.2)

`D1Repository.createPaybackBounded()` runs a single `d1.batch([...])` transaction:
1. Guarded insert — `INSERT INTO paybacks ... SELECT ... WHERE (SUM active) + amount <= payment.amount`
   (materializes only if the in-transaction re-check holds; fail-closed for missing payments)
2. Totals read — payment amount + active sum inside the same transaction
3. Row read-back by ref

Returns `{ ok, payback, remainingCents }` or `{ ok: false, reason: 'over_bound' | 'payment_not_found', ... }`.
"Active" = status `pending`, matching `sumActivePaybacks()` semantics. The handler pre-checks the bound
for UX; the transaction re-check is authoritative. Per-chat DO serialization covers same-chat writes;
this CAS guard closes cross-chat races (design §5). Tests: `test/workers/payback-bounds.test.ts`
(11 tests, spec scenarios 5+3 of 12.50 → remaining 4.50, blocked-over, concurrent races via `Promise.all`).

## Repository Layer

The repository layer provides infra-neutral interfaces for database operations:

**Key files:**
- `src/db/types.ts` — Plain TypeScript types (User, Payment, Payback, etc.)
- `src/db/repository.ts` — Repository interface definition
- `src/db/drizzle-repository.ts` — D1Repository implementation using Drizzle ORM

**Operations:**
- Users: upsertUser, getUser
- Payments: createPayment, getPaymentByRef, listPaymentsByUser, updatePaymentStatus
- Paybacks: createPayback, createPaybackBounded (transactional bound enforcement), listPaybacksByPayment, sumActivePaybacks

**Testing:**
- 21 tests in `test/workers/repository.test.ts` cover all operations
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

- Task 5.3 stage (b): live `cloudflared` dev-bot check that the photo arrives in Telegram
  (blocked on task 1.3, Cloudflare auth)
- Task 7.3: payback QR generation + sendPhoto (replaces the `PAYBACK-PENDING:<ref>` placeholder payload)
- Task 7.4: "Mark payback as sent" button and payback history in payment detail
- Task 1.3: Cloudflare auth setup (blocked)
- Task 8.0 (implicit): wire command handlers into `src/bot.ts` (currently only ping/echo stubs)
- Tasks 8.1-8.3: Integration testing, scan validation, deploy pipeline
