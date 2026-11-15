/**
 * The Mini App page for the organiser of a group's claim split: every item with its holders, and the
 * controls to change them. One HTML string with inline CSS and a small script (no build step, like the
 * other pages). The script is the only script besides Telegram's own, so the page's CSP can allow it
 * by a nonce. Everything user-supplied (item names, people) is written with `textContent` only.
 */

const CSS = `
:root{--bg:var(--tg-theme-bg-color,#fff);--fg:var(--tg-theme-text-color,#18181b);--hint:var(--tg-theme-hint-color,#71717a);--card:var(--tg-theme-secondary-bg-color,#f4f4f5);--accent:var(--tg-theme-button-color,#2481cc);--accent-fg:var(--tg-theme-button-text-color,#fff);--danger:var(--tg-theme-destructive-text-color,#dc2626);--line:rgba(127,127,127,.28)}
*{box-sizing:border-box}
body{margin:0;background:var(--bg);color:var(--fg);font:16px/1.4 system-ui,-apple-system,"Segoe UI",Roboto,sans-serif}
main{max-width:640px;margin:0 auto;padding:12px 16px 32px}
h1{font-size:20px;margin:4px 0 2px}
.hint{color:var(--hint);font-size:14px;margin:0 0 12px}
#msg{min-height:20px;font-size:14px;margin:0 0 8px}
#msg.err{color:var(--danger)}
.card{background:var(--card);border-radius:12px;padding:12px;margin:0 0 12px}
.card.locked{opacity:.75}
.top{display:flex;justify-content:space-between;gap:8px;align-items:baseline}
.name{font-weight:600;min-width:0;overflow-wrap:anywhere}
.price{color:var(--hint);white-space:nowrap}
.row{display:flex;flex-wrap:wrap;gap:6px;margin-top:8px;align-items:center}
.label{font-size:13px;color:var(--hint);margin-top:8px}
button,select,input{font:inherit}
.chip{border:1px solid var(--line);background:var(--bg);color:var(--fg);border-radius:999px;padding:6px 12px;min-height:36px;cursor:pointer;max-width:100%;overflow-wrap:anywhere}
.chip.on{background:var(--accent);color:var(--accent-fg);border-color:var(--accent)}
.chip:disabled,.btn:disabled,select:disabled,input:disabled{opacity:.5;cursor:default}
.add{display:flex;gap:6px;margin-top:8px}
.add input{flex:1;min-width:0;border:1px solid var(--line);background:var(--bg);color:var(--fg);border-radius:8px;padding:8px 10px;min-height:40px}
.btn{border:0;background:var(--accent);color:var(--accent-fg);border-radius:8px;padding:8px 14px;min-height:40px;cursor:pointer}
.btn.plain{background:transparent;color:var(--danger);padding:8px 6px}
select{border:1px solid var(--line);background:var(--bg);color:var(--fg);border-radius:8px;padding:6px 8px;min-height:36px}
.empty{color:var(--hint);font-size:14px}
`;

