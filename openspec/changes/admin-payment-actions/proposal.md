# Proposal

## Why

The web admin page only shows payments, and in the bot only the user who created a payment can receive, void or pay it back. In a group, the person who runs `/start` is often not the one who handles the money later, and an admin who sees a payment on the web page can do nothing about it. Letting chat admins act on every payment of their chat's events, from the web page and the bot alike, closes that gap, and recording who did what keeps the extra access accountable.

## What Changes

- **Web admin payback**: received payments with room left show a **Pay back** action (amount defaults to the remaining payable amount; recipient defaults to the stored payer and can be changed for that payback; legacy payments need one). The same rules as the bot apply, including the transactional bound (pending + sent count, cancelled do not).
- The page shows the payback **QR as a PNG** (details printed below the QR, names only) and lists each payment's paybacks; pending paybacks can be marked **Sent** or **Cancelled**. Any signed-in chat admin can do this for any received payment of the event.
- **Bot: any chat admin can act on any payment of their chat's events**: view, mark received, void, pay back (`/payback <ref>` and the button), and mark sent / cancel a payback. Administrator status is checked live (`getChatMember`); owners keep access without a check; anything else is refused as before; payments with no event stay owner-only; a failed check denies.
- **`/payments` drill-down shows every payment of the event to admins** (ordinary members still see only their own).
- **Audit**: five new nullable columns record the Telegram user id of who acted: `payments.received_by`, `payments.voided_by`, `paybacks.created_by`, `paybacks.sent_by`, `paybacks.cancelled_by`, set in the same step as the transition (a lost race records nothing). Applies to bot and web actions; older rows stay empty. New migration; the data is stored, not displayed.
- State-changing web requests use the existing session, re-check admin status live, and must be same-origin.
- **CI/CD**: `deploy.yml` gains a `migrate` job that runs `wrangler d1 migrations apply paynow-db --remote` when anything under `drizzle/` changed, and the Worker (and Pages) deploys wait for it, so migrations are applied before the code that needs them goes out; a failed migration stops the deploys.
- Shared logic: payback payload/record creation is extracted, and the chat-admin check moves out of `src/web/` so the bot and the web use one implementation each.
- Not changed: creating, receiving and voiding payments stay Telegram-only on the web side; captions and QR content.

## Capabilities

### New Capabilities
- `chat-admin-access`: chat admins can act on any payment of their chat's events in the bot, see all event payments in `/payments`, and every such action records who performed it.

### Modified Capabilities
- `web-admin`: the event page is no longer strictly read-only; adds payback creation (with a PNG QR), sent/cancel actions, the access rules for them, and attribution of those actions.
- `payment-tracking`: the per-user isolation of the payment list gains the chat-admin exception.

## Impact

- **Schema**: migration `0005` adds five nullable INTEGER columns (`ALTER TABLE ... ADD COLUMN`, no rebuild, no backfill). With the updated deploy workflow, merging applies it to production automatically before the Worker and Pages are deployed.
- `src/db/` (schema, repository signatures take an optional acting user id, `getEventById`, new `payback-service.ts`), `src/access/chat-admin.ts` (moved from `src/web/access.ts`), `src/commands/` (`payment-callback-handler`, `payback-handler`, `payments-handler`, new `payment-access.ts`), `src/bot.ts` (injects the admin check), `src/sgqr/png.ts` (new `bmpToPng`), `src/web/handler.ts`.
- `.github/workflows/deploy.yml` (migrate job and job ordering); README, AGENTS.md and `docs/architecture.md` stop saying migrations are manual.
- Merging runs migration `0005`, then deploys both the Worker and the Pages app.
- Tests: repository audit and race tests, bot handlers (admin vs owner vs member), web handler, PNG converter; existing ownership tests keep passing.
- Broader privileges: an admin can now void or receive other users' payments in the bot, and every admin can pay back any received payment.
