# Design

## Context

Greenfield project: no existing code, services, or specs. See `proposal.md` — Why — for motivation. Hosting target is **Cloudflare Workers** (decided during planning): the bot runs as a Worker with D1 for storage and Durable Objects for conversation state. Constraints that shape the approach:

- The QR must be scannable by Singapore bank apps, i.e. an EMVCo Merchant-Presented Mode TLV payload with the PayNow merchant-account template (`SG.PAYNOW`) and a correct CRC16-CCITT checksum (SGQR ⊇ PayNow ⊂ EMVCo).
- Telegram bots cannot open the client's forward dialog programmatically; the Bot API's native sharing path for a bot-sent photo is the user forwarding the message.
- No PayNow notification/bank API is available to this system in v1; receipt is manual but records must be correlatable later (webhook-ready). The Workers hosting already provides public HTTPS endpoints, so future webhook ingress costs nothing structurally.
- Workers are V8 isolates, not Node: no persistent process, no shared memory across requests, no local filesystem. All state lives in D1 or Durable Objects; code must avoid Node-only APIs.

## Goals / Non-Goals

**Goals:**
- A single deployable Worker handling all Telegram interaction, QR generation, and persistence.
- Correct, bank-scan-testable SGQR PayNow payloads for collections and paybacks.
- Per-user data isolation with a stable payment reference embedded in the QR for future automated reconciliation.
- A receipt-update seam that a future bank-notification webhook can plug into without schema changes.
- Conversation state that survives cold starts and deploys.

**Non-Goals:**
- No bank/PSP integration, no automatic receipt detection in v1 (transport exists; logic deferred).
- No web dashboard, no multi-device sync beyond Telegram itself, no currency other than SGD.
- No cryptographic signing of payloads (SGQR does not define any) and no fraud checks on proxies (format validation only — the bot cannot verify that a mobile/UEN is registered).

## Decisions

