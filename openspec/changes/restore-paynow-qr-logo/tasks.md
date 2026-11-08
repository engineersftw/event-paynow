# Tasks

## 1. Restore the PayNow logo

- [x] 1.1 Restore `src/sgqr/paynow-logo.ts` and `scripts/generate-paynow-logo.mjs` from `eb680e2^`
- [x] 1.2 In `src/sgqr/qr-render.ts` put back the aspect-preserving logo box and 1-bit mask drawing with the brand colour, remove `sampleLogo` and the bot-logo import; leave the text band untouched
- [x] 1.3 Delete `src/sgqr/bot-logo.ts` and `scripts/generate-bot-logo.mjs`

## 2. Tests and docs

- [x] 2.1 Update `test/node/qr-logo.test.ts` to check the PayNow colour in the centre and none outside the clear box, keeping the multi-length decode test
- [x] 2.2 Update `AGENTS.md` (design decision 2 and the feature line), `docs/architecture.md` and the `README.md` structure lines
- [x] 2.3 Render a sample payment image and look at it; run `npm run check`, `npm run build` and `npm test`
