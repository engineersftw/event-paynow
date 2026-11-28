# Proposal

## Why

The Workers suite covers bot conversations and webhook rejection separately. PR CI needs a repeatable test that follows an accepted request from the public webhook route through the bot's response and payment outcome.

## What Changes

- Add a reusable signed-webhook test harness and one journey each for the Simple, Event, and Split bots.
- Assert on Telegram messages and buttons, persisted payment status where applicable, and decoded PayNow QR amounts.
- Run the journeys in the existing Workers CI job using synthetic fixtures without live service credentials.
- Keep live staging, Telegram client behavior, and live AI, Workflow, and Queue verification outside this change.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

None. The suite verifies existing bot behavior.

## Impact

The Workers test harness and testing guide gain a new integration test entry point. A narrow dependency injection seam lets the tests use the real Worker router and bot handlers. The existing CI configuration already discovers Workers tests.
