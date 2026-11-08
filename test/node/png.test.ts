import jsQR from 'jsqr';
import { PNG } from 'pngjs';
import { describe, expect, it } from 'vitest';
import { bmpToPng } from '../../src/sgqr/png';
import { renderQrPng } from '../../src/sgqr/qr-render';

const PAYLOAD =
  '00020101021226490009SG.PAYNOW010100211+6591234567030100507INV-001520400005303702540512.505802SG5912ACME PTE LTD6009Singapore62160112Dinner split63041AAF';

describe('bmpToPng', () => {
  it('produces a PNG with the same pixels as the BMP, smaller, and the QR still decodes', async () => {
    const bmp = await renderQrPng(PAYLOAD, ['Payback for ABC', 'SGD 5.00']);
    const png = await bmpToPng(bmp);

    expect([...png.subarray(0, 8)]).toEqual([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
    expect(png.length).toBeLessThan(bmp.length);

    const decoded = PNG.sync.read(Buffer.from(png));
    const view = new DataView(bmp.buffer, bmp.byteOffset, bmp.byteLength);
    expect(decoded.width).toBe(view.getInt32(18, true));
    expect(decoded.height).toBe(-view.getInt32(22, true));

    const stride = (decoded.width * 3 + 3) & ~3;
    for (const [x, y] of [
      [0, 0],
      [20, 30],
      [decoded.width - 1, decoded.height - 1],
      [Math.floor(decoded.width / 2), Math.floor(decoded.height / 2)],
    ] as const) {
      const s = 54 + y * stride + x * 3;
      const d = (y * decoded.width + x) * 4;
      expect([decoded.data[d], decoded.data[d + 1], decoded.data[d + 2]]).toEqual([
        bmp[s + 2],
        bmp[s + 1],
        bmp[s],
      ]);
    }

    const clamped = new Uint8ClampedArray(
      decoded.data.buffer,
      decoded.data.byteOffset,
      decoded.data.byteLength
    );
    expect(jsQR(clamped, decoded.width, decoded.height)?.data).toBe(PAYLOAD);
  });

  it('rejects anything that is not the renderer’s BMP', async () => {
    await expect(bmpToPng(new Uint8Array(60))).rejects.toThrow(/24-bit top-down BMP/);
  });
});
