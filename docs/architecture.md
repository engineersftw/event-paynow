# Architecture

## System Overview

```
┌─────────────────────────────────────────────────────────────────┐
│                          Telegram Bot                            │
│                      (@event_paynow_bot)                         │
└────────────────────────────┬────────────────────────────────────┘
                             │
                             │ Webhook POST
                             ▼
┌─────────────────────────────────────────────────────────────────┐
│                    Cloudflare Workers Runtime                    │
│                                                                  │
│  ┌──────────────────────────────────────────────────────────┐  │
│  │              Worker (src/worker.ts)                      │  │
│  │  • Health check: GET /                                   │  │
│  │  • Webhook endpoint: POST /webhook                       │  │
│  │  • Secret validation (X-Telegram-Bot-Api-Secret-Token)   │  │
│  └────────────────────┬─────────────────────────────────────┘  │
│                       │                                         │
│                       ▼                                         │
│  ┌──────────────────────────────────────────────────────────┐  │
│  │              grammY Bot (src/bot.ts)                     │  │
│  │  • Command routing (bot.command())                        │  │
│  │  • Message handling (bot.on('message'))                   │  │
│  │  • Conversation state management                          │  │
│  └────────────────────┬─────────────────────────────────────┘  │
│                       │                                         │
│                       ▼                                         │
│  ┌──────────────────────────────────────────────────────────┐  │
│  │         Conversation DO (per-chat state)                 │  │
│  │  • FSM state: flow, step, context, lastActivity          │  │
│  │  • Zod schema validation                                 │  │
│  │  • 10-minute idle expiry via alarms                      │  │
│  │  • Survives cold starts and deploys                      │  │
│  └────────────────────┬─────────────────────────────────────┘  │
│                       │                                         │
│                       ▼                                         │
│  ┌──────────────────────────────────────────────────────────┐  │
│  │         Command Handlers (src/commands/)                 │  │
│  │  • /init - Create an event (name + payee)               │  │
│  │  • /start - Payment request (payer, amount, confirm)    │  │
│  │  • /payments - List events and payments                 │  │
│  │  • /payback - Payback flow                              │  │
│  │  • /edit_event - Edit an open event                     │  │
│  │  • /end_event - Close an event                          │  │
│  │  • /web_admin - Links to the web admin page             │  │
│  └────────────────────┬─────────────────────────────────────┘  │
│                       │                                         │
│                       ▼                                         │
│  ┌──────────────────────────────────────────────────────────┐  │
│  │         Repository Layer (src/db/repository.ts)          │  │
│  │  • Infra-neutral interfaces                              │  │
│  │  • Users: upsertUser, getUser                            │  │
│  │  • Payments: create, list, receive/void (pending CAS)    │  │
│  │  • Paybacks: create, list, sum, sent/cancel (CAS)        │  │
│  └────────────────────┬─────────────────────────────────────┘  │
│                       │                                         │
│                       ▼                                         │
│  ┌──────────────────────────────────────────────────────────┐  │
│  │         Drizzle ORM (src/db/drizzle-repository.ts)       │  │
│  │  • Type-safe queries                                     │  │
│  │  • Schema: users, events, payments, paybacks             │  │
│  │  • CHECK constraints enforced                            │  │
│  └────────────────────┬─────────────────────────────────────┘  │
│                       │                                         │
│                       ▼                                         │
│  ┌──────────────────────────────────────────────────────────┐  │
│  │         D1 Database (Serverless SQLite)                  │  │
│  │  • users: telegram_id, payee_type, payee_value, etc.     │  │
│  │  • payments: ref, user_id, amount_cents, status, etc.    │  │
│  │  • paybacks: ref, payment_id, amount_cents, status, etc. │  │
│  └──────────────────────────────────────────────────────────┘  │
│                                                                  │
│  ┌──────────────────────────────────────────────────────────┐  │
│  │         SGQR Builder (src/sgqr/)                         │  │
│  │  • TLV encoder (EMVCo format)                            │  │
│  │  • CRC16-CCITT-FALSE checksum                            │  │
│  │  • PayNow template builder (tags 00-63)                  │  │
│  │  • Amount parser (integer cents)                         │  │
│  │  • QR renderer (BMP in Workers, PNG in Node) + text band │  │
│  └──────────────────────────────────────────────────────────┘  │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────┐
│  Cloudflare Pages (web/) — event admin page (payments + paybacks)  │
│  Pages Function → src/web/handler.ts → same D1 database          │
│  Telegram Login Widget sign-in, chat-admin check via Bot API     │
└─────────────────────────────────────────────────────────────────┘
```

