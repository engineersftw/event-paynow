# Tasks

## 1. Audit columns

- [x] 1.1 Add `received_by`, `voided_by` (payments) and `created_by`, `sent_by`, `cancelled_by` (paybacks) as nullable INTEGER columns in `src/db/schema.ts`, generate migration `0005` with `drizzle-kit generate`, and mirror them in `test/workers/harness.ts` and the hand-written test schemas; verify with a migration test that existing rows survive with null actors.
- [x] 1.2 Add optional acting-user parameters to `updatePaymentStatus`, `voidPayment`, `updatePaybackStatus` and `createdBy` to `createPaybackBounded`, written in the same pending-only UPDATE/INSERT, and extend the `Payment`/`Payback` types; verify with workers tests that each action records its actor, a lost Received-vs-Void or Sent-vs-Cancel race records only the winner, and omitting the actor leaves null.

## 2. Shared logic

- [x] 2.1 Add `src/db/payback-service.ts` (`createPaybackFor`: ref, payload with the payer as payee and `Refund <ref>` description, `createPaybackBounded`) and switch `PaybackCommandHandler.createPaybackRecord` to it; verify the existing payback handler and bounds tests pass unchanged and a new node test checks the payload and result passthrough.
- [x] 2.2 Move the chat-admin check from `src/web/access.ts` to `src/access/chat-admin.ts` as `isChatAdmin` and update the web import; verify the existing admin-check tests pass against the new path.
- [x] 2.3 Add `src/sgqr/png.ts` with `bmpToPng(bmp)` (24-bit top-down BMP → PNG using `CompressionStream('deflate')` and CRC-32 chunks); verify with a node test that `pngjs` decodes the output to the same pixels as the BMP, jsQR still decodes the QR payload, and the PNG is smaller than the BMP.

## 3. Bot: admins can act on any payment

- [x] 3.1 Add `EventRepository.getEventById` and `canActOnPayment(payment, userId)` (owner → allowed without a call; no event → denied; else `isChatAdmin(event.chatId, userId)`, denying on failure) in `src/commands/payment-access.ts`; verify with node tests for owner, admin, ordinary member, event-less payment and a failing check.
- [x] 3.2 Inject `isChatAdmin` from `createBot` and replace the two `payment.userId !== userId` checks in `PaymentCallbackHandler` and `PaybackCommandHandler`; pass `ctx.from.id` as the actor for received, void, payback creation, sent and cancel; verify with handler tests that an admin can run each action on another user's payment, a member is refused with the existing message, and the actor is recorded.
- [x] 3.3 `/payments` drill-down: admins get `listPaymentsByEvent`, others keep their own payments; verify with node tests for both and with a bot-wiring test using a stubbed Telegram client.

## 4. Web admin payback

- [x] 4.1 Factor `eventAccess()` (session → event → live admin check) out of `src/web/handler.ts` and add the same-origin + JSON content-type guard for POSTs; verify with workers tests: no session 401, non-admin 403, cross-origin 403, wrong content type 403, nothing recorded in each case.
- [x] 4.2 `POST /api/events/:ref/payments/:paymentRef/paybacks`: validate amount and recipient (stored payer default, required when none), payment in event and received, bounded create via `createPaybackFor` with the session user as `createdBy`; verify with workers tests for success, different recipient, no stored payer, invalid inputs, over bound (409 with remaining), pending/voided payment, payment of another event, and a concurrent pair exceeding the bound.
- [x] 4.3 `GET /api/events/:ref/paybacks/:paybackRef/qr` (PNG via `bmpToPng`, detail lines, names only) and 404 for another event's payback; verify the response is `image/png` that decodes (jsQR) to the stored payload and no number appears in the image text lines.
- [x] 4.4 `POST /api/events/:ref/paybacks/:paybackRef/sent` and `/cancel` (pending-only CAS recording the session user, 409 when not pending); verify net amount and totals change on sent, not on cancel, that actors are recorded, and that a repeated or racing request has one winner.
- [x] 4.5 Extend the event API payload with per-payment `paybacks` and `remainingCents`; verify no PayNow numbers in the JSON and the figures for sent, pending and cancelled paybacks.
- [x] 4.6 Add the Pay back form (amount, optional recipient), payback rows with status, QR image and Sent / Cancel buttons, error messages and re-fetch after actions, built with `textContent`; verify the page shell test (no payment-changing forms, new controls present); the in-browser sign-in cannot run locally (Telegram Login needs the registered domain), so also verify the inline script parses.

## 5. Deploy workflow

- [x] 5.1 Update `.github/workflows/deploy.yml`: add the `migrate` output (any change under `drizzle/`, or a manual run), a `migrate` job running `npx wrangler d1 migrations apply paynow-db --remote`, and make `worker`/`pages` depend on it with `!cancelled() && !failure()` conditions; verify the YAML parses, dry-run the path rules against recent history (migration-only, code-only, both), and after merge check in the run that `migrate` ran before the deploy jobs (and was skipped on a push without `drizzle/` changes).

## 6. Wrap-up

- [x] 6.1 Update README.md, AGENTS.md and `docs/architecture.md` (chat admins act on all payments, audit columns, web admin is no longer read-only with its new routes and CSRF rule, shared helpers, migration `0005`, automatic migrations in the deploy workflow, and the security note that repository queries no longer always filter by owner); run `npm run check`, `npm run build` and `npm test` and confirm all pass.

## Workflow follow-up

- Before merging, run `npx wrangler d1 migrations list paynow-db --remote` and confirm only `0005` is pending; the merge itself then applies it through the updated deploy workflow. (Applying it by hand first is also safe: migrations are tracked and re-runs are skipped.)
