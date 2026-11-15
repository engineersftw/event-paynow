import { env } from 'cloudflare:test';
import { beforeEach, describe, expect, it } from 'vitest';
import { applyClaim, mutateClaimsOn } from '../../src/commands/split-claims';
import type { Env } from '../../src/env';
import { handleSplitAppApi } from '../../src/split-app/api';
import worker from '../../src/worker';
import { launchFields, signInitData } from '../helpers/sign-init-data';
import { TelegramStub } from './harness';

const TOKEN = 'split-token';
const APP_ENV = {
  ...env,
  SPLIT_BOT_TOKEN: TOKEN,
  SPLIT_BOT_USERNAME: 'Split_PayNow_Bot',
  SPLIT_APP_NAME: 'Manage_Split_Claims',
} as unknown as Env;
const stub = new TelegramStub();

const organiser = { id: 7, first_name: 'Olive', last_name: 'Tan' };
const member = { id: 11, first_name: 'Ann' };
let chat = -1009000000;

const doOf = (chatId: number) =>
  env.CHAT_SESSION.get(env.CHAT_SESSION.idFromName(`split-${chatId}`));
const post = (chatId: number, path: string, body: unknown) =>
  doOf(chatId).fetch(
    new Request(`http://localhost${path}`, { method: 'POST', body: JSON.stringify(body) })
  );
const peek = async (chatId: number) =>
  (await (await doOf(chatId).fetch(new Request('http://localhost/peek'))).json()) as {
    flow: string;
    step: number;
    rev?: number;
    context: Record<string, any>;
  };

const items = [
  { name: 'Fries', cents: 600 },
  { name: 'Burger', cents: 1200 },
  { name: 'Beer', cents: 800 },
  { name: 'Salad', cents: 500 },
];

/** A chat in the middle of a claim split, started by `ownerId`. */
async function seed(extra: Record<string, unknown> = {}, ownerId = organiser.id, topicId = 0) {
  const chatId = chat--;
  await post(chatId, '/state', {
    flow: 'split',
    step: 17,
    idleMs: 3_600_000,
    context: {
      receipt: { items, serviceCents: 0, gstCents: 0, discountCents: 0, totalCents: 3100 },
      claims: { '0': [11, 12], '1': [11] },
      claimers: [
        { id: 11, name: 'Ann' },
        { id: 12, name: 'Bob' },
      ],
      claimMsg: 99,
      ...extra,
    },
  });
  await post(chatId, '/owner', { userId: ownerId, topicId });
  return chatId;
}

async function call(
  method: 'GET' | 'POST',
  path: 'state' | 'claim',
  chatId: number,
  body?: unknown,
  user: { id: number; first_name: string; last_name?: string } = organiser,
  topicId = 0
) {
  const init = await signInitData(TOKEN, launchFields(user, `${chatId}_${topicId}`));
  const response = await handleSplitAppApi(
    new Request(`https://worker.test/split-app/api/${path}`, {
      method,
      headers: { Authorization: `tma ${init}` },
      ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
    }),
    APP_ENV,
    { fetch: stub.fetch }
  );
  return { status: response.status, body: (await response.json()) as any };
}
const edit = (chatId: number, item: number, op: string, more: Record<string, unknown> = {}) =>
  call('POST', 'claim', chatId, { item, op, ...more });

beforeEach(() => stub.reset());

