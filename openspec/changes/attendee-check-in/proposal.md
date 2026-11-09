# Proposal

## Why

At the door, an organiser has to match each arrival to a payment by hand: ask for a name, search the list, tick it off from memory. The attendee is already holding the payment QR they created, which carries the payment's reference, so scanning it can find the payment instantly, record the check-in, and open the same actions (mark received, pay back) on the spot.

## What Changes

- A **Scan** button on the web admin event page opens the phone camera, reads the attendee's payment QR (the one created from the payer page, `/start` or the admin dialog), and shows that payment with its status, a **Check in** button and the existing actions (Mark received or Void for pending, Pay back for received).
- Check-in is recorded on the payment (time and the admin who did it) with a one-time guard, so scanning the same QR again shows "Already checked in" with the time. Pending and received payments can be checked in; voided payments cannot.
- A scanned QR must be one of this event's payment QRs; anything else (another event, a payback QR, a bank QR) is reported as not recognised. A reference can also be typed in when the camera is unavailable.
- Payment rows show a "Checked in" mark so the list reflects who has arrived.
- Payers are reminded to keep their QR: payment QR captions sent on Telegram (from `/start`, the web admin dialog's chat post and the payer page's private copy) gain the line "Keep this QR for event check-in and payment verification", and the payer page shows the same sentence next to every QR it displays.
- Admins only, same rules as the rest of the page: signed in, chat admin, same-origin writes.

## Capabilities

### New Capabilities

(none)

### Modified Capabilities

- `web-admin`: scanning an attendee QR, the check-in action and its refusals, the typed-reference fallback, and the check-in mark in the list.
- `payment-tracking`: a payment records when and by whom it was checked in.
- `payment-qr-issuance`: payment QR captions carry the keep-the-QR reminder.
- `event-payment-page`: the payer page shows the same reminder beside its QR.

## Impact

- Migration `0007_payment_check_in.sql` adds nullable `checked_in_at` and `checked_in_by` to `payments` (additive, safe with migrate-before-deploy); `payments` in `src/db/schema.ts`, `Payment` type, a guarded `checkInPayment` repository method.
- `src/sgqr/paynow.ts` gains a reader for the reference in a PayNow QR payload; `src/web/handler.ts` gains `POST /api/events/:ref/scan` and `POST .../payments/:paymentRef/check-in` and a shared payment view that adds `checkedInAt`; `src/web/page.ts` gains the scan dialog, the check-in button and the list mark.
- A vendored QR decoder `web/public/vendor/jsqr.js` (jsQR 1.4.0, MIT, already a dev dependency for tests) loaded only when Scan is used, and its exclusion in `web/public/_routes.json`.
- `paymentCaption` in `src/payments/payment-request.ts` (shared by `/start`, the admin chat post and the private copy) and the payer page result and history QR; existing caption tests are updated.
- Tests: SGQR reference reader, repository, web handler and page tests; a Playwright check with a fake camera if it works locally.
- README, AGENTS.md and docs.
- Out of scope: undoing a check-in, a check-in counter or filter, scanning from the Telegram bot, scanning a bank's own PayNow QR (it carries nothing of ours), one QR for several attendees.
