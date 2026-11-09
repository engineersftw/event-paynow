import { describe, expect, it } from 'vitest';
import { parseUserIds } from '../../src/commands/stats-handler';

describe('parseUserIds', () => {
  it('reads comma-separated ids, with spaces', () => {
    expect([...parseUserIds('111, 222,333')]).toEqual([111, 222, 333]);
    expect([...parseUserIds('  42  ')]).toEqual([42]);
  });

  it('ignores entries that are not whole positive numbers', () => {
    expect([...parseUserIds('111, abc, 2.5, -7, 0, 1e3, , 222')]).toEqual([111, 222]);
  });

  it('authorizes nobody for a missing, empty or junk value', () => {
    for (const v of [undefined, '', '   ', ',', 'abc']) expect(parseUserIds(v).size).toBe(0);
  });

  it('ignores numbers too large to be exact', () => {
    expect(parseUserIds('99999999999999999999').size).toBe(0);
  });
});
