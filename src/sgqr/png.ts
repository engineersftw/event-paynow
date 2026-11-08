/**
 * Convert the renderer's 24-bit top-down BMP into a PNG (browsers show PNG everywhere; Telegram
 * keeps getting the BMP). Pure JS plus the platform CompressionStream, so it runs in Workers
 * and in Node.
 */

const CRC_TABLE = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();

function crc32(bytes: Uint8Array): number {
  let c = 0xffffffff;
  for (const b of bytes) c = CRC_TABLE[(c ^ b) & 0xff]! ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function chunk(type: string, data: Uint8Array): Uint8Array {
  const out = new Uint8Array(12 + data.length);
  const view = new DataView(out.buffer);
  view.setUint32(0, data.length);
  for (let i = 0; i < 4; i++) out[4 + i] = type.charCodeAt(i);
  out.set(data, 8);
  view.setUint32(8 + data.length, crc32(out.subarray(4, 8 + data.length)));
  return out;
}

async function deflate(data: Uint8Array): Promise<Uint8Array> {
  const stream = new Blob([data]).stream().pipeThrough(new CompressionStream('deflate'));
  return new Uint8Array(await new Response(stream).arrayBuffer());
}

export async function bmpToPng(bmp: Uint8Array): Promise<Uint8Array> {
  const view = new DataView(bmp.buffer, bmp.byteOffset, bmp.byteLength);
  const width = view.getInt32(18, true);
  const height = view.getInt32(22, true);
  // shortcut: only the renderer's own format (24-bit, uncompressed, top-down) is supported
  if (bmp[0] !== 0x42 || bmp[1] !== 0x4d || view.getUint16(28, true) !== 24 || height >= 0) {
    throw new Error('bmpToPng: expected a 24-bit top-down BMP');
  }
  const rows = -height;
  const stride = (width * 3 + 3) & ~3;
  const dataOffset = view.getUint32(10, true);

  const raw = new Uint8Array(rows * (1 + width * 3));
  let o = 0;
  for (let y = 0; y < rows; y++) {
    raw[o++] = 0; // filter: none
    const row = dataOffset + y * stride;
    for (let x = 0; x < width; x++) {
      raw[o++] = bmp[row + x * 3 + 2]!; // R
      raw[o++] = bmp[row + x * 3 + 1]!; // G
      raw[o++] = bmp[row + x * 3]!; // B
    }
  }

  const ihdr = new Uint8Array(13);
  const h = new DataView(ihdr.buffer);
  h.setUint32(0, width);
  h.setUint32(4, rows);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 2; // colour type: RGB

  const parts = [
    new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', await deflate(raw)),
    chunk('IEND', new Uint8Array(0)),
  ];
  const png = new Uint8Array(parts.reduce((n, p) => n + p.length, 0));
  let at = 0;
  for (const p of parts) {
    png.set(p, at);
    at += p.length;
  }
  return png;
}
