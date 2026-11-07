import { describe, expect, it } from 'vitest';
import { formatCents, parseAmount } from '../../src/sgqr/amount';

describe('parseAmount', () => {
  it('parses integer amounts', () => {
    expect(parseAmount('10')).toBe(1000);
    expect(parseAmount('1')).toBe(100);
    expect(parseAmount('100')).toBe(10000);
  });

  it('parses amounts with 1 decimal', () => {
    expect(parseAmount('12.5')).toBe(1250);
    expect(parseAmount('0.5')).toBe(50);
  });

  it('parses amounts with 2 decimals', () => {
    expect(parseAmount('12.50')).toBe(1250);
    expect(parseAmount('0.05')).toBe(5);
    expect(parseAmount('99.99')).toBe(9999);
  });

  it('trims whitespace', () => {
    expect(parseAmount('  12.50  ')).toBe(1250);
  });

  it('rejects more than 2 decimals', () => {
    expect(parseAmount('12.505')).toBeNull();
    expect(parseAmount('1.123')).toBeNull();
  });

  it('rejects negative amounts', () => {
    expect(parseAmount('-10')).toBeNull();
    expect(parseAmount('-0.01')).toBeNull();
  });

  it('rejects zero', () => {
    expect(parseAmount('0')).toBeNull();
    expect(parseAmount('0.00')).toBeNull();
  });

  it('rejects empty or non-numeric input', () => {
    expect(parseAmount('')).toBeNull();
    expect(parseAmount('   ')).toBeNull();
    expect(parseAmount('abc')).toBeNull();
    expect(parseAmount('12.50.10')).toBeNull();
    expect(parseAmount('1,250')).toBeNull();
  });

  it('rejects non-string input', () => {
    // @ts-expect-error testing runtime behavior
    expect(parseAmount(null)).toBeNull();
    // @ts-expect-error testing runtime behavior
    expect(parseAmount(undefined)).toBeNull();
    // @ts-expect-error testing runtime behavior
    expect(parseAmount(12.5)).toBeNull();
  });
});

describe('formatCents', () => {
  it('formats integer cents to 2-decimal string', () => {
    expect(formatCents(1250)).toBe('12.50');
    expect(formatCents(5)).toBe('0.05');
    expect(formatCents(100)).toBe('1.00');
    expect(formatCents(0)).toBe('0.00');
    expect(formatCents(9999)).toBe('99.99');
  });

  it('throws on non-integer cents', () => {
    expect(() => formatCents(12.5)).toThrow('Invalid cents');
  });

  it('throws on negative cents', () => {
    expect(() => formatCents(-100)).toThrow('Invalid cents');
  });
});
