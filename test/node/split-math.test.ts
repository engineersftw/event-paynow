import { describe, expect, it } from 'vitest';
import { parsePeople, splitEqually } from '../../src/commands/split-math';

describe('splitEqually', () => {
  it('divides evenly', () => {
    expect(splitEqually(12000, 4)).toEqual({
      shareCents: 3000,
      collectedCents: 12000,
      overCents: 0,
    });
  });
  it('rounds the share up and reports the over-collection', () => {
    expect(splitEqually(10000, 3)).toEqual({
      shareCents: 3334,
      collectedCents: 10002,
      overCents: 2,
    });
  });
  it('187.40 by 4 is 46.85', () => {
    expect(splitEqually(18740, 4).shareCents).toBe(4685);
  });
  it('never collects less than the bill', () => {
    for (let total = 2; total < 400; total += 7) {
      for (let n = 2; n <= Math.min(total, 100); n += 3) {
        const s = splitEqually(total, n);
        expect(s.overCents).toBeGreaterThanOrEqual(0);
        expect(s.overCents).toBeLessThan(n);
      }
    }
  });
});

describe('parsePeople', () => {
  it('accepts 2 to 100', () => {
    expect(parsePeople('2', 10000)).toBe(2);
    expect(parsePeople(' 100 ', 10000)).toBe(100);
  });
  it('rejects everything else', () => {
    for (const v of ['1', '0', '101', '-3', '2.5', 'four', '', '1e2']) {
      expect(parsePeople(v, 10000)).toBeNull();
    }
  });
  it('rejects more people than cents', () => {
    expect(parsePeople('5', 4)).toBeNull();
    expect(parsePeople('4', 4)).toBe(4);
  });
});