## Component Descriptions

### Worker (src/worker.ts)

**Role**: Entry point for all HTTP requests

- Validates Telegram webhook secret token before processing (against `TELEGRAM_WEBHOOK_SECRET` binding)
- Routes health checks (`GET /`) and webhook posts (`POST /webhook`)
- Returns 404 for unknown paths

**Key behavior**: Secret validation happens BEFORE bot instantiation to avoid "Empty token" errors in tests. The webhook URL must include the `/webhook` path.

### Simple_PayNow_Bot (src/simple-bot.ts)

A second, independent bot in the same Worker on `POST /webhook/simple` (own token and secret; 404 until configured). `SimpleCommandHandler` runs payee → amount → (payer may change the amount?) → description in the chat's Durable Object under key `simple-<id>` (flow `simple`, so it never mixes with the event bot's `chat-<id>`), then claims the state (exactly once, which also wipes it), builds the payload with `buildPayNowPayload` and sends the QR. No D1 access, no logging of answers, private chats only, payee number never printed on the image or caption.

### grammY Bot (src/bot.ts)

**Role**: Telegram Bot framework integration

- Creates Bot instance with webhook callback
- Registers command handlers (`/init`, `/start`, `/payments`, `/payback`, `/edit_event`, `/end_event`, `/web_admin`, `/cancel`, `/help`, `/ping`)
- Registers an inline-button callback dispatcher with prefix-based routing:
  - `init_confirm:` / `init_cancel:` → InitCommandHandler
  - `start_pick:` / `start_skip_name` / `start_confirm` / `start_cancel` → StartCommandHandler
  - `end_pick:` / `end_confirm:` / `end_cancel:` → EndEventHandler
  - `payments:N` / `event_view:` → PaymentsCommandHandler (pagination, event drill-down)
  - `payback_confirm_payer:` / `payback_change_payer:` / `payback_cancel:` / `payback_confirm_amount:` / `payback_cancel_amount:` → PaybackCommandHandler
  - everything else (`view:`, `mark_received:`, `void:`, `payback:`, `pb_sent:`, `pb_cancel:`) → PaymentCallbackHandler
- Registers message handlers for conversation flows (the active flow in the DO decides which handler owns the text); text from anyone but the conversation's owner, or with no active conversation, is ignored
- Sends QR images via `sendPhoto` with inline action buttons

**Key behavior**: Uses `webhookCallback` adapter for Cloudflare Workers. Bot instance cached per isolate (single `bot.init()` getMe).

### Conversation DO (src/worker/conversation-do.ts)

**Role**: Per-chat conversation state management

- Stores FSM state: current flow, step, context data, last activity timestamp
- `POST /claim {flow, step}`: atomic compare-and-reset (200 = the caller won and gets the previous state, 409 = lost), so a double tap on Confirm creates exactly one payment
- Validates all state transitions with Zod schema
- Automatically expires idle conversations after 10 minutes
- Records the conversation's owner (user and topic) beside `flow`; `POST /owner` stamps it, `GET /peek` reads without side effects, and it is dropped when the flow returns to idle
- Survives cold starts and deployments (persistent storage)

**Key behavior**: Get-or-create pattern - first access creates state, subsequent accesses retrieve it. Alarm-based expiry clears state but preserves user data in D1. The `alarm()` lifecycle method is required by workerd (not a fetch route).

### Command Handlers (src/commands/)

**Role**: Implement user-facing bot commands

