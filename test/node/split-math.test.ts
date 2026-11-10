import { describe, expect, it } from 'vitest';
import {
  applyLeftover,
  groupByAmount,
  parseCustomList,
  parsePeople,
  splitEqually,
} from '../../src/commands/split-math';

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

describe('parseCustomList', () => {
  const ok = (t: string) => {
    const r = parseCustomList(t);
    if (!r.ok) throw new Error(r.error);
    return r.entries;
  };
  it('parses lines, including multi-word names and blank lines', () => {
    expect(ok('Ann 40\n\n  Mary Ann   12.50 ')).toEqual([
      { name: 'Ann', cents: 4000 },
      { name: 'Mary Ann', cents: 1250 },
    ]);
  });
  it('names the first bad line', () => {
    for (const bad of ['Ann', '40', 'Ann 0', 'Ann -5', 'Ann 1.234', 'Ann abc']) {
      const r = parseCustomList(`Bob 10\n${bad}`);
      expect(r.ok).toBe(false);
      if (!r.ok) expect(r.error).toContain(bad);
    }
  });
  it('rejects repeated names ignoring case, long names, empty and 21 people', () => {
    expect(parseCustomList('Ann 10\nann 20').ok).toBe(false);
    expect(parseCustomList(`${'x'.repeat(21)} 10`).ok).toBe(false);
    expect(parseCustomList('  \n ').ok).toBe(false);
    const many = Array.from({ length: 21 }, (_, i) => `P${i} 1`).join('\n');
    expect(parseCustomList(many).ok).toBe(false);
    expect(parseCustomList(many.split('\n').slice(0, 20).join('\n')).ok).toBe(true);
  });
});

describe('applyLeftover and groupByAmount', () => {
  const two = [
    { name: 'Ann', cents: 4000 },
    { name: 'Bob', cents: 4000 },
  ];
  it('splits the leftover evenly: 100.00 with Ann 40 and Bob 40 gives 50.00 each', () => {
    const r = applyLeftover(two, 10000, 'even');
    expect(r.entries.map((e) => e.cents)).toEqual([5000, 5000]);
    expect(r.overCents).toBe(0);
  });
  it('rounds the even share up and reports the over-collection', () => {
    const three = ['A', 'B', 'C'].map((name) => ({ name, cents: 0 + 100 }));
    const r = applyLeftover(three, 1300, 'even'); // leftover 10.00 over 3 people
    expect(r.extraCents).toBe(334);
    expect(r.overCents).toBe(2);
  });
  it('leaves the leftover out', () => {
    const r = applyLeftover(two, 10000, 'omit');
    expect(r.entries).toEqual(two);
    expect(r.leftoverCents).toBe(2000);
    expect(r.overCents).toBe(0);
  });
  it('groups people by distinct amount in first-appearance order', () => {
    expect(
      groupByAmount([
        { name: 'Ann', cents: 4000 },
        { name: 'Bob', cents: 2500 },
        { name: 'Cy', cents: 2500 },
      ])
    ).toEqual([
      { cents: 4000, names: ['Ann'] },
      { cents: 2500, names: ['Bob', 'Cy'] },
    ]);
  });
});

describe('parseCustomList mentions', () => {
  it('reads @username mentions, lowercased, mixed with plain names', () => {
    const r = parseCustomList('@Ann_Lee 40\nBob 25');
    expect(r).toEqual({
      ok: true,
      entries: [
        { name: '@Ann_Lee', cents: 4000, username: 'ann_lee' },
        { name: 'Bob', cents: 2500 },
      ],
    });
  });
  it('reads a text mention by its display text and carries the user id', () => {
    const r = parseCustomList('Ann Lee 40', new Map([['Ann Lee', 555]]));
    expect(r).toEqual({ ok: true, entries: [{ name: 'Ann Lee', cents: 4000, userId: 555 }] });
  });
  it('treats the same mention twice, ignoring case, as a repeat', () => {
    expect(parseCustomList('@Annie 10\n@annie 20').ok).toBe(false);
  });
  it('lets a long username through but not a long plain name', () => {
    const long = `@${'a'.repeat(30)}`;
    expect(parseCustomList(`${long} 10`).ok).toBe(true);
    expect(parseCustomList(`${'a'.repeat(21)} 10`).ok).toBe(false);
    expect(parseCustomList('@ab 10').ok).toBe(true); // too short to be a username: just a name
    expect(parseCustomList('@ab 10')).toMatchObject({ entries: [{ name: '@ab' }] });
  });
});
