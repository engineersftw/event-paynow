import qrcode from "qrcode-generator";

/**
 * Render a payload string as a QR code BMP image (Uint8Array).
 *
 * Uses error correction level M (15% recovery) and version auto-detect.
 * Pure JS — no canvas, no Buffer, runs in Workers isolate.
 *
 * BMP chosen for simplicity (no zlib/deflate needed for PNG).
 * Telegram accepts BMP in sendPhoto.
 *
 * @param payload - The EMVCo/SGQR payload string to encode.
 * @returns BMP image as Uint8Array.
 */
export async function renderQrPng(payload: string): Promise<Uint8Array> {
  // Generate QR matrix using qrcode-generator
  // Type 0 = auto-detect version, "M" = error correction level
  const qr = qrcode(0, "M");
  qr.addData(payload);
  qr.make();

  const moduleCount = qr.getModuleCount();
  const scale = 10; // pixels per module (design §3: scale 8–12)
  const margin = 2; // modules of white border

  const imageSize = moduleCount + margin * 2;
  const pixelSize = imageSize * scale;

  // Build BMP file
  // BMP header: 14 bytes
  // DIB header (BITMAPINFOHEADER): 40 bytes
  // Pixel data: pixelSize * pixelSize * 3 bytes (24-bit BGR)
  // Row padding: each row must be multiple of 4 bytes

  const rowBytes = pixelSize * 3;
  const padding = (4 - (rowBytes % 4)) % 4;
  const paddedRowBytes = rowBytes + padding;
  const pixelDataSize = paddedRowBytes * pixelSize;
  const fileSize = 14 + 40 + pixelDataSize;

  const buffer = new ArrayBuffer(fileSize);
  const view = new DataView(buffer);

  // BMP file header
  view.setUint8(0, 0x42); // 'B'
  view.setUint8(1, 0x4d); // 'M'
  view.setUint32(2, fileSize, true); // file size
  view.setUint32(6, 0, true); // reserved
  view.setUint32(10, 14 + 40, true); // pixel data offset

  // DIB header (BITMAPINFOHEADER)
  view.setUint32(14, 40, true); // header size
  view.setInt32(18, pixelSize, true); // width
  view.setInt32(22, -pixelSize, true); // height (negative = top-down)
  view.setUint16(26, 1, true); // color planes
  view.setUint16(28, 24, true); // bits per pixel
  view.setUint32(30, 0, true); // compression (0 = none)
  view.setUint32(34, pixelDataSize, true); // image size
  view.setInt32(38, 2835, true); // X pixels per meter
  view.setInt32(42, 2835, true); // Y pixels per meter
  view.setUint32(46, 0, true); // colors in palette
  view.setUint32(50, 0, true); // important colors

  // Pixel data (24-bit BGR, top-down)
  let offset = 54;
  for (let y = 0; y < pixelSize; y++) {
    const moduleY = Math.floor(y / scale) - margin;
    for (let x = 0; x < pixelSize; x++) {
      const moduleX = Math.floor(x / scale) - margin;

      let isBlack = false;
      if (moduleY >= 0 && moduleY < moduleCount && moduleX >= 0 && moduleX < moduleCount) {
        isBlack = qr.isDark(moduleY, moduleX);
      }

      // BMP is BGR
      if (isBlack) {
        view.setUint8(offset++, 0);     // B
        view.setUint8(offset++, 0);     // G
        view.setUint8(offset++, 0);     // R
      } else {
        view.setUint8(offset++, 255);   // B
        view.setUint8(offset++, 255);   // G
        view.setUint8(offset++, 255);   // R
      }
    }
    // Row padding
    for (let p = 0; p < padding; p++) {
      view.setUint8(offset++, 0);
    }
  }

  return new Uint8Array(buffer);
}
