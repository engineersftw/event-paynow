# Tasks

## 1. Project and platform scaffolding

- [x] 1.1 Create the TypeScript Worker project (src layout, strict tsconfig, ESLint, vitest workspace with both a Node pool for runtime-agnostic core and a `vitest-pool-workers` pool for Worker-runtime tests, `wrangler.toml` with D1 binding and DO binding stubs, `drizzle.config.ts` pointing at the D1 dialect) and add dependencies — runtime: `grammY`, `qrcode`, `drizzle-orm`, `zod`; dev: `drizzle-kit`, `wrangler`, `jsqr` — verify `npm run build`, `npm test` (both pools, empty skeleton) and `wrangler dev` all succeed; document the two-pool setup and update-fixture replay workflow in `docs/testing.md` and verify the documented commands run as written
- [x] 1.2 Implement the webhook `fetch` entrypoint with grammY: validate `X-Telegram-Bot-Api-Secret-Token`, store the token via `wrangler secret put`, and register the webhook with `setWebhook` — verify with update-fixture replay against `wrangler dev` (`curl` POST with and without the secret header: dev-bot echo update round-trips; unsigned request rejected 403) plus a `vitest-pool-workers` test asserting the same 403 path
- [ ] 1.3 Register the command list (`/init`, `/start`, `/payments`, `/payback`, `/cancel`) with BotFather and provision the D1 database (`wrangler d1 create`) — verify the commands appear in the bot's Telegram menu and `wrangler d1 migrations list` runs against the new DB
- [ ] 1.4 Document the Workers topology (webhook entry, D1, per-chat DO, wrangler commands) in `docs/architecture.md` — verify a reviewer can name each component, its storage role, and the deploy command from the doc alone

## 2. SGQR payload and QR rendering core (runtime-agnostic)

- [x] 2.1 Implement the TLV field encoder and CRC16-CCITT checksum (computed over payload including the trailing `6304`, uppercase hex output) with unit tests covering quoting edge cases and a known SGQR-spec example payload verifying the checksum — tests pass via `npm test`
- [x] 2.2 Implement the PayNow merchant-account template builder (tags 00/01/26/52/53/54/58/59/60/62/63 per the design table) with unit tests asserting field values for mobile and UEN proxies, fixed-amount flag `03=0`, embedded `05` reference, and 25-ANS truncation of description and merchant name
- [x] 2.3 Enforce amount handling in integer cents (positive, ≤ 2 decimals parse; 2-decimal string into tag 54) with unit tests for `12.50`, `0.05`, rejected `12.505` and negative/empty inputs
- [x] 2.4 Implement QR PNG rendering from a payload string with the pure-JS `qrcode` path (error correction M, module scale 8–12, no Node APIs) and verify by (a) rendering to a PNG and decoding it back with `jsqr` in a Node-pool test — decoded string must equal the payload — and (b) a `vitest-pool-workers` test rendering the golden payload inside the Workers runtime to confirm isolate compatibility and CPU time well within limits

## 3. D1 storage and shared services

