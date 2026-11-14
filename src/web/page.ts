import { KEEP_QR_REMINDER } from '../payments/payment-request';

/** Signed-in user block shared by both pages: name from /api/me and a Sign out that reloads. */
const ME_CSS =
  '.me{display:flex;align-items:center;gap:8px;min-width:0}.me[hidden]{display:none!important}.me-name{max-width:12em;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;color:var(--muted-fg)}';
const ME_JS = `
async function loadMe(){try{const r=await fetch('/api/me',{credentials:'same-origin'});if(!r.ok)return;const u=(await r.json()).user;$('me').hidden=!u;if(u)$('me-name').textContent=u.name||'Signed in'}catch(e){}}
$('signout').onclick=async()=>{try{await fetch('/api/logout',{method:'POST',credentials:'same-origin',headers:{'Content-Type':'application/json'},body:'{}'})}catch(e){}location.reload()};
loadMe();
`;
const ME_HTML =
  '<div id="me" class="me" hidden><span id="me-name" class="me-name"></span><button id="signout" class="btn">Sign out</button></div>';

/** Top bar of both pages: signed-in name + Sign out (when signed in) and the light/dark toggle (always). */
const TOPBAR_HTML = `<div class="topbar">${ME_HTML}<button id="theme" class="btn icon" aria-label="Switch between light and dark theme"></button></div>`;
const TOPBAR_CSS =
  '.topbar{display:flex;align-items:center;justify-content:flex-end;gap:8px;margin-bottom:8px;font-size:13px}.topbar .btn{min-height:32px;padding:2px 12px;font-size:13px;background:var(--bg);color:var(--fg);border:1px solid var(--border);border-radius:6px;cursor:pointer}.topbar .btn.icon{width:32px;padding:0}';
/**
 * Page script shared by the admin and payment pages: shows "Event website: <host>" under the title.
 * Only http and https values become links (checked again here, though the bot validated it), the link text
 * is the host, and everything is built with DOM calls (textContent / attributes), never innerHTML.
 */
const SITE_JS = String.raw`
function showSite(u){
  const p = document.getElementById('site'); if (!p) return;
  p.textContent = '';
  let host = null;
  try { if (/^https?:\/\//i.test(u || '')) host = new URL(u).host; } catch (e) {}
  if (!host) { p.hidden = true; p.classList.add('hidden'); return; }
  const a = document.createElement('a');
  a.textContent = host; a.href = u; a.target = '_blank'; a.rel = 'noopener noreferrer nofollow';
  p.append('Event website: ', a);
  p.hidden = false; p.classList.remove('hidden');
}
`;
/** Applies the saved theme before first paint (key shared by both pages: same origin). */
const THEME_EARLY =
  "<script>try{var t=localStorage.getItem('theme');if(t==='light'||t==='dark')document.documentElement.dataset.theme=t}catch(e){}</script>";
const THEME_JS = `
const root = document.documentElement;
const isDark = () => (root.dataset.theme ? root.dataset.theme === 'dark' : matchMedia('(prefers-color-scheme: dark)').matches);
const paintTheme = () => { $('theme').textContent = isDark() ? '☀' : '☾'; };
$('theme').onclick = () => { const next = isDark() ? 'light' : 'dark'; root.dataset.theme = next; try { localStorage.setItem('theme', next); } catch (e) {} paintTheme(); };
matchMedia('(prefers-color-scheme: dark)').addEventListener('change', paintTheme);
paintTheme();
`;

/** The event website line under the title (admin and payment pages): theme text colour, underlined. */
const SITE_CSS = '#site a{color:var(--fg);text-decoration:underline}';

/** Attribution footer shared by every web page; the two links are plain anchors (no requests on load). */
const LINKEDIN_URL = 'https://linkedin.com/in/miccheng';
const REPO_URL = 'https://github.com/engineersftw/event-paynow';
const FOOTER_HTML = `<footer class="site-footer"><span>Built by <a href="${LINKEDIN_URL}" target="_blank" rel="noopener noreferrer">Michael Cheng</a> &amp; Claude Code AI.</span> <span><a href="${REPO_URL}" target="_blank" rel="noopener noreferrer">Open Source</a> with ❤️.</span></footer>`;
const FOOTER_CSS =
  '.site-footer{margin:32px 0 8px;text-align:center;font-size:13px;color:var(--muted-fg)}.site-footer span{display:block}.site-footer a{color:inherit;text-decoration:underline}';

