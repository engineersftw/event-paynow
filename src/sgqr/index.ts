/**
 * SGQR / EMVCo Merchant-Presented Mode (MPM) payload builder.
 *
 * Runtime-agnostic: no Node APIs, runs identically in Node vitest
 * and inside a V8 isolate (Cloudflare Workers).
 */

/**
 * Build a single TLV (Tag-Length-Value) field.
 * Tag is 2 chars, length is 2 chars (zero-padded), value is the content.
 */
export function tlv(tag: string, value: string): string {
  const len = value.length;
  if (len > 99) {
    throw new Error(`TLV value too long: ${len} > 99 (tag=${tag})`);
  }
  const tagStr = tag.padStart(2, '0');
  const lenStr = len.toString().padStart(2, '0');
  return `${tagStr}${lenStr}${value}`;
}

/**
 * Build a nested TLV field — value is itself a sequence of TLV sub-fields.
 */
export function nestedTlv(tag: string, fields: Array<[string, string]>): string {
  const inner = fields.map(([t, v]) => tlv(t, v)).join('');
  return tlv(tag, inner);
}

/**
 * CRC16-CCITT-FALSE (ISO/IEC 13239).
 * Input: ASCII string; Output: 4-char uppercase hex.
 *
 * Polynomial: 0x1021, init: 0xFFFF, no final XOR.
 * Algorithm processes one byte at a time, 8-bit shifts.
 */
export function crc16(input: string): string {
  let crc = 0xffff;
  for (let i = 0; i < input.length; i++) {
    const byte = input.charCodeAt(i);
    crc ^= byte << 8;
    for (let j = 0; j < 8; j++) {
      if (crc & 0x8000) {
        crc = ((crc << 1) ^ 0x1021) & 0xffff;
      } else {
        crc = (crc << 1) & 0xffff;
      }
    }
  }
  return (crc & 0xffff).toString(16).toUpperCase().padStart(4, '0');
}

/**
 * Build a complete EMVCo MPM payload with CRC16 checksum appended.
 * The CRC is computed over (content + "6304"), then "6304<CRC>" is appended.
 *
 * @param fields - Array of [tag, value] TLV pairs in order. Use `nestedTlv`
 *                 output as a value for nested templates.
 */
export function buildPayload(fields: Array<[string, string]>): string {
  const content = fields.map(([tag, value]) => tlv(tag, value)).join('');
  // CRC is computed over content + "6304"
  const crcInput = `${content}6304`;
  const checksum = crc16(crcInput);
  return `${crcInput}${checksum}`;
}
