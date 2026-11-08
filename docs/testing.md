# Testing Strategy

Two vitest pools configured via `vitest.config.ts` projects
(`vitest.node.config.ts` + `vitest.workers.config.ts`, the latter using the
`cloudflareTest()` plugin from `@cloudflare/vitest-plugin`):

**Storage isolation:** the Workers integration isolates D1/DO storage **per test
file**, not per test — tests in one file share writes. Every test must seed its
own unique user ids/refs (see `test/workers/repository.test.ts` factories).

## 1. Node pool — runtime-agnostic core

```bash
npx vitest run --project node
```

Covers: SGQR TLV/CRC16, proxy validation, cents parsing, `ref` generation, QR rendering (including the
detail text band, decoded back with jsQR), command handlers against mocked dependencies (confirmation
steps, void/sent/cancel, names, chat checks), web admin auth (Telegram login HMAC, session cookie,
chat-admin check) and the migration tests for the hand-written table rebuilds.
Tests live in `test/node/**/*.test.ts`.

Handler tests that need to see which lines are drawn on a QR image wrap the real renderer:
`vi.mock('../../src/sgqr/qr-render.js', async (orig) => ({ renderQrPng: vi.fn((await orig()).renderQrPng) }))`.

## 2. Workers pool — Worker-runtime integration

```bash
npx vitest run --project workers
```

Covers: D1 repository layer, compare-and-set races (Received vs Void, Sent vs Cancel, concurrent
paybacks), ChatSessionDO FSM, alarm expiry, the atomic `/claim` (`conversation-do-claim.test.ts`), the
web admin handler (`web-admin.test.ts`: 401/403/404, admin view, no PayNow numbers) and end-to-end flows
through `createBot` (`bot-wiring.test.ts`, `start-flow.test.ts`, `e2e-event-flow.test.ts`).
Tests live in `test/workers/**/*.test.ts`.

`test/workers/harness.ts` is the shared bot harness: idempotent test schema (**keep it in step with
`drizzle/` — new columns and widened CHECK constraints must be mirrored there and in the hand-written
schemas of `repository.test.ts`, `payback-bounds.test.ts` and `event-repository.test.ts`**), a
`TelegramStub` that captures outbound API calls and photo uploads, update builders, and a BMP decoder.
Stub Telegram through `client: { fetch }` and pass `botInfo` (see the AGENTS.md harness notes).

For code that calls the Telegram Bot API directly (the web admin chat-admin check), inject a stub
`fetch` instead of mocking globals.

CI runs both pools on every PR and push to `main` (`.github/workflows/ci.yml`), alongside type-check
(`npm run build`, which also checks `web/`) and Biome. A merge to `main` then deploys through
`.github/workflows/deploy.yml`; tests are not re-run there, so branch protection must keep the CI checks required.

Avoid tight wall-clock assertions: the render-time test in `qr-render-isolate.test.ts` uses a generous
bound because a 100 ms limit flaked on loaded CI runners.

Both pools together:

```bash
npm test          # runs all pools
npm run test:watch  # watch mode
```

## Update-fixture replay against `wrangler dev`

Replay recorded Telegram update JSON directly against the local Worker (the webhook route is `/webhook`):

```bash
# Start dev server
npm run dev

# Replay an update with the secret header
curl -X POST http://localhost:8787/webhook \
  -H "X-Telegram-Bot-Api-Secret-Token: dev" \
  -H "Content-Type: application/json" \
  -d @my-update.json   # a recorded update; no fixtures are checked in
```

Verify:

- Unsigned requests (without the secret header) are rejected with HTTP 403.
- Signed requests with a valid update produce the expected Telegram API calls.

## Live dev bot (optional)

For end-to-end Telegram flows (photo upload, callback buttons):

```bash
# 1. Start a cloudflared tunnel to wrangler dev
npx cloudflared tunnel --url http://localhost:8787

# 2. Note the tunnel URL (e.g. https://xxx.trycloudflare.com)
# 3. Set the webhook:
curl "https://api.telegram.org/bot<TOKEN>/setWebhook?url=https://xxx.trycloudflare.com&secret_token=dev"

# 4. Chat with the bot in Telegram
```

## Web admin page (Pages) locally

```bash
npm run web:dev   # wrangler pages dev with the paynow_db binding
```

The Telegram Login Widget only works on the domain registered with BotFather, so sign-in cannot be tried
on `localhost`; the handler logic is covered by `test/node/web-auth.test.ts` and `test/workers/web-admin.test.ts`.
Verify a deployed page by opening `/events/<ref>` (sign-in prompt) and, signed in as a chat admin and as a
regular member, checking the list and the "Not allowed" message.
