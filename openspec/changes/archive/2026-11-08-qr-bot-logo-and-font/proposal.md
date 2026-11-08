# Proposal

## Why

The QR images still carry the old PayNow wordmark in the centre and print their details in a blocky 5x7 pixel font. The bot now has its own logo (the red calendar with the green dollar sign, already used on the web admin page), and the text under the QR should look cleaner and be easier to read.

## What Changes

- The centre of every payment and payback QR shows the bot logo instead of the PayNow wordmark. The logo is full colour with a soft (anti-aliased) edge and sits on a white clear box; the QR keeps its error-correction level H and must still scan.
- The detail lines under the QR are drawn in a smooth, proportional font instead of the 5x7 bitmap font. Same lines, same content, still names only and never a PayNow number.
- The old PayNow logo asset, its generator script and the 5x7 font module are removed once unused.
- No change to the payload, the captions, the API or the database.

## Capabilities

### New Capabilities

(none)

### Modified Capabilities

- `payment-qr-issuance`: adds requirements for the bot logo in the QR centre and for the smooth text font.
- `payback-qr`: adds a requirement that payback QR images use the same logo and font.

## Impact

- `src/sgqr/qr-render.ts` (logo compositing, text drawing), new generated modules for the logo pixels and the font atlas in `src/sgqr/`, new generator scripts in `scripts/`.
- Removed: `src/sgqr/paynow-logo.ts`, `src/sgqr/font5x7.ts`, `scripts/generate-paynow-logo.mjs`.
- Tests: `test/node/qr-logo.test.ts`, `sgqr-qr-text.test.ts`, the jsQR round-trip tests, and render-time checks.
- `README.md` (project structure lines for the removed files), `AGENTS.md` (design decision 2 on QR rendering).
- Worker bundle grows by roughly 75 KB of embedded image and font data.
