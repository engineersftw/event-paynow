import jsQR from 'jsqr';
import { describe, expect, it } from 'vitest';
import { glyph } from '../../src/sgqr/font5x7';
import { renderQrPng } from '../../src/sgqr/qr-render';

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

describe('font5x7', () => {
  it('has a glyph for every printable ASCII char and falls back to ? otherwise', () => {
    for (let c = 0x20; c <= 0x7e; c++) expect(glyph(String.fromCharCode(c))).toHaveLength(5);
    expect(glyph('é')).toEqual(glyph('?'));
    expect(glyph('A')).not.toEqual(glyph('B'));
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
    for (let i = qrHeight * width * 4; i < data.length; i += 4) if (data[i] === 0) ink++;
    expect(ink).toBeGreaterThan(100);
  });
});
