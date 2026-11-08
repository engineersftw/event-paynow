# Design

## Context

The Pages Function currently serves an administrator event page at `/events/:ref`. Its API authenticates a Telegram session and then performs a live chat-admin check before exposing event data or allowing payment creation; payment creation also posts the generated QR to Telegram. Shared payment construction already snapshots the event payee and name, and QR rendering can produce a PNG from the stored payload. The incoming default-amount change will add the event-level amount that this page must consume.

The new flow must not weaken the existing admin route. It needs a separate public URL and API surface with Telegram session authentication, owner-scoped QR access, same-origin write protection, and no Telegram API dependency.

## Goals / Non-Goals

**Goals:**

- Add a stable payer URL for each event, implemented as a separate route from the admin page.
- Reuse the existing Telegram Login/session verification, payment validation, payment-request construction, and QR rendering behavior.
- Make the payer form available to any authenticated Telegram user with the link, regardless of event-chat membership.
- Use a configured event default as a fixed payable amount, while retaining an editable required amount for events without a default.
- Return or expose an inline QR for the newly created payment while keeping payer PayNow numbers out of displayed text.
- Restrict QR retrieval to the authenticated owner of the created payment and its event.
- Keep creation and QR retrieval independent of Telegram `sendPhoto` or chat-admin checks.

**Non-Goals:**

- Replacing or relaxing the existing administrator event page and its admin actions.
- Letting payer-page users mark payments received/void, create paybacks, or browse the event's payment history.
- Adding a new payment or authentication provider beyond Telegram Login.
- Changing payment settlement, payback bounds, or SGQR payload semantics.

## Decisions

### Separate payer route and API

Use a dedicated route such as `/pay/:eventRef` and matching `/api/pay/:eventRef` endpoints rather than overloading `/events/:ref`. The existing route has admin-specific assumptions and response shapes; separation makes the access policy explicit and prevents a non-admin session from accidentally receiving admin data. The event reference remains the stable shareable identifier.

Alternative considered: add a query-mode to `/events/:ref`. Rejected because it would create an authorization branch inside every existing admin endpoint and make it easier to expose payment history or actions to payer sessions.

### Reuse session cookies with a payer-specific login redirect

Reuse `verifyTelegramLogin`, signed session cookies, and the existing bot credentials. Add a login redirect target/return parameter for the payer route so successful login returns to `/pay/:eventRef`, while validating the event reference before redirecting. The payer API checks only session validity and event existence/status; it does not call `getChatMember`.

Alternative considered: issue a special event token in the URL. Rejected because the requested audience is authenticated Telegram users and the existing signed session mechanism already provides an expiry and tamper resistance.

### Owner-scoped payment QR endpoint

The create response returns the created payment reference and enough non-sensitive metadata for the page to render the result. A separate PNG endpoint verifies the session, loads the payment, checks both event ownership and `payment.userId === session.userId`, and then renders the stored payload with the existing name-only detail-line rules.

Alternative considered: allow every signed-in visitor to fetch any payment QR in the event. Rejected because the QR contains a payer-specific request and the page does not need to expose other participants' payment requests.

### Shared creation path, no Telegram posting

Call the existing payment-request service with the authenticated session user as `userId`, then return the stored payment reference. Do not call `postPaymentQr` from this route. The existing admin flow remains unchanged and continues to post its own requests to Telegram.

Alternative considered: add a `postToTelegram` option to the shared service. Rejected because delivery is a web-handler concern and the payer flow should have no Telegram API dependency at all.

### Default amount is server-provided and conditionally editable

After authentication, the payer page fetches event metadata containing the event name/status and default amount. If a default exists, the HTML form displays it as read-only/disabled and the create endpoint derives the amount from the server-side event row rather than trusting the client. If no default exists, the form displays a required editable amount field and the create endpoint parses and validates the submitted amount.

The implementation must consume the default-amount field and migration from the incoming change rather than inventing a second field or migration. If that change has not landed when implementation starts, it is a prerequisite and must be applied first.

### Inline result with lazy QR image

After successful creation, the page switches to a result panel containing the payment details and an `<img>` whose source is the owner-scoped QR endpoint. This keeps the initial page shell small and uses the same PNG conversion/rendering path already used by web QR images. The result includes a clear retry/error state if image loading fails, without invalidating the payment record.

## Risks / Trade-offs

- [Risk] A shared event URL can be forwarded publicly. → Only event identity and sign-in UI are available before authentication; no payer form or payment data is returned until a valid session exists.
- [Risk] A stolen valid session cookie could create requests as that Telegram user. → Keep the existing signed, HttpOnly, Secure, SameSite cookie and short session lifetime; require same-origin JSON for writes.
- [Risk] The event default may change while the page is open. → The server re-reads the event at creation time and uses the current default as authoritative; a client-submitted amount cannot override it.
- [Risk] QR rendering can fail after payment creation. → Persist first, return the payment reference, and make the QR endpoint independently retryable; do not delete or duplicate the payment on image failure.
- [Risk] The incoming default-amount migration may land with a different field shape. → Treat its repository/schema contract as the source of truth during implementation and add an explicit compatibility test for missing/null defaults.

## Migration Plan

1. Ensure the incoming event default-amount schema, migration, repository type, and existing bot/admin behavior are available before deploying this change.
2. Deploy the new payer route and API alongside the existing admin routes; no existing URL or authorization behavior changes.
3. Verify Telegram Login redirect configuration and the Pages deployment serves the new path.
4. Roll back by deploying the previous Pages bundle; existing admin routes and stored payment rows remain compatible because the new flow uses the existing payment schema.
