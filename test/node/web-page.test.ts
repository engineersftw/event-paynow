import { describe, expect, it } from 'vitest';
import { handleWeb, type WebEnv } from '../../src/web/handler';

describe('event page shell', () => {
  it('serves valid inline script, the payback controls, and no payment-changing forms', async () => {
    const res = await handleWeb(new Request('https://x.test/events/EVT1'), {
      BOT_USERNAME: 'my_bot',
    } as unknown as WebEnv);
    const html = await res.text();

    const script = html.match(/<script>([\s\S]*)<\/script>/)![1]!;
    expect(() => new Function(script)).not.toThrow(); // syntax check only, never executed
    expect(html).toContain("'/api/events/EVT1/payments/'");
    expect(html).toContain('Pay back');
    expect(html).toContain("el('button', 'Sent')");
    expect(html).not.toMatch(/<form|method=["']post/i);
    expect(html).not.toMatch(/innerHTML/);
    // payments themselves are not changeable from the page
    expect(html).not.toMatch(/mark_received|[^a-z]void[^a-z]/i);
  });
});
