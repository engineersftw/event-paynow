import { buildPayload, nestedTlv, tlv } from './index';

/** PayNow proxy types. */
export type ProxyType = 'mobile' | 'uen';

/** Numeric codes for SGQR PayNow proxy types (tag 26.01). */
const PROXY_TYPE_CODE: Record<ProxyType, string> = {
  mobile: '0',
  uen: '2',
};

/** Options for building a PayNow QR payload. */
export interface PayNowPayloadOptions {
  /** Proxy type — mobile or UEN. */
  proxyType: ProxyType;
  /** Proxy value — e.g. "+6591234567" or "201234567A". */
  proxyValue: string;
  /** Amount in integer cents (e.g. 1250 for $12.50). If undefined, editable. */
  amountCents?: number;
  /** Whether the payer can edit the amount at scan time. */
  editable?: boolean;
  /** Merchant/payee display name (truncated to 25 ANS chars if longer). */
  merchantName?: string;
  /** Payment reference (embedded in tag 26.05, truncated to 25 ANS). */
  reference?: string;
  /** Short description (embedded in tag 62.01, truncated to 25 ANS). */
  description?: string;
}

/**
 * Truncate a string to `maxLen` bytes (ANS = ASCII-only for SGQR purposes).
 * SGQR ANS fields use only printable ASCII; non-ASCII chars are dropped.
 */
export function truncateAnsi(value: string, maxLen: number): string {
  const cleaned = value.replace(/[^\x20-\x7E]/g, '');
  return cleaned.slice(0, maxLen);
}

/** Split a TLV string into [tag, value] pairs; null if the lengths do not add up. */
function readTlv(s: string): Array<[string, string]> | null {
  const fields: Array<[string, string]> = [];
  let i = 0;
  while (i < s.length) {
    const len = /^\d\d$/.test(s.slice(i + 2, i + 4)) ? Number(s.slice(i + 2, i + 4)) : -1;
    if (len < 0 || i + 4 + len > s.length) return null;
    fields.push([s.slice(i, i + 2), s.slice(i + 4, i + 4 + len)]);
    i += 4 + len;
  }
  return fields;
}

/**
 * The payment reference in a PayNow payload (tag 26, sub-tag 05, as `buildPayNowPayload` writes
 * it), or null when the payload has none or is malformed. Does not check the CRC.
 */
export function paymentReferenceFromPayload(payload: string): string | null {
  const merchant = readTlv(payload)?.find(([tag]) => tag === '26');
  const reference = merchant && readTlv(merchant[1])?.find(([tag]) => tag === '05');
  return reference?.[1] || null;
}

/**
 * Build an EMVCo-compliant PayNow (SGQR) payload string with CRC16.
 *
 * Field mapping per design §3:
 *   00: payload format indicator = "01"
 *   01: point of initiation = "12" (dynamic, one transaction)
 *   26: PayNow merchant account template
 *   52: merchant category code = "0000"
 *   53: currency = "702" (SGD)
 *   54: amount (decimal string, e.g. "12.50") — omitted if editable
 *   58: country = "SG"
 *   59: merchant name (max 25 ANS)
 *   60: city = "Singapore"
 *   62: additional data (description in 62.01)
 *   63: CRC16 (appended by buildPayload)
 */
export function buildPayNowPayload(opts: PayNowPayloadOptions): string {
  const {
    proxyType,
    proxyValue,
    amountCents,
    editable = false,
    merchantName = 'PAYNOW USER',
    reference,
    description,
  } = opts;

  // Build PayNow merchant account template (tag 26)
  const paynowFields: Array<[string, string]> = [
    ['00', 'SG.PAYNOW'],
    ['01', PROXY_TYPE_CODE[proxyType]],
    ['02', proxyValue],
    ['03', editable || amountCents === undefined ? '1' : '0'],
  ];
  if (reference) {
    paynowFields.push(['05', truncateAnsi(reference, 25)]);
  }
  const _paynowTemplate = nestedTlv('26', paynowFields);

  // Format amount as decimal string (e.g. 1250 → "12.50")
  // An amount is always carried when given; `editable` (tag 26.03) only says whether the payer may change it
  const amountStr = amountCents !== undefined ? (amountCents / 100).toFixed(2) : undefined;

  // Build the full payload
  const _fields: Array<[string, string]> = [
    ['00', '01'], // payload format indicator
    ['01', '12'], // dynamic point of initiation
    // paynowTemplate is a pre-built string starting with "26..."
    // We need to include it as a single field — use tlv directly with the inner
  ];

  // Insert the paynow template (already TLV-encoded with tag 26)
  // We'll build the content manually and include it in the CRC input
  const outerFields: Array<[string, string]> = [
    ['00', '01'],
    ['01', '12'],
  ];

  // Build inner content for the PayNow template (tag 26)
  const paynowInner = paynowFields.map(([t, v]) => tlv(t, v)).join('');
  outerFields.push(['26', paynowInner]);
  outerFields.push(['52', '0000']);
  outerFields.push(['53', '702']);
  if (amountStr !== undefined) {
    outerFields.push(['54', amountStr]);
  }
  outerFields.push(['58', 'SG']);
  outerFields.push(['59', truncateAnsi(merchantName, 25)]);
  outerFields.push(['60', 'Singapore']);

  // Additional data (tag 62) with description in sub-tag 01
  if (description) {
    const descField = tlv('01', truncateAnsi(description, 25));
    outerFields.push(['62', descField]);
  }

  return buildPayload(outerFields);
}
