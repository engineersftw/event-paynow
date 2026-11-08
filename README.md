# event-paynow

A Telegram bot on Cloudflare Workers that generates SGQR PayNow QR codes for collecting payments, tracks receipts, and supports paybacks.

## Features

- **Event-based payments**: Create events with a shared PayNow payee; generate payment QRs per event
- **SGQR PayNow QR codes**: EMVCo-compliant payloads with CRC16 checksum, rendered as BMP images
- **Payment tracking**: List payments, mark as received, view details with payback history
- **Payback support**: Bounded paybacks (sum cannot exceed original payment) with SGQR QR for the payer
- **Inline buttons**: Confirm/cancel via buttons, action buttons on QR photos, paginated lists
- **Conversation state**: Per-chat Durable Objects with 10-minute idle expiry
- **Two-pool testing**: Node pool for runtime-agnostic core, Workers pool for D1/DO integration

## Stack

- TypeScript on Cloudflare Workers (webhook transport)
- grammY (Telegram Bot framework)
- D1 (serverless SQLite) for persistence
- Durable Objects for per-chat conversation state
- Drizzle ORM for database access
- Pure-JS QR rendering (qrcode-generator + custom BMP builder)
- Biome for lint + format

## Quick Start

### Prerequisites

1. Cloudflare account with Workers paid plan ($5/month)
2. Telegram bot token from [@BotFather](https://t.me/BotFather)
3. Node.js 22+ and npm

### 1. Clone and install

```bash
git clone https://github.com/engineersftw/event-paynow.git
cd event-paynow
npm install
```

### 2. Cloudflare setup

```bash
# Authenticate with Cloudflare
npx wrangler login

# Create D1 database
npx wrangler d1 create paynow-db
# Note the database_id from output, update wrangler.toml

# Apply database migrations
npx wrangler d1 migrations apply paynow-db --remote

# Set secrets
npx wrangler secret put TELEGRAM_BOT_TOKEN
# Paste your bot token when prompted

npx wrangler secret put TELEGRAM_WEBHOOK_SECRET
# Paste a random hex string (e.g., openssl rand -hex 16)
```

### 3. BotFather setup

Message [@BotFather](https://t.me/BotFather) in Telegram:

1. `/newbot` → create bot, note the token
2. `/mybots` → your bot → Bot Settings → Commands → paste:
   ```
   init - Create a new event
   start - Create a payment QR
   payments - List events and payments
   end_event - Close an event
   cancel - Cancel current conversation
   help - Show help
   ping - Health check
   ```

### 4. Deploy

```bash
npm run deploy
```

### 5. Set webhook

```bash
curl -X POST "https://api.telegram.org/bot<TOKEN>/setWebhook" \
  -H "Content-Type: application/json" \
  -d '{"url":"https://<worker>.<subdomain>.workers.dev/webhook","secret_token":"<TELEGRAM_WEBHOOK_SECRET>"}'
```

### 6. Verify

Open Telegram, message your bot:
- `/ping` → should reply "pong 🏓"
- `/help` → should show the command list
- `/init` → create your first event

## Web admin (read-only event page)

`/web_admin` replies with a link per event to a Cloudflare Pages page (`web/`) that lists every payment
of the event. Visitors sign in with the Telegram Login Widget; only the chat's administrators/owner
(or the user in a private chat) can view it.

```bash
# 1. Create the Pages project, then set its secrets (D1 binding and BOT_USERNAME come from web/wrangler.toml)
cd web && npx wrangler pages project create event-paynow-web --production-branch main
npx wrangler pages secret put TELEGRAM_BOT_TOKEN --project-name event-paynow-web
npx wrangler pages secret put SESSION_SECRET --project-name event-paynow-web   # e.g. openssl rand -hex 32
cd .. && npm run web:deploy
# 2. BotFather: /setdomain -> choose the bot -> event-paynow-web.pages.dev (the Login Widget needs this)
# 3. Point the bot Worker at the page, then redeploy it
npx wrangler secret put WEB_ADMIN_URL      # https://event-paynow-web.pages.dev
npm run deploy
```

Preview deployments cannot sign in (the widget only works on the registered domain).

## Development

### Local development

```bash
npm run dev          # Start wrangler dev server
npm run db:migrate:local  # Apply migrations locally
```

### Testing

```bash
npm test                    # Run all tests (both pools)
npx vitest run --project node      # Node pool only
npx vitest run --project workers   # Workers pool only
npm run test:watch             # Watch mode
```

### Linting & formatting

```bash
npm run check        # Biome lint + format + import verification
npm run check:fix    # Auto-fix safe issues
npm run build        # TypeScript type-check
```

### Database

```bash
npm run db:generate  # Generate migration from schema changes
npm run db:migrate:local  # Apply migrations locally
npx wrangler d1 migrations apply paynow-db --remote  # Apply to production
```

## Project Structure

```
src/
├── worker.ts              # Fetch handler, routing
├── bot.ts                 # grammY bot factory, webhook handler, callback dispatcher
├── env.ts                 # Cloudflare Workers environment bindings
├── index.ts               # Worker entry + ChatSessionDO export
├── commands/
│   ├── init-handler.ts    # /init — create event (name + payee)
│   ├── start-handler.ts   # /start — create payment QR (event picker → amount → QR)
│   ├── payments-handler.ts # /payments — list events, drill into payments
│   ├── end-event-handler.ts # /end_event — close event
│   ├── payback-handler.ts  # /payback — payback flow (4 steps)
│   └── payment-callback-handler.ts # Inline button callbacks
├── db/
│   ├── schema.ts          # Drizzle table definitions (users, events, payments, paybacks)
│   ├── repository.ts      # Infra-neutral interfaces
│   └── drizzle-repository.ts # D1 implementation
├── sgqr/
│   ├── index.ts           # TLV encoder, CRC16
│   ├── paynow.ts          # PayNow template builder
│   ├── amount.ts          # Amount parsing (integer cents)
│   ├── proxy-validation.ts # Mobile/UEN validation
│   ├── qr-render.ts       # BMP renderer (Workers)
│   └── qr-render-node.ts  # PNG renderer (Node)
└── worker/
    └── conversation-do.ts # Per-chat Durable Object (FSM + alarm expiry)

test/
├── node/                  # Node-pool tests (runtime-agnostic core)
└── workers/               # Workers-pool tests (D1, DO, integration)

docs/
├── architecture.md        # System architecture
└── testing.md             # Testing strategy

openspec/
├── specs/                 # Main specs (6 capabilities)
└── changes/archive/       # Archived changes
```

## Bot Commands

| Command | Description |
|---|---|
| `/init` | Create a new event (name + PayNow payee) |
| `/start` | Create a payment QR for an event |
| `/payments` | List events and payments with inline buttons |
| `/end_event` | Close an event (no new payments) |
| `/payback <ref>` | Pay back a received payment |
| `/cancel` | Cancel current conversation |
| `/help` | Show command list |
| `/ping` | Health check |

## Testing

Two vitest pools:

1. **Node pool** (`test/node/`): Runtime-agnostic core (SGQR, amount parsing, proxy validation, QR rendering)
2. **Workers pool** (`test/workers/`): Worker-runtime integration (D1, DO, webhook, integration)

```bash
npm test                    # Run all (292 tests)
npx vitest run --project node      # Node only
npx vitest run --project workers   # Workers only
```

## Deployment

```bash
npm run deploy          # Deploy to Cloudflare Workers
npx wrangler tail event-paynow  # Tail logs
```

### Rollback

```bash
npx wrangler deployments rollback
```

## Security

- Webhook secret validation (`X-Telegram-Bot-Api-Secret-Token`) before bot processing
- Per-chat Durable Object isolation for conversation state
- Repository queries always filter by user ID
- All inputs validated before database operations
- Parameterized SQL queries (Drizzle ORM)
- CHECK constraints at database level

## License

Private — not for redistribution.