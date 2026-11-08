# Proposal

## Why

The event page grew feature by feature into an unstyled table with inline forms, payback controls and a QR image under every pending payment. It is hard to scan, especially on a phone, and the payment request form is always in the way. Admins mostly want a clean list, and to act on one payment at a time.

## What Changes

- Restyle the page with a shadcn/ui look (design tokens, cards, badges, buttons, inputs, dialog; light and dark; mobile first), implemented as plain CSS and DOM code in the existing page shell. No React, no build step, no new dependency.
- Creating a payment request moves into a modal dialog opened by a "New request" button. The new request's QR is shown inside the dialog after creating.
- Payments become a compact list. Paybacks are hidden by default: a row with paybacks (or that can still be paid back) shows an indicator, and tapping it expands the paybacks and the pay back form.
- Pending payments no longer load their QR on page load. A row shows a pending indicator; tapping it reveals the QR image and the Received / Void buttons.
- No API, database or bot change. The same endpoints, same-origin guard and attribution are used.

## Capabilities

### New Capabilities

(none)

### Modified Capabilities

- `web-admin`: adds requirements for the compact list, the collapsible payback and pending-payment details, the payment request dialog and the visual design; updates the "shows its QR" requirements for payment requests and paybacks to say when the QR is displayed.

## Impact

- `src/web/handler.ts` (`renderPage`: CSS and client script only), `test/node/web-page.test.ts`.
- `README.md` / `docs` only if the page description there changes; `AGENTS.md` web admin section (one sentence).
- No migration, no change to `web/` Functions, secrets or the deploy workflow. Deploys as a Pages change.
