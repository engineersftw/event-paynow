# Proposal

## Why

On the payer page the fixed amount appears as a greyed, disabled-looking box that reads like a broken form. Payers also lose their QR once they leave the page, and they get nothing in Telegram to find it again.

## What Changes

- When an event has a default amount, the payer page shows the amount as plain text (label and value) instead of a disabled input. The amount is still fixed and enforced by the server; with no default, the editable amount field is unchanged.
- The page lists the signed-in user's earlier payment requests for this event (newest first, with amount, status and date). Tapping a pending request shows its QR again.
- After a request is created, the bot sends the payer a private Telegram message with the QR photo and caption. The payer must have started the bot; when Telegram refuses, the request still succeeds and the page says how to get the copy (open the bot and press Start).
- The private message carries no ✓ Received / ✖ Void buttons and no PayNow numbers, only the name-only caption `/start` already uses. Nothing is posted to the event chat from the payer page.

## Capabilities

### New Capabilities

(none)

### Modified Capabilities

- `event-payment-page`: the amount display rule, a new history requirement, and the "no Telegram messages" rule becomes "a private copy, no group post".

## Impact

- `src/web/handler.ts` (history route, DM after create), `src/web/page.ts` (payer page markup and script), `src/web/telegram.ts` (a direct-message sender sharing the photo upload with `postPaymentQr`), a repository method listing a user's payments for an event.
- Tests: web handler, page and repository tests.
- README and AGENTS.md notes on the payer page.
- No migration, no new secrets (the Pages project already has the bot token).
- Out of scope: the admin dialog (it already posts to the event chat), history across events, voiding or editing from the history list, retrying a failed message.
