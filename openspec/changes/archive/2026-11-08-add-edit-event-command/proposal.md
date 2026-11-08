# Proposal

## Why

An event's name, payee and default amount can only be set once, in `/init`. A typo, a wrong PayNow number or a changed amount means closing the event and starting a new one, which loses the event's link and splits its payments across two events.

## What Changes

- New `/edit_event` command: pick an open event (skipped when there is only one), pick a field (name, payee, default amount), type the new value. The change is saved at once and the bot confirms with the event's new details.
- The default amount can be cleared as well as changed.
- Only chat administrators (or the user in a private chat) may edit, checked live when the command starts and again when the change is saved.
- Only open events can be edited. Closed events stay as they were.
- Payments already issued keep the payee and description they were created with, so their QR codes and history do not change. New payments, `/start`, the web admin dialog and the payer page use the new values.
- Validation matches `/init`: name 1–50 characters, payee a mobile number or UEN, amount positive with at most two decimals.
- The conversation state gains an `edit` flow. `/help`, README and the BotFather command list mention `/edit_event`.

## Capabilities

### New Capabilities

(none)

### Modified Capabilities

- `event-management`: adds a requirement for editing an open event via `/edit_event`.

## Impact

- New `src/commands/edit-event-handler.ts`; wiring in `src/bot.ts` (command, `edit_*` callbacks, text routing, help text); `edit` added to the flow enum in `src/worker/conversation-do.ts`.
- `EventRepository` gains a guarded `updateEvent` (open events only). No migration: the columns already exist.
- Tests: handler unit tests, repository test, bot-wiring and e2e flow tests.
- README (command table, BotFather list, project structure), AGENTS.md, `docs/architecture.md`.
- Out of scope: reopening closed events, deleting events, moving an event to another chat, rewriting existing payments.
