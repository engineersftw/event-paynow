import { describe, expect, it } from 'vitest';
import { renderQrPng } from '../../src/sgqr/qr-render';

describe('renderQrPng', () => {
  it('renders a payload to BMP bytes (valid BMP signature)', async () => {
    const payload =
      '00020101021226490009SG.PAYNOW010100211+6591234567030100507INV-001520400005303702540512.505802SG5912ACME PTE LTD6009Singapore62160112Dinner split63041AAF';
    const bmpBytes = await renderQrPng(payload);

    // Verify BMP signature ('BM')
    expect(bmpBytes[0]).toBe(0x42); // 'B'
    expect(bmpBytes[1]).toBe(0x4d); // 'M'

    // Verify non-empty
    expect(bmpBytes.length).toBeGreaterThan(100);
  });

  it('produces different QR codes for different payloads', async () => {
    const payload1 = '00020101021253037026304ABCD';
    const payload2 = '000201010212530370263041234';
    const bmp1 = await renderQrPng(payload1);
    const bmp2 = await renderQrPng(payload2);

    // Different payloads should produce different BMPs
    expect(bmp1).not.toEqual(bmp2);
  });

  it('produces the same QR code for the same payload (deterministic)', async () => {
    const payload = '00020101021253037026304ABCD';
    const bmp1 = await renderQrPng(payload);
    const bmp2 = await renderQrPng(payload);

    expect(bmp1).toEqual(bmp2);
  });
});
