import { describe, expect, it } from 'vitest';
import { buildRegistrantCsv, csvCell } from '../../src/payments/csv';

const row = (over: Record<string, unknown> = {}) => ({
  ref: 'R1',
  createdAt: '2024-01-01T00:00:00Z',
  status: 'pending',
  amountCents: 1250,
  ...over,
});

describe('csvCell', () => {
  it('quotes and doubles quotes, keeping commas and newlines inside the cell', () => {
    expect(csvCell('a,"b"\nc')).toBe('"a,""b""\nc"');
    expect(csvCell(null)).toBe('""');
  });

  it.each(['=1+1', '+1', '-1', '@SUM(A1)', '\tx', '\rx'])(
    'neutralises a formula start: %j',
    (v) => {
      expect(csvCell(v)).toBe(`"'${v}"`);
    }
  );

  it('leaves ordinary text and numbers alone', () => {
    expect(csvCell('Ann = Lee')).toBe('"Ann = Lee"');
    expect(csvCell('12.50')).toBe('"12.50"');
  });
});

describe('buildRegistrantCsv', () => {
  const form = JSON.stringify({ name: true, email: true, custom: ['Dietary needs'] });

  it('writes a BOM, CRLF lines, the asked columns and one row per payment, with no PayNow number', () => {
    const csv = buildRegistrantCsv(form, [
      row({
        payerName: 'Ann Lee',
        payerEmail: 'ann@x.com',
        answers: JSON.stringify([{ label: 'Dietary needs', value: 'Vegan' }]),
        checkedInAt: '2024-01-02T00:00:00Z',
        payerValue: '+6591234567',
      }),
      row({ ref: 'R2', status: 'voided' }),
    ]);
    expect(csv.startsWith('﻿')).toBe(true);
    const lines = csv.slice(1).split('\r\n');
    expect(lines[0]).toBe(
      '"Reference","Created","Status","Amount (SGD)","Name","Email","Dietary needs","Checked in"'
    );
    expect(lines[1]).toBe(
      '"R1","2024-01-01T00:00:00Z","pending","12.50","Ann Lee","ann@x.com","Vegan","2024-01-02T00:00:00Z"'
    );
    expect(lines[2]).toBe('"R2","2024-01-01T00:00:00Z","voided","12.50","","","",""');
    expect(csv).not.toContain('6591234567');
  });

  it('has no Email or custom columns when nothing was asked and nothing was stored', () => {
    expect(buildRegistrantCsv(null, [row()]).split('\r\n')[0]).toBe(
      '﻿"Reference","Created","Status","Amount (SGD)","Name","Checked in"'
    );
  });

  it('keeps answers given before a field was removed or switched off', () => {
    const csv = buildRegistrantCsv(JSON.stringify({ name: false, email: false, custom: ['New'] }), [
      row({
        payerEmail: 'old@x.com',
        answers: JSON.stringify([{ label: 'Removed', value: 'kept' }]),
      }),
    ]);
    const [header, line] = csv.slice(1).split('\r\n');
    expect(header).toContain('"Email","New","Removed"');
    expect(line).toContain('"old@x.com","","kept"');
  });

  it('neutralises formulas typed by registrants and adds a note when truncated', () => {
    const csv = buildRegistrantCsv(form, [row({ payerName: '=HYPERLINK("x")' })], 5000);
    expect(csv).toContain(`"'=HYPERLINK(""x"")"`);
    expect(csv).toContain('Only the first 5000 payments are listed.');
  });

  it('survives malformed stored answers', () => {
    expect(() => buildRegistrantCsv(form, [row({ answers: 'not json' })])).not.toThrow();
  });
});
