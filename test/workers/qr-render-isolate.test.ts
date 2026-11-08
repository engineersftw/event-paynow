import { describe, expect, it } from 'vitest';
import { renderQrPng } from '../../src/sgqr/qr-render';

describe('renderQrPng — Workers runtime', () => {
  it('renders a QR BMP inside the isolate (CPU time well within limits)', async () => {
    const payload =
      '00020101021226490009SG.PAYNOW010100211+6591234567030100507INV-001520400005303702540512.505802SG5912ACME PTE LTD6009Singapore62160112Dinner split63041AAF';

    const start = Date.now();
    const bmpBytes = await renderQrPng(payload);
    const elapsed = Date.now() - start;

    // Verify BMP signature
    expect(bmpBytes[0]).toBe(0x42); // 'B'
    expect(bmpBytes[1]).toBe(0x4d); // 'M'

    // Generous bound: a tight one flakes on loaded CI runners
    expect(elapsed).toBeLessThan(500);

    // Reasonable size
    expect(bmpBytes.length).toBeGreaterThan(100);
    expect(bmpBytes.length).toBeLessThan(1_000_000); // < 1MB for a QR
  });
});
