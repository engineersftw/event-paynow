import { env } from 'cloudflare:test';
import { describe, expect, it } from 'vitest';
import { handleWeb, type WebEnv } from '../../src/web/handler';

const ORIGIN = 'https://event-paynow.engineers.sg';

const get = (path: string, e: Partial<WebEnv> = {}) =>
  handleWeb(new Request(`${ORIGIN}${path}`), {
    ...env,
    BOT_USERNAME: 'event_paynow_bot',
    SPLIT_BOT_USERNAME: 'Split_PayNow_Bot',
    ...e,
  } as unknown as WebEnv);
const head = (html: string) => html.slice(0, html.indexOf('</head>'));
const meta = (html: string, key: string) =>
  html.match(new RegExp(`<meta (?:property|name)="${key}" content="([^"]*)">`))?.[1];

describe('GET /split', () => {
  it('shows the Split PayNow Bot page to an anonymous visitor, with its own logo', async () => {
    const res = await get('/split');
    expect(res.status).toBe(200);
    expect(res.headers.get('Content-Type')).toContain('text/html');
    const html = await res.text();
    expect(html).toContain('<h1>Split PayNow Bot</h1>');
    expect(html).toContain('<img src="/split-logo.png"');
    expect(html).toContain('<link rel="icon" type="image/png" href="/split-logo.png">');
    expect(html).not.toContain('/logo.png'); // not the Event PayNow Bot's logo
    expect(await (await get('/split/')).text()).toBe(html);
  });

  it('links to the configured bot, twice, and strips anything else from the username', async () => {
    const html = await (await get('/split')).text();
    expect(html.match(/href="https:\/\/t\.me\/Split_PayNow_Bot"/g)).toHaveLength(2);
    const hostile = await (
      await get('/split', { SPLIT_BOT_USERNAME: 'Bot"><script>alert(1)</script>' })
    ).text();
    expect(hostile).not.toContain('<script>alert(1)');
    expect(hostile).toMatch(/href="https:\/\/t\.me\/Botscriptalert1script"/);
  });

  it('explains what it does, how to start and what it keeps', async () => {
    const html = await (await get('/split')).text();
    for (const text of [
      'Equal split',
      'Custom amounts',
      'Receipt scan',
      'Group claiming',
      '<code>/split</code>',
      '<code>/split_custom</code>',
      '<code>/split_receipt</code>',
      'Receipt photos are read and never stored',
      '<code>/forget</code>',
      'whether that is you',
    ]) {
      expect(html).toContain(text);
    }
  });

  it('has its own preview tags, image and site name', async () => {
    const html = await (await get('/split')).text();
    const h = head(html);
    expect(html).toContain('<title>Split PayNow Bot</title>');
    expect(meta(h, 'og:title')).toBe('Split PayNow Bot');
    expect(meta(h, 'og:url')).toBe(`${ORIGIN}/split`);
    expect(meta(h, 'og:image')).toBe(`${ORIGIN}/split-preview.jpg`);
    expect(meta(h, 'twitter:image')).toBe(`${ORIGIN}/split-preview.jpg`);
    expect(meta(h, 'og:site_name')).toBe('Split PayNow Bot');
    expect(meta(h, 'twitter:card')).toBe('summary_large_image');
    expect(meta(h, 'og:image:alt')).toContain('Split PayNow Bot');
    expect(h).toContain(`<link rel="canonical" href="${ORIGIN}/split">`);
  });

  it('answers 404 until the Split bot username is set', async () => {
    for (const value of [undefined, '', ' ', '!!!']) {
      const res = await get('/split', { SPLIT_BOT_USERNAME: value });
      expect(res.status).toBe(404);
    }
  });

  it('loads nothing from any other site', async () => {
    const html = await (await get('/split')).text();
    expect(html).not.toMatch(/<script[^>]+src=/);
    expect(html).not.toContain('<iframe');
    expect(html).not.toMatch(/youtube|telegram\.org/i);
    const allowed = [
      'https://t.me/',
      'https://linkedin.com/in/miccheng',
      'https://github.com/engineersftw/event-paynow',
      ORIGIN,
    ];
    for (const url of html.match(/https?:\/\/[^"'\s<)]+/g) ?? []) {
      expect(allowed.some((a) => url.startsWith(a))).toBe(true);
    }
  });

  it('shares the theme choice and footer with the other pages and links home', async () => {
    const html = await (await get('/split')).text();
    expect(html).toContain("localStorage.getItem('theme')");
    expect(html).toContain('id="theme"');
    expect(html).toContain('class="site-footer"');
    expect(html).toContain('<a href="/">Event PayNow Bot</a>');
  });
});

describe('the home page link to the Split page', () => {
  it('is shown when the Split bot is configured, and left out when it is not', async () => {
    const withLink = await (await get('/')).text();
    expect(withLink).toContain('Splitting a bill? <a href="/split">Try the Split PayNow Bot</a>');
    const without = await (await get('/', { SPLIT_BOT_USERNAME: undefined })).text();
    expect(without).not.toContain('/split');
    // the rest of the home page is unchanged
    expect(without).toContain('Add the bot on Telegram');
    expect(without).toContain('id="play"');
  });
});
