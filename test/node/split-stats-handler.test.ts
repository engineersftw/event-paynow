import { describe, expect, it } from 'vitest';
import { formatSplitStats } from '../../src/commands/split-stats-handler';
import type { SplitUsageSnapshot } from '../../src/db/usage-repository';

const NOW = new Date('2026-11-10T04:00:00Z');
const base: SplitUsageSnapshot = {
  confirmed: { total: 0, last7: 0, last30: 0 },
  types: { equal: 0, custom: 0, receipt: 0 },
  places: { private: 0, group: 0 },
  qrs: { chat: 0 },
  scans: { ok: 0, failed: 0 },
};

describe('formatSplitStats', () => {
  it('says so when nothing has been counted', () => {
    const text = formatSplitStats(base, NOW);
    expect(text).toContain('Split_PayNow_Bot usage (as of 2026-11-10 12:00 SGT)');
    expect(text).toContain('No splits counted yet.');
    expect(text).not.toContain('Splits confirmed');
  });

  it('shows the figures with percentages', () => {
    const text = formatSplitStats(
      {
        confirmed: { total: 4, last7: 3, last30: 4 },
        types: { equal: 1, custom: 1, receipt: 2 },
        places: { private: 3, group: 1 },
        qrs: { chat: 6 },
        scans: { ok: 2, failed: 1 },
      },
      NOW
    );
    expect(text).toContain('Splits confirmed: 4 (last 7 days 3, last 30 days 4)');
    expect(text).toContain('equal 1 (25%), custom 1 (25%), receipt 2 (50%)');
    expect(text).toContain('private chats 3, groups 1');
    expect(text).toContain('QR codes posted in the chat: 6');
    expect(text).toContain('Receipt scans: 2 read, 1 failed (67% read)');
    expect(text).not.toContain('direct message');
    expect(text).not.toContain('Waiting QRs');
    expect(text).toContain('Counting began when this report was added');
  });

  it('handles scans with no splits and splits with no scans', () => {
    expect(formatSplitStats({ ...base, scans: { ok: 0, failed: 2 } }, NOW)).toContain(
      'Receipt scans: 0 read, 2 failed (0% read)'
    );
    expect(
      formatSplitStats({ ...base, confirmed: { total: 1, last7: 1, last30: 1 } }, NOW)
    ).toContain('Receipt scans: none yet');
  });

  it('contains numbers only', () => {
    const text = formatSplitStats(base, NOW);
    expect(text).not.toMatch(/@|\+65|\bSGD\b/);
  });
});
