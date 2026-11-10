import { describe, expect, it } from 'vitest';
import {
  applyUnassigned,
  parseAssignments,
  parseScan,
  shareReceipt,
  toEntries,
} from '../../src/commands/receipt';

const items = (...cents: number[]) => cents.map((c, i) => ({ name: `Item ${i + 1}`, cents: c }));
const assign = (text: string, n: number, mentions?: Map<string, number>) => {
  const a = parseAssignments(text, n, mentions);
  if (!a.ok) throw new Error(a.error);
  return a;
};

describe('parseScan', () => {
  const good = {
    merchant: 'Ah Seng Cafe',
    items: [
      { name: 'Chilli crab', price: 58 },
      { name: 'Rice x4', price: '8.00' },
    ],
    subtotal: 66,
    serviceCharge: 6.6,
    gst: 6.53,
    total: 79.13,
  };
  it('reads a clean receipt into cents', () => {
    const r = parseScan(good);
    expect(r).toMatchObject({ ok: true, warnings: [] });
    if (r.ok) {
      expect(r.receipt.items).toEqual([
        { name: 'Chilli crab', cents: 5800 },
        { name: 'Rice x4', cents: 800 },
      ]);
      expect([r.receipt.serviceCents, r.receipt.gstCents, r.receipt.totalCents]).toEqual([
        660, 653, 7913,
      ]);
    }
  });
  it('refuses a missing total, no items, junk, and too many items', () => {
    expect(parseScan({ ...good, total: undefined }).ok).toBe(false);
    expect(parseScan({ ...good, total: 0 }).ok).toBe(false);
    expect(parseScan({ ...good, items: [] }).ok).toBe(false);
    expect(parseScan('hello').ok).toBe(false);
    expect(parseScan(null).ok).toBe(false);
    const many = Array.from({ length: 41 }, () => ({ name: 'x', price: 1 }));
    expect(parseScan({ ...good, items: many }).ok).toBe(false);
  });
  it('skips unreadable lines with a warning and cleans names', () => {
    const r = parseScan({
      ...good,
      items: [
        { name: 'Beer\u0000\n  big', price: 12 },
        { name: 'bad', price: 'abc' },
        { name: 'neg', price: -3 },
      ],
      subtotal: undefined,
    });
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.receipt.items).toEqual([{ name: 'Beer big', cents: 1200 }]);
      expect(r.warnings.join(' ')).toContain('skipped 2');
    }
  });
  it('warns when items exceed the total or the printed numbers disagree', () => {
    const over = parseScan({ items: [{ name: 'a', price: 50 }], total: 40 });
    expect(over.ok && over.warnings.join(' ')).toContain('more than the total');
    const off = parseScan({ ...good, total: 90 });
    expect(off.ok && off.warnings.join(' ')).toContain('do not add up');
    const huge = parseScan({ items: [{ name: 'a', price: 5 }], total: 999999999 });
    expect(huge.ok).toBe(false);
  });
});

describe('parseAssignments', () => {
  it('reads numbers, lists, ranges, me and all', () => {
    const a = assign('1,3 Ann\n2 Ann, Bob\n4 me\n5-6 all', 6);
    expect(a.people.map((p) => p.name)).toEqual(['Ann', 'Bob', 'me']);
    expect(a.people[2]!.isMe).toBe(true);
    expect(a.items).toEqual([[0], [0, 1], [0], [2], [0, 1, 2], [0, 1, 2]]);
  });
  it('reads mentions and keeps identities', () => {
    const a = assign('1 @Ann_Lee\n2 Zed Q', 2, new Map([['Zed Q', 77]]));
    expect(a.people[0]).toMatchObject({ name: '@Ann_Lee', username: 'ann_lee' });
    expect(a.people[1]).toMatchObject({ name: 'Zed Q', userId: 77 });
  });
  it('treats names that differ only by case as one person', () => {
    const a = assign('1 Ann\n2 ann', 2);
    expect(a.people).toHaveLength(1);
  });
  it('names the problem for every kind of mistake', () => {
    const err = (t: string, n = 3) => {
      const a = parseAssignments(t, n);
      return a.ok ? '' : a.error;
    };
    expect(err('1 Ann\n1 Bob\n2 Ann\n3 Ann')).toContain('Item 1 is listed twice');
    expect(err('1 Ann\n2 Ann\n9 Ann')).toContain('no item 9');
    expect(err('Ann 1')).toContain('must start with item numbers');
    expect(err('1')).toContain('no people');
    expect(err('')).toContain('empty');
    expect(err('1-3 all')).toContain('needs people');
    expect(err('3-1 Ann')).toContain('backwards');
    expect(err(`1-3 ${'x'.repeat(21)}`)).toContain('too long');
    expect(err('1-2 Ann\n3 Bob', 3)).toBe('');
  });
});