describe('Split Mini App interface: who may use it', () => {
  it('shows the organiser the items, their holders and the people, the organiser included', async () => {
    const chatId = await seed({ ways: { '1': 3 }, served: { '12': 100 } });
    const { status, body } = await call('GET', 'state', chatId);
    expect(status).toBe(200);
    expect(body.items).toEqual([
      { name: 'Fries', cents: 600, holders: [11, 12], locked: true },
      { name: 'Burger', cents: 1200, holders: [11], ways: 3, locked: false },
      { name: 'Beer', cents: 800, holders: [], locked: false },
      { name: 'Salad', cents: 500, holders: [], locked: false },
    ]);
    expect(body.people).toEqual([
      { id: 7, name: 'Olive Tan', served: false },
      { id: 11, name: 'Ann', served: false },
      { id: 12, name: 'Bob', served: true },
    ]);
    expect(body.organiserId).toBe(7);
  });

  it('refuses a member and a stranger, and changes nothing', async () => {
    const chatId = await seed();
    const before = await peek(chatId);
    for (const user of [member, { id: 99, first_name: 'Eve' }]) {
      expect((await call('GET', 'state', chatId, undefined, user)).status).toBe(403);
      const r = await call('POST', 'claim', chatId, { item: 2, op: 'mine' }, user);
      expect(r.status).toBe(403);
      expect(r.body.error).toBe('not_organiser');
    }
    expect(await peek(chatId)).toEqual(before);
    expect(stub.editedMessages).toHaveLength(0);
  });

  it('refuses the organiser of another chat, and the right user in the wrong topic', async () => {
    const chatId = await seed({}, organiser.id, 5);
    expect((await call('GET', 'state', chatId, undefined, organiser, 0)).status).toBe(403);
    expect((await call('GET', 'state', chatId, undefined, organiser, 5)).status).toBe(200);
    const other = await seed({}, 55);
    expect((await call('GET', 'state', other)).status).toBe(403);
  });

  it('refuses missing, forged and old launch data, and a bad link parameter', async () => {
    const chatId = await seed();
    const ask = (headers: Record<string, string>) =>
      handleSplitAppApi(
        new Request('https://worker.test/split-app/api/state', { headers }),
        APP_ENV
      );
    expect((await ask({})).status).toBe(401);
    expect((await ask({ Authorization: 'tma nonsense' })).status).toBe(401);
    const otherBot = await signInitData('999:other', launchFields(organiser, `${chatId}_0`));
    expect((await ask({ Authorization: `tma ${otherBot}` })).status).toBe(401);
    const old = await signInitData(
      TOKEN,
      launchFields(organiser, `${chatId}_0`, Math.floor(Date.now() / 1000) - 25 * 3600)
    );
    expect((await ask({ Authorization: `tma ${old}` })).status).toBe(401);
    const noChat = await signInitData(TOKEN, launchFields(organiser, 'hello'));
    expect((await ask({ Authorization: `tma ${noChat}` })).status).toBe(400);
  });

  it('says the claiming is over when there is none, and creates nothing', async () => {
    const chatId = chat--;
    const r = await call('GET', 'state', chatId);
    expect(r.status).toBe(409);
    expect(r.body.error).toBe('over');
    expect((await peek(chatId)).flow).toBe('idle');
    expect(
      await doOf(chatId)
        .fetch(new Request('http://localhost/peek'))
        .then((x) => x.ok)
    ).toBe(true);
  });

  it('says over after Done, a cancel or a later step, and refuses changes', async () => {
    const chatId = await seed();
    await post(chatId, '/state', { flow: 'split', step: 13, context: { receipt: { items } } });
    expect((await call('GET', 'state', chatId)).status).toBe(409);
    expect((await edit(chatId, 0, 'mine')).status).toBe(409);
    await post(chatId, '/reset', {});
    expect((await edit(chatId, 0, 'mine')).status).toBe(409);
  });

  it('answers 404 for everything when the Mini App is not configured', async () => {
    const chatId = await seed();
    const init = await signInitData(TOKEN, launchFields(organiser, `${chatId}_0`));
    const off = { ...APP_ENV, SPLIT_APP_NAME: undefined } as unknown as Env;
    const r = await handleSplitAppApi(
      new Request('https://worker.test/split-app/api/state', {
        headers: { Authorization: `tma ${init}` },
      }),
      off
    );
    expect(r.status).toBe(404);
  });
});

