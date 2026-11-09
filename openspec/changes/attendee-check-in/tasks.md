# Tasks

## 1. Data

- [x] 1.1 Add migration `0007_payment_check_in.sql` (`checked_in_at text`, `checked_in_by integer` on `payments`), update `src/db/schema.ts`, the drizzle meta files, the `Payment` type and `toPayment`, and the hand-written test schemas. Verify with `test/node/migration.test.ts` and `npm run build`.
- [x] 1.2 Add `checkInPayment(ref, actorId, timestamp)` to `Repository` and `D1Repository` (guarded single UPDATE, returns the payment or null). Verify with workers repository tests: pending and received succeed, a second call returns null and keeps the first time and actor, voided and unknown refs return null, two concurrent calls have one winner.

## 2. Scan resolution

- [x] 2.1 Add `paymentReferenceFromPayload(payload)` to `src/sgqr/paynow.ts` (tag 26 sub-tag 05, null when absent or malformed). Verify with node tests round-tripping `buildPayNowPayload`, a payback payload, a payload with the reference truncated at 25 characters, and garbage input.
- [x] 2.2 Extract the payment JSON from `eventData` into a shared view function that adds `checkedInAt`, used by the list. Verify the existing web admin tests still pass and the list now includes `checkedInAt`.
- [x] 2.3 Add `POST /api/events/:ref/scan` (`{ payload }` or `{ ref }`, admin-only, event-scoped, payload must equal the stored QR payload). Verify with web handler tests: a real payment QR resolves, a QR of another event, a payback QR, an edited payload, an unknown ref and garbage give 404, a non-admin gets 403, no session gets 401, no PayNow number appears in the response, and a payment outside the loaded page still resolves.
- [x] 2.4 Add `POST /api/events/:ref/payments/:paymentRef/check-in` (same-origin, admin-only). Verify with web handler tests: pending and received succeed and record the admin, a repeat returns 409 `already_checked_in` with the time, voided returns 409 `voided`, another event's payment returns 404, cross-origin returns 403, and works on a closed event.

## 3. Page

- [x] 3.1 Vendor jsQR 1.4.0 to `web/public/vendor/jsqr.js`, exclude `/vendor/*` in `web/public/_routes.json`, and confirm the Pages deploy filter covers `web/`. Verify the file matches the installed `jsqr` dist and that the route exclusion is present.
- [x] 3.2 Add the Scan button and dialog: camera capture with `BarcodeDetector` or jsQR, status and error text, typed-reference field, result with `paymentCard`, banner and Check in button, "Scan next", and refresh of the result and the list after any action. Verify with web-page tests on the rendered HTML and script (it must parse), and a Playwright check with stubbed API calls.
- [x] 3.3 Show a "Checked in" mark on payment rows. Verify with web-page tests and the Playwright check.
- [x] 3.4 Try a real decode locally: Chromium with a fake video capture of a generated payment QR through the scan dialog (stubbed API). Verify the dialog resolves the reference; if the fake camera cannot be made to work, say so and rely on the unit-level decode test.

## 4. Reminder copy

- [x] 4.1 Add the reminder segment to `paymentCaption` (between the payer segment and the share hint) with the sentence as one shared constant, and update the existing caption tests (`payment-request`, `web-telegram`, `start-flow`, `web-payment-requests`). Verify with those tests: captions from `/start`, the admin chat post and the private copy contain it in the right place with and without a payer name, and a payback caption does not.
- [x] 4.2 Show the same sentence next to the QR on the payer page after creating a request and when a pending history row is opened. Verify with web-page tests on the rendered script, and in the Playwright check that the text appears under the QR.

## 5. Docs and checks

- [x] 5.1 Update README (feature, web pages section, vendored jsQR licence note), AGENTS.md and `docs/architecture.md`. Verify by reading the diff.
- [x] 5.2 Run `npm run check`, `npm run build` and `npm test`; all pass.
