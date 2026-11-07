# Testing Strategy

Two vitest pools configured via `vitest.workspace.ts`:

## 1. Node pool — runtime-agnostic core

```bash
npx vitest run --project node
```

Covers: SGQR TLV/CRC16, proxy validation, cents parsing, `ref` generation.
Tests live in `test/node/**/*.test.ts`.

## 2. Workers pool — Worker-runtime integration

```bash
npx vitest run --project workers
```

Covers: D1 repository layer, ChatSessionDO FSM, alarm expiry, concurrent payback serialization.
Tests live in `test/workers/**/*.test.ts`.

Both pools together:

```bash
npm test          # runs all pools
npm run test:watch  # watch mode
```

## Update-fixture replay against `wrangler dev`

Replay recorded Telegram update JSON directly against the local Worker:

```bash
# Start dev server
npm run dev

# Replay an update with the secret header
curl -X POST http://localhost:8787 \
  -H "X-Telegram-Bot-Api-Secret-Token: dev" \
  -H "Content-Type: application/json" \
  -d @test/fixtures/update-init-mobile.json
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
