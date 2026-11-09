<p align="center"><img src="web/public/logo.png" alt="event-paynow bot logo" width="96" height="96"></p>

# Event-PayNow Bot

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
- **Web pages**: every page carries a small two-line attribution footer ("Built by Michael Cheng & Claude Code AI." then "Open Source with ❤️.", linking to LinkedIn and this repository; edit `LINKEDIN_URL` / `REPO_URL` in `src/web/page.ts`); the site root is a public landing page with an Add-the-bot-on-Telegram button and a click-to-play YouTube explainer video (nothing is requested from YouTube until the visitor clicks; change the video id in `EXPLAINER_VIDEO_ID` in `src/web/page.ts`); `/web_admin` links chat admins to an event management page; each event also has a shareable `/pay/<event-ref>` page where anyone (no sign-in needed) can create their own payment request and see its QR inline; signing in with Telegram adds a private Telegram copy and a history of their requests. Admins can scan an attendee's payment QR from the event page to check them in (and mark received or pay back from the same result)
- **Inline buttons**: Confirm/cancel via buttons, action buttons on QR photos, paginated lists; double taps and racing taps resolve to one winner
- **Conversation state**: Per-chat Durable Objects with 10-minute idle expiry
- **Automatic deploys**: GitHub Actions deploys the Worker and Pages from `main` when their files change
- **Two-pool testing**: Node pool for runtime-agnostic core, Workers pool for D1/DO integration

## Using the bot

Add the bot to your event's Telegram group (or chat with it directly) and use these steps. Type `/help` in Telegram for the command list.

**Organiser (chat admin)**

1. `/init`: give the event a name, the PayNow payee (mobile number or UEN) and an optional default amount, then Confirm.
2. Share the event's payment page: `/web_payment` gives the link to `/pay/<event-ref>`. Anyone can open it, enter their details and get their own PayNow QR (no sign-in needed).
3. Or issue a QR yourself with `/start`: pick the event, enter the payer's PayNow number and optional name, the amount, then Confirm. The QR is posted in the chat.
4. Tap **✓ Received** on the QR message once the money arrives (or **✖ Void** to cancel a pending request). `/payments` lists everything and shows totals.
5. `/payback` (or the Payback button on a received payment) makes a QR to refund the payer; tap **✓ Sent** when done.
6. `/web_admin` opens the event's web page: search payments, mark received/void, pay back, and **Check-In** attendees by scanning their QR or tapping Check-In on their row.
7. `/edit_event` changes the name, payee or default amount; `/end_event` closes the event.

**Payer / attendee**

- Pay by scanning the QR in your banking app (PayNow).
- **Keep the QR**: it is your proof of payment and is scanned at the door for check-in.
- Commands you start (`/start`, `/payback`) only continue for you; `/cancel` abandons the current step.

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
   web_payment - Open the payment page for an event
   edit_event - Change an event's name, payee or default amount
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

## Simple_PayNow_Bot (optional second bot)

