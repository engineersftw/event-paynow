import { COVERAGE, FONT_ASCENT, FONT_DESCENT, FONT_FIRST, GLYPHS } from './font-atlas.js';

/** Height of one text row in px. */
export const LINE_HEIGHT = 32;

const glyphOf = (ch: string): number[] => {
  const g = GLYPHS[ch.charCodeAt(0) - FONT_FIRST];
  return g ?? GLYPHS['?'.charCodeAt(0) - FONT_FIRST]!;
};

/** Width of a string in 1/16 px (sum of advances; no kerning). */
const measure = (text: string): number => {
  let w = 0;
  for (const ch of text) w += glyphOf(ch)[0]!;
  return w;
};

/** Shorten to fit `maxWidth` px, ending in "..." (by measured width, not character count). */
export function fitLine(text: string, maxWidth: number): string {
  const limit = maxWidth * 16;
  if (measure(text) <= limit) return text;
  const chars = [...text];
  while (chars.length > 0 && measure(`${chars.join('')}...`) > limit) chars.pop();
  return `${chars.join('')}...`;
}

/** Height in px of the band for `count` lines (half a row of space above and below). */
export const bandHeight = (count: number): number => (count ? (count + 1) * LINE_HEIGHT : 0);

/**
 * Draw lines of text into an 8-bit coverage buffer (0 = white, 255 = full ink), `width` x
 * bandHeight(lines.length), starting `left` px from the edge. Glyphs are anti-aliased; a
 * character outside printable ASCII is drawn as `?`.
 */
export function renderTextBand(lines: string[], width: number, left: number): Uint8Array {
  const height = bandHeight(lines.length);
  const band = new Uint8Array(width * height);
  lines.forEach((raw, row) => {
    const line = fitLine(raw, width - 2 * left);
    // baseline, centering the font's ascent + descent inside the row
    const baseline =
      LINE_HEIGHT / 2 +
      row * LINE_HEIGHT +
      FONT_ASCENT +
      (LINE_HEIGHT - FONT_ASCENT - FONT_DESCENT) / 2;
    let pen = left * 16;
    for (const ch of line) {
      const [adv, w, h, xoff, yoff, at] = glyphOf(ch) as [
        number,
        number,
        number,
        number,
        number,
        number,
      ];
      const x0 = (pen >> 4) + xoff;
      const y0 = Math.round(baseline) + yoff;
      for (let gy = 0; gy < h; gy++) {
        for (let gx = 0; gx < w; gx++) {
          const x = x0 + gx;
          const y = y0 + gy;
          if (x < 0 || x >= width || y < 0 || y >= height) continue;
          const i = y * width + x;
          band[i] = Math.min(255, band[i]! + COVERAGE[at + gy * w + gx]!);
        }
      }
      pen += adv;
    }
  });
  return band;
}