**`/init` handler** (event creation):

- Collects event name (non-empty, ≤ 50 chars)
- Collects mobile number or UEN (payee for this event)
- Optionally collects a default amount (text or Skip), stored as `events.default_amount_cents`; `/start` offers it as a "Use SGD x.xx" button and the web admin dialog pre-fills it
- Echoes name + payee (+ default amount) for confirmation via inline Confirm/Cancel buttons
- Creates an `events` row on confirm (status: open)
- Events are scoped by (chat_id, topic_id)
- All outcomes update the original message in place via `editMessageText`

**`/start` handler**:

- Fetches open events for the chat+topic (1 event auto-advances, N shows a picker, 0 prompts `/init`)
- Steps: event → payer PayNow proxy (required) → payer display name (optional, skippable) → amount → Confirm/Cancel summary (event, payer, pay-to, amount)
- Nothing is persisted or rendered until Confirm, which claims the conversation through the DO's atomic `/claim`
- Creates the payment (payee and payer snapshotted, event name as description), renders the SGQR PayNow QR (BMP, PayNow logo, detail text band) and uploads it via `sendPhoto`
- If the QR cannot be delivered after the payment row exists, the payment is voided
- Caption: `description / SGD amount / ref / Payer: <name> / hint` (name only, never the number)
- QR photo carries ✓ Received and ✖ Void; both replace the photo with a text status line

**`/payments` handler**:

- Top-level lists the chat's events with payment count and collected (net of sent paybacks), paid back and pending totals (voided payments excluded)
- Drill into an event → the caller's payments, or every payment of the event for a chat administrator (net of sent paybacks, with the original amount and `Paid back` when any were sent) with inline buttons (View / ✓ Received for pending / Payback for received)
- Payment detail view shows status (⏳ / ✅ / 🚫), payer, timestamps, source and payback history with `Paid back` (sent), `Net`, `Pending paybacks` and `Remaining` (payable-back room); event names and descriptions are Markdown-escaped
- An event from another chat reads as not found

**`/edit_event` handler** (`src/commands/edit-event-handler.ts`): flow `edit` (pick event, pick field, type value). Admin check at start and before the write; one guarded `updateEvent` (open events only); the reply lists the final name, payee and default amount. Payments keep the payee/description they were created with.

**`/end_event` handler**:

- Lists open events for the chat+topic, inline picker if several, then Confirm/Cancel
- Closes via guarded CAS (open → closed) and shows payments count, collected and pending
- Refuses events that belong to another chat; closed events reject new `/start` requests

**`/payback` handler**:

- Starts from `/payback <ref>` or the Payback button; refused unless the payment is `received`. The owner or a chat administrator of the event's chat may pay it back.
- A payment with a stored payer proposes it (Confirm / Change recipient / Cancel; a change applies to that payback only); legacy payments prompt for the payer
- Then amount → Confirm; the payback row is created inside the bounded D1 transaction (pending + sent count toward the bound, cancelled do not)
- The QR encodes the PAYER as payee proxy; caption and image text show `To: <name>` when the recipient is the stored payer
- QR photo carries ✓ Sent and ✖ Cancel (pending-only CAS; the photo is replaced by a status line)

**`/web_admin` handler**:

- Replies with a link button per event to `${WEB_ADMIN_URL}/events/<ref>`; says so when no events exist or the URL isn't configured

### Web Admin (web/, src/web/)

**Role**: Page listing every payment of an event and letting admins handle paybacks, on Cloudflare Pages

