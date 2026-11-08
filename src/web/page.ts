/** Static shell; data is fetched from the API and written with textContent (names are user input). */
export function renderPage(ref: string, botUsername: string): string {
  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Event</title>
<link rel="icon" href="/logo.png">
<script>try{var t=localStorage.getItem('theme');if(t==='light'||t==='dark')document.documentElement.dataset.theme=t}catch(e){}</script>
<style>
:root{--bg:#fff;--fg:#09090b;--muted:#f4f4f5;--muted-fg:#71717a;--border:#e4e4e7;--primary:#18181b;--primary-fg:#fafafa;--destructive:#dc2626;--ring:#a1a1aa;--radius:.5rem;--pending-bg:#fef3c7;--pending-fg:#92400e;--received-bg:#dcfce7;--received-fg:#166534;--voided-bg:#e4e4e7;--voided-fg:#52525b}
@media (prefers-color-scheme:dark){:root:not([data-theme="light"]){--bg:#09090b;--fg:#fafafa;--muted:#27272a;--muted-fg:#a1a1aa;--border:#27272a;--primary:#fafafa;--primary-fg:#18181b;--destructive:#f87171;--ring:#52525b;--pending-bg:#451a03;--pending-fg:#fcd34d;--received-bg:#052e16;--received-fg:#86efac;--voided-bg:#3f3f46;--voided-fg:#d4d4d8}}
:root[data-theme="dark"]{--bg:#09090b;--fg:#fafafa;--muted:#27272a;--muted-fg:#a1a1aa;--border:#27272a;--primary:#fafafa;--primary-fg:#18181b;--destructive:#f87171;--ring:#52525b;--pending-bg:#451a03;--pending-fg:#fcd34d;--received-bg:#052e16;--received-fg:#86efac;--voided-bg:#3f3f46;--voided-fg:#d4d4d8}
*{box-sizing:border-box}
body{margin:0 auto;max-width:44rem;padding:16px;font:14px/1.5 system-ui,-apple-system,"Segoe UI",sans-serif;background:var(--bg);color:var(--fg)}
h1{font-size:1.5rem;line-height:1.2;margin:0;letter-spacing:-.02em}
[hidden]{display:none!important}
.muted{color:var(--muted-fg)}.sm{font-size:12px}
.head{display:flex;align-items:center;justify-content:space-between;gap:12px;margin-bottom:16px}
.stats{display:grid;grid-template-columns:repeat(3,1fr);gap:8px;margin-bottom:16px}
.card{border:1px solid var(--border);border-radius:var(--radius);padding:12px}
.stat b{display:block;font-size:1.1rem;margin-top:2px}
.list{display:grid;gap:8px}
.row{display:flex;justify-content:space-between;align-items:flex-start;gap:12px}
.row .end{text-align:right;flex:none}
.name{font-weight:600;overflow-wrap:anywhere}
.voided .amt{text-decoration:line-through;color:var(--muted-fg)}
.badge{display:inline-block;border-radius:999px;padding:1px 10px;font-size:12px;font-weight:600;background:var(--muted);color:var(--fg)}
.badge.pending{background:var(--pending-bg);color:var(--pending-fg)}
.badge.received,.badge.sent{background:var(--received-bg);color:var(--received-fg)}
.badge.voided,.badge.cancelled{background:var(--voided-bg);color:var(--voided-fg)}
.toggles{display:flex;flex-wrap:wrap;gap:6px;margin-top:8px}
.panel{margin-top:8px;padding-top:8px;border-top:1px solid var(--border);display:grid;gap:8px}
.btn{font:inherit;font-weight:600;min-height:40px;display:inline-flex;align-items:center;justify-content:center;gap:6px;border:1px solid var(--border);background:var(--bg);color:var(--fg);border-radius:calc(var(--radius) - 2px);padding:8px 16px;cursor:pointer}
.btn:hover{background:var(--muted)}
.btn.primary{background:var(--primary);color:var(--primary-fg);border-color:var(--primary)}
.btn.primary:hover{opacity:.9}
.btn.destructive{color:var(--destructive);border-color:var(--destructive)}
.btn:disabled{opacity:.5;cursor:not-allowed}
.count{display:inline-block;min-width:1.6em;padding:0 6px;border-radius:999px;background:var(--primary);color:var(--primary-fg);font-size:13px;font-weight:700;line-height:1.6;text-align:center}
.brand{display:flex;align-items:center;gap:10px;min-width:0}
.brand img{flex:none;border-radius:8px}
:focus-visible{outline:2px solid var(--ring);outline-offset:2px}
.input{font:inherit;min-height:40px;width:100%;border:1px solid var(--border);border-radius:calc(var(--radius) - 2px);padding:6px 10px;background:var(--bg);color:var(--fg)}
label{display:grid;gap:4px;font-weight:500}
.fields{display:grid;gap:12px}
.inline{display:flex;flex-wrap:wrap;gap:6px}.inline .input{width:auto;flex:1 1 8rem}
.err{color:var(--destructive);margin:0}
.alert{border:1px solid var(--border);border-radius:var(--radius);padding:12px;margin-bottom:16px;background:var(--muted)}
dialog{border:1px solid var(--border);border-radius:var(--radius);padding:0;background:var(--bg);color:var(--fg);width:min(26rem,calc(100% - 32px))}
dialog::backdrop{background:rgba(0,0,0,.5)}
.dlg{padding:16px;display:grid;gap:12px}
.dlg h2{margin:0;font-size:1.1rem}
.foot{display:flex;justify-content:flex-end;gap:8px}
img{max-width:100%;height:auto}
</style></head><body>
<div class="head"><div class="brand"><img src="/logo.png" alt="" width="40" height="40"><h1 id="title">Event</h1></div><div class="inline"><button id="theme" class="btn" aria-label="Switch between light and dark theme"></button><button id="new" class="btn primary" hidden>New request</button></div></div>
<p id="msg" class="alert" hidden></p>
<div id="login" hidden>
<p>Sign in with Telegram to view this event.</p>
<script async src="https://telegram.org/js/telegram-widget.js?22" data-telegram-login="${botUsername.replace(/[^A-Za-z0-9_]/g, '')}" data-size="large" data-auth-url="/api/login?ref=${ref}" data-request-access="write"></script>
</div>
<div id="data" hidden>
<div class="stats">
<div class="card stat"><span class="muted sm">Collected</span><b id="collected"></b></div>
<div class="card stat"><span class="muted sm">Paid back</span><b id="paidback"></b></div>
<div class="card stat"><span class="muted sm">Pending</span><b id="pending"></b></div>
</div>
<div id="rows" class="list"></div>
</div>
<dialog id="dlg" aria-labelledby="dlg-title"><div class="dlg">
<h2 id="dlg-title">New payment request</h2>
<div id="dlg-form" class="fields">
<label>Payer mobile / UEN<input id="np-payer" class="input" autocomplete="off"></label>
<label>Payer name (optional)<input id="np-name" class="input" maxlength="40" autocomplete="off"></label>
<label>Amount (SGD)<input id="np-amount" class="input" inputmode="decimal" placeholder="0.00" autocomplete="off"></label>
<p id="dlg-err" class="err" hidden></p>
<div class="foot"><button id="np-cancel" class="btn">Cancel</button><button id="np-go" class="btn primary">Create</button></div>
</div>
<div id="dlg-result" class="fields" hidden>
<p id="dlg-note" class="muted"></p>
<div id="dlg-qr"></div>
<div class="foot"><button id="np-again" class="btn">Create another</button><button id="np-done" class="btn primary">Done</button></div>
</div>
</div></dialog>
<script>
const $ = (id) => document.getElementById(id);
const sgd = (c) => 'SGD ' + (c / 100).toFixed(2);
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const fmtDate = (t) => { if (!t) return ''; const d = new Date(t); return String(d.getDate()).padStart(2, '0') + '-' + MONTHS[d.getMonth()] + '-' + d.getFullYear(); };
const ERRORS = {
  invalid_amount: 'Enter an amount such as 5.00 (at most 2 decimals).',
  invalid_recipient: 'The recipient must be a valid mobile number or UEN.',
  recipient_required: 'This payment has no stored payer: enter a recipient.',
  not_received: 'Only received payments can be paid back.',
  not_pending: 'That payment or payback is no longer pending.',
  invalid_payer: 'The payer must be a valid mobile number or UEN.',
  event_closed: 'This event is closed.',
  forbidden: 'Not allowed.',
  not_found: 'Not found.',
};
const open = new Set();
function say(text) { $('msg').textContent = text; $('msg').hidden = !text; }
function el(tag, text, cls) { const e = document.createElement(tag); if (text !== undefined) e.textContent = text; if (cls) e.className = cls; return e; }
function failure(e) { return e.error === 'over_bound' ? 'Too much: at most ' + sgd(e.remainingCents) + ' can still be paid back.' : (ERRORS[e.error] || 'Something went wrong.'); }
async function post(path, body) {
  return fetch(path, { method: 'POST', credentials: 'same-origin', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body || {}) });
}
async function act(path, body, button) {
  if (button) button.disabled = true;
  say('');
  const res = await post(path, body);
  if (!res.ok) say(failure(await res.json().catch(() => ({}))));
  await load();
}
function toggle(key, label, count) {
  const b = el('button', undefined, 'btn');
  b.append(label);
  if (count) b.append(el('span', String(count), 'count'));
  b.append(el('span', open.has(key) ? '▴' : '▾'));
  b.setAttribute('aria-expanded', String(open.has(key)));
  b.onclick = () => { if (open.has(key)) open.delete(key); else open.add(key); load(); };
  return b;
}
function qrImage(path, alt) { const img = el('img'); img.src = path; img.alt = alt; img.width = 220; return img; }
function pendingPanel(p) {
  const panel = el('div', undefined, 'panel');
  const base = '/api/events/${ref}/payments/' + encodeURIComponent(p.ref);
  const received = el('button', 'Received', 'btn primary'); received.onclick = () => act(base + '/received', {}, received);
  const voided = el('button', 'Void', 'btn destructive'); voided.onclick = () => act(base + '/void', {}, voided);
  const actions = el('div', undefined, 'inline'); actions.append(received, voided);
  panel.append(qrImage(base + '/qr', 'Payment QR'), actions);
  return panel;
}
function paybackForm(p) {
  const form = el('div', undefined, 'inline');
  const amount = el('input', undefined, 'input'); amount.placeholder = 'Amount'; amount.value = (p.remainingCents / 100).toFixed(2);
  const recipient = el('input', undefined, 'input'); recipient.placeholder = p.needsRecipient ? 'Recipient mobile / UEN (required)' : 'Other recipient (optional)';
  const go = el('button', 'Pay back', 'btn primary');
  go.onclick = () => { open.add('b:' + p.ref); act('/api/events/${ref}/payments/' + encodeURIComponent(p.ref) + '/paybacks', { amount: amount.value, recipient: recipient.value }, go); };
  form.append(amount, recipient, go);
  return form;
}
function paybackRow(b) {
  const row = el('div', undefined, 'panel');
  const info = el('div', undefined, 'row'); info.append(el('span', sgd(b.amountCents) + (b.recipientName ? ' to ' + b.recipientName : '') + ' (' + b.ref + ')'), el('span', b.status, 'badge ' + b.status)); row.append(info);
  if (b.status === 'pending') {
    const base = '/api/events/${ref}/paybacks/' + encodeURIComponent(b.ref);
    const sent = el('button', 'Sent', 'btn primary'); sent.onclick = () => act(base + '/sent', {}, sent);
    const cancel = el('button', 'Cancel', 'btn destructive'); cancel.onclick = () => act(base + '/cancel', {}, cancel);
    const actions = el('div', undefined, 'inline'); actions.append(sent, cancel);
    row.append(qrImage(base + '/qr', 'Payback QR'), actions);
  }
  return row;
}
function paymentCard(p) {
  const card = el('div', undefined, 'card' + (p.status === 'voided' ? ' voided' : ''));
  const row = el('div', undefined, 'row');
  const left = el('div');
  left.append(el('div', p.payerName || p.ref, 'name'), el('div', p.ref + ' · ' + fmtDate(p.createdAt) + (p.receivedAt ? ' · received ' + fmtDate(p.receivedAt) : ''), 'muted sm'));
  const end = el('div', undefined, 'end');
  end.append(el('div', sgd(p.amountCents), 'amt name'));
  if (p.paidBackCents > 0) end.append(el('div', 'Net ' + sgd(p.netCents), 'muted sm'));
  end.append(el('span', p.status, 'badge ' + p.status));
  row.append(left, end);
  card.append(row);
  const toggles = el('div', undefined, 'toggles');
  if (p.status === 'pending') toggles.append(toggle('p:' + p.ref, 'Show QR and actions'));
  const canPayback = p.status === 'received' && p.remainingCents > 0;
  if (p.paybacks.length > 0 || canPayback) toggles.append(toggle('b:' + p.ref, p.paybacks.length > 0 ? 'Paybacks' : 'Pay back', p.paybacks.length));
  if (toggles.children.length > 0) card.append(toggles);
  if (p.status === 'pending' && open.has('p:' + p.ref)) card.append(pendingPanel(p));
  if (open.has('b:' + p.ref)) {
    for (const b of p.paybacks) card.append(paybackRow(b));
    if (canPayback) { const panel = el('div', undefined, 'panel'); panel.append(paybackForm(p)); card.append(panel); }
  }
  return card;
}
async function load() {
  const res = await fetch('/api/events/${ref}', { credentials: 'same-origin' });
  if (res.status === 401) { say(''); $('login').hidden = false; $('data').hidden = true; return; }
  if (res.status === 403) { say('Not allowed: only chat administrators can view this event.'); return; }
  if (res.status === 404) { say('Event not found.'); return; }
  if (!res.ok) { say('Something went wrong.'); return; }
  const d = await res.json();
  document.title = 'Event: ' + d.event.name;
  $('title').textContent = 'Event: ' + d.event.name;
  $('new').hidden = d.event.status !== 'open';
  $('collected').textContent = sgd(d.totals.collectedCents);
  $('paidback').textContent = sgd(d.totals.paidBackCents);
  $('pending').textContent = sgd(d.totals.pendingCents);
  $('rows').replaceChildren(...d.payments.map(paymentCard));
  say(d.payments.length === 0 ? 'No payments yet.' : '');
  $('data').hidden = false;
}
function showForm() { $('dlg-form').hidden = false; $('dlg-result').hidden = true; $('dlg-title').textContent = 'New payment request'; $('dlg-err').hidden = true; }
async function createRequest() {
  const go = $('np-go');
  go.disabled = true;
  $('dlg-err').hidden = true;
  const res = await post('/api/events/${ref}/payments', { payer: $('np-payer').value, name: $('np-name').value, amount: $('np-amount').value });
  const out = await res.json().catch(() => ({}));
  go.disabled = false;
  if (!res.ok) { $('dlg-err').textContent = ERRORS[out.error] || 'Something went wrong.'; $('dlg-err').hidden = false; return; }
  for (const id of ['np-payer', 'np-name', 'np-amount']) $(id).value = '';
  $('dlg-form').hidden = true; $('dlg-result').hidden = false;
  $('dlg-title').textContent = 'Request created';
  $('dlg-note').textContent = sgd(out.payment.amountCents) + ' (' + out.payment.ref + '). ' + (out.payment.posted ? 'Posted to the chat.' : 'Could not post to the chat; share the QR below instead.');
  $('dlg-qr').replaceChildren(qrImage('/api/events/${ref}/payments/' + encodeURIComponent(out.payment.ref) + '/qr', 'Payment QR'));
  await load();
}
const root = document.documentElement;
const isDark = () => (root.dataset.theme ? root.dataset.theme === 'dark' : matchMedia('(prefers-color-scheme: dark)').matches);
const paintTheme = () => { $('theme').textContent = isDark() ? '☀' : '☾'; };
$('theme').onclick = () => { const next = isDark() ? 'light' : 'dark'; root.dataset.theme = next; try { localStorage.setItem('theme', next); } catch (e) {} paintTheme(); };
matchMedia('(prefers-color-scheme: dark)').addEventListener('change', paintTheme);
paintTheme();
$('new').onclick = () => { showForm(); $('dlg').showModal(); };
$('np-cancel').onclick = () => $('dlg').close();
$('np-done').onclick = () => $('dlg').close();
$('np-again').onclick = showForm;
$('dlg').addEventListener('click', (e) => { if (e.target === $('dlg')) $('dlg').close(); });
$('dlg-form').addEventListener('keydown', (e) => { if (e.key === 'Enter') createRequest(); });
$('np-go').onclick = createRequest;
load();
</script></body></html>`;
}
