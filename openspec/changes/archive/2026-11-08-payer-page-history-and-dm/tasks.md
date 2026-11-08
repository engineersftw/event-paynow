# Tasks

## 1. Data and Telegram helpers

- [x] 1.1 Add `listPaymentsByUserAndEvent(userId, eventId)` (newest first, limit 50) to `Repository` and `D1Repository`. Verify with workers repository tests: only that user's payments for that event, ordered newest first, none for another user or event.
- [x] 1.2 In `src/web/telegram.ts`, share the photo upload between `postPaymentQr` and a new `sendPaymentDm` (chat id = user id, caption from `paymentCaption`, no buttons, never throws). Verify with a unit test stubbing fetch: the DM carries the caption without buttons, returns false on a non-OK response, and `postPaymentQr` still sends its buttons.

## 2. Payer API

- [x] 2.1 Add `GET /api/pay/:ref/payments` returning the session user's requests for the event (401 without a session, 404 for an unknown event). Verify with web handler tests: own requests only, other event and other users excluded, no PayNow numbers in the JSON.
- [x] 2.2 In `createPayerPayment`, send the DM after creation using an injectable `fetchFn` and return `dm: true|false`; nothing is posted to the event chat. Verify with web handler tests: sendPhoto goes to the user's chat id, a refused send still returns 201 with `dm: false`, and the payment exists either way.

## 3. Payer page

- [x] 3.1 Show the default amount as plain text with no input, keep the editable field when there is no default, and show the "open the bot and press Start" hint when `dm` is false. Verify with web-page tests on the rendered HTML and script strings, and by checking the form still posts without an amount when a default is set.
- [x] 3.2 Add the "Your previous requests" list (amount, status pill, `dd-MMM-YYYY` date, tap a pending row for its QR, hidden when empty). Verify with web-page tests and a manual check on the payer page.

## 4. Docs and checks

- [x] 4.1 Update README and AGENTS.md (payer page now lists history and sends a private copy). Verify by reading the diff.
- [x] 4.2 Run `npm run check`, `npm run build` and `npm test`; all pass.
