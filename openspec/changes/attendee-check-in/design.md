# Design

## Context

The payment QR is a PayNow SGQR whose merchant-account block (tag 26) carries the payment reference in sub-tag 05 (`buildPayNowPayload` in `src/sgqr/paynow.ts`); the exact payload is stored as `payments.qr_payload`. The web admin page (`src/web/page.ts`, `src/web/handler.ts`) already lists payments with actions (mark received, void, payback) behind `eventAccess` (session, event, live chat-admin check) and same-origin POSTs; `eventData` builds the payment JSON inline. Pages Functions catch everything unless `web/public/_routes.json` excludes a static path. `jsqr` is already a dev dependency. See proposal.md for motivation.

## Goals / Non-Goals

**Goals:**
- Scan, check in, and reach the existing actions from one result, on iPhone and Android browsers.
- Server-side matching that cannot be fooled by editing a QR.

**Non-Goals:**
- Undo, counters, filters, scanning from the bot, bank QRs, multi-attendee QRs.

## Decisions

1. **Data:** migration `0007_payment_check_in.sql` adds nullable `checked_in_at text` and `checked_in_by integer` to `payments` (two `ALTER TABLE ... ADD`, no rebuild). `checkInPayment(ref, actorId, timestamp)` is one `UPDATE ... WHERE ref = ? AND status != 'voided' AND checked_in_at IS NULL RETURNING`, so concurrent scans have one winner and a lost race records nobody, like the other audit columns. The caller re-reads to tell "already checked in" from "voided" from "missing".
2. **Resolving a scan on the server:** `POST /api/events/:ref/scan` takes `{ payload }` (the decoded QR text) or `{ ref }` (typed reference). A new `paymentReferenceFromPayload` reads tag 26, sub-tag 05 from the TLV. The payment must exist, belong to this event, and for `payload` equal `payment.qrPayload` exactly; otherwise 404 `not_found`. This rejects forged or edited QRs and payback QRs (a payback payload carries a payback reference, not a payment). A typed `ref` is accepted without the payload check; the reference is a 10-character random code, and the caller is already an admin.
3. **One payment view:** the payment JSON built inline in `eventData` moves into a shared function used by the list, the scan and the check-in responses, and gains `checkedInAt`. Names only, never PayNow numbers, as today.
4. **Check-in route:** `POST /api/events/:ref/payments/:paymentRef/check-in` behind `eventAccess` and the same-origin guard. 200 with the payment view; 409 `voided` or `already_checked_in` (with the stored time); 404 otherwise.
5. **Decoding in the browser:** use `BarcodeDetector` when present, otherwise a vendored jsQR (`web/public/vendor/jsqr.js`, loaded on first Scan tap only, excluded from the catch-all in `_routes.json`). Frames from `getUserMedia({ video: { facingMode: 'environment' } })` are drawn to a canvas about 5 times a second and decoded; the first hit stops the camera and posts the text to `/scan`. Alternative: server-side decoding of uploaded photos, rejected as slower and heavier. Camera needs HTTPS, which Pages provides.
6. **Result UI:** a dialog with the video, a status line, a typed-reference field, and, after a hit, the existing `paymentCard` for that payment plus a banner and a primary Check in button. Existing actions inside the card keep working; after any action the dialog re-resolves the payment by `{ ref }` and the list reloads. "Scan next" restarts the camera.
7. **Check-in on closed events is allowed**, since entry can happen after payments close.

8. **Reminder copy:** one sentence, "Keep this QR for event check-in and payment verification", defined once and used in both places. `paymentCaption` gets it as a new segment between the payer segment and `SHARE_HINT` (it feeds `/start`, `postPaymentQr` and `sendPaymentDm`, so all three change together); the payer page prints it under the QR after creation and when a pending history row is opened. It is text only, so a payer can still forward the message. Payback captions are untouched. Telegram's 1024-character caption limit is far from reached (the caption stays under about 130 characters).

## Risks / Trade-offs

- iOS in-app browsers sometimes block camera access → the typed-reference field is the fallback and the error says so.
- A vendored 130 KB script is a supply-chain surface → pin version 1.4.0, copy from the installed dev dependency, note the version and licence in README.
- A person could photograph someone else's QR and present it → this proves a payment exists, not who holds it; admins see the payer name on the result and compare. Out of scope to bind QR to identity.
- Migration must apply before the Worker/Pages deploy → the `migrate` job already runs first, and the columns are additive.
