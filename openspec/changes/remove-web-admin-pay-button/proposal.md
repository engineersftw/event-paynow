# Proposal

## Why

`/web_admin` shows each event as a row of buttons, and Telegram divides the row's width equally between them. With the Mini App button, the 🌐 browser button and Pay, the event name gets a third of the width and is cut off ("Birthda…", "Year En…"), so the admin cannot tell events apart. The Pay button adds little: the payer link is available from `/web_payment` and from the Pay button on the event page itself.

## What Changes

- `/web_admin` no longer shows a Pay button. Each event row keeps the event button and the 🌐 browser button when the Mini App is configured, and the event button alone when it is not.
- The payer link stays reachable: `/web_payment` lists it per event, and the event page has its own Pay button.
- No other behaviour changes.

## Capabilities

### New Capabilities

(none)

### Modified Capabilities

- `web-admin`: the `/web_admin` event buttons no longer include a Pay button.

## Impact

- Code: `src/commands/web-admin-handler.ts` (drop one button).
- Tests: `test/node/web-admin-handler.test.ts` and `test/workers/bot-wiring.test.ts` expect the old rows.
- Docs: README and `docs/architecture.md` mention the Pay button on `/web_admin`.
- No database, configuration or deploy-order change.
