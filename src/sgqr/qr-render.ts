import qrcode from 'qrcode-generator';
import { BOT_LOGO_RGBA, BOT_LOGO_SIZE } from './bot-logo.js';
import { bandHeight, renderTextBand } from './text-band.js';

/**
 * Render a payload string as a QR code BMP image (Uint8Array) with the bot
 * logo overlaid in the center.
 *
 * Uses error correction level H (30% recovery) so the center logo can be
 * recovered by scanners. Pure JS — no canvas, no Buffer, runs in Workers
 * isolate and in Node identically.
 *
 * BMP chosen for simplicity (no zlib/deflate needed for PNG).
 * Telegram accepts BMP in sendPhoto.
 *
 * @param payload - The EMVCo/SGQR payload string to encode.
 * @param lines - Optional detail lines drawn as black text in a white band below the QR.
 * @returns BMP image as Uint8Array.
 */
export async function renderQrPng(payload: string, lines: string[] = []): Promise<Uint8Array> {
  // Generate QR matrix using qrcode-generator.
  // Type 0 = auto-detect version, "H" = 30% error correction (headroom for
  // the center logo overlay).
  const qr = qrcode(0, 'H');
  qr.addData(payload);
  qr.make();

  const moduleCount = qr.getModuleCount();
  // 8 px/module (design §3: 8–12) keeps the uncompressed BMP under 1MB even at
  // error-correction level H + the center logo overlay.
  const scale = 8;
  const margin = 2; // modules of white border

  // Center logo geometry (in modules): the bot logo is square.
  const logoBoxW = Math.max(4, Math.floor(moduleCount * 0.22));
  const logoBoxH = logoBoxW;
  const logoPad = 1; // modules of white padding around the logo
  const centerX = moduleCount / 2;
  const centerY = moduleCount / 2;
  const halfLogoW = logoBoxW / 2;
  const halfLogoH = logoBoxH / 2;
  const halfClearW = halfLogoW + logoPad;
  const halfClearH = halfLogoH + logoPad;

  const imageSize = moduleCount + margin * 2;
  const pixelSize = imageSize * scale;

  // Build BMP file
  // BMP header: 14 bytes
  // DIB header (BITMAPINFOHEADER): 40 bytes
  // Pixel data: pixelSize * pixelSize * 3 bytes (24-bit BGR)
  // Row padding: each row must be multiple of 4 bytes

  // Text band below the QR (outside its quiet zone), anti-aliased. shortcut: lines are shortened
  // with an ellipsis, not wrapped.
  const bandH = bandHeight(lines.length);
  const textBand = renderTextBand(lines, pixelSize, margin * scale);
  const height = pixelSize + bandH;

  const rowBytes = pixelSize * 3;
  const padding = (4 - (rowBytes % 4)) % 4;
  const paddedRowBytes = rowBytes + padding;
  const pixelDataSize = paddedRowBytes * height;
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
  view.setInt32(22, -height, true); // height (negative = top-down)
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
  for (let y = 0; y < height; y++) {
    if (y >= pixelSize) {
      for (let x = 0; x < pixelSize; x++) {
        const c = 255 - textBand[(y - pixelSize) * pixelSize + x]!;
        view.setUint8(offset++, c);
        view.setUint8(offset++, c);
        view.setUint8(offset++, c);
      }
      offset += padding;
      continue;
    }
    const fy = y / scale - margin; // fractional module coordinate
    const moduleY = Math.floor(fy);
    for (let x = 0; x < pixelSize; x++) {
      const fx = x / scale - margin;
      const moduleX = Math.floor(fx);

      // Default to the QR module value (black on white).
      let r = 255;
      let g = 255;
      let b = 255;

      const dx = fx - centerX;
      const dy = fy - centerY;

      if (Math.abs(dx) < halfClearW && Math.abs(dy) < halfClearH) {
        // Inside the white clear box behind the logo.
        if (Math.abs(dx) < halfLogoW && Math.abs(dy) < halfLogoH) {
          [r, g, b] = sampleLogo((dx + halfLogoW) / logoBoxW, (dy + halfLogoH) / logoBoxH);
        }
      } else if (moduleY >= 0 && moduleY < moduleCount && moduleX >= 0 && moduleX < moduleCount) {
        if (qr.isDark(moduleY, moduleX)) {
          r = 0;
          g = 0;
          b = 0;
        }
      }

      // BMP is BGR
      view.setUint8(offset++, b);
      view.setUint8(offset++, g);
      view.setUint8(offset++, r);
    }
    // Row padding
    for (let p = 0; p < padding; p++) {
      view.setUint8(offset++, 0);
    }
  }

  return new Uint8Array(buffer);
}

/**
 * Bilinear sample of the bot logo at (u, v) in 0..1, composited over white. The embedded pixels
 * are premultiplied, so the result is premultiplied color + (255 - alpha) of white.
 */
function sampleLogo(u: number, v: number): [number, number, number] {
  const n = BOT_LOGO_SIZE;
  const fx = Math.min(n - 1, Math.max(0, u * n - 0.5));
  const fy = Math.min(n - 1, Math.max(0, v * n - 0.5));
  const x0 = Math.floor(fx);
  const y0 = Math.floor(fy);
  const x1 = Math.min(n - 1, x0 + 1);
  const y1 = Math.min(n - 1, y0 + 1);
  const tx = fx - x0;
  const ty = fy - y0;
  const px = (x: number, y: number, c: number) => BOT_LOGO_RGBA[(y * n + x) * 4 + c]!;
  const mix = (c: number) =>
    (px(x0, y0, c) * (1 - tx) + px(x1, y0, c) * tx) * (1 - ty) +
    (px(x0, y1, c) * (1 - tx) + px(x1, y1, c) * tx) * ty;
  const white = 255 - mix(3);
  return [Math.round(mix(0) + white), Math.round(mix(1) + white), Math.round(mix(2) + white)];
}
