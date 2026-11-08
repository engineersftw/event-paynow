# Proposal

## Why

Event participants currently create payment requests through the admin-oriented event page or Telegram, where the QR may also be posted to the event chat. Some Telegram users prevent messages from non-contacts, so a payer-facing page is needed that lets any signed-in participant create their own request and view the QR inline without requiring a Telegram message.

The page should use the event's configured default amount from the incoming default-amount change as the fixed payable amount. Events without a default should retain an editable, required amount field.

## What Changes

- Add a standalone payer-facing page for each event, reachable from an event link and protected by Telegram Login.
- Allow any successfully signed-in Telegram user with the link to create a payment request for themselves by entering their PayNow proxy and optional display name.
- Use the event's default amount as a non-editable payable amount when configured; for events without a default, show a required user-entered amount field.
- Create the request against the event's payee and snapshot the signed-in user as its owner, using the existing validation, SGQR payload, and payment-record conventions.
- Display the generated payment QR and payment details inline on the webpage after creation.
- Do not send or post the payer-created QR to Telegram; the page remains the delivery surface for this flow.
- Keep event-open validation and existing pending-payment semantics so closed events cannot receive new requests.

## Capabilities

### New Capabilities

- `event-payment-page`: A Telegram-authenticated, payer-facing event page that creates payment requests and displays their QR inline without Telegram delivery.

### Modified Capabilities

- `web-admin`: The existing event-page access and payment-request behavior is extended with a separate payer-facing page and access policy; the admin page remains admin-only.
- `event-scoped-payments`: Event payment creation gains a web payer flow that uses the event's payee, stores the signed-in creator, and does not require Telegram posting.
- `payment-qr-issuance`: Payment QR delivery gains an inline webpage surface in addition to Telegram delivery, with the new flow explicitly omitting Telegram posting.
- `event-management`: Event presentation includes a payer-facing page and uses the event's configured default amount when available.

## Impact

- Web routing and HTML/JavaScript in `src/web/handler.ts` and `src/web/page.ts`, likely with a distinct payer route/API alongside the existing admin page.
- Shared payment-request creation and QR rendering in `src/payments/payment-request.ts` and `src/sgqr/`.
- Event schema/repository types and migrations for the default amount supplied by the incoming change, if not already present when implementation begins.
- Web authentication/session handling and Pages configuration; authenticated users are not required to be event chat admins.
- Node and Workers tests for authentication, event access, fixed/default and user-entered amounts, request ownership, inline QR rendering, closed events, and the guarantee that this flow does not call Telegram `sendPhoto`.
- README and web deployment documentation if the public URL or required configuration changes.
