# Proposal

## Why

The QR image is the thing that actually gets forwarded and screenshotted, but it is anonymous: the description, amount, reference and names live only in the Telegram caption, which is lost when the image is saved or re-shared. Printing the payment details on the image itself makes it self-explanatory wherever it ends up.

## What Changes

- Render a text block of payment details below the QR code, inside the same image, for both payment QRs (`/start`) and payback QRs (`/payback`).
- Payment QR lines: event name, description, `SGD <amount>`, reference, and `Payer: <name>` when a name is known.
- Payback QR lines: `Payback for <payment ref>`, `SGD <amount>`, payback reference, and `To: <name>` when the recipient has a known name.
- Names only, never a PayNow number (same rule as captions, because images get forwarded).
- The QR area, quiet zone and centre logo are unchanged, so the code stays scannable.
- Text is drawn with a small built-in bitmap font (pure JS, no canvas); characters outside printable ASCII render as `?`; long lines are truncated with an ellipsis.
- Captions are unchanged.

## Capabilities

### New Capabilities

### Modified Capabilities
- `payment-qr-issuance`: the delivered payment QR image carries the payment details as visible text.
- `payback-qr`: the delivered payback QR image carries the payback details as visible text.

## Impact

- `src/sgqr/qr-render.ts` (optional text lines argument, new bitmap font module), `src/commands/start-handler.ts`, `src/commands/payback-handler.ts`.
- Tests: `test/node/sgqr-qr-render.test.ts` (jsQR round-trip still decodes with text present), handler tests for the lines passed.
- No schema, migration or dependency changes. Image grows taller (still well under 1 MB BMP).