- [x] 3.1 Define the Drizzle table schema for `users`, `payments`, `paybacks` per design §5 (status CHECK constraints, unique `ref`, `source` column), generate numbered SQL migrations with `drizzle-kit generate`, and apply via `wrangler d1 migrations apply` — verify generated SQL matches the design table-by-table, `wrangler d1 migrations apply` succeeds twice (idempotent), and `.schema` output in local dev matches
- [x] 3.2 Implement the async repository layer over Drizzle (`drizzle-orm/d1`) behind infra-neutral interfaces (users upsert/get; payments create/get-by-ref/list-by-user/update-status; paybacks create/list-by-payment/sum-active; no Drizzle types in service-layer signatures) with `vitest-pool-workers` tests against a real local D1 binding seeded by migrations, including cross-user isolation (user A cannot read user B's rows) and read-back-after-write consistency checks
- [x] 3.3 Implement proxy validation/normalization (mobile → `+65XXXXXXXX` with 6/8/9 prefix; UEN length/charset rule) and the 10-char base32 `ref` generator using `crypto.getRandomValues`, with unit tests for accepted, rejected, and normalized forms
- [x] 3.4 Implement `markPaymentReceived(ref, source)` as the single entry point for payment status transitions, recording `source` — unit tests covering pending→received, duplicate rejection, and unknown-ref rejection
- [x] 3.5 Implement the per-chat Durable Object: conversation FSM state as a zod-schema'd JSON object behind one typed serializer class (`state.storage.put/get`, design §2), 10-minute idle expiry via `state.storage.setAlarm`, get-or-create routing from the webhook handler — verify with `vitest-pool-workers` DO tests (real local DO bindings) that state survives instance eviction (harness fetch cycle), the serializer rejects schema-violating stored blobs (test with corrupted state), the alarm clears conversation state (`waitAlarms`), and concurrent updates to one chat serialize through the DO

## 4. Payee configuration (/init)

- [x] 4.1 Implement the `/init` conversation on the DO-hosted state machine: prompt for reference, validate via 3.3, echo the normalized value for confirmation, then persist to `users` — verify with conversation tests covering mobile, UEN, invalid-input re-prompt, and confirmation-before-save behavior
- [ ] 4.2 Implement reference update on re-run (`/init` again replaces the stored value; cancel/alarm expiry leaves the old reference intact) and verify by test that canceling after a new input preserves the previous stored value

## 5. Payment issuance and sharing (/start)

- [ ] 5.1 Implement the `/start` conversation guard: unconfigured users are prompted to run `/init` and no QR is generated — verify with a conversation test for the unconfigured path
- [ ] 5.2 Implement description and amount collection with validation; `/cancel` and alarm expiry create no record — verify conversation tests for success, invalid amount re-prompt, cancel, and idle expiry
- [ ] 5.3 On completion, create the payment record (status `pending`, embedded unique `ref`, payee snapshot), build the payload via 2.2, render PNG via 2.4, and `sendPhoto` a `FormData`/`Blob` upload with caption `description / SGD amount / ref / "Forward this message to share"` — verify in two stages: (a) `vitest-pool-workers` integration test with grammY's custom `fetch` stub capturing the outbound `sendPhoto` — assert PNG bytes decode via 2.4's `jsqr` path, caption contents, and the DB row; (b) one live check behind a `cloudflared` tunnel with `setWebhook` on the dev bot confirming the photo arrives in Telegram; if FormData upload fails under isolates, implement the design's one-time-token URL fallback and update this task's verification
- [ ] 5.4 Verify the payee snapshot is immutable: update `/init` afterward and confirm the stored `qr_payload` and payment row are unchanged (test)

## 6. Payment tracking (/payments)

- [ ] 6.1 Implement `/payments` listing with per-payment inline buttons (View, Mark as received, Payback) showing status, description, amount, and date — verify with handler tests asserting only the requesting user's rows appear
- [ ] 6.2 Wire the "Mark as received" button to `markPaymentReceived(ref, "manual")` with an ownership check routed through the owning chat's DO for serialization — verify tests for own payment, another user's payment id (rejected), and duplicate tap (already-received message, no change)
- [ ] 6.3 Implement payment detail view (status, created/received timestamps, `source`, payback summary) and verify via handler test on a fixture payment

## 7. Payback generation (/payback)

- [ ] 7.1 Implement the `/payback <ref-or-id>` conversation: prompt for payer proxy (validate via 3.3), echo for confirmation, prompt for amount defaulting to original — verify conversation tests for mobile and UEN payers and invalid-proxy re-prompt
- [ ] 7.2 Enforce payback bounds inside a D1 batch with the design's in-transaction re-check of `SUM(active paybacks)` — verify tests for exact, partial, second-partial, and blocked-over cases matching the spec scenarios (5+3 of 12.50, remaining 4.50) plus, in `vitest-pool-workers`, two concurrent payback requests routed through the chat DO asserted to serialize so the sum never exceeds the original
- [ ] 7.3 Generate the payback QR using the 2.2 builder with the PAYER as payee proxy and payback `ref`, store the `paybacks` row (`pending`), and `sendPhoto` with caption — verify integration test round-tripping the payload as in 5.3
- [ ] 7.4 Implement "Mark payback as sent" button and payback history rendering in payment detail — verify tests for transition, timestamp, and updated remaining total

## 8. Integration, scan validation, and operations

- [ ] 8.1 Run an end-to-end manual pass on the deployed dev Worker: `/init` → `/start` → forward to a second chat → `/payments` → mark received → `/payback` → mark sent, exercising two distinct users to confirm isolation and confirming conversation survives a mid-flow `wrangler deploy` (per DO design); record results in `docs/verification.md`
- [ ] 8.2 Scan-test generated fixed-amount QRs (mobile proxy and UEN proxy, with and without 25-char-truncated descriptions) against DBS/POSB, OCBC, and UOB apps; confirm payee, amount lock, and reference display — record outcomes in `docs/verification.md`; if a bank edits the amount, flip `26.03` to editable per the design fallback and update 2.2's tests
- [ ] 8.3 Finalize the deploy pipeline: `wrangler.toml` production vars, D1 migrations wired into deploy notes, `setWebhook` bootstrap script, Workers Versions rollback procedure, README quick-start (BotFather setup, secrets, deploy commands) — verify a fresh clone + documented steps deploys to a second dev bot end-to-end
