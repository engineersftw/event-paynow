import { describe, expect, it } from 'vitest';
import { renderSplitAppPage, splitAppPageHeaders } from '../../src/split-app/page';

const NONCE = 'abc123';
const html = renderSplitAppPage(NONCE);
const script = /<script nonce="abc123">([\s\S]*)<\/script>/.exec(html)![1]!;

describe('Split Mini App page', () => {
  it('is one nonce-marked script plus Telegram’s own, and nothing else that runs', () => {
    const tags = html.match(/<script\b[^>]*>/g)!;
    expect(tags).toEqual([
      '<script src="https://telegram.org/js/telegram-web-app.js">',
      `<script nonce="${NONCE}">`,
    ]);
    expect(html).not.toMatch(/\son[a-z]+\s*=/i); // no inline event handlers
  });

  it('has a script that parses', () => {
    expect(() => new Function(script)).not.toThrow();
  });

  it('writes people and item names as text, never as markup', () => {
    for (const unsafe of [
      'innerHTML',
      'outerHTML',
      'insertAdjacentHTML',
      'document.write',
      'eval(',
    ]) {
      expect(script).not.toContain(unsafe);
    }
    expect(script).toContain('textContent');
  });

  it('sends the launch data with every call and calls only its own interface', () => {
    expect(script).toContain("'Authorization': 'tma ' + tg.initData");
    const calls = [...script.matchAll(/fetch\(([^,]+),/g)].map((m) => m[1]);
    expect(calls).toEqual(["'/split-app/api/' + path"]);
    expect(script).not.toMatch(/https?:\/\//);
  });

  it('offers Everyone, and keeps the ways dropdown behind a link until it is wanted', () => {
    expect(script).toContain("change(i, 'everyone')");
    expect(script).toContain('Share with more people');
    expect(script).toContain('waysOpen');
  });

  it('shows a spinner while a change or the first load waits, and keeps the poll silent', () => {
    expect(html).toContain('<div id="spin" class="spin" role="status" hidden>');
    expect(html).toContain('Updating…');
    expect(html).toContain('.spin[hidden]{display:none}'); // display:flex would otherwise override hidden
    expect(html).toContain('.head{position:sticky'); // in view however far the list is scrolled
    expect(html).toContain('prefers-reduced-motion');
    expect(script).toContain('function setBusy');
    expect(script).toContain('setBusy(true)');
    expect(script.match(/setBusy\(false\)/g)).toHaveLength(2); // after a change, after a loud load
    expect(script).toContain('load(true)'); // the first load is loud
    // the poll and the refresh on returning to the page are not
    expect(script).toContain('if (!document.hidden) load(); }, 4000)');
    expect(script).toContain("visibilitychange', function () { if (!document.hidden) load(); }");
  });

  it('is told, not guessed: a page opened outside Telegram says how to open it', () => {
    expect(script).toContain('Open this page from the Edit in app button in Telegram.');
  });

  it('has a policy that allows its script by nonce and Telegram’s script, and nothing else', () => {
    const h = splitAppPageHeaders(NONCE);
    const csp = h['Content-Security-Policy']!;
    expect(csp).toContain("default-src 'none'");
    expect(csp).toContain(`script-src 'nonce-${NONCE}' https://telegram.org`);
    expect(csp).toContain("connect-src 'self'");
    expect(csp).not.toContain("script-src 'unsafe-inline'");
    expect(csp).not.toContain('frame-ancestors'); // Telegram Web shows Mini Apps in a frame
    expect(h['Content-Type']).toContain('text/html');
    expect(h['Cache-Control']).toBe('no-store');
  });
});
