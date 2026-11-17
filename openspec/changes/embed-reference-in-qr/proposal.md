# Proposal

## Why

A payee reconciles who paid from their banking app and statement. Banks show a PayNow QR's bill-number field (tag 62.01) there, and the Event bot fills it with the event name only: the payment reference sits in a sub-field of the PayNow account template (26.05) that banks do not show. A payee with twenty payments to "Birthday Party" cannot tell them apart.

## What Changes

- The payment QR the Event bot (`/start`) and the web pages create puts the payment reference first in the bill-number field, followed by the event name, at most 25 characters: for example `K7M2QX4TNB Birthday Party`. The payee sees the reference in the app and the statement and can match it to the payment in the bot and the web admin.
- The reference stays in its existing field (26.05) too, because the check-in scan reads it there.
- Nothing else changes: the amount, payee, caption, image text and buttons are as before. QRs issued earlier are not touched.

## Capabilities

### New Capabilities

(none)

### Modified Capabilities

- `payment-qr-issuance`: a payment QR carries its reference where banks show it, ahead of the event name.

## Impact

- Code: `src/payments/payment-request.ts` (one expression), shared by `/start`, the payer page and the admin page.
- Tests: `test/node/payment-request.test.ts` and the QR decode checks gain assertions on the field; no existing assertion should need to change.
- Not changed: payback QRs (their bill-number field already reads `Refund <payment reference>`), and the Simple and Split bots.
- No database, configuration or deploy-order change.
