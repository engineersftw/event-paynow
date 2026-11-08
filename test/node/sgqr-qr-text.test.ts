import jsQR from 'jsqr';
import { describe, expect, it } from 'vitest';
import { COVERAGE, FONT_FIRST, GLYPHS } from '../../src/sgqr/font-atlas';
import { renderQrPng } from '../../src/sgqr/qr-render';
import { bandHeight, fitLine, LINE_HEIGHT, renderTextBand } from '../../src/sgqr/text-band';

const PAYLOAD =
  '00020101021226490009SG.PAYNOW010100211+6591234567030100507INV-001520400005303702540512.505802SG5912ACME PTE LTD6009Singapore62160112Dinner split63041AAF';

/** Decode a 24-bit top-down BMP into RGBA for jsQR. */
function bmpToRgba(bmp: Uint8Array) {
  const v = new DataView(bmp.buffer, bmp.byteOffset, bmp.byteLength);
  const width = v.getInt32(18, true);
  const height = Math.abs(v.getInt32(22, true));
  const stride = (width * 3 + 3) & ~3;
  const data = new Uint8ClampedArray(width * height * 4);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const s = 54 + y * stride + x * 3;
      const d = (y * width + x) * 4;
      data[d] = bmp[s + 2]!;
      data[d + 1] = bmp[s + 1]!;
      data[d + 2] = bmp[s]!;
      data[d + 3] = 255;
    }
  }
  return { data, width, height };
}

describe('font atlas and text band', () => {
  it('has anti-aliased glyphs for every printable ASCII char, and ? for anything else', () => {
    expect(GLYPHS).toHaveLength(0x7e - FONT_FIRST + 1);
    for (let c = 0x21; c <= 0x7e; c++) expect(GLYPHS[c - FONT_FIRST]![1]).toBeGreaterThan(0);
    // coverage has intermediate grey levels, not just 0 and 255
    expect(COVERAGE.some((v) => v > 20 && v < 235)).toBe(true);
    const q = renderTextBand(['?'], 60, 4);
    expect(renderTextBand(['é'], 60, 4)).toEqual(q);
    expect(renderTextBand(['A'], 60, 4)).not.toEqual(q);
  });

  it('shortens by measured width with an ellipsis and never draws past the edge', () => {
    expect(fitLine('Hi', 200)).toBe('Hi');
    const fit = fitLine('x'.repeat(200), 300);
    expect(fit.endsWith('...')).toBe(true);
    expect(fit.length).toBeLessThan(200);
    // narrow glyphs fit more characters than wide ones in the same width
    expect(fitLine('i'.repeat(100), 300).length).toBeGreaterThan(
      fitLine('W'.repeat(100), 300).length
    );
    const band = renderTextBand(['W'.repeat(100)], 300, 16);
    expect(band).toHaveLength(300 * bandHeight(1));
    for (let y = 0; y < bandHeight(1); y++) {
      for (let x = 300 - 16; x < 300; x++) expect(band[y * 300 + x]).toBe(0);
    }
  });

  it('draws each line inside its own row', () => {
    const band = renderTextBand(['Hello', 'World'], 200, 8);
    expect(band).toHaveLength(200 * bandHeight(2));
    const inkRows = new Set<number>();
    band.forEach((v, i) => {
      if (v) inkRows.add(Math.floor(i / 200));
    });
    expect(Math.min(...inkRows)).toBeGreaterThanOrEqual(LINE_HEIGHT / 2 - 4);
    expect(Math.max(...inkRows)).toBeLessThan(bandHeight(2));
  });
});

describe('renderQrPng with detail lines', () => {
  it('without lines is unchanged; with lines the image is taller', async () => {
    const plain = await renderQrPng(PAYLOAD);
    expect(await renderQrPng(PAYLOAD, [])).toEqual(plain);
    const withText = await renderQrPng(PAYLOAD, ['Dinner split', 'SGD 12.50']);
    expect(withText.length).toBeGreaterThan(plain.length);
    expect(bmpToRgba(withText).height).toBeGreaterThan(bmpToRgba(plain).height);
  });

  it('still decodes to the same payload and draws ink in the text band', async () => {
    const lines = [
      'Team Lunch',
      'SGD 12.50',
      'ABC123DEFG',
      'Payer: Alice',
      'x'.repeat(200),
      'Zoë ☃',
    ];
    const { data, width, height } = bmpToRgba(await renderQrPng(PAYLOAD, lines));
    expect(jsQR(data, width, height)?.data).toBe(PAYLOAD);
    const qrHeight = bmpToRgba(await renderQrPng(PAYLOAD)).height;
    let ink = 0;
    for (let i = qrHeight * width * 4; i < data.length; i += 4) if (data[i]! < 128) ink++;
    expect(ink).toBeGreaterThan(100);
    let grey = 0; // anti-aliased glyph edges
    for (let i = qrHeight * width * 4; i < data.length; i += 4) {
      if (data[i]! > 20 && data[i]! < 235) grey++;
    }
    expect(grey).toBeGreaterThan(50);
  });
});
