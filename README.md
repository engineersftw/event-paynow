# event-paynow

A Telegram bot on Cloudflare Workers that generates SGQR PayNow QR codes for collecting payments, tracks receipts, and supports paybacks.

## Features

- **Event-based payments**: Create events with a shared PayNow payee; generate payment QRs per event
- **Payer details**: `/start` takes the payer's PayNow proxy (required) and a display name (optional), then shows a Confirm/Cancel summary before anything is created
- **SGQR PayNow QR codes**: EMVCo-compliant payloads with CRC16 checksum, rendered as BMP images with the payment details printed below the QR (names only, never PayNow numbers)
- **Payment tracking**: List payments; mark received or void a pending request from the QR message; view details with payback history; per-payment amounts and event totals are net of **sent** paybacks, with the paid-back total shown (in the bot and on the web page)
- **Payback support**: Bounded paybacks (pending + sent cannot exceed the original payment) with an SGQR QR for the payer; confirm a payback as sent or cancel it; the stored payer is proposed as the recipient and can be changed per payback
- **Chat admins act on any payment**: administrators of an event's chat can view, receive, void, pay back and mark paybacks sent/cancelled on payments they did not create (checked live with `getChatMember`), and `/payments` shows them every payment of the event; ordinary members keep owner-only access
- **Audit**: who received/voided a payment and who created/sent/cancelled a payback is recorded (Telegram user ids) for bot and web actions
- **Names in messages**: Captions and status lines show `Payer: <name>` / `To: <name>`, never a PayNow number
- **Web admin**: `/web_admin` links to a Cloudflare Pages page listing every payment in an event; chat admins (Telegram sign-in) can also create payment requests (QR on the page and posted to the event's chat), mark pending payments received or void, and create paybacks with a QR image and mark them sent or cancel them
- **Inline buttons**: Confirm/cancel via buttons, action buttons on QR photos, paginated lists; double taps and racing taps resolve to one winner
- **Conversation state**: Per-chat Durable Objects with 10-minute idle expiry
- **Automatic deploys**: GitHub Actions deploys the Worker and Pages from `main` when their files change
- **Two-pool testing**: Node pool for runtime-agnostic core, Workers pool for D1/DO integration

## Stack

- TypeScript on Cloudflare Workers (webhook transport)
- grammY (Telegram Bot framework)
- D1 (serverless SQLite) for persistence
- Durable Objects for per-chat conversation state
- Drizzle ORM for database access
- Pure-JS QR rendering (qrcode-generator + custom BMP builder)
- Cloudflare Pages + Pages Functions for the web admin page
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
   payback - Pay back a received payment
   web_admin - Open the web page for an event
   end_event - Close an event
   cancel - Cancel current conversation
   help - Show help
   ping - Health check
   ```

### 4. Deploy

```bash
npm run deploy
```

Later deploys happen automatically from `main` (see [Deployment](#deployment)); run this by hand only for the first deploy.

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

## Web admin (event page)

`/web_admin` replies with a link per event to a Cloudflare Pages page (`web/`) that lists every payment
of the event. Admins can create a payment request (payer mobile/UEN, optional name, amount; the QR is shown as a PNG
and posted to the event's chat with Received/Void buttons), mark a pending payment received or void it, pay a
received payment back (amount, optional other recipient, QR as a PNG) and mark a payback sent or cancel it.
Visitors sign in with the
Telegram Login Widget; only the chat's administrators/owner (or the user in a private chat) can use it, and
every change is same-origin and re-checks admin status.

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
│   ├── payback-handler.ts  # /payback — payback flow (confirm recipient → amount → QR)
│   ├── payment-callback-handler.ts # Inline button callbacks (received, void, sent, cancel)
│   ├── web-admin-handler.ts # /web_admin — links to the event page
│   └── payer-label.ts     # Name formatting and Markdown escaping for messages
├── db/
│   ├── schema.ts          # Drizzle table definitions (users, events, payments, paybacks)
│   ├── repository.ts      # Infra-neutral interfaces
│   ├── drizzle-repository.ts # D1 implementation
│   ├── payment-service.ts # Payment status transitions
│   └── proxy-validation.ts # Mobile/UEN validation, reference generator
├── sgqr/
│   ├── index.ts           # TLV encoder, CRC16
│   ├── paynow.ts          # PayNow template builder
│   ├── amount.ts          # Amount parsing (integer cents)
│   ├── qr-render.ts       # BMP renderer (Workers) with the detail text band
│   ├── font5x7.ts         # Built-in ASCII bitmap font for the QR image text
│   └── qr-render-node.ts  # PNG renderer (Node, tests)
├── web/
│   ├── handler.ts         # Event page + JSON API + login (used by Pages)
│   ├── auth.ts            # Telegram Login verification, signed session cookie
│   └── access.ts          # Chat-admin check via getChatMember
└── worker/
    └── conversation-do.ts # Per-chat Durable Object (FSM, atomic /claim, alarm expiry)

web/                       # Cloudflare Pages project (functions/ delegates to src/web)

drizzle/                   # SQL migrations (generated + hand-written table rebuilds)

.github/workflows/         # ci.yml (checks + tests), deploy.yml (deploys from main)

test/
├── node/                  # Node-pool tests (runtime-agnostic core)
└── workers/               # Workers-pool tests (D1, DO, integration)

docs/
├── architecture.md        # System architecture
└── testing.md             # Testing strategy

openspec/
├── specs/                 # Main specs (8 capabilities)
└── changes/archive/       # Archived changes
```

## Bot Commands

| Command | Description |
|---|---|
| `/init` | Create a new event (name + PayNow payee) |
| `/start` | Create a payment QR for an event (payer, optional name, amount, confirm) |
| `/payments` | List events and payments with inline buttons |
| `/web_admin` | Links to the web page for each event (chat admins) |
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
npm test                    # Run all tests
npx vitest run --project node      # Node only
npx vitest run --project workers   # Workers only
```

## Deployment

Pushes to `main` deploy through `.github/workflows/deploy.yml`. It diffs the push and deploys only what changed:

| Part | Deployed when these change |
|---|---|
| Worker | `src/` (except `src/web/`), `wrangler.toml`, `package*.json`, `tsconfig.json` |
| Pages | `web/`, `src/web/`, `src/db/`, `package*.json`, `tsconfig.json` |

Add repo secrets `CLOUDFLARE_API_TOKEN` (Workers Scripts: Edit, Cloudflare Pages: Edit, D1: Edit) and
`CLOUDFLARE_ACCOUNT_ID`. To deploy both without a code change, use Actions → Deploy → Run workflow.
A change under `drizzle/` also runs `wrangler d1 migrations apply paynow-db --remote` first (job "Apply D1 migrations");
the Worker and Pages deploys wait for it and are skipped if it fails. Migrations therefore have to be backward
compatible (the old code keeps serving until the deploy finishes).

Manual deploys (from `main` only):

```bash
npm run deploy          # Worker
npm run web:deploy      # Pages
npx wrangler tail event-paynow  # Tail logs
```

### Rollback

```bash
npx wrangler deployments rollback
```

## Security

- Webhook secret validation (`X-Telegram-Bot-Api-Secret-Token`) before bot processing
- Per-chat Durable Object isolation for conversation state
- Payment actions are limited to the payment's owner and to administrators of the event's chat (live check, denied when it fails); other queries filter by user ID, and event actions check the event belongs to the chat
- Every payment/payback action records who performed it (audit columns)
- Web admin: Telegram Login data is HMAC-verified and expires after a day, sessions are signed HttpOnly cookies, and viewing requires chat-admin status checked live; the page never exposes PayNow numbers
- All inputs validated before database operations
- Parameterized SQL queries (Drizzle ORM)
- CHECK constraints at database level

## License

Private — not for redistribution.