- `web/functions/[[path]].ts` is a catch-all Pages Function that delegates to `handleWeb()` (`src/web/handler.ts`)
- `GET /` serves the public landing page (`renderLandingPage`: what the bot does and a `t.me/<BOT_USERNAME>` button; no session, no database); `GET /events/:ref` serves an HTML shell (data is written with `textContent`); `GET /api/events/:ref` returns JSON; `GET /api/login` is the Telegram Login Widget redirect target
- Sign-in: HMAC-SHA256 over the widget data keyed with SHA256(bot token), rejected after 24 h; success sets a 12 h signed HttpOnly cookie (`src/web/auth.ts`)
- Authorisation: the user must be a chat administrator/creator, checked live with `getChatMember`, or the owner of a private chat; any failure denies (`src/web/access.ts`)
- The API returns payer names only (never PayNow numbers); per-payment `paidBackCents` / `netCents` and totals (`collectedCents` net of sent paybacks, `paidBackCents`, `pendingCents`); voided payments are listed but excluded from totals
- Payback actions (all `POST`s require same-origin JSON, then session → event → live admin check): `POST /api/events/:ref/payments/:paymentRef/paybacks` (shared `createPaybackFor`, same validation and bound as the bot, stored payer as default recipient), `GET /api/events/:ref/paybacks/:ref/qr` (PNG via `bmpToPng`), `POST .../paybacks/:ref/sent` and `/cancel` (pending-only CAS)
- Payment requests: `POST /api/events/:ref/payments` (shared `createPaymentRequest`, same payload/caption/image text as `/start`, open events only, owned by the signed-in admin), `GET .../payments/:ref/qr` (PNG), and the QR photo is also posted to the event's chat by the Pages Function (`src/web/telegram.ts`, `sendPhoto` with Received/Void buttons; failure keeps the payment and reports `posted: false`)
- Settling: `POST .../payments/:ref/received` and `/void` (pending-only CAS recording the acting admin; races with Telegram taps have one winner, the chat message keeps stale buttons the bot already handles)
- Reads the same D1 database through the Pages `paynow_db` binding and the shared repository code

### Repository Layer (src/db/repository.ts)

**Role**: Database access abstraction

- Defines infra-neutral interfaces (no Drizzle types in signatures)
- Enables testing with mocks, swapping storage backends
- Enforces data consistency (CHECK constraints via schema)

**Key operations**:

- `upsertUser`: Create or update a user's PayNow reference
- `createPayment`: Create a pending payment (with optional payer type/value/name)
- `updatePaymentStatus`: Pending-only compare-and-set to `received`
- `voidPayment`: Pending-only compare-and-set to `voided`; null if missing or no longer pending
- `listPaymentsByUser` / `listPaymentsByEvent`: a user's payments / every payment of an event, newest first
- `createPaybackBounded`: Create a payback inside a D1 batch with an in-transaction `SUM(paybacks) <= amount` re-check (counts pending + sent, excludes cancelled)
- `updatePaybackStatus`: Pending-only compare-and-set to `sent` or `cancelled`; racing taps yield exactly one winner
- `sumPaybacks`: Total of pending + sent paybacks against a payment (the bounded quantity)
- `listPaybacksByEvent`: every payback of an event's payments (web page payload)
- Status transitions (`updatePaymentStatus`, `voidPayment`, `updatePaybackStatus`) and `createPaybackBounded` take an optional acting user id, written in the same guarded statement as the transition (audit columns)
- `sentPaybackTotalsByEvent`: paymentId → total of SENT paybacks for an event (net amounts without a query per payment)
- Event repository: `createEvent`, `listOpenEventsByChat`, `listAllEventsByChat`, `getEventByRef`, `closeEvent` (open → closed CAS), `getEventStats` (count, collected net of sent paybacks, paid back, pending; voided excluded)

### Drizzle ORM (src/db/drizzle-repository.ts)

**Role**: Type-safe database queries

- Implements Repository interface
- Uses Drizzle's query builder for type safety
- Maps between database rows and domain types

**Key behavior**: All queries use parameterized statements to prevent SQL injection.

### D1 Database

**Role**: Persistent storage

- Serverless SQLite database on Cloudflare
- Four tables: `users`, `events`, `payments`, `paybacks`
- CHECK constraints enforce valid states; widening one means rebuilding the table (migrations 0003 and 0004 do this for `paybacks` and `payments`)

**Schema**:

