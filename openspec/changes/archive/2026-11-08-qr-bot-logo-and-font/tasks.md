# Tasks

## 1. Bot logo in the centre

- [x] 1.1 Add `scripts/generate-bot-logo.mjs` (reads `web/public/logo.png`, area-averages to 96x96, writes `src/sgqr/bot-logo.ts` with width, height and base64 RGBA); run it and commit the output
- [x] 1.2 In `src/sgqr/qr-render.ts`, replace the 1-bit PayNow mask with bilinear, alpha-blended sampling of the bot logo in a square box (about 22% of the modules, 1 module white padding)
- [x] 1.3 Delete `src/sgqr/paynow-logo.ts` and `scripts/generate-paynow-logo.mjs`; update `test/node/qr-logo.test.ts` (logo colours in the centre, no PayNow colour, outside the clear box stays black/white) and keep the jsQR round-trips green for short and long payloads

## 2. Smooth font

- [x] 2.1 Add `scripts/generate-font.py` (Pillow, DejaVu Sans, one pixel size picked by eye between 20 and 24 px) and generate `src/sgqr/font-atlas.ts` with per-glyph metrics and 8-bit coverage; document the requirements in the script header
- [x] 2.2 Replace the text drawing in `qr-render.ts` with proportional layout, truncation with an ellipsis by measured width, unsupported characters as `?`, and coverage blending; adjust row height and band height
- [x] 2.3 Delete `src/sgqr/font5x7.ts`; update `test/node/sgqr-qr-text.test.ts` (every printable ASCII glyph present, `?` fallback, intermediate grey levels present, no line past the image edge, long line gets an ellipsis, same payload still decodes)

## 3. Checks and docs

- [x] 3.1 Check render time still passes the existing test; look at the generated payment and payback images and adjust font size and logo box size if needed; confirm with a real phone scan
- [x] 3.2 Update `README.md` (structure lines) and `AGENTS.md` (design decision 2); run `npm run check`, `npm run build` and `npm test`
