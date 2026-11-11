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

### Split_PayNow_Bot (src/split-bot.ts)

Its hidden `/stats` follows the Event bot's rule (private chat, id in `STATS_USER_IDS`, silent otherwise) and prints `formatSplitStats(splitSnapshot())`. The handler and `collectClaim` add best-effort anonymous counts to `usage_counters` (confirmed splits by type, place and payee, chat and direct-message QRs, receipt scans read or failed, waiting QRs created and collected); the waiting-QR and contact figures are live counts of `split_claims` and `split_contacts`.


A third bot in the same Worker on `POST /webhook/split` (own token and secret; 404 until configured). `SplitCommandHandler` runs payee → payee-is-organiser → total → number of people → description → confirmation summary in the chat's Durable Object under key `split-<id>` (flow `split`). Steps: total → mode (Equally / Custom amounts; `/split_custom` skips it) → people, or a list of `name amount` lines → leftover choice (only when the list is short of the bill) → payee → description → confirm. `split-math.ts` works in integer cents: `splitEqually` rounds the share up, `parseCustomList` / `applyLeftover` / `groupByAmount` handle custom splits, and Confirm sends one QR per distinct amount, stopping and reporting counts if a send fails. It works in private chats and groups: in a group the DO owner stamp (`POST /owner`) restricts answers to the user and topic that sent `/split`, text questions are force-reply prompts (so privacy mode can stay on), `getChatMemberCount` minus the bot is offered as a button, the summary masks the payee and the typed payee message is deleted when the bot may. Every answer is stored in the DO context and `nextNeed` returns the first thing still missing or invalid (the same rules for the first run, for the summary's Amend menu and for edited answer messages, which are found through the recorded message ids `answerMsgs`); the latest summary's message id is kept in `summaryMsg` so earlier summaries lose their buttons and cannot be confirmed. Confirm claims the state once, then sends a fixed-amount QR for one share. Answers are not logged and no counters are kept. Mentioned payers (`@username` or a text mention) in a custom list are sent their QR by `sendPhoto` to their id (a username is resolved through `split_contacts`, filled by a private `/start` and emptied by `/forget`); anyone who cannot be messaged gets a row in `split_claims` (token, amount, QR payload containing the payee, organiser, chat and message ids, 48-hour expiry) and a button in one waiting message, and `/start claim_<token>` checks the tapper's id or username, deletes the row first (so one tap wins), sends the QR and edits the waiting message. Splits without mentions write nothing.

`/split_receipt` adds steps RECEIPT, REVIEW and ASSIGN. A photo (largest size) is downloaded through the Bot API file endpoint, passed to a `ReceiptReader` (`WorkersAiReceiptReader` calls `env.AI.run(RECEIPT_MODEL, …)` with the photo as a data URL, accepts the model licence once if asked, and extracts the JSON from the reply), and `parseScan` turns it into integer cents with warnings; the model output is never trusted. After the user taps Use this, `parseAssignments` reads the assignment message (item numbers and ranges, people, `me`, `all`; items named nowhere come back as `unassigned`, which adds an `UNASSIGNED` step: `applyUnassigned` gives them to the organiser or shares each equally between those named, and the choice is kept while the same items stay unassigned) and `shareReceipt` splits each item equally and shares `receipt total − sum of items` in proportion to each person's items by largest remainder, so all amounts, the organiser's included, add up to the receipt total. The collectable amounts become the custom-split entries with `leftover: 'omit'` (the organiser's share), so payee, Amend (Items replaces Total/Split in the menu), QRs and DMs are the existing code. The photo is held in memory for the one call. `missingCents` compares the items with the printed subtotal (or, without one, the total minus service charge and GST plus any discount, when a charge was read); a shortfall of more than two cents makes the review say how much looks missing and offer **Add a missing item** (`split_scan:add`), which opens step `ADD_ITEM` where `parseAddedItems` reads `name price` lines (or **Add as one line** adds "Unread items" for the gap); the items are appended, `receiptWarnings` is worked out again and the review is shown afresh in step `REVIEW`. `parseAssignments` reads two formats and picks one per message: all lines are `1,3 Ann` style, or (any name line or `N.` item line) a header format where each `N.` item line, matched by its number, belongs to the header above it; an item under several headers is merged into a shared item, and both formats produce the same `lines` that the sharing code consumes. In a group, `Use this` sets `group` and `nextNeed` asks step `HOW` (16: type, or let everyone claim) before `ASSIGN`; claiming (step `CLAIM` = 17) keeps `claims` (item index to user ids), `claimers` (id, display name, username; at most 20, dropped when they hold nothing) and `claimMsg`. `split_claim:<i>` is the one callback any group member may tap (`claimTap` reads the state, toggles, and writes with `ifRev`, retrying on 409; the DO state carries a `rev` incremented by every `POST /state`); Done builds an assignment with `assignmentFromClaims` and passes it through `assignmentPatch`, the same code the typed assignment uses, so unclaimed items reuse step `UNASSIGNED` (with a Keep claiming button). The handler writes `idleMs` with every state (one hour for HOW, CLAIM and a claim-originated UNASSIGNED, ten minutes otherwise); the DO's alarm uses it. The organiser's tap on an item opens a menu (`menu: { item, msg, awaiting }` in the context, callbacks `split_who:<item>:mine|<claimerId>|else|all|w<N>|noways|clear|back|close`): every claim change goes through `mutateClaims` (read, `applyClaim`, conditional write with `ifRev`, retry) so taps, menu choices and typed replies are all kept; typed names go through `resolveTyped` (people without a Telegram id get negative ids, matched by name or @username, merged into the real claimer when they tap), and `ways[item] = N` makes `assignmentFromClaims` expand the item into N share lines (`shareItems`) that the unclaimed-items choice and `shareReceipt` work on. Early QRs: `split_claim:qr` (`qrTap`) fixes `served[memberId]` (cents from `memberAmount`: items split between holders or one N-way share, plus extras floored against the receipt's item total) in the same conditional write that reads the claims, then `deliverEarly` sends the QR by direct message or creates a waiting claim and answers the callback with a `t.me/<bot>?start=claim_<token>` url; a failed delivery rolls `served` back. `applyClaim` refuses every change to an item with a served holder; Done passes `lockedPeople(c)` to `shareReceipt` (floors only, the cents to the unlocked), `toEntries` (marks `sent`) and `applyUnassigned` (no share for locked people), and `finish` skips `sent` entries.

