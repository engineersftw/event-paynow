# Proposal

## Why

Simple_PayNow_Bot builds the QR straight after the last answer. A mistyped payee number or amount then produces a valid-looking QR that pays the wrong person or the wrong sum, and the payee cannot be looked up to double-check. Event PayNow Bot's `/start` already shows a Confirm/Cancel summary for this reason; the simple bot should too.

## What Changes

- After the last question (description answered or skipped), the bot shows a **summary of everything entered** and asks the user to **Confirm** or **Cancel**; the QR is generated only after Confirm.
- The summary lists: payee (type and number), amount (SGD x.xx, or "set by payer"), whether the payer can change the amount (only when an amount was given), and the description (or "none").
- Cancel ends the conversation with nothing generated. Typing text at this step just reminds the user to tap a button.
- Confirm is claimed exactly once (double taps give one QR); the summary message loses its buttons and shows the outcome.
- The payee number appears in the summary (the user typed it, in a private chat, and the point is to let them check it); it still never appears in the QR image or caption.
- Docs updated.

Out of scope: editing a single answer from the summary (Cancel and `/start` again), any change to the QR itself.

## Capabilities

### New Capabilities

(none)

### Modified Capabilities

- `simple-paynow-bot`: a confirmation step before the QR is generated.

## Impact

- `src/commands/simple-handler.ts` (new step, summary, Confirm/Cancel callbacks), tests (`test/workers/simple-bot.test.ts`), README, `docs/architecture.md`, `AGENTS.md`.
- Worker only; no migration, no new secrets.
