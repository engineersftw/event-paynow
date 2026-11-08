import { describe, expect, it } from 'vitest';
import { handleWeb, type WebEnv } from '../../src/web/handler';

describe('event page shell', () => {
  it('serves valid inline script with the payment request and payback controls, without forms or innerHTML', async () => {
    const res = await handleWeb(new Request('https://x.test/events/EVT1'), {
      BOT_USERNAME: 'my_bot',
    } as unknown as WebEnv);
    const html = await res.text();

    const script = html.match(/<script>([\s\S]*)<\/script>/)![1]!;
    expect(() => new Function(script)).not.toThrow(); // syntax check only, never executed
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
    expect(html).not.toContain('<img'); // QR images are only created when a panel opens
    expect(html).not.toMatch(/<th>Description/);
  });
});
