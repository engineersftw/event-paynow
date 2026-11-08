# Proposal

## Why

The full-colour bot logo in the centre of the QR was a poor fit: it is a busy icon in a spot where scanners and bank apps expect the recognisable PayNow mark, and the flat PayNow wordmark was lighter on the code. The QR should go back to the PayNow logo.

## What Changes

- The centre of every payment and payback QR shows the PayNow wordmark again (single colour, on a white clear box), exactly as before the bot-logo change.
- The smooth anti-aliased text under the QR stays; only the centre logo changes.
- The bot logo remains on the web admin page header and as the page icon (`web/public/logo.png`); it is no longer embedded in the QR renderer.
- The unused bot-logo module and its generator are removed; the PayNow logo module and its generator are restored from git history.
- No change to the payload, captions, API or database.

## Capabilities

### New Capabilities

(none)

### Modified Capabilities

- `payment-qr-issuance`: the centre-logo requirement is renamed and changed from the bot logo to the PayNow logo.
- `payback-qr`: the shared logo-and-text requirement now names the PayNow logo.

## Impact

- `src/sgqr/qr-render.ts` (centre overlay back to the 1-bit mask), restored `src/sgqr/paynow-logo.ts` and `scripts/generate-paynow-logo.mjs`, removed `src/sgqr/bot-logo.ts` and `scripts/generate-bot-logo.mjs`.
- Tests: `test/node/qr-logo.test.ts`.
- Docs: `AGENTS.md` (design decision 2), `docs/architecture.md`, `README.md` (structure lines).
- Because `src/sgqr/` is now in the Pages deploy filter, merging this deploys both the Worker and Pages.