describe('shareReceipt', () => {
  it('shares charges pro rata: 30.00 and 10.00 on a 48.00 receipt is 36.00 and 12.00', () => {
    const a = assign('1 Ann\n2 Bob', 2);
    const r = shareReceipt(items(3000, 1000), a, 4800);
    expect(r.shares.map((s) => s.cents)).toEqual([3600, 1200]);
    expect(r.extrasCents).toBe(800);
  });
  it('splits a shared item equally, odd cents to the first people listed', () => {
    const a = assign('1 Ann, Bob, Cy', 1);
    const r = shareReceipt(items(1000), a, 1000);
    expect(r.shares.map((s) => s.cents)).toEqual([334, 333, 333]);
  });
  it('counts the organiser but does not collect from them', () => {
    const a = assign('1 Ann\n2 me', 2);
    const r = shareReceipt(items(4000, 2000), a, 6000);
    expect(r.shares.map((s) => s.cents)).toEqual([4000, 2000]);
    expect(toEntries(r.shares)).toEqual([{ name: 'Ann', cents: 4000 }]);
  });
  it('handles a discount as negative extras', () => {
    const a = assign('1 Ann\n2 Bob', 2);
    const r = shareReceipt(items(3000, 1000), a, 3600); // 10% off
    expect(r.shares.map((s) => s.cents)).toEqual([2700, 900]);
  });
  it('always adds up exactly to the receipt total', () => {
    for (const total of [9999, 10001, 12345, 777]) {
      for (const prices of [
        [333, 334, 335],
        [1, 2, 3],
        [1000, 1, 1],
      ]) {
        const a = assign('1 Ann, Bob\n2 Bob, Cy\n3 me, Ann, Cy', 3);
        const r = shareReceipt(items(...prices), a, total);
        expect(r.shares.reduce((s, x) => s + x.cents, 0)).toBe(total);
      }
    }
  });
  it('keeps mention identities on the entries', () => {
    const a = assign('1 @Ann_Lee', 1);
    expect(toEntries(shareReceipt(items(500), a, 550).shares)).toEqual([
      { name: '@Ann_Lee', cents: 550, username: 'ann_lee' },
    ]);
  });
});

import { extractJson, toDataUrl, WorkersAiReceiptReader } from '../../src/receipt-reader';

