import { describe, expect, it } from 'vitest';
import {
  detectProxyType,
  generateRef,
  isValidUEN,
  normalizeMobile,
} from '../../src/db/proxy-validation';

describe('Proxy Validation', () => {
  // ==========================================================================
  // Mobile Number Validation
  // ==========================================================================

  describe('normalizeMobile', () => {
    describe('valid formats', () => {
      it('accepts 8-digit local format starting with 6', () => {
        expect(normalizeMobile('61234567')).toBe('+6561234567');
      });

      it('accepts 8-digit local format starting with 8', () => {
        expect(normalizeMobile('81234567')).toBe('+6581234567');
      });

      it('accepts 8-digit local format starting with 9', () => {
        expect(normalizeMobile('91234567')).toBe('+6591234567');
      });

      it('accepts +65XXXXXXXX format', () => {
        expect(normalizeMobile('+6591234567')).toBe('+6591234567');
      });

      it('accepts 65XXXXXXXX format (without +)', () => {
        expect(normalizeMobile('6591234567')).toBe('+6591234567');
      });

      it('trims whitespace', () => {
        expect(normalizeMobile('  91234567  ')).toBe('+6591234567');
      });

      it('accepts lowercase input', () => {
        expect(normalizeMobile('+6591234567')).toBe('+6591234567');
      });
    });

    describe('invalid formats', () => {
      it('rejects numbers starting with 3', () => {
        expect(normalizeMobile('31234567')).toBeNull();
      });

      it('rejects numbers starting with 5', () => {
        expect(normalizeMobile('51234567')).toBeNull();
      });

      it('rejects 7-digit numbers', () => {
        expect(normalizeMobile('9123456')).toBeNull();
      });

      it('rejects 9-digit numbers', () => {
        expect(normalizeMobile('912345678')).toBeNull();
      });

      it('rejects +65 with wrong digit count', () => {
        expect(normalizeMobile('+659123456')).toBeNull();
        expect(normalizeMobile('+65912345678')).toBeNull();
      });

      it('rejects empty string', () => {
        expect(normalizeMobile('')).toBeNull();
      });

      it('rejects non-numeric input', () => {
        expect(normalizeMobile('abcdefghij')).toBeNull();
      });

      it('rejects null/undefined', () => {
        expect(normalizeMobile(null as any)).toBeNull();
        expect(normalizeMobile(undefined as any)).toBeNull();
      });
    });
  });

  // ==========================================================================
  // UEN Validation
  // ==========================================================================

  describe('isValidUEN', () => {
    describe('valid formats', () => {
      it('accepts 9-character alphanumeric UEN', () => {
        expect(isValidUEN('201234567')).toBe(true);
      });

      it('accepts 10-character UEN with letter suffix', () => {
        expect(isValidUEN('201234567A')).toBe(true);
      });

      it('accepts 13-character UEN', () => {
        expect(isValidUEN('T09XX0000000L')).toBe(true);
      });

      it('accepts UEN with hyphens', () => {
        expect(isValidUEN('S12-FC-0001')).toBe(true);
      });

      it('accepts lowercase input', () => {
        expect(isValidUEN('201234567a')).toBe(true);
      });

      it('trims whitespace', () => {
        expect(isValidUEN('  201234567A  ')).toBe(true);
      });

      it('accepts UEN starting with letter', () => {
        expect(isValidUEN('T09XX0000L')).toBe(true);
      });
    });

    describe('invalid formats', () => {
      it('rejects 8-character UEN (too short)', () => {
        expect(isValidUEN('20123456')).toBe(false);
      });

      it('rejects 14-character UEN (too long)', () => {
        expect(isValidUEN('T09XX00000000L')).toBe(false);
      });

      it('rejects UEN with special characters', () => {
        expect(isValidUEN('201234567!')).toBe(false);
        expect(isValidUEN('201234567@')).toBe(false);
        expect(isValidUEN('201234567#')).toBe(false);
      });

      it('rejects empty string', () => {
        expect(isValidUEN('')).toBe(false);
      });

      it('rejects null/undefined', () => {
        expect(isValidUEN(null as any)).toBe(false);
        expect(isValidUEN(undefined as any)).toBe(false);
      });

      it('rejects UEN starting with hyphen', () => {
        expect(isValidUEN('-201234567')).toBe(false);
      });
    });
  });

  // ==========================================================================
  // Proxy Type Detection
  // ==========================================================================

  describe('detectProxyType', () => {
    it('detects mobile numbers', () => {
      const result = detectProxyType('91234567');
      expect(result).toEqual({
        type: 'mobile',
        normalized: '+6591234567',
      });
    });

    it('detects mobile with +65 prefix', () => {
      const result = detectProxyType('+6591234567');
      expect(result).toEqual({
        type: 'mobile',
        normalized: '+6591234567',
      });
    });

    it('detects UEN', () => {
      const result = detectProxyType('201234567A');
      expect(result).toEqual({
        type: 'uen',
        normalized: '201234567A',
      });
    });

    it('normalizes UEN to uppercase', () => {
      const result = detectProxyType('201234567a');
      expect(result).toEqual({
        type: 'uen',
        normalized: '201234567A',
      });
    });

    it('returns null for invalid input', () => {
      expect(detectProxyType('invalid')).toBeNull();
      expect(detectProxyType('123')).toBeNull();
      expect(detectProxyType('')).toBeNull();
    });
  });

  // ==========================================================================
  // Reference Generator
  // ==========================================================================

  describe('generateRef', () => {
    it('generates 10-character string', () => {
      const ref = generateRef();
      expect(ref).toHaveLength(10);
    });

    it('uses only base32 alphabet', () => {
      const ref = generateRef();
      expect(ref).toMatch(/^[A-Z2-7]{10}$/);
    });

    it('generates unique references', () => {
      const refs = new Set<string>();
      for (let i = 0; i < 1000; i++) {
        refs.add(generateRef());
      }
      // All 1000 refs should be unique
      expect(refs.size).toBe(1000);
    });

    it('generates different references each time', () => {
      const ref1 = generateRef();
      const ref2 = generateRef();
      expect(ref1).not.toBe(ref2);
    });
  });
});
