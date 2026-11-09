import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { handleWeb, type WebEnv } from '../../src/web/handler';
import {
  renderLandingPage,
  renderPage,
  renderPayerPage,
  socialMeta,
  videoCard,
} from '../../src/web/page';

describe('event page shell', () => {
  it('serves valid inline script with the payment request and payback controls, without forms or innerHTML', async () => {
    const res = await handleWeb(new Request('https://x.test/events/EVT1'), {
      BOT_USERNAME: 'my_bot',
    } as unknown as WebEnv);
    const html = await res.text();

    const scripts = [...html.matchAll(/<script>([\s\S]*?)<\/script>/g)].map((m) => m[1]!);
    for (const code of scripts) expect(() => new Function(code)).not.toThrow(); // syntax check only, never executed
    expect(html).toContain("'/api/events/EVT1/payments/'");
    expect(html).toContain("'Pay back'");
    expect(html).toContain("el('button', 'Sent'");
    expect(html).not.toMatch(/<form|method=["']post/i);
    expect(html).not.toMatch(/innerHTML/);
    // payment requests: form, QR, and settle buttons (all through same-origin JSON endpoints)
    expect(html).toContain('New payment request');
    expect(html).toContain("'/api/events/EVT1/payments'");
    expect(html).toContain("el('button', 'Received'");
    expect(html).toContain("el('button', 'Void'");
    expect(html).toContain("'/qr'");
    // modal dialog, lazy pending QR, collapsed paybacks
    expect(html).toContain('<dialog id="dlg"');
    expect(html).toContain('prefers-color-scheme:dark');
    expect(html).toContain('aria-expanded');
    expect(html.match(/<img/g)).toHaveLength(1); // only the logo; QR images are created when a panel opens
    expect(html).not.toMatch(/<th>Description/);
  });

  it('has the header, logo, theme toggle, status colours, count chip and dd-MMM-YYYY dates', async () => {
    const html = await (
      await handleWeb(new Request('https://x.test/events/EVT1'), {
        BOT_USERNAME: 'my_bot',
      } as unknown as WebEnv)
    ).text();
    expect(html).toContain("'Event: ' + d.event.name");
    expect(html).toContain('src="/logo.png"');
    expect(html).toContain('rel="icon" href="/logo.png"');
    expect(html).toContain('id="theme"');
    expect(html).toContain("localStorage.getItem('theme')");
    expect(html).toContain('[data-theme="dark"]');
    for (const status of ['pending', 'received', 'voided']) {
      expect(html).toContain(`--${status}-bg:`);
    }
    expect(html).toContain("el('span', String(count), 'count')");
    expect(html).toContain('min-height:40px');
    // the dialog pre-fills the event's default amount (opening and "Create another")
    expect(html).toContain(
      "d.event.defaultAmountCents ? (d.event.defaultAmountCents / 100).toFixed(2) : ''"
    );
    expect(html).toContain("$('np-amount').value = defaultAmount;");
    // list controls: paging, search and status filter
    expect(html).toContain('id="more"');
    expect(html).toContain('Checked in');
    expect(html).toContain('not-checked-in-split');
    expect(html).toContain("$('checked-in').textContent = String(d.checkInStats.checkedInCount)");
    expect(html).toContain('>Load more<');
    expect(html).toContain('id="q"');
    expect(html).toContain("['voided', 'Voided']");
    expect(html).toContain("params.set('cursor', cursor)");
    expect(html).toContain('href="/pay/EVT1"');

    const src = html.match(/const MONTHS = [^;]*;\nconst fmtDate = [^\n]*/)![0];
    const fmtDate = new Function(`${src}; return fmtDate;`)() as (t: unknown) => string;
    expect(fmtDate(new Date(2026, 10, 8, 12).getTime())).toBe('08-Nov-2026');
    expect(fmtDate(new Date(2027, 0, 31, 23, 59).getTime())).toBe('31-Jan-2027');
    expect(fmtDate(null)).toBe('');
  });

  it('the event page has a Scan dialog that decodes in the browser and checks attendees in', () => {
    const html = renderPage('EVT1', 'my_bot');
    expect(html).toContain('id="scan"');
    expect(html).toContain('id="scan-dlg"');
    expect(html).toContain('id="sc-video"');
    expect(html).toContain("facingMode: 'environment'");
    // BarcodeDetector when present, otherwise the vendored jsQR, loaded only on demand
    expect(html).toContain('BarcodeDetector');
    expect(html).toContain("s.src = '/vendor/jsqr.js'");
    expect(html).not.toContain('<script src="/vendor/jsqr.js"');
    // The decoded text goes to the server, which matches it; typed references are the fallback
    expect(html).toContain("post('/api/events/EVT1/scan', body)");
    expect(html).toContain('resolveScan({ payload: text })');
    expect(html).toContain('resolveScan({ ref: v })');
    expect(html).toContain("'/check-in'");
    expect(html).toContain('Checked in ');
    expect(html).toContain("'badge checked'");
    for (const code of [...html.matchAll(/<script>([\s\S]*?)<\/script>/g)].map((m) => m[1]!)) {
      expect(() => new Function(code)).not.toThrow();
    }
  });

  it('payment rows have a Check-In button that shares one check-in call with the scan dialog', () => {
    const html = renderPage('EVT1', 'my_bot');
    // Offered only for rows that are not voided and not yet checked in; not duplicated inside the dialog
    expect(html).toContain("if (withCheckIn && p.status !== 'voided' && !p.checkedInAt)");
    expect(html).toContain("el('button', 'Check-In', 'btn primary')");
    expect(html).toContain('paymentCard(p, false)');
    expect(html).toContain('rows.map((p) => paymentCard(p))'); // map must not pass its index as withCheckIn
    // One request helper for both callers, and the row always reloads the list afterwards
    expect(html).toContain('async function checkInRequest(paymentRef)');
    expect(html.split('checkInRequest(').length - 1).toBe(3); // definition + dialog + row
    expect(html).toContain('async function rowCheckIn(p, button)');
    // Error text is set after the reload, which clears the message line (also for the existing act())
    expect(html.split('if (problem) say(problem)').length - 1).toBe(1);
    expect(html).toContain('if (problem) { say(problem);');
    expect(html).toContain(' is already checked in.');
    expect(html).toContain(' is voided: it cannot be checked in.');
    for (const code of [...html.matchAll(/<script>([\s\S]*?)<\/script>/g)].map((m) => m[1]!)) {
      expect(() => new Function(code)).not.toThrow();
    }
  });

  it('both pages share the top bar: signed-in name, Sign out and the light/dark toggle', () => {
    for (const html of [
      renderPage('EVT1', 'my_bot'),
      renderPayerPage('EVT1', 'my_bot', 'https://x.test'),
    ]) {
      expect(html).toContain('<div class="topbar">');
      expect(html).toContain('id="theme"');
      // The saved theme is applied before first paint and toggled in the page (same key on both pages)
      expect(html).toContain("localStorage.getItem('theme')");
      expect(html).toContain("localStorage.setItem('theme', next)");
      expect(html).toContain('[data-theme="dark"]');
      for (const code of [...html.matchAll(/<script>([\s\S]*?)<\/script>/g)].map((m) => m[1]!)) {
        expect(() => new Function(code)).not.toThrow();
      }
    }
  });

  it('both pages show the signed-in user with Sign out, hidden until /api/me reports one', () => {
    for (const html of [
      renderPage('EVT1', 'my_bot'),
      renderPayerPage('EVT1', 'my_bot', 'https://x.test'),
    ]) {
      expect(html).toContain('id="me"');
      expect(html).toMatch(/id="me"[^>]*hidden/);
      expect(html).toContain('id="signout"');
      expect(html).toContain("fetch('/api/me'");
      expect(html).toContain("fetch('/api/logout',{method:'POST'");
      expect(html).toContain("u.name||'Signed in'");
      expect(html).toContain('location.reload()');
      expect(html).toContain('textContent');
      const scripts = [...html.matchAll(/<script>([\s\S]*?)<\/script>/g)].map((m) => m[1]!);
      for (const code of scripts) expect(() => new Function(code)).not.toThrow();
    }
  });

  it('renders the standalone payer page with conditional amount editing and inline QR flow', () => {
    const html = renderPayerPage('EVT1', 'my_bot', 'https://x.test');
    const scripts = [...html.matchAll(/<script>([\s\S]*?)<\/script>/g)].map((m) => m[1]!);
    for (const code of scripts) expect(() => new Function(code)).not.toThrow();
    expect(html).toContain('/api/pay/EVT1');
    expect(html).toContain('/api/pay/EVT1/payments');
    expect(html).toContain('data-auth-url="/api/login?ref=EVT1&amp;next=pay"');
    // A default amount is plain text (no disabled input); no default keeps the editable field
    expect(html).toContain("$('amount-field').classList.toggle('hidden',defaultCents!==null)");
    expect(html).toContain("$('amount-fixed').classList.toggle('hidden',defaultCents===null)");
    expect(html).not.toContain('readOnly');
    // History of the signed-in user's requests, and the hint shown when the private copy failed
    expect(html).toContain("fetch('/api/pay/EVT1/payments'");
    expect(html).toContain('Your previous requests');
    expect(html).toContain("$('dm').classList.toggle('hidden',d.payment.dm!==false)");
    expect(html).toContain("alt:'Payment QR'");
    expect(html).not.toContain('sendPhoto');
    // Sign-in is optional: the form shows without it, the widget sits in an optional block,
    // the QR comes from the create response, and history is only for signed-in users
    expect(html).not.toContain("$('login')");
    expect(html).toContain('id="signin"');
    expect(html).toContain("if(signedIn)loadHistory();else $('signin').classList.remove('hidden')");
    expect(html).toContain('src:d.payment.qr');
    // The keep-the-QR reminder sits by both QRs the page shows (after creating, and a reopened pending request)
    expect(html.split('Keep this QR for event check-in and payment verification.').length - 1).toBe(
      2
    );
    expect(html).toContain('id="keep"');
    expect(html).toContain('rate_limited');
  });
});

describe('landing page', () => {
  const get = (bot: string) =>
    handleWeb(new Request('https://x.test/'), { BOT_USERNAME: bot } as unknown as WebEnv);

  it('is public at / with the Telegram link, getting-started steps and theme toggle', async () => {
    const res = await get('my_bot');
    expect(res.status).toBe(200);
    expect(res.headers.get('Content-Type')).toContain('text/html');
    const html = await res.text();
    expect(html).toContain('href="https://t.me/my_bot"');
    expect(html.match(/t\.me\/my_bot/g)).toHaveLength(2); // top and bottom
    expect(html).toContain('/init');
    expect(html).toContain('id="theme"');
    const scripts = [...html.matchAll(/<script>([\s\S]*?)<\/script>/g)].map((m) => m[1]!);
    for (const code of scripts) expect(() => new Function(code)).not.toThrow();
  });

  it('sanitises the bot username in the link', async () => {
    const html = await (await get('a"><script>x</script>')).text();
    expect(html).toContain('https://t.me/ascriptxscript"');
    expect(html).not.toContain('<script>x');
  });

  describe('explainer video', () => {
    it('is a click-to-play card: no player, no YouTube request before the click', async () => {
      const html = await (await get('my_bot')).text();
      expect(html).toContain('id="play"');
      expect(html).toContain('data-video="ezOo1OIhl-Y"');
      expect(html).toContain('href="https://youtu.be/ezOo1OIhl-Y"'); // works without JavaScript
      expect(html).not.toContain('<iframe');
      // the only YouTube hosts in the page are the plain link and the script that runs on click
      expect(html.match(/<(?:img|script|link|iframe)[^>]+(?:youtube|ytimg|google)/gi)).toBeNull();
      expect(html.indexOf('id="play"')).toBeGreaterThan(html.indexOf('t.me/my_bot'));
      expect(html.indexOf('id="play"')).toBeLessThan(html.indexOf('What it does'));
    });

    it('swaps in the privacy-enhanced player on click', async () => {
      const html = await (await get('my_bot')).text();
      const code = [...html.matchAll(/<script>([\s\S]*?)<\/script>/g)].map((m) => m[1]!).join('\n');
      expect(() => new Function(code)).not.toThrow();
      expect(code).toContain('https://www.youtube-nocookie.com/embed/');
      expect(code).toContain('autoplay=1');
      expect(code).toContain('allowFullscreen=true');
      expect(code).toContain('f.title=');
    });

    it('leaves the block out for an id that is not a YouTube id', () => {
      for (const bad of ['', 'short', 'ezOo1OIhl-Y"><script>', 'ezOo1OIhl-YY', 'ezOo1OIhl 1'])
        expect(videoCard(bad)).toBe('');
      expect(videoCard('ezOo1OIhl-Y')).toContain('data-video="ezOo1OIhl-Y"');
    });
  });
});

describe('attribution footer', () => {
  const pages: Array<[string, string, string]> = [
    ['landing page', renderLandingPage('my_bot', 'https://x.test'), 'Get started'],
    ['event admin page', renderPage('EVT1', 'my_bot'), 'id="data"'],
    ['payer page', renderPayerPage('EVT1', 'my_bot', 'https://x.test'), 'id="app"'],
  ];

  for (const [name, html, content] of pages) {
    it(`appears on the ${name}, after the content, with safe links and nothing to load`, () => {
      const footer = html.match(/<footer class="site-footer">([\s\S]*?)<\/footer>/)?.[0];
      expect(footer).toBeDefined();
      const text = footer!.replace(/<[^>]+>/g, '').replace(/&amp;/g, '&');
      expect(text).toBe('Built by Michael Cheng & Claude Code AI. Open Source with ❤️.');
      // two lines: credit first, then "Open Source with ❤️."
      expect(footer).toMatch(
        /^<footer class="site-footer"><span>Built by .*AI\.<\/span> <span><a href=.*>Open Source<\/a> with ❤️\.<\/span><\/footer>$/
      );
      expect(footer).toContain(
        '<a href="https://linkedin.com/in/miccheng" target="_blank" rel="noopener noreferrer">Michael Cheng</a>'
      );
      expect(footer).toContain(
        '<a href="https://github.com/engineersftw/event-paynow" target="_blank" rel="noopener noreferrer">Open Source</a>'
      );
      expect(footer).not.toMatch(/src=|<script|<img|<link/i);
      expect(html.indexOf('<footer')).toBeGreaterThan(html.indexOf(content));
      expect(html.match(/<footer/g)).toHaveLength(1);
      expect(html).toContain('.site-footer{'); // styled on every page
    });
  }
});

describe('social preview tags', () => {
  const ORIGIN = 'https://event-paynow.engineers.sg';
  const meta = (html: string, key: string) =>
    html.match(new RegExp(`<meta (?:property|name)="${key}" content="([^"]*)">`))?.[1];
  const head = (html: string) => html.slice(0, html.indexOf('</head>'));

  it('socialMeta escapes every value and emits the full Open Graph and Twitter set', () => {
    const out = socialMeta({
      title: 'A "quoted" <b>title</b> & more',
      description: "it's <script>alert(1)</script>",
      url: 'https://x.test/p?a=1&b="2"',
      image: 'https://x.test/i.jpg',
    });
    expect(out).not.toMatch(/<script|<b>|"quoted"/);
    expect(out).toContain('content="A &quot;quoted&quot; &lt;b&gt;title&lt;/b&gt; &amp; more"');
    expect(out).toContain('content="it&#39;s &lt;script&gt;alert(1)&lt;/script&gt;"');
    expect(out).toContain('href="https://x.test/p?a=1&amp;b=&quot;2&quot;"');
    for (const key of [
      'og:type',
      'og:site_name',
      'og:locale',
      'og:title',
      'og:description',
      'og:url',
      'og:image',
      'og:image:type',
      'og:image:width',
      'og:image:height',
      'og:image:alt',
      'twitter:card',
      'twitter:title',
      'twitter:description',
      'twitter:image',
      'twitter:image:alt',
      'description',
    ]) {
      expect(out, key).toContain(`"${key}"`);
    }
    expect(out).toContain('<meta name="twitter:card" content="summary_large_image">');
    expect(out).toContain('<link rel="canonical"');
  });

  it('the landing page has every tag in the server HTML, with absolute URLs from the origin', async () => {
    const html = await (
      await handleWeb(new Request(`${ORIGIN}/`), { BOT_USERNAME: 'my_bot' } as unknown as WebEnv)
    ).text();
    const h = head(html);
    expect(meta(h, 'og:title')).toBe('Event PayNow Bot');
    expect(meta(h, 'og:description')).toContain('Collect PayNow payments');
    expect(meta(h, 'og:url')).toBe(`${ORIGIN}/`);
    expect(meta(h, 'og:image')).toBe(`${ORIGIN}/explainer-poster.jpg`);
    expect(meta(h, 'twitter:image')).toBe(`${ORIGIN}/explainer-poster.jpg`);
    expect(meta(h, 'twitter:card')).toBe('summary_large_image');
    expect(h).toContain(`<link rel="canonical" href="${ORIGIN}/">`);
    // all of it in the head as plain tags: nothing here depends on running a script
    expect(h).not.toMatch(/<script[^>]*>[^<]*og:/);
  });

  it('follows the host it was requested on', async () => {
    const html = await (
      await handleWeb(new Request('https://other.pages.dev/'), {
        BOT_USERNAME: 'b',
      } as unknown as WebEnv)
    ).text();
    expect(meta(head(html), 'og:image')).toBe('https://other.pages.dev/explainer-poster.jpg');
    expect(meta(head(html), 'og:url')).toBe('https://other.pages.dev/');
  });

  it('payment pages name the event, escaped, and shorten long names', () => {
    const named = renderPayerPage('EVT1', 'b', ORIGIN, 'Team Dinner');
    expect(meta(head(named), 'og:title')).toBe('Pay for Team Dinner');
    expect(meta(head(named), 'og:description')).toContain('Team Dinner');
    expect(meta(head(named), 'og:url')).toBe(`${ORIGIN}/pay/EVT1`);
    expect(named).toContain('<title>Pay for Team Dinner</title>');

    const hostile = renderPayerPage('EVT1', 'b', ORIGIN, '"><script>alert(1)</script> & Co');
    expect(head(hostile)).not.toContain('<script>alert(1)');
    expect(meta(head(hostile), 'og:title')).toBe(
      'Pay for &quot;&gt;&lt;script&gt;alert(1)&lt;/script&gt; &amp; Co'
    );
    expect(hostile).toContain(
      '<title>Pay for &quot;&gt;&lt;script&gt;alert(1)&lt;/script&gt; &amp; Co</title>'
    );

    const long = renderPayerPage('EVT1', 'b', ORIGIN, 'X'.repeat(200));
    expect(meta(head(long), 'og:title')).toBe(`Pay for ${'X'.repeat(59)}…`);

    const generic = renderPayerPage('EVT1', 'b', ORIGIN, null);
    expect(meta(head(generic), 'og:title')).toBe('Make a PayNow payment');
    expect(meta(head(generic), 'og:description')).not.toContain('null');
  });

  it('the admin page is private and carries no preview tags', () => {
    const html = renderPage('EVT1', 'b');
    expect(html).not.toMatch(/(?:property|name)="(?:og|twitter):/);
    expect(html).not.toContain('rel="canonical"');
  });

  it('the video card shows the site-hosted poster and nothing from YouTube until clicked', () => {
    const card = videoCard('ezOo1OIhl-Y');
    expect(card).toContain('<img class="vposter" src="/explainer-poster.jpg"');
    expect(card).not.toContain('/logo.png');
    expect(card.match(/<(?:img|script|link|iframe)[^>]+(?:youtube|ytimg|google)/gi)).toBeNull();
  });

  it('the preview image is a 1280x720 JPEG under 200 KB', () => {
    const bytes = readFileSync(new URL('../../web/public/explainer-poster.jpg', import.meta.url));
    expect(bytes.length).toBeLessThan(200 * 1024);
    expect([bytes[0], bytes[1]]).toEqual([0xff, 0xd8]); // JPEG magic
    // read the dimensions from the first start-of-frame marker
    let i = 2;
    let size: [number, number] | null = null;
    while (i < bytes.length - 9) {
      if (bytes[i] !== 0xff) {
        i++;
        continue;
      }
      const marker = bytes[i + 1]!;
      if (marker >= 0xc0 && marker <= 0xcf && ![0xc4, 0xc8, 0xcc].includes(marker)) {
        size = [bytes.readUInt16BE(i + 7), bytes.readUInt16BE(i + 5)];
        break;
      }
      i += 2 + bytes.readUInt16BE(i + 2);
    }
    expect(size).toEqual([1280, 720]);
  });
});
