import { describe, expect, it } from 'vitest';
import {
  applyUnassigned,
  assignmentFromClaims,
  claimerName,
  expandShares,
  MAX_ITEMS,
  missingCents,
  parseAddedItems,
  parseAssignments,
  parseScan,
  receiptWarnings,
  resolveTyped,
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
  describe('header format', () => {
    it('reads names above pasted item lines', () => {
      const a = assign(
        'Sam\n1. Chefs Pizza SGD 18.80\n\n@benjamin\n2. Clam Chowder SGD 8.80\n\nAll:\n3. Sirloin Steak SGD 30.80\n4. Spaghetti SGD 20.80',
        4
      );
      expect(a.people.map((p) => p.name)).toEqual(['Sam', '@benjamin']);
      expect(a.people[1]).toMatchObject({ username: 'benjamin' });
      expect(a.items).toEqual([[0], [1], [0, 1], [0, 1]]);
      expect(a.unassigned).toEqual([]);
    });
    it('matches by number only, accepts ) and a colon, groups and me', () => {
      const a = assign('Ann, Bob:\n1) pizza\n2. x\nme\n3. y', 4);
      expect(a.people.map((p) => p.name)).toEqual(['Ann', 'Bob', 'me']);
      expect(a.items).toEqual([[0, 1], [0, 1], [2], []]);
      expect(a.unassigned).toEqual([3]);
    });
    it('treats a colon after a name, and the case of all, as optional', () => {
      const same = ['All', 'All:', 'ALL :'].map((h) => assign(`Sam\n1. a\n\n${h}\n2. b`, 2).items);
      expect(same[0]).toEqual([[0], [0]]);
      expect(same[1]).toEqual(same[0]);
      expect(same[2]).toEqual(same[0]);
    });
    it('shares an item listed under two names', () => {
      const a = assign('Ann\n1. a\nBob\n1. a', 1);
      expect(a.items).toEqual([[0, 1]]);
    });
    it('counts a name with no items in All', () => {
      const a = assign('Ann\n1. a\nBob\nAll\n2. b', 2);
      expect(a.items).toEqual([[0], [0, 1]]);
    });
    it('rejects mistakes', () => {
      const err = (t: string, n = 3) => {
        const a = parseAssignments(t, n);
        return a.ok ? '' : a.error;
      };
      expect(err('1. Pizza\nAnn')).toContain('before any name');
      expect(err('Ann\n9. Pizza')).toContain('no item 9');
      expect(err('Ann\nBob')).toContain('must start with item numbers');
      expect(err('Ann\n1,2 Bob')).toContain('must be a name or an item');
    });
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

import {
  DEFAULT_RECEIPT_MODEL,
  extractJson,
  toDataUrl,
  WorkersAiReceiptReader,
} from '../../src/receipt-reader';

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
    // the default is the model that read a real 10-item receipt completely in live tests
    expect(DEFAULT_RECEIPT_MODEL).toBe('@cf/meta/llama-4-scout-17b-16e-instruct');
    expect(calls.every((c) => c.model === DEFAULT_RECEIPT_MODEL)).toBe(true);
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

describe('a scan that dropped an item', () => {
  // The real receipt: nine items read (107.60) of ten, printed subtotal 117.10, service 11.71, GST 11.59
  const dropped = {
    merchant: 'Bistrot',
    items: [14.9, 12.9, 9.5, 11.9, 1.8, 9.9, 14.9, 12.0, 19.8].map((price, i) => ({
      name: `Item ${i + 1}`,
      price,
    })),
    subtotal: 117.1,
    serviceCharge: 11.71,
    gst: 11.59,
    total: 140.4,
  };
  const read = (raw: unknown) => {
    const r = parseScan(raw);
    if (!r.ok) throw new Error(r.error);
    return r;
  };

  it('says how much is missing, against the printed subtotal', () => {
    const r = read(dropped);
    expect(missingCents(r.receipt)).toBe(950);
    expect(r.warnings.join(' ')).toContain(
      'The items add up to SGD 107.60 but the subtotal is SGD 117.10: SGD 9.50 looks missing.'
    );
    expect(r.warnings.join(' ')).not.toContain('do not add up to the subtotal');
  });

  it('works out the gap from the total and charges when no subtotal was read', () => {
    const r = read({ ...dropped, subtotal: undefined });
    expect(missingCents(r.receipt)).toBe(950);
    expect(r.warnings.join(' ')).toContain('SGD 9.50 looks missing');
    // a discount is added back to what the items should come to
    const disc = read({ ...dropped, subtotal: undefined, discount: 5, total: 135.4 });
    expect(missingCents(disc.receipt)).toBe(950);
  });

  it('cannot tell a gap from charges when neither a subtotal nor a charge was read', () => {
    const r = read({ items: [{ name: 'a', price: 10 }], total: 30 });
    expect(missingCents(r.receipt)).toBe(0);
  });

  it('ignores two cents of rounding, and items above the expected amount', () => {
    expect(missingCents(read({ ...dropped, subtotal: 107.62, total: 126.92 }).receipt)).toBe(0);
    const over = read({ ...dropped, subtotal: 100, total: 123.3 });
    expect(missingCents(over.receipt)).toBe(0);
    expect(over.warnings.join(' ')).toContain('do not add up to the subtotal');
  });

  it('keeps the skipped-lines warning and clears the missing one once the item is added', () => {
    const r = read({ ...dropped, items: [...dropped.items, { name: 'bad', price: 'abc' }] });
    expect(r.receipt.skipped).toBe(1);
    expect(receiptWarnings(r.receipt).join(' ')).toContain('skipped 1');
    const added = parseAddedItems('Sapporo Black 9.50', r.receipt.items.length);
    if (!added.ok) throw new Error(added.error);
    const fixed = { ...r.receipt, items: [...r.receipt.items, ...added.items] };
    expect(missingCents(fixed)).toBe(0);
    expect(receiptWarnings(fixed).join(' ')).not.toContain('looks missing');
    expect(receiptWarnings(fixed).join(' ')).toContain('skipped 1');
  });
});

describe('parseAddedItems', () => {
  const ok = (t: string, n = 9) => {
    const r = parseAddedItems(t, n);
    if (!r.ok) throw new Error(r.error);
    return r.items;
  };
  it('reads a name and a price per line, in order', () => {
    expect(ok('Sapporo Black 9.50\nRice $1.80')).toEqual([
      { name: 'Sapporo Black', cents: 950 },
      { name: 'Rice', cents: 180 },
    ]);
  });
  it('numbers an item with no name after the existing ones', () => {
    expect(ok('9.50', 9)).toEqual([{ name: 'Item 10', cents: 950 }]);
  });
  it('names the first bad line and adds nothing', () => {
    for (const bad of ['Sapporo', 'Sapporo 0', 'Sapporo 9.505', 'Sapporo -3', 'Sapporo abc']) {
      const r = parseAddedItems(`Beer 5\n${bad}`, 3);
      expect(r.ok).toBe(false);
      if (!r.ok) expect(r.error).toContain(bad);
    }
    expect(parseAddedItems('  \n ', 3).ok).toBe(false);
  });
  it('refuses to go past the item cap', () => {
    expect(parseAddedItems('A 1', MAX_ITEMS).ok).toBe(false);
    expect(parseAddedItems('A 1\nB 2', MAX_ITEMS - 1).ok).toBe(false);
    expect(parseAddedItems('A 1', MAX_ITEMS - 1).ok).toBe(true);
  });
});

describe('claims', () => {
  const claimers = [
    { id: 1, name: 'Ann' },
    { id: 2, name: 'Bob', username: 'Bob_B' },
    { id: 9, name: 'Org' },
  ];
  const items = [
    { name: 'Crab', cents: 3000 },
    { name: 'Rice', cents: 1000 },
    { name: 'Beer', cents: 2000 },
  ];
  const receipt = { items, serviceCents: 0, gstCents: 0, discountCents: 0, totalCents: 6000 };

  it('builds people, shared items and the organiser as me', () => {
    const a = assignmentFromClaims(items, { '0': [1, 2], '1': [2], '2': [9] }, claimers, 9);
    expect(a.people.map((p) => p.name)).toEqual(['Ann', 'Bob', 'me']);
    expect(a.people[1]).toMatchObject({ userId: 2, username: 'bob_b' });
    expect(a.people[2]!.isMe).toBe(true);
    expect(a.items).toEqual([[0, 1], [1], [2]]);
    expect(a.unassigned).toEqual([]);
  });

  it('lists unclaimed items, and they can go to the organiser or be shared', () => {
    const a = assignmentFromClaims(items, { '0': [1] }, claimers.slice(0, 2), 9);
    expect(a.unassigned).toEqual([1, 2]);
    expect(applyUnassigned(a, 'me').people.at(-1)!.isMe).toBe(true);
    expect(applyUnassigned(a, 'even').items).toEqual([[0], [0, 1], [0, 1]]);
  });

  it('gives the same amounts as the typed assignment for the same people', () => {
    const typed = parseAssignments('1 Ann, Bob\n2 Bob\n3 me', 3);
    if (!typed.ok) throw new Error(typed.error);
    const claimed = assignmentFromClaims(items, { '0': [1, 2], '1': [2], '2': [9] }, claimers, 9);
    const sum = (a: typeof claimed) =>
      shareReceipt(receipt.items, a, receipt.totalCents).shares.map((s) => s.cents);
    expect(sum(claimed)).toEqual(sum(typed));
  });

  it('shows different names for claimers who share a first name', () => {
    expect(claimerName([], { first_name: 'Ann' })).toBe('Ann');
    expect(claimerName(['Ann'], { first_name: 'Ann', last_name: 'Lee' })).toBe('Ann L.');
    expect(
      claimerName(['Ann', 'Ann L.'], { first_name: 'Ann', last_name: 'Lim', username: 'al' })
    ).toBe('@al');
    expect(claimerName(['ann', 'Ann 2'], { first_name: 'Ann' })).toBe('Ann 3');
  });

  it('shares an item N ways: one share per holder, unfilled shares unassigned', () => {
    const a = assignmentFromClaims(items, { '0': [1, 2] }, claimers.slice(0, 2), 9, { '0': 3 });
    expect(a.lines.map((l) => [l.name, l.cents])).toEqual([
      ['Crab (share 1 of 3)', 1000],
      ['Crab (share 2 of 3)', 1000],
      ['Crab (share 3 of 3)', 1000],
      ['Rice', 1000],
      ['Beer', 2000],
    ]);
    expect(a.items.slice(0, 3)).toEqual([[0], [1], []]);
    expect(a.unassigned).toEqual([2, 3, 4]);
    const lineReceipt = { ...receipt, items: a.lines };
    // the organiser covers the open share, the rice and the beer
    const covered = applyUnassigned(a, 'me');
    const cents = shareReceipt(lineReceipt.items, covered, 6000).shares.map((x) => x.cents);
    expect(cents.reduce((t, c) => t + c, 0)).toBe(6000);
    expect(cents.slice(0, 2)).toEqual([1000, 1000]);
  });

  it('puts odd cents on the first shares and leaves normal items alone', () => {
    const odd = expandShares([{ name: 'Dish', cents: 1000 }], { '0': 3 });
    expect(odd.lines.map((l) => l.cents)).toEqual([334, 333, 333]);
    const plain = expandShares(items, {});
    expect(plain.lines).toEqual(items);
    expect(plain.first).toEqual([0, 1, 2]);
  });

  it('reads typed people: me, mentions, usernames and plain names, reusing existing ones', () => {
    const org = { id: 9, name: 'Olive' };
    const ok = (t: string, m?: Map<string, number>) => {
      const r = resolveTyped(claimers, t, m, org);
      if (!r.ok) throw new Error(r.error);
      return r.people;
    };
    expect(ok('ann').map((p) => p.id)).toEqual([1]); // existing, by name
    expect(ok('@bob_b').map((p) => p.id)).toEqual([2]); // existing, by username
    expect(ok('me')[0]).toMatchObject({ id: 9 });
    const fresh = ok('Uncle Lim, @new_user, Zed Q', new Map([['Zed Q', 77]]));
    expect(fresh.map((p) => p.id)).toEqual([-1, -2, 77]);
    expect(fresh[1]).toMatchObject({ username: 'new_user' });
    // typed people carry no Telegram id: no userId, username kept
    const a = assignmentFromClaims(items, { '0': [-1], '1': [1] }, [fresh[0]!, claimers[0]!], 9);
    expect(a.people[0]).toEqual({ name: 'Uncle Lim', isMe: false });
    expect(a.people[1]).toMatchObject({ userId: 1 });
  });

  it('refuses a name over 20 characters and an empty message', () => {
    const org = { id: 9, name: 'Olive' };
    const long = resolveTyped(claimers, 'x'.repeat(21), undefined, org);
    expect(long.ok).toBe(false);
    expect(resolveTyped(claimers, ' , ', undefined, org).ok).toBe(false);
  });
});
