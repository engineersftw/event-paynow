# Proposal

## Why

Many events collect the same amount from everyone (a fixed contribution, a ticket price). Today the amount is typed again for every payment request, in `/start` and in the web admin dialog. Setting it once when the event is created saves typing and avoids mistakes.

## What Changes

- `/init` gets an optional step after the payee: "Default amount to collect (optional)", with a Skip button. A valid amount is shown in the confirmation summary and stored on the event.
- `/start` for an event that has a default amount offers a one-tap "Use SGD 21.00" button on the amount prompt. Typing a different amount still works, so the default is a suggestion, not a fixed price.
- The web admin "New request" dialog pre-fills the amount with the event's default; the admin can change it before creating.
- Events without a default behave exactly as today.
- Database: a nullable `events.default_amount_cents` column (migration 0006, additive only, safe for the automated migrate job).
- No change to payments already created, paybacks, or QR payloads.

## Capabilities

### New Capabilities

(none)

### Modified Capabilities

- `event-management`: `/init` can set an optional default amount, stored on the event and shown in the confirmation and success messages.
- `payment-qr-issuance`: `/start` offers the event's default amount as a one-tap choice.
- `web-admin`: the new-request dialog pre-fills the event's default amount.

## Impact

- `src/db/schema.ts`, `drizzle/0006_*.sql` and its meta, `src/db/repository.ts` (`Event.defaultAmountCents`), `src/db/drizzle-repository.ts` (`createEvent`, `toEvent`).
- `src/commands/init-handler.ts` (new step, callbacks), `src/commands/start-handler.ts` (default button), `src/bot.ts` (callback routing for the two new buttons), `src/web/handler.ts` (returns the default) and `src/web/page.ts` (pre-fill).
- Tests: init and start handler tests, bot wiring, event repository (hand-written test schemas must gain the column), web admin API and page tests, migration test.
- Docs: `AGENTS.md`, `README.md` (the `/init` description), `docs/architecture.md` if it lists `/init` steps.
- Deploy: the migration runs first through the deploy workflow (`drizzle/` changed), then the Worker and Pages (both import `src/db/`).
