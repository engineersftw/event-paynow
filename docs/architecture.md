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
│  │  • /init - Set PayNow reference (mobile/UEN)            │  │
│  │  • /start - Create payment request                      │  │
│  │  • /payments - List payments                            │  │
│  │  • /payback - Payback flow                              │  │
│  └────────────────────┬─────────────────────────────────────┘  │
│                       │                                         │
│                       ▼                                         │
│  ┌──────────────────────────────────────────────────────────┐  │
│  │         Repository Layer (src/db/repository.ts)          │  │
│  │  • Infra-neutral interfaces                              │  │
│  │  • Users: upsertUser, getUser                            │  │
│  │  • Payments: create, list, update status                 │  │
│  │  • Paybacks: create, list, sum active                    │  │
│  └────────────────────┬─────────────────────────────────────┘  │
│                       │                                         │
│                       ▼                                         │
│  ┌──────────────────────────────────────────────────────────┐  │
│  │         Drizzle ORM (src/db/drizzle-repository.ts)       │  │
│  │  • Type-safe queries                                     │  │
│  │  • Schema: users, payments, paybacks                     │  │
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
│  │  • QR renderer (BMP in Workers, PNG in Node)             │  │
│  └──────────────────────────────────────────────────────────┘  │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

## Component Descriptions

### Worker (src/worker.ts)
**Role**: Entry point for all HTTP requests
- Validates Telegram webhook secret token before processing
- Routes health checks (`GET /`) and webhook posts (`POST /webhook`)
- Returns 404 for unknown paths

**Key behavior**: Secret validation happens BEFORE bot instantiation to avoid "Empty token" errors in tests.

### grammY Bot (src/bot.ts)
**Role**: Telegram Bot framework integration
- Creates Bot instance with webhook callback
- Registers command handlers (`/init`, `/start`, `/payments`, `/payback`)
- Registers message handlers for conversation flows
- Sends QR images via `sendPhoto` with FormData

**Key behavior**: Uses `webhookCallback` adapter for Cloudflare Workers.

### Conversation DO (src/worker/conversation-do.ts)
**Role**: Per-chat conversation state management
- Stores FSM state: current flow, step, context data, last activity timestamp
- Validates all state transitions with Zod schema
- Automatically expires idle conversations after 10 minutes
- Survives cold starts and deployments (persistent storage)

**Key behavior**: Get-or-create pattern - first access creates state, subsequent accesses retrieve it. Alarm-based expiry clears state but preserves user data in D1.

### Command Handlers (src/commands/)
**Role**: Implement user-facing bot commands

**`/init` handler**:
- Collects mobile number or UEN from user
- Validates and normalizes input (mobile → `+65XXXXXXXX`, UEN → uppercase)
- Requires confirmation before saving
- Updates existing user or creates new user

**`/start` handler** (implemented):
- Guard: unconfigured users are prompted to run `/init` first
- Collects description, then amount (integer cents, ≤ 2 decimals)
- Creates the payment record with payee snapshot + embedded base32 `ref`
- Renders the SGQR PayNow QR (BMP, pure JS) and uploads it via `sendPhoto`

**`/payments` handler** (implemented):
- Lists all payments for the user with inline buttons (View / Mark as received / Payback)
- Payment detail view shows status, timestamps, source, and payback summary
- Detail view renders a "Mark payback as sent" button per pending payback (task 7.4);
  tapping performs a guarded `pending → sent` transition and re-renders the history with
  sent timestamps and the refreshed remaining total

**`/payback` handler** (implemented):
- 4-step conversation: payer proxy → confirm → amount → confirm
- Payback row created inside the bounded D1 transaction (task 7.2)
- Generates QR encoding the PAYER as payee proxy and uploads via `sendPhoto` (task 7.3)

### Repository Layer (src/db/repository.ts)
**Role**: Database access abstraction
- Defines infra-neutral interfaces (no Drizzle types in signatures)
- Enables testing with mocks, swapping storage backends
- Enforces data consistency (CHECK constraints via schema)

**Key operations**:
- `upsertUser`: Create or update user's PayNow reference
- `createPayment`: Create pending payment record
- `updatePaymentStatus`: Transition payment status (pending → received)
- `createPayback`: Create payback record
- `createPaybackBounded`: Create payback inside a D1 batch with in-transaction
  `SUM(active paybacks) <= amount` compare-and-set re-check (task 7.2)
- `getPaybackByRef`: Look up a payback by its unique ref
- `updatePaybackStatus`: Guarded `pending → sent` transition (compare-and-set);
  duplicate/concurrent taps yield exactly one winner (task 7.4)
- `sumActivePaybacks`: Calculate total active (pending) paybacks for bounding

### Drizzle ORM (src/db/drizzle-repository.ts)
**Role**: Type-safe database queries
- Implements Repository interface
- Uses Drizzle's query builder for type safety
- Maps between database rows and domain types

**Key behavior**: All queries use parameterized statements to prevent SQL injection.

### D1 Database
**Role**: Persistent storage
- Serverless SQLite database on Cloudflare
- Three tables: `users`, `payments`, `paybacks`
- CHECK constraints enforce valid states