The payee and step `PAYEE_ME` come first in `nextNeed` (every command starts at `PAYEE`; `/split_receipt` leaves `entry: 'receipt'` so the photo step follows them); `PAYEE_ME` asks whether the payee is the organiser and stores `payeeIsMe` (cleared whenever the payee changes). With `payeeIsMe === false` the organiser's own amount (the left-out remainder, which for a receipt is the `me` shares) is added in `finish` as a person with the sender's user id, so `deliverMentioned` sends it by direct message or as a Get my QR claim with an empty organiser name, which makes the caption read "Your share: …"; an equal split needs no extra QR, only different summary wording.

### Simple_PayNow_Bot (src/simple-bot.ts)

A second, independent bot in the same Worker on `POST /webhook/simple` (own token and secret; 404 until configured). `SimpleCommandHandler` runs payee → amount → (payer may change the amount?) → description → confirmation summary (Confirm / Cancel) in the chat's Durable Object under key `simple-<id>` (flow `simple`, so it never mixes with the event bot's `chat-<id>`), then, on Confirm, claims the state (exactly once, which also wipes it), builds the payload with `buildPayNowPayload` and sends the QR. It stores no payee, amount, description or identity and logs no answers; after the QR is sent it adds anonymous daily counts to D1 (`usage_counters(day, metric, count)`: `simple_qr` plus one of `simple_amount_skipped|fixed|editable`, upserted atomically, best effort, by Singapore day) that feed `/stats`. Private chats only, payee number never printed on the image or caption.

### Usage stats (`/stats`)

A hidden command in Event PayNow Bot, answered only in private chats and only for Telegram ids in the `STATS_USER_IDS` secret (comma-separated, parsed by `parseUserIds`; nobody when unset). `D1UsageRepository.snapshot()` runs a few aggregate queries in one batch over `events`, `payments`, `paybacks` and `usage_counters` and `formatStats()` renders a numbers-only text report (no names, PayNow numbers or references).

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
- Optionally collects an event website link (text or Skip; http/https only, validated by `normalizeWebsiteUrl`), stored as `events.website_url` (migration `0001_event_website`) and shown on the admin and payment pages
- Echoes name + payee (+ default amount, website) for confirmation via inline Confirm/Cancel buttons
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

**`/edit_event` handler** (`src/commands/edit-event-handler.ts`): flow `edit` (pick event, pick field, type value). Admin check at start and before the write; one guarded `updateEvent` (open events only); the reply lists the final name, payee, default amount and website (Website is a fourth field, with Clear). Payments keep the payee/description they were created with.

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
- The landing page and `/pay/<ref>` add Open Graph and Twitter card tags (`socialMeta()`; absolute URLs from the request origin; image `/explainer-poster.jpg`; for `/pay/<ref>` the route reads the event with `getEventByRef` inside a try/catch and names it, escaped, when it is open). Every HTML page ends with the same attribution footer (`FOOTER_HTML` / `FOOTER_CSS` in `src/web/page.ts`: two plain links, no requests on load). `GET /` serves the public landing page (`renderLandingPage`: what the bot does, a `t.me/<BOT_USERNAME>` button and a click-to-play YouTube card that loads the `youtube-nocookie.com` player only after a click; no session, no database); `GET /events/:ref` serves an HTML shell (data is written with `textContent`); `GET /api/events/:ref` returns JSON; `GET /api/login` is the Telegram Login Widget redirect target - `/split` is a static public page for the Split PayNow Bot (`renderSplitLandingPage`, same shell and footer as the home page, no third-party requests); `handleWeb` serves it only when `SPLIT_BOT_USERNAME` is set and `renderLandingPage` links to it only then.
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
- CHECK constraints enforce valid states; widening one means rebuilding the table (the original migrations 0003 and 0004 did this for `paybacks` and `payments`; the history is now one baseline, `0000_initial_schema.sql`, which must never be renamed)

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
  checked_in_at TEXT,       -- door check-in: once per payment, by an admin (added by an early migration, now in the baseline)
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
