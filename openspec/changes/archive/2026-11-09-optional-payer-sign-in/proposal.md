# Proposal

## Why

Anyone paying into an event should be able to open the shared payer link and get a QR straight away. Today the payer page asks for Telegram sign-in first, which many participants will not have set up or will not bother with.

## What Changes

- The payer page works without signing in: the form is shown at once and a visitor can create a payment request and see its QR on the page.
- Telegram sign-in stays on the page as an option. Signed-in users keep what they have today: requests tied to their Telegram account, the list of their earlier requests, and the private Telegram copy of the QR.
- Anonymous visitors get the QR on the page only: no private message, no list of earlier requests.
- A request made without signing in is recorded with owner `0` (no Telegram user). Event admins see and settle it like any other request.
- The QR for a new request comes back in the create response, so it needs no session to display. Signed-in history keeps using the owner-only QR route.
- Anonymous creation is capped per event (30 per 10 minutes, then HTTP 429) to blunt abuse, and still requires same-origin JSON.

## Capabilities

### New Capabilities

(none)

### Modified Capabilities

- `event-payment-page`: sign-in becomes optional; anonymous creation, owner and QR delivery; history and private copy limited to signed-in users; creation rate cap.
- `event-management`: the payer-link and default-amount requirements no longer assume sign-in.

## Impact

- `src/web/handler.ts` (event metadata and create without a session, `qr` in the response, rate cap), `src/web/page.ts` (form always visible, optional sign-in block), a repository count of recent anonymous payments.
- Tests: web handler and page tests, repository test.
- README and AGENTS.md payer page notes.
- No migration (`payments.user_id` is NOT NULL but has no foreign key, so `0` is valid). No new secrets or bindings.
- Out of scope: a Telegram copy or history for anonymous visitors (a bot cannot message an @handle, and a start-bot button was declined), per-IP limits, CAPTCHA, requiring a payer name.
