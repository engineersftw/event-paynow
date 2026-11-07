# Design

## Context

`renderQrPng(payload)` builds a 24-bit BMP by hand (no canvas, Workers-safe): QR modules at 8 px/module with a 2-module quiet zone and a centre logo. Both handlers send it with `replyWithPhoto` plus a caption (`start-handler.ts`, `payback-handler.ts`). There is no text rendering anywhere.

## Goals / Non-Goals

**Goals:**
- Visible detail lines inside the image, same fields as the caption plus the event name for payments.
- Keep the QR byte-for-byte scannable and the renderer pure JS.

**Non-Goals:**
- Unicode / non-Latin names on the image (they show as `?`; the caption still carries the real name).
- Changing captions, the SGQR payload or any stored data.
- Rich styling (fonts, colours, wrapping across lines).

## Decisions

1. **Optional `lines: string[]` parameter on `renderQrPng(payload, lines = [])`.** With no lines the output is identical to today, so existing tests and callers are untouched. Alternative: a separate composer function that post-processes the BMP — more code, rereads pixels.
2. **Text band appended below the QR, white background, black text.** The image height grows by `lines.length * lineHeight + padding`; the QR and its quiet zone are not touched. Alternative: text above the QR — equivalent, but below keeps the scan target at the top of the photo preview.
3. **Embedded 5x7 bitmap font for printable ASCII (32–126), drawn at 2x scale.** Pure data in a new `src/sgqr/font5x7.ts`, no dependency. Alternatives: a canvas/SVG renderer (not available in Workers), a font library (dependency for ~100 glyphs).
4. **Fit by truncation.** Max characters per line = image width / glyph advance; longer lines are cut and end with `...`. Non-ASCII maps to `?`. Simple and deterministic; wrapping is a later upgrade (`shortcut:` comment).
5. **Callers build the lines; the renderer only draws.** Handlers already hold the name-only values used for captions (`captionPart`/`recipientName` rules), so the "name, never the number" rule is applied once at the call site. Event name comes from the event already loaded in `/start`.

## Risks / Trade-offs

- [Text hurts scanning] → text sits outside the quiet zone below the QR; add a jsQR round-trip test with lines present.
- [Image grows] → ~5 extra lines at 2x is a few dozen pixel rows; BMP stays far below Telegram's 10 MB photo limit.
- [Telegram re-compresses photos] → 2x scale keeps glyphs legible after JPEG recompression.
- [Names with accents/emoji look wrong] → shown as `?` on the image only; accepted.
