# Design

## Context

The payer page (`renderPayerPage`, `/api/pay/:ref*` in `src/web/handler.ts`) gates everything on `payerAccess`, which returns 401 without a Telegram Login cookie; the page then shows only the login widget. A signed-in request creates a payment owned by the Telegram user, sends them a private copy (`sendPaymentDm`), and the QR is served from an owner-only route. `payments.user_id` is `integer NOT NULL` with no foreign key, and admins act on payments through the event chat's admin check, not ownership. See proposal.md for motivation.

## Goals / Non-Goals

**Goals:**
- Anyone with the link can create a request and see its QR with no sign-in and no migration.
- Signed-in behaviour (history, private copy) is unchanged.

**Non-Goals:**
- A Telegram copy or history for anonymous visitors, per-IP limits, CAPTCHA, a required payer name.

## Decisions

1. **Session becomes optional.** `payerAccess` returns `{ userId: number | null, event }`: a missing, invalid or expired cookie means `null`; only an unknown event is an error (404). `GET /api/pay/:ref` therefore works for everyone and adds `signedIn: boolean` to its JSON.
2. **Anonymous owner is `0`.** `createPaymentRequest` gets `userId: access.userId ?? 0`. No schema change; real Telegram ids are positive so `0` cannot collide. Admin pages and bot admin tools already list every payment of the event, so they show these requests. The owner-only QR route and history never match `0` because those require a session.
3. **QR in the create response.** The create handler renders the PNG once (`renderQrPng` then `bmpToPng`, as the QR route does) and returns it as a base64 data URL in `payment.qr`, so an anonymous visitor needs no authenticated image route. The history QR route stays owner-only. Alternative: an unguessable-token route, rejected as extra state.
4. **Private copy only when signed in.** The DM block runs only if `userId !== null`; the response carries `dm` only then (absent for anonymous), and the page shows the "open the bot" hint only when `dm === false`.
5. **Rate cap on anonymous creation.** Before creating, count payments with `user_id = 0` and `created_at` in the last 10 minutes for the event (`countRecentAnonymousPayments(eventId, sinceIso)`); at 30 or more, answer 429 `rate_limited` and create nothing. Signed-in users skip the check. Limits: a per-event cap lets one abuser block other anonymous payers for up to 10 minutes; per-IP limiting or Turnstile is the upgrade if that happens. Same-origin JSON is still required.
6. **Page.** Load event data without waiting for sign-in and show the form immediately. When `signedIn` is false, show the Telegram widget in a small "Sign in to get a copy in Telegram and see your earlier requests" block below the form; when true, load history as today. The widget's `data-auth-url` already returns to `/pay/<ref>`.

## Risks / Trade-offs

- Anyone with the link can create requests, so spam can fill the admin list → per-event cap, admins can void; revisit with per-IP limits or CAPTCHA.
- Anonymous requests have no owner, so only admins can settle or void them → this matches how admins already operate; a payer cannot void their own request without signing in.
- Cleared cookies or closing the tab lose the QR for an anonymous payer → the QR is on screen at creation and admins have the request; the payer can create another.