/** Static shell; data is fetched from the API and written with textContent (names are user input). */
export function renderPage(ref: string, botUsername: string): string {
  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Event</title>
<link rel="icon" href="/logo.png">
${THEME_EARLY}
<style>
:root{--bg:#fff;--fg:#09090b;--muted:#f4f4f5;--muted-fg:#71717a;--border:#e4e4e7;--primary:#18181b;--primary-fg:#fafafa;--destructive:#dc2626;--ring:#a1a1aa;--radius:.5rem;--pending-bg:#fef3c7;--pending-fg:#92400e;--received-bg:#dcfce7;--received-fg:#166534;--voided-bg:#e4e4e7;--voided-fg:#52525b}
@media (prefers-color-scheme:dark){:root:not([data-theme="light"]){--bg:#09090b;--fg:#fafafa;--muted:#27272a;--muted-fg:#a1a1aa;--border:#27272a;--primary:#fafafa;--primary-fg:#18181b;--destructive:#f87171;--ring:#52525b;--pending-bg:#451a03;--pending-fg:#fcd34d;--received-bg:#052e16;--received-fg:#86efac;--voided-bg:#3f3f46;--voided-fg:#d4d4d8}}
:root[data-theme="dark"]{--bg:#09090b;--fg:#fafafa;--muted:#27272a;--muted-fg:#a1a1aa;--border:#27272a;--primary:#fafafa;--primary-fg:#18181b;--destructive:#f87171;--ring:#52525b;--pending-bg:#451a03;--pending-fg:#fcd34d;--received-bg:#052e16;--received-fg:#86efac;--voided-bg:#3f3f46;--voided-fg:#d4d4d8}
*{box-sizing:border-box}
body{margin:0 auto;max-width:44rem;padding:16px;font:14px/1.5 system-ui,-apple-system,"Segoe UI",sans-serif;background:var(--bg);color:var(--fg)}
h1{font-size:1.5rem;line-height:1.2;margin:0;letter-spacing:-.02em}
[hidden]{display:none!important}
.muted{color:var(--muted-fg)}.sm{font-size:12px}
.head{display:flex;align-items:center;justify-content:space-between;gap:12px;margin-bottom:12px}
.actions{display:flex;gap:6px;margin-bottom:16px}
.actions .btn{flex:1;min-width:0;white-space:nowrap;padding-left:8px;padding-right:8px}
@media(max-width:360px){.actions .btn{padding-left:4px;padding-right:4px;font-size:13px}}
.actions .btn.primary{flex:1.6}
${TOPBAR_CSS}
.stats{display:grid;grid-template-columns:repeat(3,1fr);gap:8px;margin-bottom:16px}
.checkin-stats{display:grid;grid-template-columns:repeat(2,1fr);gap:8px;margin-bottom:16px}
.card{border:1px solid var(--border);border-radius:var(--radius);padding:12px}
.stat b{display:block;font-size:1.1rem;margin-top:2px}
.list{display:grid;gap:8px}
.row{display:flex;justify-content:space-between;align-items:flex-start;gap:12px}
.row .end{text-align:right;flex:0 1 auto;max-width:70%}
.row .end .badge{margin-top:2px}
.name{font-weight:600;overflow-wrap:anywhere}
.voided .amt{text-decoration:line-through;color:var(--muted-fg)}
.badge{display:inline-block;border-radius:999px;padding:1px 10px;font-size:12px;font-weight:600;background:var(--muted);color:var(--fg)}
.badge.pending{background:var(--pending-bg);color:var(--pending-fg)}
.badge.received,.badge.sent{background:var(--received-bg);color:var(--received-fg)}
.badge.voided,.badge.cancelled{background:var(--voided-bg);color:var(--voided-fg)}
.badge.checked{white-space:nowrap;background:transparent;border:1px solid var(--received-fg);color:var(--received-fg)}
#sc-video{width:100%;max-height:50vh;border-radius:calc(var(--radius) - 2px);background:#000}
.banner{border-radius:calc(var(--radius) - 2px);padding:10px 12px;font-weight:600;background:var(--muted)}
.banner.ok{background:var(--received-bg);color:var(--received-fg)}
.banner.no{background:var(--voided-bg);color:var(--voided-fg)}
.big{min-height:48px;width:100%}
.toggles{display:flex;flex-wrap:wrap;gap:6px;margin-top:8px}
.panel{margin-top:8px;padding-top:8px;border-top:1px solid var(--border);display:grid;gap:8px}
.btn{text-decoration:none;font:inherit;font-weight:600;min-height:40px;display:inline-flex;align-items:center;justify-content:center;gap:6px;border:1px solid var(--border);background:var(--bg);color:var(--fg);border-radius:calc(var(--radius) - 2px);padding:8px 16px;cursor:pointer}
.btn:hover{background:var(--muted)}
.btn.primary{background:var(--primary);color:var(--primary-fg);border-color:var(--primary)}
.btn.primary:hover{opacity:.9}
.btn.destructive{color:var(--destructive);border-color:var(--destructive)}
.btn:disabled{opacity:.5;cursor:not-allowed}
.count{display:inline-block;min-width:1.6em;padding:0 6px;border-radius:999px;background:var(--primary);color:var(--primary-fg);font-size:13px;font-weight:700;line-height:1.6;text-align:center}
.tools{display:grid;gap:8px;margin-bottom:12px}
.seg{display:flex;flex-wrap:wrap;gap:6px}
.more{width:100%;margin-top:8px}
.brand{display:flex;align-items:center;gap:10px;min-width:0}
${ME_CSS}
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
${FOOTER_CSS}
${SITE_CSS}
</style></head><body>
${TOPBAR_HTML}
<div class="head"><div class="brand"><img src="/logo.png" alt="" width="40" height="40"><h1 id="title">Event</h1></div></div>
<p id="site" class="muted sm" hidden></p>
<div class="actions"><button id="scan" class="btn" hidden>Check-In</button><a id="payer-link" class="btn" href="/pay/${ref}">Pay</a><button id="new" class="btn primary" hidden>New request</button></div>
<p id="msg" class="alert" hidden></p>
<div id="login" hidden>
<p>Sign in with Telegram to view this event.</p>
<script async src="https://telegram.org/js/telegram-widget.js?22" data-telegram-login="${botUsername.replace(/[^A-Za-z0-9_]/g, '')}" data-size="large" data-auth-url="/api/login?ref=${ref}" data-request-access="write"></script>
</div>
<div id="data" hidden>
<div class="checkin-stats" aria-label="Check-in statistics">
<div class="card stat"><span class="muted sm">Checked in</span><b id="checked-in"></b></div>
<div class="card stat"><span class="muted sm">Not checked in</span><b id="not-checked-in"></b><span class="muted sm" id="not-checked-in-split"></span></div>
</div>
<div class="stats">
<div class="card stat"><span class="muted sm">Collected</span><b id="collected"></b></div>
<div class="card stat"><span class="muted sm">Paid back</span><b id="paidback"></b></div>
<div class="card stat"><span class="muted sm">Pending</span><b id="pending"></b></div>
</div>
<div class="tools">
<input id="q" class="input" type="search" placeholder="Search payer or reference" maxlength="40" aria-label="Search payments" autocomplete="off">
<div id="filter" class="seg" role="group" aria-label="Filter by status"></div>
</div>
<div id="rows" class="list"></div>
<button id="more" class="btn more" hidden>Load more</button>
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
<dialog id="scan-dlg" aria-labelledby="scan-title"><div class="dlg">
<h2 id="scan-title">Scan attendee QR</h2>
<div id="sc-cam" class="fields"><video id="sc-video" playsinline muted></video></div>
<p id="sc-status" class="muted"></p>
<div id="sc-result" class="fields" hidden></div>
<div class="inline"><input id="sc-ref" class="input" placeholder="Or type the payment reference" autocomplete="off" maxlength="40"><button id="sc-go" class="btn">Find</button></div>
<div class="foot"><button id="sc-next" class="btn">Scan next</button><button id="sc-close" class="btn primary">Close</button></div>
</div></dialog>
${FOOTER_HTML}
<script>
const $ = (id) => document.getElementById(id);
${SITE_JS}
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
  const problem = res.ok ? '' : failure(await res.json().catch(() => ({})));
  await load();
  if (problem) say(problem); // after the reload, which clears the message line
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
function paymentCard(p, withCheckIn = true) {
  const card = el('div', undefined, 'card' + (p.status === 'voided' ? ' voided' : ''));
  const row = el('div', undefined, 'row');
  const left = el('div');
  left.append(el('div', p.payerName || p.ref, 'name'), el('div', p.ref + ' · ' + fmtDate(p.createdAt) + (p.receivedAt ? ' · received ' + fmtDate(p.receivedAt) : ''), 'muted sm'));
  const end = el('div', undefined, 'end');
  end.append(el('div', sgd(p.amountCents), 'amt name'));
  if (p.paidBackCents > 0) end.append(el('div', 'Net ' + sgd(p.netCents), 'muted sm'));
  end.append(el('span', p.status, 'badge ' + p.status));
  if (p.checkedInAt) end.append(el('span', 'Checked in ' + fmtDate(p.checkedInAt).replace(/-/g, '\\u2011'), 'badge checked'));
  row.append(left, end);
  card.append(row);
  const toggles = el('div', undefined, 'toggles');
  if (withCheckIn && p.status !== 'voided' && !p.checkedInAt) {
    const ci = el('button', 'Check-In', 'btn primary');
    ci.onclick = () => rowCheckIn(p, ci);
    toggles.append(ci);
  }
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
const PAGE = 20;
let rows = [];
let nextCursor = null;
let defaultAmount = '';
let statusFilter = '';
let query = '';
let seq = 0;
async function fetchPage(cursor, limit) {
  const params = new URLSearchParams({ limit: String(limit) });
  if (statusFilter) params.set('status', statusFilter);
  if (query) params.set('q', query);
  if (cursor) params.set('cursor', cursor);
  return fetch('/api/events/${ref}?' + params, { credentials: 'same-origin' });
}
async function show(res, mode) {
  if (res.status === 401) { say(''); $('login').hidden = false; $('data').hidden = true; return false; }
  if (res.status === 403) { say('Not allowed: only chat administrators can view this event.'); return false; }
  if (res.status === 404) { say('Event not found.'); return false; }
  if (!res.ok) { say('Something went wrong.'); return false; }
  const d = await res.json();
  document.title = 'Event: ' + d.event.name;
  $('title').textContent = 'Event: ' + d.event.name;
  showSite(d.event.websiteUrl);
  $('new').hidden = d.event.status !== 'open';
  $('scan').hidden = false;
  defaultAmount = d.event.defaultAmountCents ? (d.event.defaultAmountCents / 100).toFixed(2) : '';
  $('collected').textContent = sgd(d.totals.collectedCents);
  $('paidback').textContent = sgd(d.totals.paidBackCents);
  $('pending').textContent = sgd(d.totals.pendingCents);
  $('checked-in').textContent = String(d.checkInStats.checkedInCount);
  const paid = d.checkInStats.notCheckedInPaidCount;
  const unpaid = d.checkInStats.notCheckedInPendingCount;
  $('not-checked-in').textContent = String(paid + unpaid);
  $('not-checked-in-split').textContent = paid + ' paid · ' + unpaid + ' pending';
  if (mode === 'append') {
    const seen = new Set(rows.map((p) => p.ref));
    rows = rows.concat(d.payments.filter((p) => !seen.has(p.ref)));
  } else rows = d.payments;
  nextCursor = d.nextCursor;
  $('rows').replaceChildren(...rows.map((p) => paymentCard(p)));
  $('more').hidden = !nextCursor;
  say(rows.length === 0 ? (statusFilter || query ? 'No payments match.' : 'No payments yet.') : '');
  $('data').hidden = false;
  if (scanned && $('scan-dlg').open) refreshScan();
  return true;
}
// Refresh what is already loaded (at least one page, up to the server cap), keeping the filter and search
async function load() {
  const mine = ++seq;
  const res = await fetchPage(null, Math.min(200, Math.max(PAGE, rows.length)));
  if (mine === seq) await show(res, 'replace');
}
async function loadMore() {
  const mine = ++seq;
  $('more').disabled = true;
  const res = await fetchPage(nextCursor, PAGE);
  $('more').disabled = false;
  if (mine === seq) await show(res, 'append');
}
function restart() { rows = []; nextCursor = null; load(); }
function paintFilter() {
  $('filter').replaceChildren(...[['', 'All'], ['pending', 'Pending'], ['received', 'Received'], ['voided', 'Voided']].map(([value, label]) => {
    const b = el('button', label, 'btn' + (statusFilter === value ? ' primary' : ''));
    b.setAttribute('aria-pressed', String(statusFilter === value));
    b.onclick = () => { statusFilter = value; paintFilter(); restart(); };
    return b;
  }));
}
let timer;
$('q').addEventListener('input', () => { clearTimeout(timer); timer = setTimeout(() => { query = $('q').value.trim(); restart(); }, 300); });
$('more').onclick = loadMore;
paintFilter();
function showForm() { $('np-amount').value = defaultAmount; $('dlg-form').hidden = false; $('dlg-result').hidden = true; $('dlg-title').textContent = 'New payment request'; $('dlg-err').hidden = true; }
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
// --- Scan an attendee's payment QR, show the payment, check in ---
let scanned = null;
let stream = null;
let scanTimer = null;
const scanSay = (t) => { $('sc-status').textContent = t; };
function stopCamera() {
  if (scanTimer) { clearInterval(scanTimer); scanTimer = null; }
  if (stream) { stream.getTracks().forEach((t) => t.stop()); stream = null; }
  $('sc-video').srcObject = null;
}
async function qrDecoder() {
  if (window.BarcodeDetector) return null;
  if (!window.jsQR) await new Promise((ok, fail) => { const s = document.createElement('script'); s.src = '/vendor/jsqr.js'; s.onload = ok; s.onerror = fail; document.head.append(s); });
  return window.jsQR;
}
async function startScan() {
  stopCamera();
  scanned = null;
  $('sc-result').hidden = true;
  $('sc-cam').hidden = false;
  scanSay('Starting the camera...');
  try {
    stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' }, audio: false });
  } catch (e) { scanSay('Camera unavailable: allow camera access, or type the payment reference below.'); return; }
  const video = $('sc-video');
  video.srcObject = stream;
  await video.play().catch(() => {});
  let decode = null;
  try { decode = await qrDecoder(); } catch (e) { stopCamera(); scanSay('Could not load the scanner: type the payment reference below.'); return; }
  const detector = decode ? null : new BarcodeDetector({ formats: ['qr_code'] });
  const canvas = document.createElement('canvas');
  const g = canvas.getContext('2d', { willReadFrequently: true });
  scanSay('Point the camera at the attendee payment QR.');
  let busy = false;
  scanTimer = setInterval(async () => {
    if (busy || video.readyState < 2 || !video.videoWidth) return;
    busy = true;
    try {
      let text = null;
      if (detector) { const found = await detector.detect(video); text = found[0] && found[0].rawValue; }
      else {
        const k = Math.min(1, 640 / video.videoWidth);
        canvas.width = Math.round(video.videoWidth * k); canvas.height = Math.round(video.videoHeight * k);
        g.drawImage(video, 0, 0, canvas.width, canvas.height);
        const img = g.getImageData(0, 0, canvas.width, canvas.height);
        const found = decode(img.data, img.width, img.height);
        text = found && found.data;
      }
      if (text) { stopCamera(); await resolveScan({ payload: text }); }
    } catch (e) { /* keep scanning */ } finally { busy = false; }
  }, 200);
}
async function resolveScan(body) {
  const res = await post('/api/events/${ref}/scan', body);
  if (res.status === 404) { scanned = null; $('sc-result').hidden = true; scanSay('That is not a payment QR of this event. Tap Scan next to try again.'); return; }
  if (!res.ok) { scanSay('Something went wrong. Tap Scan next to try again.'); return; }
  scanned = (await res.json()).payment;
  renderScan();
}
async function refreshScan() {
  if (!scanned) return;
  const res = await post('/api/events/${ref}/scan', { ref: scanned.ref });
  if (res.ok) { scanned = (await res.json()).payment; renderScan(); }
}
const fmtTime = (t) => new Date(t).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
function renderScan() {
  const p = scanned;
  const box = $('sc-result');
  stopCamera();
  $('sc-cam').hidden = true;
  scanSay('');
  const banner = p.checkedInAt
    ? el('div', 'Checked in ' + fmtDate(p.checkedInAt) + ' ' + fmtTime(p.checkedInAt), 'banner ok')
    : p.status === 'voided' ? el('div', 'Voided: cannot check in', 'banner no') : el('div', 'Not checked in', 'banner');
  box.replaceChildren(banner, paymentCard(p, false));
  if (!p.checkedInAt && p.status !== 'voided') {
    const go = el('button', 'Check in', 'btn primary big');
    go.onclick = () => checkIn(go);
    box.append(go);
  }
  box.hidden = false;
}
// One check-in call for the scan dialog and the rows: { ok, payment, error, checkedInAt }
async function checkInRequest(paymentRef) {
  const res = await post('/api/events/${ref}/payments/' + encodeURIComponent(paymentRef) + '/check-in', {});
  const out = await res.json().catch(() => ({}));
  return { ok: res.ok, payment: out.payment, error: out.error, checkedInAt: out.checkedInAt };
}
async function checkIn(button) {
  button.disabled = true;
  const r = await checkInRequest(scanned.ref);
  if (r.ok) scanned = r.payment;
  else if (r.error === 'already_checked_in') await refreshScan();
  else if (r.error === 'voided') { scanSay('This payment is voided: it cannot be checked in.'); await refreshScan(); }
  else scanSay(failure(r));
  if (scanned) renderScan();
  await load();
}
// Check-In on a list row: one tap; whatever the outcome the list reloads to the payment's real state
async function rowCheckIn(p, button) {
  button.disabled = true;
  say('');
  const r = await checkInRequest(p.ref);
  const who = p.payerName || p.ref;
  const problem = r.ok ? '' : r.error === 'already_checked_in' ? who + ' is already checked in.' : r.error === 'voided' ? who + ' is voided: it cannot be checked in.' : failure(r);
  await load();
  if (problem) { say(problem); $('msg').scrollIntoView({ block: 'nearest' }); } // after the reload, which clears the message line
}
$('scan').onclick = () => { $('scan-dlg').showModal(); startScan(); };
$('sc-next').onclick = startScan;
$('sc-close').onclick = () => $('scan-dlg').close();
$('scan-dlg').addEventListener('close', () => { stopCamera(); scanned = null; });
$('sc-go').onclick = () => { const v = $('sc-ref').value.trim(); if (v) { stopCamera(); resolveScan({ ref: v }); } };
$('sc-ref').addEventListener('keydown', (e) => { if (e.key === 'Enter') $('sc-go').click(); });
${THEME_JS}$('new').onclick = () => { showForm(); $('dlg').showModal(); };
$('np-cancel').onclick = () => $('dlg').close();
$('np-done').onclick = () => $('dlg').close();
$('np-again').onclick = showForm;
$('dlg').addEventListener('click', (e) => { if (e.target === $('dlg')) $('dlg').close(); });
$('dlg-form').addEventListener('keydown', (e) => { if (e.key === 'Enter') createRequest(); });
$('np-go').onclick = createRequest;
load();
${ME_JS}</script></body></html>`;
}

/** YouTube id of the explainer video on the landing page (11 characters of A-Z a-z 0-9 _ -). */
const EXPLAINER_VIDEO_ID = 'ezOo1OIhl-Y';

/** Preview/poster image served from the site itself (a same-origin request, never YouTube). */
const POSTER_PATH = '/explainer-poster.jpg';
const SITE_NAME = 'Event PayNow Bot';
const POSTER_ALT = 'Event PayNow Bot: collect PayNow payments for your event, from Telegram.';

/** Escapes text for use in HTML text and attribute values. */
function escapeAttr(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

/** Shortens long text to `max` characters, ending in an ellipsis. */
function shorten(value: string, max: number): string {
  return value.length > max ? `${value.slice(0, max - 1).trimEnd()}…` : value;
}

/**
 * Open Graph + Twitter card tags, description and canonical link for pages that get shared. They are
 * part of the HTML the server returns (crawlers do not run scripts) and every value is escaped.
 * `url` and `image` are absolute, built from the origin the page was requested on.
 */
export function socialMeta(m: {
  title: string;
  description: string;
  url: string;
  image: string;
  imageAlt?: string;
  siteName?: string;
}): string {
  const t = escapeAttr(m.title);
  const d = escapeAttr(m.description);
  const u = escapeAttr(m.url);
  const i = escapeAttr(m.image);
  const alt = escapeAttr(m.imageAlt ?? POSTER_ALT);
  return [
    `<meta name="description" content="${d}">`,
    `<link rel="canonical" href="${u}">`,
    '<meta property="og:type" content="website">',
    `<meta property="og:site_name" content="${escapeAttr(m.siteName ?? SITE_NAME)}">`,
    '<meta property="og:locale" content="en_SG">',
    `<meta property="og:title" content="${t}">`,
    `<meta property="og:description" content="${d}">`,
    `<meta property="og:url" content="${u}">`,
    `<meta property="og:image" content="${i}">`,
    '<meta property="og:image:type" content="image/jpeg">',
    '<meta property="og:image:width" content="1280">',
    '<meta property="og:image:height" content="720">',
    `<meta property="og:image:alt" content="${alt}">`,
    '<meta name="twitter:card" content="summary_large_image">',
    `<meta name="twitter:title" content="${t}">`,
    `<meta name="twitter:description" content="${d}">`,
    `<meta name="twitter:image" content="${i}">`,
    `<meta name="twitter:image:alt" content="${alt}">`,
  ].join('\n');
}

/**
 * Click-to-play card for the landing page: nothing is requested from YouTube until the visitor
 * clicks (the script on the page then swaps in the youtube-nocookie player). An id that is not a
 * YouTube id leaves the block out, so it can never put markup into the page.
 */
export function videoCard(id: string): string {
  if (!/^[A-Za-z0-9_-]{11}$/.test(id)) return '';
  return `<div class="video"><button id="play" class="vcard" type="button" data-video="${id}" aria-label="Play the Event PayNow Bot explainer video"><img class="vposter" src="${POSTER_PATH}" width="1280" height="720" alt="" loading="lazy"><span class="vplay" aria-hidden="true"></span></button><a class="ylink" href="https://youtu.be/${id}">Watch on YouTube</a></div>`;
}

/** Base styles of the public pages (home and Split): tokens, dark theme, brand row, lead, button, lists. */
const LANDING_BASE_CSS = `:root{--bg:#fff;--fg:#09090b;--muted:#f4f4f5;--muted-fg:#71717a;--border:#e4e4e7;--primary:#18181b;--primary-fg:#fafafa}
@media(prefers-color-scheme:dark){:root:not([data-theme="light"]){--bg:#09090b;--fg:#fafafa;--muted:#27272a;--muted-fg:#a1a1aa;--border:#27272a;--primary:#fafafa;--primary-fg:#18181b}}
:root[data-theme="dark"]{--bg:#09090b;--fg:#fafafa;--muted:#27272a;--muted-fg:#a1a1aa;--border:#27272a;--primary:#fafafa;--primary-fg:#18181b}
*{box-sizing:border-box}body{max-width:36rem;margin:0 auto;padding:20px;font:16px/1.55 system-ui,-apple-system,"Segoe UI",sans-serif;background:var(--bg);color:var(--fg)}
.topbar{display:flex;justify-content:flex-end;margin-bottom:8px}
.icon{min-height:32px;padding:2px 12px;font-size:13px;background:var(--bg);color:var(--fg);border:1px solid var(--border);border-radius:8px;cursor:pointer}
.brand{display:flex;align-items:center;gap:12px;margin-bottom:12px}.brand img{border-radius:12px}
h1{font-size:1.6rem;line-height:1.2;margin:0;letter-spacing:-.02em}h2{font-size:1.1rem;margin:28px 0 8px}
.lead{font-size:1.05rem;margin:0 0 18px}.muted{color:var(--muted-fg)}
.cta{display:block;text-align:center;padding:14px 16px;border-radius:10px;background:var(--primary);color:var(--primary-fg);font-weight:600;text-decoration:none;overflow-wrap:anywhere}
ul,ol{padding-left:1.2rem;margin:0}li{margin:6px 0}code{background:var(--muted);padding:1px 6px;border-radius:5px;font-size:.9em}
.end{margin-top:28px}`;

/** A Telegram username reduced to the characters it can contain; empty when not configured. */
export const cleanUsername = (value: string | undefined): string =>
  (value ?? '').replace(/[^A-Za-z0-9_]/g, '');

/** Public home page at `/`: what the bot does and a link to add it on Telegram. No data, no session. */
export function renderLandingPage(
  botUsername: string,
  origin: string,
  splitUsername?: string
): string {
  const bot = botUsername.replace(/[^A-Za-z0-9_]/g, '');
  const meta = socialMeta({
    title: SITE_NAME,
    description:
      'Collect PayNow payments for your event from a Telegram group: a QR code for every request, and a clear record of who has paid.',
    url: `${origin}/`,
    image: `${origin}${POSTER_PATH}`,
  });
  const cta = `<a class="cta" href="https://t.me/${bot}">Add the bot on Telegram</a>`;
  const video = videoCard(EXPLAINER_VIDEO_ID);
  // The Split page exists only when its bot is configured, so the link does too
  const splitLink = cleanUsername(splitUsername)
    ? '<p class="muted">Splitting a bill? <a href="/split">Try the Split PayNow Bot</a>.</p>'
    : '';
  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Event PayNow Bot</title><link rel="icon" href="/logo.png">
${meta}
${THEME_EARLY}
<style>
${LANDING_BASE_CSS}
.muted a{color:var(--fg);text-decoration:underline}
.video{margin-top:18px}
.vcard{position:relative;display:block;width:100%;aspect-ratio:16/9;padding:0;overflow:hidden;border:1px solid var(--border);border-radius:12px;background:var(--muted);cursor:pointer}
.vposter{display:block;width:100%;height:100%;object-fit:cover}
.vplay{position:absolute;right:12px;top:12px;width:56px;height:56px;border-radius:50%;background:rgba(15,23,42,.85);box-shadow:0 2px 8px rgba(0,0,0,.25)}
.vplay::after{content:'';position:absolute;left:22px;top:16px;border-left:20px solid #fff;border-top:12px solid transparent;border-bottom:12px solid transparent}
.vcard:hover .vplay{background:#dc2626}.vcard:focus-visible{outline:2px solid var(--fg);outline-offset:2px}
.vframe{display:block;width:100%;aspect-ratio:16/9;border:0;border-radius:12px}
.ylink{display:block;text-align:center;margin-top:8px;font-size:14px;color:var(--muted-fg)}
@media(max-width:360px){.vplay{right:8px;top:8px;width:44px;height:44px}.vplay::after{left:17px;top:12px;border-left-width:16px;border-top-width:10px;border-bottom-width:10px}}
${FOOTER_CSS}
</style></head><body>
<div class="topbar"><button id="theme" class="icon" aria-label="Switch between light and dark theme"></button></div>
<div class="brand"><img src="/logo.png" alt="" width="56" height="56"><h1>Event PayNow Bot</h1></div>
<p class="lead">Collect PayNow payments for your event from a Telegram group: a QR code for every request, and a clear record of who has paid.</p>
${cta}
${splitLink}
${video}
<h2>What it does</h2>
<ul>
<li><b>Events with a PayNow payee</b>: set a name, a payee (mobile or UEN) and an optional default amount.</li>
<li><b>PayNow QR codes</b>: one per payment request, with the payer's name printed on it.</li>
<li><b>Payment tracking</b>: mark payments received, void requests, and pay back with a refund QR.</li>
<li><b>Check-in</b>: scan an attendee's payment QR, or tap Check-In on their row, on the web page.</li>
<li><b>Payment page</b>: share one link so attendees make their own request, no sign-in needed.</li>
</ul>
<h2>Get started</h2>
<ol>
<li>Add the bot to your Telegram group.</li>
<li>Send <code>/init</code> to create an event.</li>
<li>Send <code>/web_payment</code> and share the link, or issue QR codes yourself with <code>/start</code>.</li>
<li>Send <code>/web_admin</code> to manage payments and check people in.</li>
</ol>
<div class="end">${cta}</div>
${FOOTER_HTML}
<script>
const $=id=>document.getElementById(id);
${THEME_JS}
const play=$('play');
if(play)play.onclick=()=>{const f=document.createElement('iframe');f.className='vframe';f.src='https://www.youtube-nocookie.com/embed/'+encodeURIComponent(play.dataset.video)+'?autoplay=1&rel=0';f.title='Event PayNow Bot explainer video';f.allow='autoplay; encrypted-media; picture-in-picture; fullscreen';f.allowFullscreen=true;f.referrerPolicy='strict-origin-when-cross-origin';play.replaceWith(f)};
</script></body></html>`;
}

const SPLIT_NAME = 'Split PayNow Bot';
const SPLIT_IMAGE_ALT =
  'Split PayNow Bot: split a bill and give everyone a PayNow QR for their share, from Telegram.';
const SPLIT_TAGLINE =
  'Split a bill in Telegram. Everyone gets a PayNow QR for exactly what they owe.';

/**
 * Public page at `/split`: what the Split PayNow Bot does, how a split goes and what it keeps, with
 * a link to open it on Telegram. Static text apart from the bot username (reduced to the characters
 * a username can contain), no data, no session and nothing loaded from another site.
 */
export function renderSplitLandingPage(botUsername: string, origin: string): string {
  const bot = cleanUsername(botUsername);
  const meta = socialMeta({
    title: SPLIT_NAME,
    description: SPLIT_TAGLINE,
    url: `${origin}/split`,
    image: `${origin}/split-preview.jpg`,
    imageAlt: SPLIT_IMAGE_ALT,
    siteName: SPLIT_NAME,
  });
  const cta = `<a class="cta" href="https://t.me/${bot}">Add the bot on Telegram</a>`;
  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${SPLIT_NAME}</title><link rel="icon" type="image/png" href="/split-logo.png">
${meta}
${THEME_EARLY}
<style>
${LANDING_BASE_CSS}
.muted a{color:var(--fg);text-decoration:underline}
.hero{display:block;width:100%;height:auto;margin-top:18px;border:1px solid var(--border);border-radius:12px}
${FOOTER_CSS}
</style></head><body>
<div class="topbar"><button id="theme" class="icon" aria-label="Switch between light and dark theme"></button></div>
<div class="brand"><img src="/split-logo.png" alt="" width="56" height="56"><h1>${SPLIT_NAME}</h1></div>
<p class="lead">${SPLIT_TAGLINE}</p>
${cta}
<img class="hero" src="/split-preview.jpg" width="1280" height="720" alt="${SPLIT_IMAGE_ALT}">
<h2>What it does</h2>
<ul>
<li><b>Equal split</b>: give it the total and how many people; it makes one QR for one share, rounded up to the cent.</li>
<li><b>Custom amounts</b>: list who owes what. Every QR is posted in the chat with the names it is for, yours included.</li>
<li><b>Receipt scan</b>: send a photo of the receipt. It reads the items, GST and service charge, and the charges are shared in proportion to what each person had.</li>
<li><b>Group claiming</b>: in a group, everyone taps the items they had, and anyone can get their own QR straight away.</li>
</ul>
<h2>How a split goes</h2>
<ol>
<li>Who should be paid (a mobile number or a UEN).</li>
<li>The bill: type the total, or send a photo of the receipt.</li>
<li>A short description for the QRs (a receipt gives one if you skip).</li>
<li>How to split it: equally, with custom amounts, or by items.</li>
<li>Check the summary and tap Confirm. The QRs are made only then.</li>
</ol>
<h2>Get started</h2>
<ul>
<li>Message the bot, or add it to your Telegram group.</li>
<li><code>/split</code> for an equal or custom split.</li>
<li><code>/split_custom</code> to go straight to custom amounts.</li>
<li><code>/split_receipt</code> to start from a photo of the receipt.</li>
</ul>
<h2>What it keeps</h2>
<ul>
<li>Nothing beyond the conversation: your answers are forgotten when the split ends, or after 10 minutes (an hour while a group is claiming items).</li>
<li>Receipt photos are read and never stored.</li>
<li>If you message the bot privately it may remember your username. <code>/forget</code> deletes what it remembers about you.</li>
<li>A QR never shows the payee's number. In a group, the number you type stays in the chat unless the bot may delete messages, so use a private chat if that matters.</li>
</ul>
<div class="end">${cta}</div>
<p class="muted end">Collecting payments for an event instead? See the <a href="/">Event PayNow Bot</a>.</p>
${FOOTER_HTML}
<script>
const $=id=>document.getElementById(id);
${THEME_JS}
</script></body></html>`;
}

/** Standalone payer page: no event history or administrator actions are exposed here. */
export function renderPayerPage(
  ref: string,
  botUsername: string,
  origin: string,
  eventName: string | null = null
): string {
  const bot = botUsername.replace(/[^A-Za-z0-9_]/g, '');
  const name = eventName ? shorten(eventName, 60) : null;
  const title = name ? `Pay for ${name}` : 'Make a PayNow payment';
  const meta = socialMeta({
    title,
    description: name
      ? `Make a PayNow payment for ${name}. Get your own PayNow QR code in seconds, no sign-in needed.`
      : 'Get your own PayNow QR code for this event in seconds, no sign-in needed.',
    url: `${origin}/pay/${ref}`,
    image: `${origin}${POSTER_PATH}`,
  });
  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${escapeAttr(title)}</title><link rel="icon" href="/logo.png">
${meta}
${THEME_EARLY}
<style>
:root{--bg:#fff;--fg:#09090b;--muted:#f4f4f5;--muted-fg:#71717a;--border:#e4e4e7;--primary:#18181b;--primary-fg:#fafafa;--danger:#dc2626}
@media(prefers-color-scheme:dark){:root:not([data-theme="light"]){--bg:#09090b;--fg:#fafafa;--muted:#27272a;--muted-fg:#a1a1aa;--border:#27272a;--primary:#fafafa;--primary-fg:#18181b;--danger:#f87171}}
:root[data-theme="dark"]{--bg:#09090b;--fg:#fafafa;--muted:#27272a;--muted-fg:#a1a1aa;--border:#27272a;--primary:#fafafa;--primary-fg:#18181b;--danger:#f87171}
*{box-sizing:border-box}body{max-width:32rem;margin:0 auto;padding:20px;font:15px/1.5 system-ui,-apple-system,"Segoe UI",sans-serif;background:var(--bg);color:var(--fg)}
h1{font-size:1.5rem;line-height:1.2;margin:0}.brand{display:flex;align-items:center;gap:10px;margin-bottom:20px}.brand img{border-radius:8px}.card{border:1px solid var(--border);border-radius:8px;padding:16px;display:grid;gap:14px}.muted{color:var(--muted-fg)}.alert{background:var(--muted);border:1px solid var(--border);border-radius:8px;padding:12px}.err{color:var(--danger);margin:0}.fields{display:grid;gap:12px}label{display:grid;gap:5px;font-weight:600}.input{font:inherit;min-height:42px;width:100%;padding:8px 10px;border:1px solid var(--border);border-radius:6px;background:var(--bg);color:var(--fg)}.input:read-only{background:var(--muted)}.btn{font:inherit;font-weight:600;min-height:42px;border:1px solid var(--border);border-radius:6px;padding:8px 16px;background:var(--primary);color:var(--primary-fg);cursor:pointer}.btn:disabled{opacity:.5;cursor:not-allowed}img{max-width:100%;height:auto}.qr{display:grid;justify-items:center;gap:8px}.qr img{width:280px}.hidden{display:none!important}${ME_CSS}${TOPBAR_CSS}.amount{font-size:1.25rem;font-weight:600}h2{font-size:1rem;margin:0 0 8px}.hist{display:grid;gap:8px}.row{border:1px solid var(--border);border-radius:6px;padding:10px;display:grid;gap:8px}.row button{font:inherit;color:inherit;background:none;border:0;padding:0;text-align:left;display:flex;gap:10px;align-items:center;flex-wrap:wrap;cursor:pointer}.row button:disabled{cursor:default}.pill{border-radius:999px;padding:1px 8px;font-size:.8rem;background:var(--muted);border:1px solid var(--border)}
${FOOTER_CSS}
${SITE_CSS}
</style></head><body>
${TOPBAR_HTML}
<div class="brand"><img src="/logo.png" alt="" width="40" height="40"><h1 id="title">Pay event</h1></div>
<p id="site" class="muted sm hidden"></p>
<p id="msg" class="alert hidden"></p>
<div id="app" class="card hidden">
<p id="event-status" class="muted"></p>
<div id="form" class="fields">
<label>Your PayNow mobile / UEN<input id="payer" class="input" autocomplete="off"></label>
<label>Your name (optional)<input id="name" class="input" maxlength="40" autocomplete="name"></label>
<label id="amount-field">Amount (SGD)<input id="amount" class="input" inputmode="decimal" autocomplete="off"></label>
<div id="amount-fixed" class="hidden"><div class="muted">Amount (SGD)</div><div id="amount-text" class="amount"></div></div>
<p id="err" class="err hidden"></p><button id="create" class="btn">Show payment QR</button>
</div>
<div id="result" class="hidden"><p id="note"></p><p id="dm" class="muted hidden">Open the bot in Telegram and press Start to receive a copy of this QR there.</p><div id="qr" class="qr"></div><p id="keep" class="muted">${KEEP_QR_REMINDER}.</p><button id="again" class="btn">Create another</button></div>
<div id="signin" class="hidden"><p class="muted">Optional: sign in with Telegram to get a copy of your QR in Telegram and see your earlier requests.</p>
<script async src="https://telegram.org/js/telegram-widget.js?22" data-telegram-login="${bot}" data-size="large" data-auth-url="/api/login?ref=${ref}&amp;next=pay" data-request-access="write"></script></div>
<div id="history" class="hidden"><h2>Your previous requests</h2><div id="hist-list" class="hist"></div></div>
</div>
${FOOTER_HTML}
<script>
const $=id=>document.getElementById(id), sgd=c=>'SGD '+(c/100).toFixed(2);
${SITE_JS}
const say=t=>{$('msg').textContent=t;$('msg').classList.toggle('hidden',!t)};
const errorText={invalid_payer:'Enter a valid mobile number or UEN.',invalid_amount:'Enter a positive amount with up to 2 decimals.',event_closed:'This event is closed.',forbidden:'Not allowed.',not_found:'Event not found.',rate_limited:'This page is busy. Please try again in a few minutes.'};
let defaultCents=null,signedIn=false;
const MONTHS=['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
const fmtDate=iso=>{const d=new Date(iso);return String(d.getUTCDate()).padStart(2,'0')+'-'+MONTHS[d.getUTCMonth()]+'-'+d.getUTCFullYear()};
function setAmount(){
  $('amount').value=defaultCents===null?'':(defaultCents/100).toFixed(2);
  $('amount-field').classList.toggle('hidden',defaultCents!==null);
  $('amount-fixed').classList.toggle('hidden',defaultCents===null);
  $('amount-text').textContent=defaultCents===null?'':(defaultCents/100).toFixed(2);
}
async function loadHistory(){
  const res=await fetch('/api/pay/${ref}/payments',{credentials:'same-origin'});
  if(!res.ok)return;
  const list=(await res.json()).payments;
  $('history').classList.toggle('hidden',list.length===0);
  $('hist-list').replaceChildren(...list.map(p=>{
    const row=document.createElement('div');row.className='row';
    const b=document.createElement('button');b.disabled=p.status!=='pending';
    const pill=document.createElement('span');pill.className='pill';pill.textContent=p.status;
    b.append(sgd(p.amountCents)+' ',pill,' '+fmtDate(p.createdAt)+' · '+p.ref);
    row.append(b);
    if(p.status==='pending'){let box=null;b.onclick=()=>{if(box){box.remove();box=null;return}box=document.createElement('div');box.className='qr';const img=Object.assign(document.createElement('img'),{src:'/api/pay/${ref}/payments/'+encodeURIComponent(p.ref)+'/qr',alt:'Payment QR'});box.append(img,Object.assign(document.createElement('p'),{className:'muted',textContent:'${KEEP_QR_REMINDER}.'}));row.append(box)}}
    return row;
  }));
}
function showError(t){$('err').textContent=t;$('err').classList.toggle('hidden',!t)}
function reset(){showError('');$('result').classList.add('hidden');$('form').classList.remove('hidden');$('payer').value='';$('name').value='';setAmount()}
async function load(){
  const res=await fetch('/api/pay/${ref}',{credentials:'same-origin'});
  if(res.status===404){say('Event not found.');return}
  if(!res.ok){say('Something went wrong.');return}
  const d=await res.json(); document.title='Pay: '+d.event.name; $('title').textContent='Pay: '+d.event.name;showSite(d.event.websiteUrl);
  defaultCents=d.event.defaultAmountCents; $('event-status').textContent=d.event.status==='open'?'Make payment for event.':'This event is closed.';
  if(d.event.status!=='open'){$('form').classList.add('hidden');$('app').classList.remove('hidden');return}
  setAmount(); $('app').classList.remove('hidden');
  signedIn=d.signedIn; if(signedIn)loadHistory();else $('signin').classList.remove('hidden');
}
async function create(){
  const b=$('create');b.disabled=true;showError('');
  const res=await fetch('/api/pay/${ref}/payments',{method:'POST',credentials:'same-origin',headers:{'Content-Type':'application/json'},body:JSON.stringify({payer:$('payer').value,name:$('name').value,amount:$('amount').value})});
  const d=await res.json().catch(()=>({}));b.disabled=false;
  if(!res.ok){showError(errorText[d.error]||'Something went wrong.');return}
  $('form').classList.add('hidden');$('result').classList.remove('hidden');$('dm').classList.toggle('hidden',d.payment.dm!==false);$('note').textContent='Payment '+d.payment.ref+' · '+sgd(d.payment.amountCents);$('qr').replaceChildren(Object.assign(document.createElement('img'),{src:d.payment.qr,alt:'Payment QR'}));if(signedIn)loadHistory();
}
$('create').onclick=create;$('again').onclick=reset;load();${ME_JS}${THEME_JS}
</script></body></html>`;
}
