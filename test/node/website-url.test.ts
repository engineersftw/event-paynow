import { describe, expect, it } from 'vitest';
import { normalizeWebsiteUrl } from '../../src/commands/website-url';

describe('normalizeWebsiteUrl', () => {
  it('accepts http and https addresses and returns the parsed form', () => {
    expect(normalizeWebsiteUrl('https://example.com/dinner')).toBe('https://example.com/dinner');
    expect(normalizeWebsiteUrl('http://www.example.com/a?b=1#c')).toBe(
      'http://www.example.com/a?b=1#c'
    );
    expect(normalizeWebsiteUrl('  https://example.com/x  ')).toBe('https://example.com/x');
    expect(normalizeWebsiteUrl('HTTPS://Example.COM/Path')).toBe('https://example.com/Path');
    expect(normalizeWebsiteUrl('https://example.com')).toBe('https://example.com/');
  });

  it('adds https:// when there is no scheme', () => {
    expect(normalizeWebsiteUrl('example.com/dinner')).toBe('https://example.com/dinner');
    expect(normalizeWebsiteUrl('www.example.sg')).toBe('https://www.example.sg/');
    expect(normalizeWebsiteUrl('example.com:8080/x')).toBe('https://example.com:8080/x');
  });

  it('rejects schemes other than http and https', () => {
    for (const bad of [
      'javascript:alert(1)',
      'JaVaScRiPt:alert(1)',
      'javascript://example.com/%0aalert(1)',
      'data:text/html,x',
      'mailto:a@b.com',
      'ftp://example.com',
      'file:///etc/passwd',
      'tel:+6591234567',
    ]) {
      expect(normalizeWebsiteUrl(bad), bad).toBeNull();
    }
  });

  it('rejects credentials, spaces, bare names and empty input', () => {
    for (const bad of [
      'https://user:pass@example.com',
      'https://user@example.com',
      'not a url',
      'https://exa mple.com',
      'localhost',
      'https://localhost/x',
      'intranet',
      'https://',
      '',
      '   ',
    ]) {
      expect(normalizeWebsiteUrl(bad), bad).toBeNull();
    }
  });

  it('enforces the 200 character limit on what is typed and on what would be stored', () => {
    expect(normalizeWebsiteUrl(`https://example.com/${'a'.repeat(170)}`)).not.toBeNull();
    expect(normalizeWebsiteUrl(`https://example.com/${'a'.repeat(200)}`)).toBeNull();
    // percent-encoding can make the stored form longer than what was typed
    expect(normalizeWebsiteUrl(`https://example.com/${'é'.repeat(100)}`)).toBeNull();
  });

  it('never returns anything but an http(s) address', () => {
    for (const input of [
      'example.com',
      'https://a.b/c d'.replace(' ', '%20'),
      'HTTP://A.B',
      'a.b/<script>',
    ]) {
      const out = normalizeWebsiteUrl(input);
      if (out !== null) expect(out).toMatch(/^https?:\/\//);
    }
    expect(normalizeWebsiteUrl('a.b/<script>')).toBe('https://a.b/%3Cscript%3E');
  });
});