```sql
events (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  ref TEXT NOT NULL UNIQUE,
  chat_id INTEGER NOT NULL,
  topic_id INTEGER NOT NULL DEFAULT 0,
  name TEXT NOT NULL,
  payee_type TEXT NOT NULL CHECK(payee_type IN ('mobile', 'uen')),
  payee_value TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'open' CHECK(status IN ('open', 'closed')),
  created_at TEXT NOT NULL,
  closed_at TEXT
)

users (
  telegram_id INTEGER PRIMARY KEY,
  payee_type TEXT CHECK(payee_type IN ('mobile', 'uen')),
  payee_value TEXT NOT NULL,
  display_name TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
)

payments (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  ref TEXT NOT NULL UNIQUE,
  user_id INTEGER NOT NULL,
  event_id INTEGER,
  description TEXT NOT NULL,
  amount_cents INTEGER NOT NULL,
  payee_type TEXT NOT NULL CHECK(payee_type IN ('mobile', 'uen')),
  payee_value TEXT NOT NULL,
  status TEXT NOT NULL CHECK(status IN ('pending', 'received', 'voided')),
  source TEXT NOT NULL CHECK(source IN ('manual', 'notification')),
  qr_payload TEXT NOT NULL,
  payer_type TEXT,          -- null on legacy rows
  payer_value TEXT,
  payer_name TEXT,
  created_at TEXT NOT NULL,
  received_at TEXT,
  received_by INTEGER,      -- audit: Telegram user ids, null for older rows
  voided_by INTEGER,
  checked_in_at TEXT,       -- door check-in: once per payment, by an admin (migration 0007)
  checked_in_by INTEGER,
  FOREIGN KEY (user_id) REFERENCES users(telegram_id),
  FOREIGN KEY (event_id) REFERENCES events(id)
)

paybacks (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  ref TEXT NOT NULL UNIQUE,
  payment_id INTEGER NOT NULL,
  payer_type TEXT NOT NULL CHECK(payer_type IN ('mobile', 'uen')),
  payer_value TEXT NOT NULL,
  amount_cents INTEGER NOT NULL,
  status TEXT NOT NULL CHECK(status IN ('pending', 'sent', 'cancelled')),
  qr_payload TEXT NOT NULL,
  created_at TEXT NOT NULL,
  sent_at TEXT,
  created_by INTEGER,       -- audit: Telegram user ids, null for older rows
  sent_by INTEGER,
  cancelled_by INTEGER,
  FOREIGN KEY (payment_id) REFERENCES payments(id)
)
```

**Indexes**:

- `payments(user_id)` - Fast user payment lookup
- `payments(ref)` - Fast payment by reference
- `payments(event_id)` - Fast event payment lookup
- `paybacks(payment_id)` - Fast payback lookup
- `paybacks(ref)` - Fast payback by reference
- `events(chat_id, topic_id)` - Fast event lookup by chat
- `events(ref)` - Fast event by reference

### SGQR Builder (src/sgqr/)

**Role**: Generate valid SGQR PayNow QR codes

**Components**:

- **TLV encoder** (`index.ts`): Encodes EMVCo TLV fields
- **CRC16 calculator** (`index.ts`): CRC16-CCITT-FALSE checksum
- **PayNow template builder** (`paynow.ts`): Builds tag 26 (PayNow merchant account)
- **Amount parser** (`amount.ts`): Converts dollars to integer cents
- **Proxy validation** (`proxy-validation.ts`): Validates mobile/UEN format
- **Ref generator** (`proxy-validation.ts`): 10-char base32 reference
- **QR renderer** (`qr-render.ts`): Renders QR as BMP (Workers) or PNG (Node); overlays the PayNow logo in the center (EC level H); `renderQrPng(payload, lines)` appends a white text band below the QR with the payment details
- **Text band** (`text-band.ts`, `font-atlas.ts`): anti-aliased proportional DejaVu Sans glyphs (pre-rendered by `scripts/generate-font.py`) for that band; non-ASCII draws as `?`, long lines are shortened with an ellipsis by measured width

**Key behavior**: Runtime-agnostic - no Node APIs, runs in both vitest and Workers isolate.

