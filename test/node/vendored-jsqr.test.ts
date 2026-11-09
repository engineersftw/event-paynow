import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { buildPayNowPayload } from '../../src/sgqr/paynow';
import { renderQrPngBuffer } from '../../src/sgqr/qr-render-node';

/** The browser decoder shipped in web/public/vendor must be a working jsQR (the same one the tests use). */
describe('vendored jsQR', () => {
  it('decodes a payment QR to its exact payload', async () => {
    const source = readFileSync(join(__dirname, '../../web/public/vendor/jsqr.js'), 'utf-8');
    const mod: { exports: any } = { exports: {} };
    new Function('module', 'exports', source)(mod, mod.exports);
    const jsQR = mod.exports as (
      d: Uint8ClampedArray,
      w: number,
      h: number
    ) => { data: string } | null;

    const payload = buildPayNowPayload({
      proxyType: 'mobile',
      proxyValue: '+6591234567',
      amountCents: 2300,
      merchantName: 'Dinner',
      reference: 'ABCDE12345',
      description: 'Dinner',
    });
    const { PNG } = await import('pngjs');
    const png = PNG.sync.read(await renderQrPngBuffer(payload));
    const decoded = jsQR(new Uint8ClampedArray(png.data), png.width, png.height);
    expect(decoded?.data).toBe(payload);
  });
});
