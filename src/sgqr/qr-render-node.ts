import QRCode from "qrcode";

/**
 * Render a payload string as a QR code PNG (Buffer) using Node-mode qrcode.
 * This uses toBuffer which requires Node Buffer — use renderQrPng (BMP) for Workers.
 */
export async function renderQrPngBuffer(payload: string): Promise<Buffer> {
  return await QRCode.toBuffer(payload, {
    type: "png",
    errorCorrectionLevel: "M",
    scale: 10,
    margin: 2,
  });
}
