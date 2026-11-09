import { describe, expect, it } from 'vitest';
import { handleWeb, type WebEnv } from '../../src/web/handler';
import { renderPage, renderPayerPage } from '../../src/web/page';

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
    for (const html of [renderPage('EVT1', 'my_bot'), renderPayerPage('EVT1', 'my_bot')]) {
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
    for (const html of [renderPage('EVT1', 'my_bot'), renderPayerPage('EVT1', 'my_bot')]) {
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
    const html = renderPayerPage('EVT1', 'my_bot');
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
