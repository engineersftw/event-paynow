# Tasks

## 1. Integrate event default amount and shared contracts

- [x] 1.1 Verify the incoming default-amount change is present, then extend the event model, schema/repository reads, and D1 migration integration as needed; verify `npm run build` and existing event repository tests pass.
- [x] 1.2 Expose the event default amount in the server-side event metadata contract while preserving null/absent behavior for events without a default; verify node tests cover configured and missing defaults.
- [x] 1.3 Confirm payer-page creation uses the existing shared payment-request service and owner field without changing `/start` or administrator web creation; verify existing payment-request and web-admin tests remain green.

## 2. Add payer authentication, routes, and API

- [x] 2.1 Add a dedicated payer route and validated Telegram Login return path that reuses signed sessions without invoking chat-admin access; verify signed-in non-admin and unauthenticated route tests.
- [x] 2.2 Add authenticated payer metadata and payment-creation endpoints with same-origin JSON checks, server-side event-open validation, proxy/name/amount validation, authoritative fixed-default versus user-entered amount handling, and authenticated-user ownership; verify invalid input, default override attempts, closed-event, cross-origin, and ownership tests.
- [x] 2.3 Add an owner-scoped payment QR endpoint that checks event and payment ownership before rendering the stored payload as PNG; verify cross-event, other-user, and QR privacy tests plus QR decode coverage.
- [x] 2.4 Ensure the payer endpoints never call Telegram delivery helpers and keep administrator event endpoints on their existing admin-only policy; verify the test harness observes no `sendPhoto` call and existing admin access tests pass.

## 3. Build the standalone payer page

- [x] 3.1 Add the payer-facing responsive page shell with Telegram sign-in, event status, payer proxy/name form, a read-only default amount when configured, an editable required amount when absent, validation errors, and closed-event state; verify rendered HTML and browser-script tests cover sign-in and form behavior.
- [x] 3.2 Add the inline payment result state showing event, amount, reference, optional payer name, and the owner-scoped QR image without exposing the payer PayNow number; verify page tests assert the QR URL and name-only details.
- [x] 3.3 Surface the stable payer URL from the existing administrator event experience so an event owner/admin can copy or share it, without granting payer users administrator controls; verify the link is generated for the correct event reference.
- [x] 3.4 Update README and web deployment/configuration documentation with the payer URL, Telegram Login domain requirements, and the distinction between payer and admin pages; verify documented routes and required secrets match the implementation.

## 4. Integration verification

- [x] 4.1 Add Workers integration coverage for a non-admin signed-in user creating a payment for an event, reading its inline QR, and being rejected from another user's QR; verify the stored payment is pending and event-scoped.
- [x] 4.2 Run `npm run check`, `npm run build`, and `npm test`; verify the full node and Workers suites pass without changing existing admin, Telegram, settlement, or payback behavior.
