import { describe, expect, it } from 'vitest';
import {
  captionPart,
  escapeMarkdown,
  payerLabel,
  plainPayerLabel,
  recipientName,
} from '../../src/commands/payer-label.js';

describe('payer-label helpers', () => {
  it('payerLabel escapes Markdown, plainPayerLabel does not', () => {
    expect(payerLabel('A_li*ce', '+6591234568')).toBe('A\\_li\\*ce (+6591234568)');
    expect(plainPayerLabel('A_li*ce', '+6591234568')).toBe('A_li*ce (+6591234568)');
    expect(escapeMarkdown('a`b[c')).toBe('a\\`b\\[c');
  });

  it('labels fall back to the bare proxy without a name', () => {
    expect(payerLabel(null, '+6591234568')).toBe('+6591234568');
    expect(plainPayerLabel(undefined, '+6591234568')).toBe('+6591234568');
    expect(plainPayerLabel('', '+6591234568')).toBe('+6591234568');
  });

  it('recipientName only resolves for the stored payer proxy', () => {
    expect(recipientName('+6591234568', 'Alice', '+6591234568')).toBe('Alice');
    expect(recipientName('+6591234568', 'Alice', '+6598765432')).toBeNull();
    expect(recipientName('+6591234568', null, '+6591234568')).toBeNull();
    expect(recipientName(null, 'Alice', '+6591234568')).toBeNull();
    expect(recipientName(undefined, undefined, '+6591234568')).toBeNull();
  });

  it('captionPart is empty without a name and never adds anything else', () => {
    expect(captionPart('Payer', 'Alice')).toEqual(['Payer: Alice']);
    expect(captionPart('To', 'Alice')).toEqual(['To: Alice']);
    expect(captionPart('Payer', null)).toEqual([]);
    expect(captionPart('To', '')).toEqual([]);
  });
});