describe('receipt reader', () => {
  it('pulls the JSON out of a chatty reply or a code fence', () => {
    expect(extractJson('Sure!\n```json\n{"total": 5}\n```')).toEqual({ total: 5 });
    expect(extractJson({ total: 6 })).toEqual({ total: 6 });
    expect(() => extractJson('no json here')).toThrow();
    expect(() => extractJson(undefined)).toThrow();
  });
  it('makes a data URL for a large photo', () => {
    const big = new Uint8Array(200_000).fill(65);
    const url = toDataUrl(big);
    expect(url.startsWith('data:image/jpeg;base64,')).toBe(true);
    expect(atob(url.split(',')[1]!).length).toBe(200_000);
  });
  it('calls the model with the image and accepts the licence once if asked', async () => {
    const calls: Array<{ model: string; input: Record<string, unknown> }> = [];
    let refused = true;
    const ai = {
      async run(model: string, input: Record<string, unknown>) {
        calls.push({ model, input });
        if (refused && input.prompt !== 'agree') throw new Error('Please agree to the licence');
        if (input.prompt === 'agree') {
          refused = false;
          return { response: 'ok' };
        }
        return { response: 'Here: {"total": 12.5, "items": []}' };
      },
    };
    const reader = new WorkersAiReceiptReader(ai);
    expect(await reader.read(new Uint8Array([1, 2, 3]))).toEqual({ total: 12.5, items: [] });
    expect(calls.map((c) => c.input.prompt ?? 'scan')).toEqual(['scan', 'agree', 'scan']);
    // the photo travels as an image part of the user message (the `image` field is refused live)
    const part = (
      calls[0]!.input.messages as Array<{ content: Array<Record<string, unknown>> }>
    )[0]!.content;
    expect(part.map((p) => p.type)).toEqual(['text', 'image_url']);
    expect(JSON.stringify(part[1])).toContain('data:image/jpeg;base64,');
    expect(calls[0]!.input.image).toBeUndefined();
  });
  it('lets other errors through', async () => {
    const ai = {
      async run(_m: string, input: Record<string, unknown>) {
        const part = (input.messages as Array<{ content: unknown }>)[0]!.content as Array<{
          type: string;
        }>;
        expect(part.map((p) => p.type)).toEqual(['text', 'image_url']);
        throw new Error('model overloaded');
      },
    };
    await expect(
      new WorkersAiReceiptReader(ai, '@cf/meta/llama-4-scout-17b-16e-instruct').read(
        new Uint8Array(1)
      )
    ).rejects.toThrow('overloaded');
  });
});

describe('unassigned items', () => {
  it('reports the gap instead of failing', () => {
    const a = assign('1 Ann\n3 Bob', 3);
    expect(a.unassigned).toEqual([1]);
    expect(a.items[1]).toEqual([]);
    expect(assign('1 Ann\n2 Bob', 2).unassigned).toEqual([]);
  });
  it('still refuses the real mistakes', () => {
    const err = (t: string) => {
      const a = parseAssignments(t, 3);
      return a.ok ? '' : a.error;
    };
    expect(err('1 Ann\n1 Bob')).toContain('listed twice');
    expect(err('9 Ann')).toContain('no item 9');
    expect(err('1')).toContain('no people');
  });
  it('Leave them out: the organiser carries the gap and is not collected', () => {
    const a = applyUnassigned(assign('1 Ann\n3 Bob', 3), 'me');
    expect(a.people.map((p) => p.name)).toEqual(['Ann', 'Bob', 'me']);
    expect(a.items).toEqual([[0], [2], [1]]);
    const r = shareReceipt(items(3000, 1000, 2000), a, 6600);
    expect(r.shares.map((s) => s.cents)).toEqual([3300, 2200, 1100]);
    expect(toEntries(r.shares).map((e) => e.name)).toEqual(['Ann', 'Bob']);
  });
  it('Leave them out reuses the organiser when they were named', () => {
    const a = applyUnassigned(assign('1 Ann\n3 me', 3), 'me');
    expect(a.people.map((p) => p.name)).toEqual(['Ann', 'me']);
    expect(a.items[1]).toEqual([1]);
  });
  it('Split evenly: each gap item is shared by everyone named, odd cents to the first', () => {
    const a = applyUnassigned(assign('1 Ann\n3 Bob', 3), 'even');
    expect(a.items[1]).toEqual([0, 1]);
    const r = shareReceipt(items(3000, 901, 2000), a, 5901);
    expect(r.shares.map((s) => s.cents)).toEqual([3451, 2450]);
  });
  it('Split evenly includes me when named, and the amounts always add up', () => {
    const a = applyUnassigned(assign('1 Ann\n3 me', 3), 'even');
    expect(a.items[1]).toEqual([0, 1]);
    for (const total of [5000, 5333, 6001]) {
      for (const choice of ['me', 'even'] as const) {
        const done = applyUnassigned(assign('1 Ann\n2 Bob', 3), choice);
        const r = shareReceipt(items(1500, 2500, 1001), done, total);
        expect(r.shares.reduce((x, y) => x + y.cents, 0)).toBe(total);
      }
    }
  });
  it('changes nothing when nothing is unassigned', () => {
    const a = assign('1 Ann\n2 Bob', 2);
    expect(applyUnassigned(a, 'me')).toBe(a);
  });
});