## Data Flow

### /init Command Flow

```
User sends /init
  ↓
Worker receives webhook POST /webhook
  ↓
Secret validation passes (TELEGRAM_WEBHOOK_SECRET)
  ↓
grammY routes to /init command handler
  ↓
Handler gets/creates conversation DO for chat
  ↓
DO returns state (flow: 'idle', step: 0)
  ↓
Handler updates state (flow: 'init', step: 1)
  ↓
Handler prompts user for mobile/UEN
  ↓
User sends mobile number or UEN
  ↓
Handler validates input via proxy-validation
  ↓
Handler updates state (step: 2, context.pendingProxy)
  ↓
Handler echoes normalized value with inline Confirm/Cancel buttons
  ↓
User taps Confirm button (callback_query)
  ↓
Handler updates state (flow: 'idle', step: 0)
  ↓
Handler calls repository.upsertUser()
  ↓
D1 stores user record
  ↓
Handler updates original message in place with success text
```

### /start Command Flow

```
User sends /start
  ↓
Handler loads open events for the chat+topic (picker if several)
  ↓
Payer PayNow proxy → optional payer name → amount
  ↓
Handler shows a Confirm/Cancel summary (event, payer, pay-to, amount); nothing is stored yet
  ↓
User taps Confirm
  ↓
Handler claims the conversation (DO POST /claim); a second tap gets 409 and does nothing
  ↓
Handler creates the payment (status 'pending', payee and payer snapshotted)
  ↓
Handler builds the SGQR payload, renders the BMP (logo + detail text) and sends it with ✓ Received / ✖ Void
  ↓  (if delivery fails, the new payment is voided)
User taps ✓ Received  →  pending-only CAS to 'received', photo replaced by a status line
User taps ✖ Void      →  pending-only CAS to 'voided', photo replaced by a 🚫 line
```

### /payments Command Flow

```
User sends /payments
  ↓
Handler fetches all payments for user (sorted newest-first)
  ↓
Handler paginates at 5 per page
  ↓
Handler renders list with per-payment inline buttons (View / ✓ Received / Payback)
  ↓
Handler sends message with keyboard + Prev/Next navigation
  ↓
User taps page button (payments:N callback)
  ↓
Handler re-renders the list at the requested page
  ↓
User taps View / Mark as received / Payback
  ↓
Callback handler processes action (mark_received deletes photo + sends text)
```

### /payback Command Flow

```
User sends /payback <ref> (or taps Payback on a received payment)
  ↓
Handler verifies the payment exists, belongs to the user and is 'received'
  ↓
Stored payer proposed with Confirm / Change recipient / Cancel (legacy payments: prompt for the payer)
  ↓
Handler checks the remaining payback bound and prompts for the amount
  ↓
User sends amount; handler validates it against the bound and asks for Confirm
  ↓
Handler calls createPaybackBounded() in one D1 batch
  ↓
Handler renders the payback QR (payer as payee proxy) and sends it with ✓ Sent / ✖ Cancel
  ↓
✓ Sent / ✖ Cancel: pending-only CAS, photo replaced by a status line (cancel frees the amount)
```

## Storage Strategy

### What's stored in D1 (persistent)

- **User records**: Telegram ID, PayNow reference (mobile/UEN), display name
- **Event records**: Reference, chat/topic, name, payee, status
- **Payment records**: Reference, user and event IDs, amount, description, status (pending/received/voided), payer details, QR payload, timestamps
- **Payback records**: Reference, payment ID, payer reference, amount, status (pending/sent/cancelled), QR payload, timestamps

**Why D1**: Relational data with foreign keys, CHECK constraints, complex queries (list by user, sum paybacks for bounding).

### What's stored in DO (transient)

- **Conversation state**: Current flow, step, context data, last activity timestamp

**Why DO**: Fast access, automatic expiry, survives cold starts, per-chat isolation.

### What's NOT stored

- **QR images**: Rendered when sent, from the stored `qr_payload`; they are not stored
- **Bot session data**: No server-side sessions, all state in DO
- **Logs**: Cloudflare Logs (external)

