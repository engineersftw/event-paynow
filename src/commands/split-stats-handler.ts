import type { SplitUsageSnapshot } from '../db/usage-repository';

const pct = (n: number, total: number) => `${Math.round((n / total) * 100)}%`;

/**
 * Plain-text usage report for Split_PayNow_Bot. Numbers only: no names, usernames, ids,
 * PayNow numbers, descriptions or amounts. Access is the same as the Event bot's /stats.
 */
export function formatSplitStats(s: SplitUsageSnapshot, now: Date = new Date()): string {
  const sgt = new Date(now.getTime() + 8 * 3600_000).toISOString().slice(0, 16).replace('T', ' ');
  const lines = [`📊 Split_PayNow_Bot usage (as of ${sgt} SGT)`, ''];
  const scans = s.scans.ok + s.scans.failed;

  if (s.confirmed.total === 0 && scans === 0) {
    lines.push('No splits counted yet.');
  } else {
    lines.push(
      `Splits confirmed: ${s.confirmed.total} (last 7 days ${s.confirmed.last7}, last 30 days ${s.confirmed.last30})`
    );
    if (s.confirmed.total > 0) {
      const t = s.confirmed.total;
      lines.push(
        `  equal ${s.types.equal} (${pct(s.types.equal, t)}), custom ${s.types.custom} (${pct(s.types.custom, t)}), receipt ${s.types.receipt} (${pct(s.types.receipt, t)})`,
        `  private chats ${s.places.private}, groups ${s.places.group}`
      );
    }
    lines.push(`QR codes posted in the chat: ${s.qrs.chat}`);
    lines.push(
      scans === 0
        ? 'Receipt scans: none yet'
        : `Receipt scans: ${s.scans.ok} read, ${s.scans.failed} failed (${pct(s.scans.ok, scans)} read)`
    );
  }
  lines.push('', 'Counting began when this report was added, so earlier splits are not included.');
  return lines.join('\n');
}
