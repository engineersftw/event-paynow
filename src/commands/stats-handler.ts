import type { UsageSnapshot } from '../db/usage-repository';
import { formatCents } from '../sgqr/amount';

/**
 * Authorized Telegram user ids from a comma-separated list ("111, 222,333"). Spaces are fine and
 * anything that is not a whole positive number is ignored, so a missing, empty or malformed value
 * authorizes nobody.
 */
export function parseUserIds(value: string | undefined): Set<number> {
  const ids = new Set<number>();
  for (const part of (value ?? '').split(',')) {
    const t = part.trim();
    if (!/^\d+$/.test(t)) continue;
    const n = Number(t);
    if (Number.isSafeInteger(n) && n > 0) ids.add(n);
  }
  return ids;
}

const pct = (n: number, total: number) => `${Math.round((n / total) * 100)}%`;

/** Plain-text usage report. Numbers only: no names, PayNow numbers or references. */
export function formatStats(s: UsageSnapshot, now: Date = new Date()): string {
  const sgt = new Date(now.getTime() + 8 * 3600_000).toISOString().slice(0, 16).replace('T', ' ');
  const { events: e, payments: p, paybacks: b, simple: m } = s;
  const lines = [
    `📊 Usage (as of ${sgt} SGT)`,
    '',
    'Event PayNow Bot',
    `Events: ${e.total} (open ${e.open}, closed ${e.closed})`,
    `  created: last 7 days ${e.last7}, last 30 days ${e.last30}`,
    `  from ${e.chats} different chat${e.chats === 1 ? '' : 's'}`,
    `QR codes (payment requests): ${p.total}`,
    `  last 7 days ${p.last7}, last 30 days ${p.last30}`,
    `  pending ${p.pending}, received ${p.received}, voided ${p.voided}`,
    `  from the public payment page (no sign-in): ${p.anonymous}`,
    `Received: SGD ${formatCents(p.receivedCents)}`,
    `Checked in: ${p.checkedIn}`,
    `Paybacks: ${b.total} (sent ${b.sent})`,
    '',
    'Simple_PayNow_Bot',
  ];
  if (m.total === 0) {
    lines.push('No QR codes counted yet.');
  } else {
    lines.push(
      `QR codes made: ${m.total} (last 7 days ${m.last7}, last 30 days ${m.last30})`,
      'Amount choice:',
      `  skipped (payer enters it): ${m.skipped} (${pct(m.skipped, m.total)})`,
      `  fixed: ${m.fixed} (${pct(m.fixed, m.total)})`,
      `  payer can change: ${m.editable} (${pct(m.editable, m.total)})`
    );
  }
  return lines.join('\n');
}