## Deployment

### Prerequisites

1. Cloudflare account with Workers paid plan ($5/month)
2. Telegram bot token from @BotFather
3. Wrangler CLI installed (`npm install -g wrangler`)

### Initial Setup

```bash
# 1. Authenticate with Cloudflare
wrangler login

# 2. Create D1 database
wrangler d1 create paynow-db
# Note the database_id from output

# 3. Update wrangler.toml with database_id
# Edit line: database_id = "<your-database-id>"

# 4. Apply database migrations
wrangler d1 migrations apply paynow-db

# 5. Set bot token as secret
wrangler secret put TELEGRAM_BOT_TOKEN
# Paste your bot token when prompted

# 6. Deploy worker
wrangler deploy

# 7. Set webhook URL in Telegram
# URL: https://<worker-name>.<subdomain>.workers.dev/webhook
# Secret: Your TELEGRAM_WEBHOOK_SECRET (not the bot token)
```

### Regular Deploy

Pushes to `main` deploy automatically through `.github/workflows/deploy.yml`, which diffs the push and deploys:

- the **Worker** when `src/` (except `src/web/`), `wrangler.toml`, `package*.json` or `tsconfig.json` change
- the **Pages app** when `web/`, `src/{web,db,sgqr,payments,access}/`, `src/commands/payer-label.ts`, `package*.json` or `tsconfig.json` change (everything the Pages Function bundles)

It needs the repo secrets `CLOUDFLARE_API_TOKEN` and `CLOUDFLARE_ACCOUNT_ID`, can be run by hand to deploy both, and runs `wrangler d1 migrations apply paynow-db --remote` first when `drizzle/` changed (the Worker and Pages deploys wait for it and are skipped if it fails, so migrations must be backward compatible). Manual deploys from `main`:

```bash
npm run deploy        # Worker
npm run web:deploy    # Pages
wrangler deployments rollback   # roll the Worker back
```

### Environment Variables

- `TELEGRAM_BOT_TOKEN`: Bot token from @BotFather (secret)
- `TELEGRAM_WEBHOOK_SECRET`: Webhook secret for validating incoming requests (secret)
- `BOT_USERNAME`: Bot username (default: `event_paynow_bot`)
- `WEB_ADMIN_URL`: Base URL of the Pages event page (set on the Worker; `/web_admin` says "not configured" without it)

Pages project (`event-paynow-web`): secrets `TELEGRAM_BOT_TOKEN` and `SESSION_SECRET`, variable `BOT_USERNAME` and the `paynow_db` binding (see `web/wrangler.toml`). The Login Widget needs the Pages domain registered with BotFather (`/setdomain`).

### Bindings

- `paynow_db`: D1 database binding (database name: `paynow-db`)
- `CHAT_SESSION`: Durable Object binding (class `ChatSessionDO`)

## Testing Strategy

### Two-Pool Architecture

1. **Node pool** (`test/node/`): Runtime-agnostic core logic
   - SGQR payload builder (CRC16, TLV, PayNow template), amount parsing, proxy validation
   - QR rendering, including the detail text band and a jsQR decode round-trip
   - Command handlers with mocked dependencies (confirmation steps, void/sent/cancel, names, chat checks)
   - Web admin auth (Telegram login HMAC, session cookie, chat-admin check)
   - Migration tests for the hand-written table rebuilds

2. **Workers pool** (`test/workers/`): Worker runtime integration (real D1 and Durable Object bindings)
   - Repository layer, compare-and-set races and the payback bound under concurrency
   - Conversation DO, alarm expiry and the atomic `/claim`
   - Bot wiring and end-to-end flows driven through `createBot` with a stubbed Telegram client (`test/workers/harness.ts`)
   - The web admin handler (401/403/404, admin view, no PayNow numbers)

### Test Coverage

- Unit tests for core logic; integration tests for database operations
- Handler tests with mocked context
- Cross-user and cross-chat isolation tests
- State validation tests (corrupted data handling) and alarm expiry tests
- Concurrency tests: double Confirm, Received vs Void, Sent vs Cancel, concurrent paybacks

