import { describe, expect, it } from 'vitest';
import {
  checkLabel,
  describeFormFields,
  isEmail,
  NO_FIELDS,
  parseFormFields,
  serializeFormFields,
} from '../../src/commands/form-fields';

describe('form fields config', () => {
  it('round-trips and treats nothing as null', () => {
    const f = { name: true, email: false, custom: ['Dietary needs'] };
    expect(parseFormFields(serializeFormFields(f))).toEqual(f);
    expect(serializeFormFields(NO_FIELDS)).toBeNull();
  });

  it.each([null, undefined, '', 'not json', '{"custom":"x"}', '[]', 'null'])(
    'reads malformed value %j as nothing asked',
    (raw) => {
      expect(parseFormFields(raw as string | null)).toEqual(NO_FIELDS);
    }
  );

  it('drops bad labels and caps custom fields at three', () => {
    const raw = JSON.stringify({ custom: ['A', 5, '', 'B', 'C', 'D', 'x'.repeat(31)] });
    expect(parseFormFields(raw).custom).toEqual(['A', 'B', 'C']);
  });

  it('validates labels: length, limit, duplicates ignoring case, built-in names', () => {
    const f = { name: true, email: true, custom: ['Company'] };
    expect(checkLabel('  Dietary   needs ', f)).toEqual({ ok: true, label: 'Dietary needs' });
    expect(checkLabel('', f).ok).toBe(false);
    expect(checkLabel('x'.repeat(31), f).ok).toBe(false);
    expect(checkLabel('COMPANY', f).ok).toBe(false);
    expect(checkLabel('email', f).ok).toBe(false);
    expect(checkLabel('Full Name', f).ok).toBe(false);
    expect(checkLabel('D', { ...f, custom: ['A', 'B', 'C'] }).ok).toBe(false);
  });

  it('checks emails simply', () => {
    expect(isEmail('ann@example.com')).toBe(true);
    expect(isEmail('a.b+c@mail.example.co.uk')).toBe(true);
    for (const bad of [
      '',
      'ann',
      'ann@',
      '@example.com',
      'ann@example',
      'a b@x.com',
      'a@@x.com',
      'a@x..com',
    ]) {
      expect(isEmail(bad)).toBe(false);
    }
    expect(isEmail(`${'a'.repeat(120)}@x.com`)).toBe(false);
  });

  it('describes what is asked', () => {
    expect(describeFormFields(NO_FIELDS)).toBe('nothing extra');
    expect(describeFormFields({ name: true, email: true, custom: ['Company'] })).toBe(
      'Full name, Email, Company'
    );
  });
});
