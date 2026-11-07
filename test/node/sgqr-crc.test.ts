import { describe, expect, it } from 'vitest';
import { buildPayload, crc16, nestedTlv, tlv } from '../../src/sgqr/index';

describe('TLV encoder', () => {
  it('encodes a basic field with 2-digit tag and 2-digit length', () => {
    expect(tlv('00', '01')).toBe('000201');
    expect(tlv('52', '0000')).toBe('52040000');
    expect(tlv('53', '702')).toBe('5303702');
  });

  it('zero-pads single-digit lengths', () => {
    expect(tlv('01', '1')).toBe('01011');
    expect(tlv('01', 'AB')).toBe('0102AB');
  });

  it('zero-pads tags shorter than 2 chars', () => {
    expect(tlv('1', 'X')).toBe('0101X');
    expect(tlv('0', 'Y')).toBe('0001Y');
  });

  it('throws if value exceeds 99 chars', () => {
    const long = 'A'.repeat(100);
    expect(() => tlv('00', long)).toThrow('TLV value too long');
  });

  it('accepts value of exactly 99 chars', () => {
    const val = 'A'.repeat(99);
    expect(tlv('00', val)).toBe(`0099${val}`);
  });
});

describe('nestedTlv', () => {
  it('builds a nested TLV template with inner fields', () => {
    const inner = nestedTlv('26', [
      ['00', 'SG.PAYNOW'],
      ['01', '0'],
      ['02', '+6591234567'],
    ]);
    // Inner: 0009SG.PAYNOW + 01010 + 0211+6591234567
    const expectedInner = '0009SG.PAYNOW' + '01010' + '0211+6591234567';
    expect(inner).toBe(`26${expectedInner.length.toString().padStart(2, '0')}${expectedInner}`);
  });

  it('handles empty inner fields', () => {
    expect(nestedTlv('26', [])).toBe('2600');
  });
});

describe('CRC16-CCITT-FALSE', () => {
  it("produces the standard test vector for '123456789'", () => {
    // Known test vector: CRC16-CCITT-FALSE("123456789") = 0x29B1
    expect(crc16('123456789')).toBe('29B1');
  });

  it('produces the known CRC for a real SGQR PayNow payload', () => {
    // From published SGQR spec example — mobile proxy, static, ACME PTE LTD
    // Full payload ends with CRC AD2F
    const payloadWithoutCrc =
      '00020101021126380009SG.PAYNOW010100211+6591234567030115204000053037025802SG5912ACME PTE LTD6009Singapore6304';
    expect(crc16(payloadWithoutCrc)).toBe('AD2F');
  });

  it('returns 4-char uppercase hex', () => {
    const result = crc16('test');
    expect(result).toMatch(/^[0-9A-F]{4}$/);
  });

  it('is deterministic', () => {
    expect(crc16('hello')).toBe(crc16('hello'));
  });

  it('handles empty input', () => {
    // CRC16-CCITT-FALSE of empty = 0xFFFF (init value, no bytes processed)
    expect(crc16('')).toBe('FFFF');
  });
});

describe('buildPayload', () => {
  it('appends CRC16 tag (63) with length 04 and the computed checksum', () => {
    const payload = buildPayload([
      ['00', '01'],
      ['53', '702'],
    ]);
    // Content: 000201 + 5303702 = "0002015303702"
    // CRC input: "00020153037026304"
    // CRC should be appended as "6304XXXX"
    expect(payload).toMatch(/^00020153037026304[0-9A-F]{4}$/);
  });

  it('produces the full known SGQR PayNow payload end-to-end', () => {
    const paynowTemplate = nestedTlv('26', [
      ['00', 'SG.PAYNOW'],
      ['01', '0'],
      ['02', '+6591234567'],
      ['03', '1'],
    ]);

    const payload = buildPayload([
      ['00', '01'],
      ['01', '11'],
      paynowTemplate.startsWith('26')
        ? ['26', paynowTemplate.slice(4)] // strip the outer "26xx"
        : ['26', ''],
      ['52', '0000'],
      ['53', '702'],
      ['58', 'SG'],
      ['59', 'ACME PTE LTD'],
      ['60', 'Singapore'],
    ]);

    expect(payload).toBe(
      '00020101021126380009SG.PAYNOW010100211+6591234567030115204000053037025802SG5912ACME PTE LTD6009Singapore6304AD2F'
    );
  });
});
