import { describe, expect, it } from 'vitest';
import { handleWeb, type WebEnv } from '../../src/web/handler';

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

    const src = html.match(/const MONTHS = [^;]*;\nconst fmtDate = [^\n]*/)![0];
    const fmtDate = new Function(`${src}; return fmtDate;`)() as (t: unknown) => string;
    expect(fmtDate(new Date(2026, 10, 8, 12).getTime())).toBe('08-Nov-2026');
    expect(fmtDate(new Date(2027, 0, 31, 23, 59).getTime())).toBe('31-Jan-2027');
    expect(fmtDate(null)).toBe('');
  });
});