See `docs/testing.md` for details.

### Running Tests

```bash
# Run all tests
npm test

# Run Node pool only
npx vitest run --project node

# Run Workers pool only
npx vitest run --project workers

# Watch mode
npm run test:watch
```

## Security Considerations

### Secret Validation

- All webhook requests validated via `X-Telegram-Bot-Api-Secret-Token` header
- Invalid requests rejected with 403 before bot processing
- Prevents unauthorized access and replay attacks

### Data Isolation

- Per-chat DO ensures conversation state isolation
- Payment actions (view, receive, void, pay back, sent, cancel) are limited to the payment's owner and to administrators of the event's chat, checked live with `getChatMember` (denied when the check fails; payments without an event stay owner-only); event actions require the event to belong to the chat the tap came from
- Check-in at the event: the admin page scans a payment QR (decoded in the browser, matched exactly against the stored payload on the server) and records `checked_in_at` / `checked_in_by` once per payment.
- Every such action records who performed it (audit columns `received_by`, `voided_by`, `checked_in_by`, `created_by`, `sent_by`, `cancelled_by`)
- No cross-user data leakage possible
- Captions, status lines and QR images carry display names only, never PayNow numbers
- Web admin: Telegram Login data is HMAC-verified and expires after a day, sessions are signed HttpOnly cookies, and viewing requires chat-admin status checked live

### Input Validation

- Mobile numbers: strict format validation (`+65XXXXXXXX`, 6/8/9 prefix)
- UEN: length and charset validation (9-13 alphanumeric)
- Amounts: positive values only, max 2 decimal places
- All inputs validated before database operations

### SQL Injection Prevention

- All queries use Drizzle's parameterized statements
- No string concatenation in SQL queries
- CHECK constraints enforce valid states at database level

## Performance Characteristics

### Cold Start

- Worker cold start: ~50-100ms
- DO first access: ~10-20ms
- D1 query: ~5-10ms

### Warm Path

- Webhook processing: ~10-20ms
- QR generation: ~5-10ms
- Database write: ~5-10ms

### Limits

- Worker CPU time: 10ms (free) / 30s (paid)
- D1 storage: 10GB per database
- DO storage: 10GB per namespace
- Request size: 100MB

## Monitoring & Debugging

### Logs

```bash
# Tail logs in real-time
wrangler tail

# Filter by specific request
wrangler tail --format pretty
```

### Metrics

- Cloudflare Workers dashboard
- Request count, CPU time, error rate
- D1 query performance

### Common Issues

1. **"Empty token" error**: Secret not set or not validated before bot creation
2. **QR not scannable**: Payload too long or CRC invalid
3. **Conversation lost**: DO alarm fired or state corrupted
4. **Payment not found**: Reference doesn't exist or belongs to different user
5. **DO `setAlarm` fails**: `ConversationDO` must implement the public `alarm()` lifecycle method (workerd requirement) — missing it causes `TypeError: Your Durable Object class must have an alarm() handler`

## Project Status

### Completed

- `/init` (events, optional default amount), `/start` (payer details, confirmation step, QR with detail text), `/payments`, `/payback`, `/end_event`, `/web_admin`
- Payment lifecycle: pending → received or voided; paybacks: pending → sent or cancelled (all guarded transitions)
- Bounded paybacks, payer snapshotted on each payment, recipient confirmation and change
- Inline-button UX (confirm/cancel, action buttons, pagination, in-place status lines)
- Web admin page on Cloudflare Pages with Telegram sign-in: payments list plus payback create/QR/sent/cancel
- D1 migrations (including table rebuilds), live deployment on Cloudflare Workers and Pages
- GitHub Actions CI with branch protection, and path-filtered deploys from `main`
- Node and Workers test pools (run `npm test` for the current count)

### Future Enhancements

- Multi-currency support
- Payment expiry and reminders
- Export payment history
- Admin dashboard
- Analytics and reporting