describe('Split Mini App interface: changing claims', () => {
  it('claims for the organiser, adds and removes people, and clears an item', async () => {
    const chatId = await seed();
    let r = await edit(chatId, 2, 'mine');
    expect(r.status).toBe(200);
    expect(r.body.items[2].holders).toEqual([7]);
    expect(r.body.people.map((p: any) => p.id)).toContain(7);

    r = await edit(chatId, 2, 'toggle', { id: 11 });
    expect(r.body.items[2].holders).toEqual([7, 11]);
    r = await edit(chatId, 2, 'toggle', { id: 11 });
    expect(r.body.items[2].holders).toEqual([7]);

    r = await edit(chatId, 0, 'clear');
    expect(r.body.items[0].holders).toEqual([]);
    expect(r.body.items[1].holders).toEqual([11]); // other items untouched
    expect((await peek(chatId)).context.claims['0']).toEqual([]);
  });

  it('adds everyone who is listed to an item in one step, skipping those who hold it or have their QR', async () => {
    const chatId = await seed({ served: { '12': 500 } }); // Ann holds items 0 and 1, Bob has his QR
    let r = await edit(chatId, 1, 'everyone');
    expect(r.status).toBe(200);
    expect(r.body.items[1].holders).toEqual([11, 7]); // Ann stays, the organiser joins, Bob is skipped
    r = await edit(chatId, 1, 'everyone');
    expect(r.status).toBe(422);
    expect(r.body.error).toBe('Everyone is already on this item.');
    r = await edit(chatId, 2, 'everyone');
    expect(r.body.items[2].holders).toEqual([11, 7]);
  });

  it('adds nobody when the item has fewer shares left than people to add', async () => {
    const chatId = await seed({ ways: { '2': 3 }, claims: { '2': [11] } });
    const before = (await peek(chatId)).context.claims;
    let r = await edit(chatId, 2, 'everyone'); // Bob and the organiser fit: 2 shares left for 2 people
    expect(r.status).toBe(200);
    expect(r.body.items[2].holders).toHaveLength(3);
    const crowded = await seed({
      ways: { '2': 3 },
      claims: { '2': [11] },
      claimers: [
        { id: 11, name: 'Ann' },
        { id: 12, name: 'Bob' },
        { id: 13, name: 'Cy' },
      ],
    }); // Bob, Cy and the organiser are 3 people for 2 shares
    r = await edit(crowded, 2, 'everyone');
    expect(r.status).toBe(422);
    expect(r.body.error).toBe('Only 2 shares left, so not everyone fits.');
    expect((await peek(crowded)).context.claims['2']).toEqual([11]);
    expect(before['2']).toEqual([11]);
  });

  it('adds people by typed name: a new one, an existing one, me, and an @username', async () => {
    const chatId = await seed();
    let r = await edit(chatId, 3, 'add', { text: 'Uncle Lim' });
    expect(r.status).toBe(200);
    const lim = r.body.people.find((p: any) => p.name === 'Uncle Lim');
    expect(lim.id).toBeLessThan(0); // no Telegram identity
    expect(r.body.items[3].holders).toEqual([lim.id]);

    r = await edit(chatId, 3, 'add', { text: 'ann, me, @carl_x' });
    expect(r.body.items[3].holders).toEqual(expect.arrayContaining([11, 7]));
    expect(r.body.people.filter((p: any) => p.name === 'Ann')).toHaveLength(1); // reused, not twice
    expect(r.body.items[3].holders).toHaveLength(4);
    expect(r.body.people.some((p: any) => p.name === '@carl_x')).toBe(true);
  });

  it('refuses names that are too long, empty lists and the 21st person', async () => {
    const chatId = await seed();
    let r = await edit(chatId, 2, 'add', { text: 'x'.repeat(21) });
    expect(r.status).toBe(422);
    expect(r.body.error).toContain('too long');
    r = await edit(chatId, 2, 'add', { text: ' , ' });
    expect(r.status).toBe(422);
    r = await edit(chatId, 2, 'add', {});
    expect(r.status).toBe(422);

    const people = Array.from({ length: 20 }, (_, i) => ({ id: 100 + i, name: `P${i}` }));
    const full = await seed({ claimers: people, claims: { '0': people.map((p) => p.id) } });
    r = await edit(full, 2, 'add', { text: 'One More' });
    expect(r.status).toBe(422);
    expect(r.body.error).toContain('20');
  });

  it('shares an item N ways, changes it, removes it, and enforces the limits', async () => {
    const chatId = await seed({
      claims: { '0': [11, 12, 13] },
      claimers: [
        { id: 11, name: 'Ann' },
        { id: 12, name: 'Bob' },
        { id: 13, name: 'Cy' },
      ],
    });
    let r = await edit(chatId, 0, 'ways', { n: 2 });
    expect(r.status).toBe(422); // three people already hold it
    expect(r.body.error).toContain('3 people');
    for (const n of [1, 21, 2.5, 'lots']) {
      expect((await edit(chatId, 0, 'ways', { n })).status).toBe(422);
    }
    r = await edit(chatId, 0, 'ways', { n: 4 });
    expect(r.body.items[0].ways).toBe(4);
    r = await edit(chatId, 0, 'toggle', { id: 7 }); // the 4th share
    expect(r.status).toBe(422); // 7 is not a known person yet
    r = await edit(chatId, 0, 'mine');
    expect(r.body.items[0].holders).toHaveLength(4);
    r = await edit(chatId, 0, 'add', { text: 'Dee' });
    expect(r.status).toBe(422);
    expect(r.body.error).toContain('All 4 shares are taken');
    r = await edit(chatId, 0, 'ways', { n: null });
    expect(r.body.items[0].ways).toBeUndefined();
  });

  it('refuses a locked item and a person who already has their QR', async () => {
    const chatId = await seed({ served: { '12': 500 } });
    let r = await edit(chatId, 0, 'toggle', { id: 11 }); // item 0 is held by Bob, who has his QR
    expect(r.status).toBe(422);
    expect(r.body.error).toContain('locked');
    r = await edit(chatId, 2, 'toggle', { id: 12 });
    expect(r.status).toBe(422);
    expect(r.body.error).toContain('already have their QR');
    r = await edit(chatId, 0, 'clear');
    expect(r.status).toBe(422);
  });

  it('refuses an unknown item, an unknown change and a person nobody knows, without changing anything', async () => {
    const chatId = await seed();
    const before = await peek(chatId);
    for (const bad of [
      { item: 9, op: 'mine' },
      { item: -1, op: 'mine' },
      { item: '1', op: 'mine' },
      { item: 1, op: 'explode' },
      { item: 1, op: 'toggle', id: 999 },
      { item: 1, op: 'toggle' },
    ]) {
      expect((await call('POST', 'claim', chatId, bad)).status).toBe(422);
    }
    expect((await call('POST', 'claim', chatId, undefined)).status).toBe(400);
    // The organiser's own calls count as activity, so only the claims and the revision must stay
    const after = await peek(chatId);
    expect(after.context).toEqual(before.context);
    expect(after.rev).toBe(before.rev);
    expect(stub.editedMessages).toHaveLength(0);
  });
});