A QR-only bot served by the same Worker at `POST /webhook/simple`: in a private chat, `/start` asks for the payee (mobile or UEN), an optional amount (Skip leaves it to the payer; if given, it asks whether the payer may change it) and an optional description (up to 25 characters), then shows a summary of everything entered with Confirm / Cancel; the PayNow QR is made only after Confirm. It stores no payee, amount, description or identity (answers sit in the chat's Durable Object under `simple-<id>` for at most 10 minutes) and never prints the payee number on the QR or caption; the only thing it records is an anonymous count per day (table `usage_counters`: QRs made, and whether the amount was skipped, fixed or changeable by the payer). Until configured, the route answers 404.

```bash
# 1. BotFather: /newbot -> Simple_PayNow_Bot; commands: start - Make a PayNow QR, cancel - Stop, help - How it works
# 2. Secrets (SIMPLE_BOT_USERNAME is a var in wrangler.toml), then redeploy the Worker
npx wrangler secret put SIMPLE_BOT_TOKEN
npx wrangler secret put SIMPLE_WEBHOOK_SECRET      # e.g. openssl rand -hex 16
# 3. Point the new bot at its own route
curl -X POST "https://api.telegram.org/bot<SIMPLE_BOT_TOKEN>/setWebhook" \
  -H "Content-Type: application/json" \
  -d '{"url":"https://<worker>.<subdomain>.workers.dev/webhook/simple","secret_token":"<SIMPLE_WEBHOOK_SECRET>"}'
```

## Explainer video

`npm run video` renders a ~76 s, captioned, silent explainer video (Event Organizer chapter, then Attendee chapter) to `out/explainer/` (gitignored, so it is never committed): `explainer.mp4` (1920x1080 H.264), `poster.png`, `captions.srt` (upload it to YouTube for real captions) and `transcript.txt` (for the video description). It needs Playwright's Chromium and ffmpeg and takes about 80 seconds. The scenes are `scripts/explainer/scenes.html` and the caption text is `scripts/explainer/captions.json`; edit them and re-run when the bot changes. A test checks that every command named in the captions is in the bot's `/help` text. All names and the sample QR are fictional.

The video has a quiet music bed (about -23 LUFS, 2 s fade in, 3 s fade out): a slice of "Calm Pill 1 - Still Habitat" by Alaeddin Hallak, published on the Internet Archive under the CC0 1.0 dedication. `scripts/explainer/music.json` records the title, creator, source page, file URL, licence URL and start offset; edit it to use another CC0 track. The audio is never committed: the script fetches just the needed slice into `out/explainer/.music-cache/` the first time (needs network access to archive.org). `npm run video -- --silent` builds without music; if the fetch fails the build stops with a message instead of writing a silent video. `transcript.txt` ends with a music credit line for the YouTube description.

## Usage stats

Authorized users can send the hidden `/stats` command to Event PayNow Bot in a **private chat** (it is not in `/help` or the BotFather list; anyone else, and any group, gets no reply). It shows events (total, open, closed, last 7 and 30 days, different chats), QR codes / payment requests (total, last 7 and 30 days, by status, how many came from the public payment page without sign-in), SGD received, check-ins, paybacks, and Simple_PayNow_Bot's QR count with the share of QRs where the amount was skipped, fixed or changeable by the payer. It is all numbers: no names, PayNow numbers or references. The event bot's figures are computed from the existing database records; the simple bot's come from the anonymous daily counters (counts start when the counters were added, and cancelled or unconfirmed conversations are not counted).

Authorized users are a comma-separated list of Telegram user ids in a Worker secret (find an id by messaging a bot such as @userinfobot, or from the `from.id` in a webhook update):

```bash
npx wrangler secret put STATS_USER_IDS      # e.g. 123456789, 987654321
npx wrangler deploy                           # the new value is picked up on the next deploy
```

Not covered by `/stats`: landing page visits (turn on Cloudflare Web Analytics for the Pages project in the Cloudflare dashboard: no code, no cookies) and explainer video views (YouTube Studio).

## Web pages (admin and payer event pages)

**Check-in at the door.** The event page has a **Check-In** button: it opens the phone camera, reads the attendee's payment
QR (the one from the payer page, `/start` or the admin dialog, which carries the payment reference), shows that payment
with a **Check in** button and the usual actions (mark received or void, pay back), and records the check-in time and
admin once per payment. Pending and received payments can be checked in; voided ones cannot. If the camera is blocked,
type the payment reference instead, or skip the camera: search the attendee's name or reference on the event page and
tap **Check-In** on their row. Payment QR captions and the payer page remind payers to keep their QR for
check-in. QR decoding uses the browser's `BarcodeDetector` when available, else the vendored
[jsQR](https://github.com/cozmo/jsQR) 1.4.0 (Apache-2.0) at `web/public/vendor/jsqr.js`, a minified build of
`node_modules/jsqr/dist/jsQR.js` (`npx esbuild node_modules/jsqr/dist/jsQR.js --minify --outfile=web/public/vendor/jsqr.js`,
then restore the banner comment) loaded only when Check-In is used.

The event page also shows event-wide check-in statistics: **Checked in** and **Not checked in** (one box,
with a paid / pending split underneath). Voided payments are omitted from both counts, regardless of the active search,
filter, or pagination state.

`/web_admin` replies with a link per event to a Cloudflare Pages page (`web/`) that lists every payment
of the event. Admins can create a payment request (payer mobile/UEN, optional name, amount; the QR is shown as a PNG
and posted to the event's chat with Received/Void buttons), mark a pending payment received or void it, pay a
received payment back (amount, optional other recipient, QR as a PNG) and mark a payback sent or cancel it.
Visitors sign in with the
Telegram Login Widget; only the chat's administrators/owner (or the user in a private chat) can use it, and
every change is same-origin and re-checks admin status. Both web pages show the signed-in user's Telegram name with
a Sign out button (it clears the cookies in that browser; sessions are stateless, so a copied cookie stays valid until
it expires after 12 hours).

The admin page has a Pay button that opens the shareable payer link at `/pay/<event-ref>`. Anyone with that link can create a
payment request for themselves with no sign-in, without being an event-chat member or administrator (anonymous requests
are stored with owner `0`, shown to admins like any other, and capped at 30 per event per 10 minutes). Signing in with
Telegram is optional. If the
event has a default amount, the payer page shows it as plain text and uses it as the fixed payable amount. If no
default is configured, the payer enters a required amount. The generated SGQR QR is displayed inline on the page. For signed-in users the
page also lists their earlier requests for the event (tap a pending one to see its QR again), and the bot sends them a
private copy of the QR (no buttons; it needs them to have started the bot, otherwise the page says so). Anonymous
visitors get the QR on the page only. Nothing is posted to the event chat from this flow.

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

The migration history is one baseline, `drizzle/0000_initial_schema.sql`, plus any later migrations numbered from `0001`. Never rename the baseline: D1 records applied migrations by file name, so a renamed file would be run again on the live database. The status CHECK constraints exist only in the SQL (not in `src/db/schema.ts`), so a hand-written table rebuild must repeat them.

## Project Structure

```
src/
├── worker.ts              # Fetch handler, routing
├── bot.ts                 # grammY bot factory, webhook handler, callback dispatcher
├── simple-bot.ts          # Simple_PayNow_Bot factory + /webhook/simple handler
├── env.ts                 # Cloudflare Workers environment bindings
├── index.ts               # Worker entry + ChatSessionDO export
├── commands/
│   ├── simple-handler.ts  # Simple_PayNow_Bot conversation (payee → amount → payer-may-change → description → confirm)
│   ├── init-handler.ts    # /init — create event (name + payee)
│   ├── start-handler.ts   # /start — create payment QR (event picker → amount → QR)
│   ├── payments-handler.ts # /payments — list events, drill into payments
│   ├── edit-event-handler.ts # /edit_event — edit an open event
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
│   ├── paynow-logo.ts     # PayNow logo mask for the QR center (generated)
│   ├── font-atlas.ts      # Anti-aliased glyph atlas for the QR image text (generated)
│   ├── text-band.ts       # Lays out and draws the text band
│   └── qr-render-node.ts  # PNG renderer (Node, tests)
├── web/
│   ├── handler.ts         # Event page + JSON API + login (used by Pages)
│   ├── auth.ts            # Telegram Login verification, signed session cookie
│   └── access.ts          # Chat-admin check via getChatMember
└── worker/
    └── conversation-do.ts # Per-chat Durable Object (FSM, atomic /claim, alarm expiry)

web/                       # Cloudflare Pages project (functions/ delegates to src/web)

drizzle/                   # SQL migrations: one baseline (0000_initial_schema.sql, never rename it) + later ones from 0001

.github/workflows/         # ci.yml (checks + tests), deploy.yml (deploys from main)

test/
├── node/                  # Node-pool tests (runtime-agnostic core)
└── workers/               # Workers-pool tests (D1, DO, integration)

docs/
├── architecture.md        # System architecture
└── testing.md             # Testing strategy

openspec/
├── specs/                 # Main specs (16 capabilities)
└── changes/archive/       # Archived changes
```

## Bot Commands

| Command | Description |
|---|---|
| `/init` | Create a new event (name, PayNow payee, optional default amount that `/start` and the web page suggest) |
| `/start` | Create a payment QR for an event (payer, optional name, amount, confirm) |
| `/payments` | List events and payments with inline buttons |
| `/web_admin` | Links to the admin and payment pages for each event (chat admins) |
| `/web_payment` | Links to the standalone payment page for each event |
| `/edit_event` | Change an open event's name, payee or default amount (chat admins) |
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
| Pages | `web/`, `src/{web,db,sgqr,payments,access}/`, `src/commands/payer-label.ts`, `package*.json`, `tsconfig.json` |

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