**Schema**:
```sql
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
  description TEXT NOT NULL,
  amount_cents INTEGER NOT NULL,
  payee_type TEXT NOT NULL CHECK(payee_type IN ('mobile', 'uen')),
  payee_value TEXT NOT NULL,
  status TEXT NOT NULL CHECK(status IN ('pending', 'received')),
  source TEXT NOT NULL CHECK(source IN ('manual', 'notification')),
  qr_payload TEXT NOT NULL,
  created_at TEXT NOT NULL,
  received_at TEXT,
  FOREIGN KEY (user_id) REFERENCES users(telegram_id)
)

paybacks (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  ref TEXT NOT NULL UNIQUE,
  payment_id INTEGER NOT NULL,
  payer_type TEXT NOT NULL CHECK(payer_type IN ('mobile', 'uen')),
  payer_value TEXT NOT NULL,
  amount_cents INTEGER NOT NULL,
  status TEXT NOT NULL CHECK(status IN ('pending', 'sent')),
  qr_payload TEXT NOT NULL,
  created_at TEXT NOT NULL,
  sent_at TEXT,
  FOREIGN KEY (payment_id) REFERENCES payments(id)
)
```

**Indexes**:
- `payments(user_id)` - Fast user payment lookup
- `payments(ref)` - Fast payment by reference
- `paybacks(payment_id)` - Fast payback lookup
- `paybacks(ref)` - Fast payback by reference

### SGQR Builder (src/sgqr/)
**Role**: Generate valid SGQR PayNow QR codes

**Components**:
- **TLV encoder** (`index.ts`): Encodes EMVCo TLV fields
- **CRC16 calculator** (`index.ts`): CRC16-CCITT-FALSE checksum
- **PayNow template builder** (`paynow.ts`): Builds tag 26 (PayNow merchant account)
- **Amount parser** (`amount.ts`): Converts dollars to integer cents
- **Proxy validation** (`proxy-validation.ts`): Validates mobile/UEN format
- **Ref generator** (`proxy-validation.ts`): 10-char base32 reference
- **QR renderer** (`qr-render.ts`): Renders QR as BMP (Workers) or PNG (Node)

**Key behavior**: Runtime-agnostic - no Node APIs, runs in both vitest and Workers isolate.

## Data Flow

### /init Command Flow
```
User sends /init
  ↓
Worker receives webhook POST /webhook
  ↓
Secret validation passes
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
User sends mobile number
  ↓
Handler validates input via proxy-validation
  ↓
Handler updates state (step: 2, context.pendingProxy)
  ↓
Handler echoes normalized value for confirmation
  ↓
User sends "confirm"
  ↓
Handler calls repository.upsertUser()
  ↓
D1 stores user record
  ↓
Handler resets state (flow: 'idle', step: 0)
  ↓
Handler sends success message
```

### /start Command Flow
```
User sends /start
  ↓
Handler checks if user has configured reference
  ↓ (if not configured)
Handler prompts user to run /init first
  ↓ (if configured)
Handler prompts for description (payee snapshot captured in DO state)
  ↓
User sends description
  ↓
Handler prompts for amount
  ↓
User sends amount
  ↓
Handler validates amount via amount parser (integer cents)
  ↓
Handler generates unique ref (10-char base32)
  ↓
Handler builds SGQR PayNow payload
  ↓
Handler renders QR as BMP
  ↓
Handler creates payment record (status: 'pending')
  ↓
D1 stores payment record
  ↓
Handler sends QR image via sendPhoto
  ↓
Handler sends payment reference + /payments tracking hint
```

## Storage Strategy

### What's stored in D1 (persistent)
- **User records**: Telegram ID, PayNow reference (mobile/UEN), display name
- **Payment records**: Reference number, user ID, amount, description, status, QR payload, timestamps
- **Payback records**: Reference number, payment ID, payer reference, amount, status, QR payload, timestamps

**Why D1**: Relational data with foreign keys, CHECK constraints, complex queries (list by user, sum active paybacks).

### What's stored in DO (transient)
- **Conversation state**: Current flow, step, context data, last activity timestamp

**Why DO**: Fast access, automatic expiry, survives cold starts, per-chat isolation.

### What's NOT stored
- **QR images**: Generated on-demand from `qr_payload` field
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
# Secret: Your TELEGRAM_BOT_TOKEN
```

### Regular Deploy
```bash
# Deploy latest code
wrangler deploy

# Rollback to previous version
wrangler deployments rollback
```

### Environment Variables
- `TELEGRAM_BOT_TOKEN`: Bot token from @BotFather (secret)
- `BOT_USERNAME`: Bot username (default: `event_paynow_bot`)

### Bindings
- `DB`: D1 database binding
- `CHAT_SESSION`: Durable Object binding (class `ChatSessionDO`)

## Testing Strategy

### Two-Pool Architecture
1. **Node pool** (`test/node/`): Runtime-agnostic core logic
   - SGQR payload builder (CRC16, TLV, PayNow template)
   - Amount parsing (dollars ↔ cents)
   - Proxy validation (mobile/UEN normalization)
   - Command handler logic (with mocked dependencies)

2. **Workers pool** (`test/workers/`): Worker runtime integration
   - Repository layer (real D1 bindings)
   - Conversation DO (real DO bindings)
   - Webhook secret validation
   - Concurrent request handling

### Test Coverage
- Unit tests for all core logic
- Integration tests for database operations
- Handler tests with mocked context
- Cross-user isolation tests
- State validation tests (corrupted data handling)
- Alarm expiry tests

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
- Repository queries always filter by user ID
- No cross-user data leakage possible

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

## Future Enhancements

### Planned
- `/start` command for creating payments
- `/payments` command for listing payments
- `/payback` command for payback flow
- Payment status tracking (pending → received)
- Automated payment notification webhook

### Possible
- Multi-currency support
- Payment expiry and reminders
- Export payment history
- Admin dashboard
- Analytics and reporting