describe('Split Mini App interface: with the chat', () => {
  it('edits the claim message in the chat, with the Edit in app link', async () => {
    const chatId = await seed();
    await edit(chatId, 2, 'add', { text: 'Uncle Lim' });
    const shown = stub.editedMessages.at(-1)!;
    expect(shown.chatId).toBe(String(chatId));
    expect(shown.text).toContain('3. Beer SGD 8.00: Uncle Lim');
    expect(shown.text).toContain('The organiser can fix who had what with Edit in app.');
    expect(shown.text).not.toContain('assign it to someone else');
    const buttons = shown.replyMarkup!.inline_keyboard.flat() as Array<{
      text: string;
      url?: string;
    }>;
    const app = buttons.find((b) => b.text.includes('Edit in app'))!;
    expect(app.url).toBe(`https://t.me/Split_PayNow_Bot/Manage_Split_Claims?startapp=${chatId}_0`);
  });

  it('keeps simultaneous changes from the app and from a chat tap', async () => {
    const chatId = await seed();
    const tap = mutateClaimsOn(doOf(chatId), (c) =>
      applyClaim(c, 2, { kind: 'toggle', from: { id: 12, first_name: 'Bob' } })
    );
    const all = await Promise.all([
      tap,
      edit(chatId, 3, 'mine'),
      edit(chatId, 1, 'toggle', { id: 12 }),
      edit(chatId, 3, 'add', { text: 'Dee' }),
      edit(chatId, 2, 'add', { text: 'Eli' }),
    ]);
    expect(all.every((x) => ('status' in x ? x.status === 200 : x.kind === 'ok'))).toBe(true);
    const { claims } = (await peek(chatId)).context;
    expect(claims['1']).toEqual(expect.arrayContaining([11, 12]));
    expect(claims['2']).toHaveLength(2); // Bob's tap and Eli
    expect(claims['3']).toHaveLength(2); // the organiser and Dee
  });

  it('does not extend the claim expiry or store anything when it refuses', async () => {
    const chatId = await seed();
    const before = await peek(chatId);
    await call('GET', 'state', chatId, undefined, member);
    await call('POST', 'claim', chatId, { item: 99, op: 'mine' });
    const after = await peek(chatId);
    expect(after.rev).toBe(before.rev);
    expect(after.context).toEqual(before.context);
  });
});

describe('Split Mini App routes in the Worker', () => {
  const ctx = { waitUntil() {}, passThroughOnException() {} } as unknown as ExecutionContext;
  const ask = (path: string, e: Env) =>
    worker.fetch(new Request(`https://worker.test${path}`), e, ctx);

  it('serves the page when configured, with a fresh nonce and a policy that names it', async () => {
    const [a, b] = await Promise.all([ask('/split-app', APP_ENV), ask('/split-app/', APP_ENV)]);
    expect(a.status).toBe(200);
    expect(b.status).toBe(200);
    const nonce = (h: Response) =>
      /'nonce-([^']+)'/.exec(h.headers.get('Content-Security-Policy')!)![1]!;
    expect(nonce(a)).not.toBe(nonce(b));
    expect(await a.text()).toContain(`<script nonce="${nonce(a)}">`);
  });

  it('answers 404 for the page and the interface when the Mini App is not configured', async () => {
    const off = { ...APP_ENV, SPLIT_APP_NAME: undefined } as unknown as Env;
    expect((await ask('/split-app', off)).status).toBe(404);
    expect((await ask('/split-app/api/state', off)).status).toBe(404);
    const noToken = { ...APP_ENV, SPLIT_BOT_TOKEN: undefined } as unknown as Env;
    expect((await ask('/split-app', noToken)).status).toBe(404);
  });

  it('routes the interface and refuses what carries no launch data', async () => {
    expect((await ask('/split-app/api/state', APP_ENV)).status).toBe(401);
    expect((await ask('/split-app/api/nothing', APP_ENV)).status).toBe(404);
  });
});
