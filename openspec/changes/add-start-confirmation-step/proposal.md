# Proposal

## Why

`/start` generates and sends the payment QR the moment a valid amount is typed. A mistyped amount or payer number produces a QR (and a pending payment row) that has to be cleaned up afterwards, and the payer details are never shown back to the collector before money is requested. `/init` and `/payback` already confirm before committing; `/start` should too.

## What Changes

- After a valid amount, `/start` shows a **confirmation summary** instead of generating the QR: event, the payer (name and proxy), the payee the QR will pay to, and the amount, with **✅ Confirm** and **❌ Cancel** buttons.
- **Confirm** creates the payment row and sends the QR photo (unchanged caption and ✓ Received / action buttons); the summary message is updated in place to show it was confirmed. **Cancel** (or typing `cancel` / `/cancel`) creates nothing and updates the summary in place.
- No payment row exists and no QR is rendered until Confirm. Double taps cannot create two payments.
- The event is re-checked at Confirm: if it was closed in the meantime, nothing is created.
- Typing text while the summary is showing nudges the user to tap a button. The only choices are Confirm and Cancel (decided with the user): fixing a typo means Cancel and re-running `/start`.
- The stale `payment-qr-issuance` requirement "Guided payment creation via /start" (still describes a description-then-amount flow from before events existed) is rewritten to the current event → payer → amount → confirm flow.

Out of scope: editing individual fields from the summary, changing the payer/amount prompts, any change to the QR caption or buttons.

## Capabilities

### New Capabilities

(none)

### Modified Capabilities

- `event-scoped-payments`: `/start` requires confirmation before creating the payment; new confirmation requirement.
- `payment-qr-issuance`: the guided `/start` conversation ends with an explicit confirmation and no QR before it.

## Impact

- `src/commands/start-handler.ts`: new confirm step (step 5), two callbacks, summary rendering; payment creation moves behind Confirm.
- `src/bot.ts`: route `start_confirm` / `start_cancel`.
- Tests: `test/node/start-handler.test.ts`, `test/workers/start-flow.test.ts`, `e2e-event-flow.test.ts`, `bot-wiring.test.ts` (flows that typed an amount now need a Confirm tap); `AGENTS.md`. No schema change or migration.
