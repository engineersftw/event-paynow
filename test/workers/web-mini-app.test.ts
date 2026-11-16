import { env } from 'cloudflare:test';
import { beforeAll, describe, expect, it } from 'vitest';
import { INIT_DATA_MAX_AGE_SEC } from '../../src/access/init-data';
import { D1EventRepository } from '../../src/db/drizzle-repository';
import { handleWeb, type WebEnv } from '../../src/web/handler';
import { launchFields, signInitData } from '../helpers/sign-init-data';
import { applyTestSchema } from './harness';

const webEnv: WebEnv = {
  paynow_db: env.paynow_db,
  TELEGRAM_BOT_TOKEN: 'tok',
  SESSION_SECRET: 'sess',
  BOT_USERNAME: 'my_bot',
};
const ann = { id: 42, first_name: 'Ann', last_name: 'Lee' };
const answer = (status: string) =>
  (async () => new Response(JSON.stringify({ ok: true, result: { status } }))) as typeof fetch;

const login = (initData: unknown, origin = 'https://x.test') =>
  handleWeb(
    new Request('https://x.test/api/miniapp-login', {
      method: 'POST',
      headers: { Origin: origin, 'Content-Type': 'application/json' },
      body: JSON.stringify({ initData }),
    }),
    webEnv
  );

const cookies = (res: Response) => res.headers.getSetCookie().map((c) => c.split(';')[0]!);

beforeAll(async () => {
  await applyTestSchema(env.paynow_db);
  await new D1EventRepository(env.paynow_db).createEvent({
    ref: 'MINIEVT001',
    chatId: -100,
    topicId: 0,
    name: 'Dinner',
    payeeType: 'mobile',
    payeeValue: '+6591110000',
    status: 'open',
    timestamp: '2024-01-01T00:00:00Z',
  });
});

describe('POST /api/miniapp-login', () => {
  it('signs in from valid launch data and returns the signed event reference', async () => {
    const res = await login(await signInitData('tok', launchFields(ann, 'MINIEVT001')));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ref: 'MINIEVT001' });
    const [session, name] = cookies(res);
    expect(session).toMatch(/^session=42\./);
    expect(decodeURIComponent(name!)).toBe('tg_name=Ann Lee');
  });

  it('the session it sets opens the event API for an admin and not for a member', async () => {
    const [session] = cookies(
      await login(await signInitData('tok', launchFields(ann, 'MINIEVT001')))
    );
    const get = (fetchFn: typeof fetch) =>
      handleWeb(
        new Request('https://x.test/api/events/MINIEVT001', { headers: { Cookie: session! } }),
        webEnv,
        fetchFn
      );
    expect((await get(answer('administrator'))).status).toBe(200);
    expect((await get(answer('member'))).status).toBe(403);
  });

  it('drops a start value that is not a reference', async () => {
    const res = await login(await signInitData('tok', launchFields(ann, '../x y')));
    expect(await res.json()).toEqual({ ref: null });
  });

  it('refuses forged, stale and missing launch data and sets nothing', async () => {
    const now = Math.floor(Date.now() / 1000);
    const cases = [
      await signInitData('other-token', launchFields(ann, 'MINIEVT001')),
      await signInitData('tok', launchFields(ann, 'MINIEVT001', now - INIT_DATA_MAX_AGE_SEC - 10)),
      '',
      undefined,
    ];
    for (const initData of cases) {
      const res = await login(initData);
      expect(res.status).toBe(403);
      expect(res.headers.getSetCookie()).toEqual([]);
    }
  });

  it('refuses a request from another origin', async () => {
    const data = await signInitData('tok', launchFields(ann, 'MINIEVT001'));
    expect((await login(data, 'https://evil.test')).status).toBe(403);
  });
});

describe('pages', () => {
  const page = (path: string) => handleWeb(new Request(`https://x.test${path}`), webEnv);

  it('serves /mini with no event data, and the event page loads the Mini App script and still shows the Login Widget', async () => {
    const mini = await (await page('/mini')).text();
    expect(mini).toContain('telegram-web-app.js');
    expect(mini).not.toContain('Dinner');
    const html = await (await page('/events/MINIEVT001')).text();
    expect(html).toContain('telegram-web-app.js');
    expect(html).toContain('miniLogin()');
    expect(html).toContain('telegram-widget.js');
  });

  it('the browser sign-in redirect works as before', async () => {
    expect((await page('/api/login?ref=MINIEVT001')).status).toBe(403);
  });
});
