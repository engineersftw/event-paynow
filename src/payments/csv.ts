import { formatCents } from '../sgqr/amount';
import { parseFormFields } from './form-fields';

/** The payment fields the export reads (a subset of `Payment`, so tests can build rows cheaply). */
export interface ExportRow {
  ref: string;
  createdAt: string;
  status: string;
  amountCents: number;
  payerName?: string | null;
  payerEmail?: string | null;
  answers?: string | null;
  checkedInAt?: string | null;
}

/**
 * One cell. A value a spreadsheet would run as a formula (`=`, `+`, `-`, `@`, tab, carriage return
 * first) gets a leading apostrophe so it shows as text; this is the one place free text typed by a
 * registrant reaches a formula-capable program. Always quoted, quotes doubled.
 */
export function csvCell(value: string | null | undefined): string {
  let v = value ?? '';
  if (/^[=+\-@\t\r]/.test(v)) v = `'${v}`;
  return `"${v.replace(/"/g, '""')}"`;
}

function answersOf(row: ExportRow): Array<{ label: string; value: string }> {
  try {
    const v = JSON.parse(row.answers ?? 'null') as unknown;
    return Array.isArray(v)
      ? v.filter(
          (a): a is { label: string; value: string } =>
            typeof a?.label === 'string' && typeof a?.value === 'string'
        )
      : [];
  } catch {
    return [];
  }
}

/**
 * The registrants file: UTF-8 with a byte order mark (so Excel reads it), CRLF line ends, no PayNow
 * numbers. Email and custom columns appear when the event asks for them now or any row has a value,
 * so answers given before a field was removed are kept. `truncatedAt` adds a note row.
 */
export function buildRegistrantCsv(
  formFields: string | null,
  rows: ExportRow[],
  truncatedAt?: number
): string {
  const form = parseFormFields(formFields);
  const labels = [...form.custom];
  for (const r of rows)
    for (const a of answersOf(r)) if (!labels.includes(a.label)) labels.push(a.label);
  const withEmail = form.email || rows.some((r) => r.payerEmail);

  const header = [
    'Reference',
    'Created',
    'Status',
    'Amount (SGD)',
    'Name',
    ...(withEmail ? ['Email'] : []),
    ...labels,
    'Checked in',
  ];
  const lines = [header.map(csvCell).join(',')];
  for (const r of rows) {
    const byLabel = new Map(answersOf(r).map((a) => [a.label, a.value]));
    lines.push(
      [
        r.ref,
        r.createdAt,
        r.status,
        formatCents(r.amountCents),
        r.payerName,
        ...(withEmail ? [r.payerEmail] : []),
        ...labels.map((l) => byLabel.get(l)),
        r.checkedInAt,
      ]
        .map(csvCell)
        .join(',')
    );
  }
  if (truncatedAt !== undefined) {
    lines.push(csvCell(`Only the first ${truncatedAt} payments are listed.`));
  }
  return `﻿${lines.join('\r\n')}\r\n`;
}
