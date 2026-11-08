# Design

## Context

The page (`src/web/handler.ts`) is one catch-all Pages Function: session cookie (`verifySession`), live chat-admin check (`canViewChat`, to become `isChatAdmin`), `GET /api/events/:ref` returning payments with net/paid-back figures, and a static HTML shell. The bot creates paybacks in `PaybackCommandHandler.createPaybackRecord`: `generateRef`, `buildPayNowPayload` (payer as payee proxy, description `Refund <ref>`), `createPaybackBounded` (transactional bound), then renders and sends the QR. Sent/cancel are pending-only compare-and-set updates (`updatePaybackStatus`). The renderer `renderQrPng(payload, lines)` is pure JS and already used by the Worker, but despite its name it returns a **BMP** (what Telegram receives). In the bot, ownership is enforced by two `payment.userId !== userId` checks (`PaymentCallbackHandler`, `PaybackCommandHandler`); `/payments` lists only the caller's payments; no table records who performed an action.

## Goals / Non-Goals

**Goals:**
- Same payback rules and concurrency guarantees as the bot, with one implementation of the payload/record logic.
- Safe state-changing endpoints on a cookie-authenticated page.

**Non-Goals:**
- Creating, receiving or voiding payments from the web; payback editing; bulk actions; new tables.
- Displaying audit data (it is stored for queries only), timestamps for void/cancel, and notifying a payment's owner when an admin acts on it.

## Decisions

1. **Shared helper `createPaybackFor(repo, payment, recipient, amountCents)`** in `src/db/payback-service.ts`: generates the ref, builds the payload, calls `createPaybackBounded`, returns the repository result. The bot handler and the web handler both call it; the bot keeps its conversation, messages and photo upload. Alternative: duplicate ~15 lines in the web — rejected, the payload shape (payer as payee, `Refund` description) must not drift.
2. **Routes** (all after: valid session → event exists → live admin check; `eventAccess()` factors this out of `eventData`):
   - `POST /api/events/:ref/payments/:paymentRef/paybacks` `{amount, recipient?}` → 201 `{payback}` | 400 (invalid amount/recipient, missing recipient) | 404 (payment not in this event) | 409 (not received / over bound, with `remainingCents`).
   - `GET /api/events/:ref/paybacks/:paybackRef/qr` → `image/png`: the BMP from `renderQrPng(qrPayload, lines)` converted by `bmpToPng` (decision 3); 404 unless the payback's payment belongs to the event. Lines: `Payback for <payment ref>`, `SGD <amt>`, payback ref, `To: <name>` when the recipient is the stored payer (`recipientName`).
   - `POST /api/events/:ref/paybacks/:paybackRef/sent` and `/cancel` → pending-only CAS via `updatePaybackStatus`; 409 `{status}` when it is no longer pending.
3. **PNG for the browser, BMP stays for Telegram.** A small pure-JS `bmpToPng(bmp)` (`src/sgqr/png.ts`) turns the 24-bit top-down BMP into a PNG: IHDR + one IDAT (rows with filter byte 0, deflated with the platform `CompressionStream('deflate')`, available in Workers and Node) + IEND, with a CRC-32 per chunk. It also makes the image much smaller than the raw BMP. Alternatives: encode PNG inside the renderer (changes a function the bot depends on), stored-only deflate (large files), a PNG library (new dependency for ~40 lines).
4. **CSRF protection**: cookie stays `SameSite=Lax` (not sent on cross-site POSTs) and every POST additionally requires an `Origin` header equal to the request's own origin and `Content-Type: application/json`; otherwise 403. No CSRF token table. Alternative: tokens — more state for no extra protection here.
5. **Recipient handling mirrors the bot**: `detectProxyType` / `normalizeMobile` / UEN validation from `proxy-validation.ts`; default is the payment's stored payer (never sent to the browser — the server resolves it), required when none is stored.
6. **Amount parsing** with `parseAmount` (integer cents, ≤ 2 decimals); the bound is enforced by `createPaybackBounded`, with a pre-check only for a friendlier message.
7. **API payload** gains per payment: `paybacks` (`ref`, `amountCents`, `status`, `recipientName` or null, `createdAt`, `sentAt`) and `remainingCents` (pending + sent against the amount) so the page can show or hide **Pay back** and default the amount. No PayNow numbers in JSON.
8. **Page UI**: still plain HTML, DOM-built with `textContent`. A received payment with `remainingCents > 0` gets a Pay back form (amount prefilled, optional recipient input); each payback row shows status and, while pending, **Sent** / **Cancel** buttons and the QR image (`<img src=".../qr">`). After any action the page re-fetches the event data. Buttons disable while a request is in flight.
9. **Spec shape**: the read-only requirement is renamed (`... read only` → `...`) and its "Read only" scenario narrowed to "no actions that create, receive or void a payment"; payback behaviour is new requirements (create, validation and bound, QR image, sent/cancel, access).

