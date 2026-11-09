import { env } from 'cloudflare:test';
import { beforeAll, describe, expect, it } from 'vitest';
import { handleWeb, type WebEnv } from '../../src/web/handler';
import { applyTestSchema } from './harness';

const ORIGIN = 'https://event-paynow.engineers.sg';

async function event(ref: string, name: string, status: 'open' | 'closed') {
  await env.paynow_db
    .prepare(
      `INSERT INTO events (ref, chat_id, topic_id, name, payee_type, payee_value, status, created_at)
       VALUES (?1, 1, 0, ?2, 'mobile', '+6591234567', ?3, '2026-11-09T00:00:00Z')`
    )
    .bind(ref, name, status)
    .run();
}

const page = (ref: string, e: Partial<WebEnv> = {}) =>
  handleWeb(new Request(`${ORIGIN}/pay/${ref}`), {
    ...env,
    BOT_USERNAME: 'b',
    ...e,
  } as unknown as WebEnv);
const head = (html: string) => html.slice(0, html.indexOf('</head>'));
const meta = (html: string, key: string) =>
  html.match(new RegExp(`<meta (?:property|name)="${key}" content="([^"]*)">`))?.[1];

beforeAll(async () => {
  await applyTestSchema(env.paynow_db);
  await event('SOCOPEN001', 'Team Dinner', 'open');
  await event('SOCHOSTILE', '"><script>alert(1)</script> & Co', 'open');
  await event('SOCCLOSED1', 'Secret Closed Party', 'closed');
  await event('SOCLONG001', 'Y'.repeat(120), 'open');
});

describe('GET /pay/<ref> social preview', () => {
  it('names an open event in the title, description and page title', async () => {
    const res = await page('SOCOPEN001');
    expect(res.status).toBe(200);
    expect(res.headers.get('Content-Type')).toContain('text/html');
    const html = await res.text();
    expect(meta(head(html), 'og:title')).toBe('Pay for Team Dinner');
    expect(meta(head(html), 'twitter:title')).toBe('Pay for Team Dinner');
    expect(meta(head(html), 'og:description')).toContain('Team Dinner');
    expect(meta(head(html), 'og:url')).toBe(`${ORIGIN}/pay/SOCOPEN001`);
    expect(meta(head(html), 'og:image')).toBe(`${ORIGIN}/explainer-poster.jpg`);
    expect(html).toContain('<title>Pay for Team Dinner</title>');
    expect(html).toContain('id="app"'); // still the payment page
  });

  it('escapes a hostile event name everywhere it appears', async () => {
    const html = await (await page('SOCHOSTILE')).text();
    expect(head(html)).not.toContain('<script>alert(1)');
    expect(meta(head(html), 'og:title')).toBe(
      'Pay for &quot;&gt;&lt;script&gt;alert(1)&lt;/script&gt; &amp; Co'
    );
    expect(html).toContain(
      '<title>Pay for &quot;&gt;&lt;script&gt;alert(1)&lt;/script&gt; &amp; Co</title>'
    );
  });

  it('shortens a very long name', async () => {
    const html = await (await page('SOCLONG001')).text();
    expect(meta(head(html), 'og:title')).toBe(`Pay for ${'Y'.repeat(59)}…`);
  });

  it('uses generic wording for an unknown event, and does not leak a closed event name', async () => {
    for (const ref of ['SOCNOPE001', 'SOCCLOSED1']) {
      const res = await page(ref);
      expect(res.status).toBe(200);
      const html = await res.text();
      expect(meta(head(html), 'og:title')).toBe('Make a PayNow payment');
      expect(head(html)).not.toContain('Secret Closed Party');
      expect(html).toContain('id="app"');
    }
  });

  it('still serves the page, with generic wording, when the lookup fails', async () => {
    const broken = {
      prepare() {
        throw new Error('database unavailable');
      },
    };
    const res = await page('SOCOPEN001', { paynow_db: broken } as unknown as Partial<WebEnv>);
    expect(res.status).toBe(200);
    const html = await res.text();
    expect(meta(head(html), 'og:title')).toBe('Make a PayNow payment');
    expect(html).toContain('id="app"');
  });
});
