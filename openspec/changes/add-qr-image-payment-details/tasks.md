# Tasks

## 1. Renderer

- [x] 1.1 Add `src/sgqr/font5x7.ts` with a 5x7 glyph table for ASCII 32–126 and a `?` fallback; verify with a unit test that every printable char has a glyph and `é` falls back to `?`.
- [x] 1.2 Extend `renderQrPng(payload, lines = [])` in `src/sgqr/qr-render.ts` to append a white text band with the lines at 2x scale, truncating overlong lines with `...`; verify `test/node/sgqr-qr-render.test.ts` still passes unchanged for no lines and that with lines the BMP is taller.
- [x] 1.3 Add a jsQR round-trip test (`test/node/sgqr-jsqr-roundtrip.test.ts` style) proving the QR still decodes to the same payload with lines present, plus truncation and no-lines-identical-output tests.

## 2. Callers

- [x] 2.1 `/start`: pass lines (event name, description, `SGD <amt>`, ref, `Payer: <name>` when known) to `renderQrPng` in `src/commands/start-handler.ts`; verify in the start-handler test that the lines contain no payer proxy and omit the payer line without a name.
- [x] 2.2 `/payback`: pass lines (`Payback for <ref>`, `SGD <amt>`, payback ref, `To: <name>` when known) in `src/commands/payback-handler.ts`; verify in the payback-handler test that no recipient proxy appears.

## 3. Wrap-up

- [x] 3.1 Update `AGENTS.md` (QR rendering decision: text band, ASCII-only font, names never numbers); run `npm run check`, `npm run build` and `npm test` and confirm all pass.
