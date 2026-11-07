import { describe, it, expect } from "vitest";
import { renderQrPngBuffer } from "../../src/sgqr/qr-render-node";
import jsQR from "jsqr";
import { PNG } from "pngjs";

describe("renderQrPngBuffer — Node pool with jsQR round-trip", () => {
  it("renders a payload to PNG and decodes it back with jsQR — decoded string equals payload", async () => {
    const payload =
      "00020101021226490009SG.PAYNOW010100211+6591234567030100507INV-001520400005303702540512.505802SG5912ACME PTE LTD6009Singapore62160112Dinner split63041AAF";
    const pngBuffer = await renderQrPngBuffer(payload);

    // Decode PNG to raw pixel data
    const png = PNG.sync.read(pngBuffer);
    const { data, width, height } = png;

    // jsQR expects Uint8ClampedArray
    const clampedData = new Uint8ClampedArray(data.buffer, data.byteOffset, data.byteLength);

    // Decode with jsQR
    const decoded = jsQR(clampedData, width, height);

    expect(decoded).not.toBeNull();
    expect(decoded!.data).toBe(payload);
  });

  it("round-trips a short payload", async () => {
    const payload = "HELLO";
    const pngBuffer = await renderQrPngBuffer(payload);
    const png = PNG.sync.read(pngBuffer);
    const clampedData = new Uint8ClampedArray(png.data.buffer, png.data.byteOffset, png.data.byteLength);
    const decoded = jsQR(clampedData, png.width, png.height);
    expect(decoded!.data).toBe(payload);
  });

  it("round-trips a long PayNow payload", async () => {
    const payload =
      "00020101021226380009SG.PAYNOW010100211+6591234567030115204000053037025802SG5912ACME PTE LTD6009Singapore6304AD2F";
    const pngBuffer = await renderQrPngBuffer(payload);
    const png = PNG.sync.read(pngBuffer);
    const clampedData = new Uint8ClampedArray(png.data.buffer, png.data.byteOffset, png.data.byteLength);
    const decoded = jsQR(clampedData, png.width, png.height);
    expect(decoded!.data).toBe(payload);
  });
});
