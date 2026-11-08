import jsQR from 'jsqr';
import { describe, expect, it } from 'vitest';
import { LOGO_COLOR } from '../../src/sgqr/paynow-logo';
import { renderQrPng } from '../../src/sgqr/qr-render';

/**
 * BMP (24-bit) → RGBA, mirroring test/workers/harness.ts so jsQR can decode
 * the isolate-rendered QR.
 */
function bmpToRgba(bytes: Uint8Array): {
  data: Uint8ClampedArray;
  width: number;
  height: number;
} {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  if (view.getUint8(0) !== 0x42 || view.getUint8(1) !== 0x4d) {
    throw new Error('not a BMP');
  }
  const dataOffset = view.getUint32(10, true);
  const width = view.getInt32(18, true);
  const heightRaw = view.getInt32(22, true);
  const height = Math.abs(heightRaw);
  const paddedRow = Math.ceil((width * 3) / 4) * 4;
  const data = new Uint8ClampedArray(width * height * 4);
  for (let y = 0; y < height; y++) {
    const srcRow = dataOffset + (heightRaw < 0 ? y * paddedRow : (height - 1 - y) * paddedRow);
    for (let x = 0; x < width; x++) {
      const i = srcRow + x * 3;
      const j = (y * width + x) * 4;
      data[j] = bytes[i + 2] ?? 0; // R
      data[j + 1] = bytes[i + 1] ?? 0; // G
      data[j + 2] = bytes[i] ?? 0; // B
      data[j + 3] = 255; // A
    }
  }
  return { data, width, height };
}

function isLogoColor(r: number, g: number, b: number): boolean {
  const [lr, lg, lb] = LOGO_COLOR;
  return Math.abs(r - lr) < 40 && Math.abs(g - lg) < 40 && Math.abs(b - lb) < 40;
}

describe('renderQrPng — PayNow logo overlay', () => {
  const payload =
    '00020101021226490009SG.PAYNOW010100211+6591234567030100507INV-001520400005303702540512.505802SG5912ACME PTE LTD6009Singapore62160112Dinner split63041AAF';

  it('overlays the PayNow logo in the center without breaking jsQR decoding', async () => {
    const bmp = await renderQrPng(payload);
    const { data, width, height } = bmpToRgba(bmp);

    // Still decodes back to the exact payload with the logo overlaid.
    const decoded = jsQR(data, width, height);
    expect(decoded).not.toBeNull();
    expect(decoded!.data).toBe(payload);
  });

  it('places logo-colored pixels in the center region', async () => {
    const bmp = await renderQrPng(payload);
    const { data, width, height } = bmpToRgba(bmp);

    // Count PayNow-color pixels within the central quarter.
    let logoPixels = 0;
    const cx = width / 2;
    const cy = height / 2;
    for (let y = Math.floor(cy - height / 8); y < Math.ceil(cy + height / 8); y++) {
      for (let x = Math.floor(cx - width / 8); x < Math.ceil(cx + width / 8); x++) {
        const j = (y * width + x) * 4;
        if (isLogoColor(data[j] ?? 0, data[j + 1] ?? 0, data[j + 2] ?? 0)) {
          logoPixels++;
        }
      }
    }

    // The logo occupies a meaningful (but small) part of the center.
    expect(logoPixels).toBeGreaterThan(200);
  });

  it('keeps the surrounding QR black/white outside the logo clear box', async () => {
    const bmp = await renderQrPng(payload);
    const { data, width, height } = bmpToRgba(bmp);

    // Top-left corner region should contain only pure black/white (no PayNow color).
    let brand = 0;
    for (let y = 0; y < height / 5; y++) {
      for (let x = 0; x < width / 5; x++) {
        const j = (y * width + x) * 4;
        if (isLogoColor(data[j] ?? 0, data[j + 1] ?? 0, data[j + 2] ?? 0)) {
          brand++;
        }
      }
    }
    expect(brand).toBe(0);
  });

  it('still decodes for short, medium and long payloads', async () => {
    for (const extra of [0, 40, 120]) {
      const long = payload.slice(0, -4) + 'x'.repeat(extra);
      const { data, width, height } = bmpToRgba(await renderQrPng(long));
      expect(jsQR(data, width, height)?.data, `extra=${extra}`).toBe(long);
    }
  });
});