### 1. Stack: TypeScript Worker with grammY, `qrcode`, D1, Durable Objects, wrangler
- **grammY** via its Cloudflare Workers integration, served as a webhook `fetch` handler (`@grammy/adapter-cloudflare-workers`-style). Telegram pushes updates to the Worker URL; the handler validates the `X-Telegram-Bot-Api-Secret-Token` header set via `setWebhook`. Alternative considered: long polling in Cloudflare Containers — rejected; it keeps an always-on process for no benefit once D1/DO are required anyway.
- **`qrcode`** (pure-JS PNG path, `renderer: 'png'` → `Uint8Array`) rendered in the Worker itself — no native deps, so it runs in the isolate. Sent with `bot.api.sendMessage`/`sendPhoto` using a `FormData` + `Blob` upload (supported on Workers; verified by task 5.3's integration test). Alternatives: canvas-based renderers (unavailable in isolates); external QR microservice (unnecessary infra).
- **D1** for durable records — Cloudflare's serverless SQLite, schema-compatible with the design in §5, reached via an async binding. Alternative: Hyperdrive→Postgres (overkill); KV/DO storage for records (wrong tool for relational queries and reporting).
- **Drizzle ORM** over the D1 binding for all SQL: typed schema (`drizzle-orm/sqlite-core`) mirroring §5, queries typed, and `drizzle-kit generate` emitting the plain-SQL migration files that `wrangler d1 migrations apply` applies — migration artifacts stay reviewable SQL, not ORM-locked. Drizzle runs unmodified inside `vitest-pool-workers` against the same local D1 binding. Services depend on the repository interfaces, never on Drizzle types leaking outward, preserving the D1→Postgres(Hyperdrive) escape hatch. Alternatives: Prisma (query engine problematic on isolates — rejected); Kysely (typed builder, weaker migration tooling — fallback if Drizzle friction appears); TypeORM/Sequelize (Node-oriented, wrong runtime).
- **Wrangler** for config, migrations, secrets (`wrangler secret put TELEGRAM_BOT_TOKEN`), deploys, and Versions for rollback.

### 2. Durable Object per chat owns conversation state
One DO instance keyed by chat ID holds the active conversation FSM (`/init`, `/start`, `/payback` steps) with state persisted through DO storage, so restarts, cold starts, and deploys no longer lose an in-flight conversation. The 10-minute idle expiry uses DO **alarms** (`state.storage.setAlarm`), reliable across isolate churn. `/cancel` and alarm firing end the conversation without writing records, matching the specs' abandonment behavior.
- Alternative: grammY conversation plugin with a custom session adapter over `c.env` KV — rejected: KV is eventually consistent across edges and races with rapid button taps; DOs give read-modify-write serialization per chat.
- Trade-off accepted: DO state must be JSON-serializable; large payloads (QR PNGs) stay out of state — regenerate from the stored payload string if needed.
- **No ORM for DO state — thin typed serializer instead**: a zod-schema'd FSM state object with `state.storage.put/get` behind one serializer class. Libraries atop DOs (e.g. the `agent` framework) bring chat/session machinery heavier than our FSM. If state ever moves to D1/KV, only that class changes.

### 3. SGQR payload builder is hand-rolled, runtime-agnostic
A small `sgqr` module (no Node APIs — runs identically in vitest and in the isolate) builds TLV fields and the CRC16 (computed over the payload string including the trailing `6304`, appended uppercase 4-hex). Both payment and payback QRs use the same builder with different payee proxies. Field mapping:

| Tag | Value |
|---|---|
| 00 | `01` payload format indicator |
| 01 | `12` point of initiation: dynamic (one transaction) |
| 26 | nested PayNow template: `00=SG.PAYNOW`, `01` proxy type (`0` mobile, `2` UEN), `02` proxy value, `03=0` (amount not editable), `05` = payment/payback reference |
| 52 | `0000` (placeholder MCC — no registered merchant category) |
| 53 | `702` (SGD) |
| 54 | amount, decimal string (e.g. `12.50`) |
| 58 | `SG` |
| 59 | display name (sanitized ANS, max 25 bytes; defaults to `PAYNOW USER` — see Open Questions) |
| 60 | `Singapore` |
| 62 | `01` = description truncated to 25 ANS chars (bill-number slot) |
| 63 | CRC16 |

The full untruncated description lives in the message caption and D1, satisfying the spec's "truncated or reference-based encoding" behavior. Amounts are stored and computed as integer cents. Alternative: existing PayNow-QR libraries — rejected: thin, unevenly maintained, several depend on Node APIs the isolate lacks.

### 4. Proxy validation is format-only
Mobile: normalize to `+65XXXXXXXX` (accept 8-digit local starting 6/8/9). UEN: 9–13 alphanumeric with the classic `S########X` / new 10-char and 13-char GST/UEN shapes accepted by length-and-charset rule. No check-digit enforcement (check digits differ across UEN series; false rejections are worse than lenient acceptance, since the bank app itself will reject a dead proxy at scan time).

### 5. Data model (D1)
```sql
users(telegram_id INTEGER PRIMARY KEY, payee_type TEXT CHECK(mobile|uen), payee_value TEXT, display_name TEXT, created_at TEXT, updated_at TEXT)
payments(id INTEGER PRIMARY KEY, ref TEXT UNIQUE, user_id INTEGER, description TEXT, amount_cents INTEGER,
         payee_type TEXT, payee_value TEXT, status TEXT CHECK(pending|received), source TEXT,
         qr_payload TEXT, created_at TEXT, received_at TEXT NULL)
paybacks(id INTEGER PRIMARY KEY, ref TEXT UNIQUE, payment_id INTEGER, payer_type TEXT, payer_value TEXT,
         amount_cents INTEGER, status TEXT CHECK(pending|sent), qr_payload TEXT, created_at TEXT, sent_at TEXT NULL)
```
Schema defined as Drizzle tables (§1); `drizzle-kit generate` produces numbered SQL migrations applied via `wrangler d1 migrations apply` (dev and prod paths identical). `ref` is a short unique token (10-char base32 from `crypto.getRandomValues`) generated at QR creation and embedded in tag `26.05`; immutable, the correlation key a future bank notification would carry. Payback bounding — `SUM(active paybacks) <= payment.amount_cents` — runs inside a D1 **batch** (transaction) issued through the owning chat's DO, which serializes concurrent writes per chat; cross-chat races on the same payment are closed by a compare-and-set re-check of the sum inside the transaction.

### 6. Receipt seam
All status transitions go through one internal service function: `markPaymentReceived(ref, source)`. v1 only ever passes `source = "manual"`. The future bank-notification webhook is a new route on the **same Worker** (it already terminates public HTTPS) calling the same function with `source = "notification"` — no new component.

### 7. Share = native Telegram forwarding, with guidance
The QR photo message is the share object: the user long-presses → Forward → picks any chat. The caption ends with a "Forward this message to share" hint. Chosen over `switch_inline_query` chat-picking because inline results need a publicly fetchable image URL (embedding the bot token in file URLs — unacceptable, and Worker-served public QR images would leak payment references) — added risk for no gain over native forward.

### 8. Local testing strategy
Testing is layered so that only the top layer needs infrastructure:

1. **Pure unit tests (Node vitest)** — the runtime-agnostic core (sgqr TLV/CRC16, proxy validation, cents parsing, `ref` generation) runs in plain vitest. Golden-file checks: assert exact payload strings against known SGQR-spec examples; render PNG with `qrcode` and decode it back with `jsqr`, asserting round-trip equality.
2. **Workers-runtime tests (`vitest-pool-workers`)** — official Cloudflare vitest pool executing tests inside the Workers runtime, giving handlers real local bindings: seeded D1 (Drizzle riding the same binding), Durable Objects with working alarms, and real `FormData`/`Blob` code paths. Home for repo-layer isolation tests, the chat-DO conversation FSM, alarm expiry, DO eviction simulation (harness fetch cycle), and the payback-transaction concurrency check.
3. **Telegram updates without infrastructure** — update fixtures replayed with `curl -X POST http://localhost:8787 -H "X-Telegram-Bot-Api-Secret-Token: dev" -d @fixtures/<flow>.json` against `wrangler dev`; outbound Bot API calls asserted through grammY's custom `fetch` stub (captured `sendPhoto` bytes, captions, buttons). For real end-to-end moments (live photo upload, callback-button taps), a `cloudflared` tunnel fronts `wrangler dev` and `setWebhook` points at it for a dev bot. Optionally, a local long-polling script runs the same update handlers against the dev token with no tunnel during early development.
4. **Bank scan validation (not locally emulatable)** — CI can only verify payload/PNG correctness (layer 1); confirmation that DBS/POSB/OCBC/UOB accept fixed-amount mobile-proxy QRs happens in the task 8.2 manual matrix, strongest check being a self-proxy S$0.10 live payment.

## Risks / Trade-offs

- [Fixed-amount dynamic QRs for mobile proxies may be rejected or made editable by some bank apps] → Before release, scan-test generated QRs against at least DBS/POSB, OCBC, and a non-bank PayNow app; amount is verified at marking-received time regardless. Fallback knob: flip `26.03` to editable and enforce amount via caption + manual check.
- [Format-only proxy validation lets typos through (a wrong digit = money to a stranger)] → Confirmation step in every conversation echoes the normalized proxy before QR issuance; caption repeats the payee so the sharer can sanity-check.
- [Placeholder MCC `0000` and informal merchant name may be declined by stricter bank parsers] → Mitigated by the same scan-test matrix; display-name config (Open Questions) keeps this adjustable without schema change.
- [Description truncated into a 25-char ANS QR field] → Full text always in caption and D1; spec scenario explicitly covers this.
- [D1 is eventually consistent for reads following writes outside a transaction] → Writes that are immediately read back (record create → caption/list) go through D1's read-your-writes session affinity or re-derive the response from the data just written, never a follow-up SELECT assumption. Verified in integration task 8.1.
- [D1 latency (HTTP round-trip per statement) vs embedded SQLite] → Acceptable for chat-paced traffic; batches minimize round-trips; no high-QPS paths exist by design.
- [D1 5 GB / DO storage limits] → Generous for text+payload rows; QR images are re-renderable from `qr_payload` and never stored.
- [Workers CPU limit on PNG rendering for large payloads] → Module scale kept modest (≤ 12); render cost is single-digit ms at these payload sizes; verified in task 2.4.
- [grammY FormData photo upload under isolates has had edge cases] → Pinned early verification task (5.3) exercises the real Bot API from `wrangler dev`; if blocked, fall back to URL-based upload via a Worker route that serves the PNG with a one-time token.
- [Manual receipt can be marked without money actually arriving] → Accepted for v1 by design; records keep `source` so future notification-based receipts are distinguishable.

## Migration Plan

Provisioning (one-time): `wrangler d1 create`, apply migrations, `wrangler secret put`, set Telegram commands via BotFather, `setWebhook` with secret token to the Worker URL. Deploy via `wrangler deploy`; rollback via Workers Versions (traffic shift). Dev loop: `wrangler dev` + `vitest-pool-workers` (see Local testing strategy). Local SQLite files are never part of the deployed system.

## Open Questions

- Where the tag-59 merchant display name comes from (reuse Telegram first name automatically, or add an extra `/init` step) — adjustable in the payload builder without touching specs; default to `PAYNOW USER` for v1.
- Expiry dates (tag `26.04`) and QR TTL behavior — deferred; v1 payments don't expire.