10. **Audit columns, no new table.** `payments.received_by`, `payments.voided_by`, `paybacks.created_by`, `paybacks.sent_by`, `paybacks.cancelled_by` are nullable INTEGER Telegram ids, added by `drizzle-kit generate` as plain `ALTER TABLE ... ADD COLUMN` (migration `0005`; no table rebuild, no backfill, old rows stay null). Repository methods take an optional acting user id (`updatePaymentStatus`, `voidPayment`, `updatePaybackStatus`) and `createPaybackBounded` input gains `createdBy`; the id is written in the same `UPDATE ... WHERE status = 'pending'` as the transition, so a lost race records nothing. Domain types gain the fields. The bot passes `ctx.from.id`, the web passes the session user id. Alternative: an `audit_log` table (richer, timestamps, but more machinery than "an audit column").
11. **Bot authorisation.** A `canActOnPayment(payment, userId)` helper (`src/commands/payment-access.ts`): the owner is allowed without a network call; otherwise a payment with no `eventId` is denied; otherwise it loads the event (new `EventRepository.getEventById`) and calls `isChatAdmin(event.chatId, userId)`. The chat-admin check moves from `src/web/access.ts` to `src/access/chat-admin.ts` (renamed `isChatAdmin`; the web imports it from there) and is injected by `createBot` (bot token from env) into `PaymentCallbackHandler`, `PaybackCommandHandler` and `PaymentsCommandHandler`, replacing their two `payment.userId !== userId` checks. The check always targets the event's chat, not the chat the tap came from.
12. **`/payments` for admins.** The drill-down calls `isChatAdmin` once; admins get `listPaymentsByEvent(event.id)`, everyone else the existing own-payments filter. The top-level event list is already chat-wide.

13. **Migrations in the deploy workflow.** `deploy.yml`'s change detection gets a third output, `migrate`, true when any file under `drizzle/` changed (or on a manual run). A `migrate` job (`needs: changes`, `if: migrate == 'true'`) runs `npx wrangler d1 migrations apply paynow-db --remote` with the same Cloudflare secrets; the `worker` and `pages` jobs now `needs: [changes, migrate]` with `if: ${{ !cancelled() && !failure() && needs.changes.outputs.<x> == 'true' }}`, so they still run when `migrate` is skipped but are skipped when it fails. Pages waits too, since it reads the same database. The existing `concurrency` group already serialises runs. Wrangler tracks applied migrations in D1's `d1_migrations` table, so re-running is idempotent. A manual run applies anything pending. Alternative: run the migration inside the Worker job — rejected, it would couple the two and could not gate Pages.

## Risks / Trade-offs

- [Admins can now void or receive other users' payments in the bot, and pay back any payment on the web] → chosen explicitly; mitigated by live admin checks and the new audit columns.
- [Migration order] → the `migrate` job gates both deploys, so `0005` lands before code that writes the new columns; a failed migration stops the deploys instead of shipping code against the old schema.
- [Only backward-compatible migrations are safe to automate] → the old code keeps serving during the window between migrate and deploy, so a destructive migration (drop/rename) would break it; such changes need a manual, staged rollout. `0005` only adds nullable columns.
- [The first automated run could re-apply an untracked migration] → before merging, run `npx wrangler d1 migrations list paynow-db --remote` and confirm only `0005` is pending.
- [A Telegram API call per non-owner action] → owners short-circuit with no call; a failed call denies access.
- [Cookie-authenticated writes] → Lax cookie + same-origin check + JSON content type + live admin check per request.
- [The QR image carries the recipient's number] → inherent to a payable QR; only served to authorised admins, `Cache-Control: no-store`.
- [Refactoring the bot handler touches working code] → existing bot payback tests must pass unchanged; the helper is a pure extraction.
- [Double submit] → bounded insert makes a second identical request fail the bound or create a second payback only if room remains; the UI disables the button, and pending paybacks are cancellable.
- [Hand-rolled PNG encoder] → tiny (IHDR/IDAT/IEND + CRC-32) and verified by decoding with `pngjs` and jsQR in tests; `CompressionStream` is a platform API in Workers and Node.

## Migration Plan

1. Check `wrangler d1 migrations list paynow-db --remote` shows only `0005` pending.
2. Merge: the updated deploy workflow applies `0005`, then deploys the Worker and the Pages app (the workflow file of the merged commit is the one that runs).
3. Roll back by reverting the merge; the extra columns can stay.