const JS = `
(function () {
  var tg = window.Telegram && window.Telegram.WebApp;
  var msg = document.getElementById('msg');
  var list = document.getElementById('items');
  var title = document.getElementById('hint');
  var data = null;
  var busy = false;
  var closed = false;
  var timer = null;

  function say(text, isError) { msg.textContent = text || ''; msg.className = isError ? 'err' : ''; }
  function stop(text) { closed = true; clearInterval(timer); list.textContent = ''; say(text, false); }

  async function api(path, body) {
    var res = await fetch('/split-app/api/' + path, {
      method: body === undefined ? 'GET' : 'POST',
      headers: { 'Authorization': 'tma ' + tg.initData, 'Content-Type': 'application/json' },
      body: body === undefined ? undefined : JSON.stringify(body)
    });
    var json = null;
    try { json = await res.json(); } catch (e) {}
    return { status: res.status, body: json };
  }

  /** Handles the statuses every call can return; true when the call went through. */
  function accept(r) {
    if (r.status === 200) return true;
    if (r.status === 401) stop('Open this page again from the button in the chat.');
    else if (r.status === 403) stop('Only the organiser of this split can change the claims.');
    else if (r.status === 409) stop('The claiming is over. Finish the split in the chat.');
    else if (r.status === 503) say('Busy. Please try again.', true);
    else say((r.body && r.body.error) || 'That did not work.', true);
    return false;
  }

  function personName(p) { return p.id === data.organiserId ? 'Me' : p.name; }
  function byId(id) { return data.people.filter(function (p) { return p.id === id; })[0]; }

  function el(tag, cls, text) {
    var e = document.createElement(tag);
    if (cls) e.className = cls;
    if (text !== undefined) e.textContent = text;
    return e;
  }

  async function change(item, op, more) {
    if (busy || closed) return;
    busy = true;
    say('');
    var body = { item: item, op: op };
    for (var k in (more || {})) body[k] = more[k];
    var refused = false;
    try {
      var r = await api('claim', body);
      if (accept(r)) { data = r.body; render(); }
      else if (r.status === 422) refused = true;
    } catch (e) { say('No connection. Please try again.', true); }
    busy = false;
    if (refused) await load(); // show what the chat says now, keeping the reason on screen
  }

  function money(cents) { return 'SGD ' + (cents / 100).toFixed(2); }

  function card(it, i) {
    var c = el('div', 'card' + (it.locked ? ' locked' : ''));
    var top = el('div', 'top');
    top.appendChild(el('div', 'name', (it.locked ? '\\uD83D\\uDD12 ' : '') + (i + 1) + '. ' + it.name));
    top.appendChild(el('div', 'price', money(it.cents)));
    c.appendChild(top);

    var holders = el('div', 'row');
    if (it.holders.length === 0) holders.appendChild(el('span', 'empty', 'Nobody yet'));
    it.holders.forEach(function (id) {
      var p = byId(id);
      var b = el('button', 'chip on', (p ? personName(p) : '?') + ' \\u2715');
      b.type = 'button';
      b.disabled = it.locked;
      b.addEventListener('click', function () { change(i, 'toggle', { id: id }); });
      holders.appendChild(b);
    });
    c.appendChild(holders);

    if (it.locked) {
      c.appendChild(el('div', 'label', 'Someone on this item already has their QR, so it cannot change.'));
      return c;
    }

    var others = data.people.filter(function (p) { return it.holders.indexOf(p.id) < 0 && !p.served; });
    if (others.length) {
      c.appendChild(el('div', 'label', 'Add'));
      var add = el('div', 'row');
      others.forEach(function (p) {
        var b = el('button', 'chip', '+ ' + personName(p));
        b.type = 'button';
        b.addEventListener('click', function () {
          change(i, p.id === data.organiserId ? 'mine' : 'toggle', { id: p.id });
        });
        add.appendChild(b);
      });
      c.appendChild(add);
    }

    var form = el('form', 'add');
    var input = el('input');
    input.type = 'text';
    input.placeholder = 'Name or @username';
    input.maxLength = 200;
    input.setAttribute('aria-label', 'Name of someone else who had item ' + (i + 1));
    input.dataset.item = String(i);
    var go = el('button', 'btn', 'Add');
    go.type = 'submit';
    form.appendChild(input);
    form.appendChild(go);
    form.addEventListener('submit', function (ev) {
      ev.preventDefault();
      var text = input.value.trim();
      if (text) change(i, 'add', { text: text });
    });
    c.appendChild(form);

    var tools = el('div', 'row');
    var sel = el('select');
    sel.setAttribute('aria-label', 'Share item ' + (i + 1) + ' in a number of ways');
    var none = el('option', '', 'Not shared');
    none.value = '';
    sel.appendChild(none);
    for (var n = 2; n <= 20; n++) {
      var o = el('option', '', 'Shared ' + n + ' ways');
      o.value = String(n);
      sel.appendChild(o);
    }
    sel.value = it.ways ? String(it.ways) : '';
    sel.addEventListener('change', function () {
      change(i, 'ways', { n: sel.value === '' ? null : Number(sel.value) });
    });
    tools.appendChild(sel);
    if (it.holders.length) {
      var clear = el('button', 'btn plain', 'Remove all');
      clear.type = 'button';
      clear.addEventListener('click', function () { change(i, 'clear'); });
      tools.appendChild(clear);
    }
    c.appendChild(tools);
    return c;
  }

  /** Draws the items again, keeping what is typed and where the cursor is. */
  function render() {
    var typed = {};
    var focused = document.activeElement;
    var focusItem = focused && focused.dataset ? focused.dataset.item : undefined;
    Array.prototype.forEach.call(list.querySelectorAll('input'), function (inp) {
      if (inp.value) typed[inp.dataset.item] = inp.value;
    });
    list.textContent = '';
    data.items.forEach(function (it, i) { list.appendChild(card(it, i)); });
    Array.prototype.forEach.call(list.querySelectorAll('input'), function (inp) {
      if (typed[inp.dataset.item] !== undefined) inp.value = typed[inp.dataset.item];
      if (focusItem !== undefined && inp.dataset.item === focusItem) inp.focus();
    });
    title.textContent = 'Tap a name to add or remove it. When everyone has claimed, tap Done in the chat.';
  }

  async function load() {
    if (busy || closed) return;
    try {
      var r = await api('state');
      if (accept(r)) { data = r.body; render(); }
    } catch (e) { say('No connection. Trying again\\u2026', true); }
  }

  if (!tg || !tg.initData) { stop('Open this page from the Edit in app button in Telegram.'); return; }
  tg.ready();
  tg.expand();
  load();
  timer = setInterval(function () { if (!document.hidden) load(); }, 4000);
  document.addEventListener('visibilitychange', function () { if (!document.hidden) load(); });
})();
`;

/** The page, with `nonce` on its one script (the CSP allows that script and Telegram's, nothing else). */
export function renderSplitAppPage(nonce: string): string {
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">
<meta name="robots" content="noindex">
<title>Split claims</title>
<style>${CSS}</style>
<script src="https://telegram.org/js/telegram-web-app.js"></script>
</head>
<body>
<main>
<h1>Who had what</h1>
<p class="hint" id="hint">Loading…</p>
<div id="msg" role="status" aria-live="polite"></div>
<div id="items"></div>
</main>
<script nonce="${nonce}">${JS}</script>
</body>
</html>
`;
}

/** The headers of the page: no inline script without the nonce, scripts only from Telegram, calls only to itself. */
export function splitAppPageHeaders(nonce: string): Record<string, string> {
  return {
    'Content-Type': 'text/html; charset=utf-8',
    'Cache-Control': 'no-store',
    'X-Content-Type-Options': 'nosniff',
    'Referrer-Policy': 'no-referrer',
    'Content-Security-Policy': `default-src 'none'; script-src 'nonce-${nonce}' https://telegram.org; style-src 'unsafe-inline'; connect-src 'self'; img-src 'self' data:; base-uri 'none'; form-action 'none'`,
  };
}
