# Tasks

## 1. Data

- [x] 1.1 Add `countRecentAnonymousPayments(eventId, sinceIso)` to `Repository` and `D1Repository` (rows with `user_id = 0` at or after the cutoff). Verify with a workers repository test: counts only that event's anonymous rows inside the window.

## 2. Payer API

- [x] 2.1 Make `payerAccess` return `userId: number | null` (404 only for an unknown event) and add `signedIn` to `GET /api/pay/:ref`; keep history and the QR route requiring a session. Verify with web handler tests: metadata works without a cookie and with an expired one, history and QR route still return 401 without a session.
- [x] 2.2 Let `createPayerPayment` accept anonymous requests (owner `0`), return the QR as `payment.qr` (PNG data URL) for every request, and send the private copy only when signed in. Verify with web handler tests: anonymous create returns 201 with a decodable PNG data URL and no Telegram call, the payment has `userId` 0, signed-in create still sends the copy, cross-origin still 403.
- [x] 2.3 Add the anonymous cap (30 per 10 minutes per event, 429 `rate_limited`, signed-in exempt). Verify with web handler tests: the 31st anonymous request is rejected and creates nothing, a signed-in request still works, requests older than 10 minutes do not count.

## 3. Payer page

- [x] 3.1 Show the form without sign-in, add the optional Telegram block when not signed in, show the QR from `payment.qr`, keep history and the "open the bot" hint for signed-in users only, and add a `rate_limited` error text. Verify with web-page tests on the rendered HTML and script, and by opening `/pay/<ref>` signed out and signed in.

## 4. Docs and checks

- [x] 4.1 Update README and AGENTS.md (payer page works without sign-in; anonymous owner 0 and the cap). Verify by reading the diff.
- [x] 4.2 Run `npm run check`, `npm run build` and `npm test`; all pass.
