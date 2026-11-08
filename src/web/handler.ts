import { D1EventRepository, D1Repository } from '../db/drizzle-repository';
import { canViewChat } from './access';
import { SESSION_MAX_AGE_SEC, signSession, verifySession, verifyTelegramLogin } from './auth';

/** Bindings of the Pages project (see web/wrangler.toml). */
export interface WebEnv {
  paynow_db: D1Database;
  TELEGRAM_BOT_TOKEN: string;
  SESSION_SECRET: string;
  BOT_USERNAME: string;
}

const REF = /^[A-Za-z0-9_-]{1,40}$/;

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
  });

function sessionCookie(request: Request): string | undefined {
  return request.headers
    .get('Cookie')
    ?.split(';')
    .map((c) => c.trim())
    .find((c) => c.startsWith('session='))
    ?.slice('session='.length);
}

/**
 * Read-only event page: GET /events/:ref (HTML), GET /api/events/:ref (JSON), GET /api/login
 * (Telegram Login Widget redirect target). Everything else is 404.
 */
export async function handleWeb(
  request: Request,
  env: WebEnv,
  fetchFn: typeof fetch = fetch
): Promise<Response> {
  const url = new URL(request.url);
  if (request.method !== 'GET') return new Response('Not found', { status: 404 });

  if (url.pathname === '/api/login') {
    const userId = await verifyTelegramLogin(url.searchParams, env.TELEGRAM_BOT_TOKEN);
    const ref = url.searchParams.get('ref') ?? '';
    if (userId === null || !REF.test(ref)) {
      return new Response('Sign-in failed. Go back and try again.', { status: 403 });
    }
    const cookie = await signSession(userId, env.SESSION_SECRET);
    return new Response(null, {
      status: 302,
      headers: {
        Location: `/events/${ref}`,
        'Set-Cookie': `session=${cookie}; HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=${SESSION_MAX_AGE_SEC}`,
      },
    });
  }

  const page = url.pathname.match(/^\/events\/([^/]+)$/);
  if (page && REF.test(page[1]!)) {
    return new Response(renderPage(page[1]!, env.BOT_USERNAME), {
      headers: { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' },
    });
  }

  const api = url.pathname.match(/^\/api\/events\/([^/]+)$/);
  if (api && REF.test(api[1]!)) return eventData(request, env, api[1]!, fetchFn);

  return new Response('Not found', { status: 404 });
}

async function eventData(
  request: Request,
  env: WebEnv,
  ref: string,
  fetchFn: typeof fetch
): Promise<Response> {
  const userId = await verifySession(sessionCookie(request), env.SESSION_SECRET);
  if (userId === null) return json({ error: 'sign_in' }, 401);

  const event = await new D1EventRepository(env.paynow_db).getEventByRef(ref);
  if (!event) return json({ error: 'not_found' }, 404);
  if (!(await canViewChat(event.chatId, userId, env.TELEGRAM_BOT_TOKEN, fetchFn))) {
    return json({ error: 'forbidden' }, 403);
  }

  const repo = new D1Repository(env.paynow_db);
  const payments = await repo.listPaymentsByEvent(event.id);
  // Same rule as the bot: net = amount minus SENT paybacks (pending/cancelled never count)
  const sent = await repo.sentPaybackTotalsByEvent(event.id);
  const sum = (status: string) =>
    payments.filter((p) => p.status === status).reduce((t, p) => t + p.amountCents, 0);
  const paidBackCents = payments
    .filter((p) => p.status === 'received')
    .reduce((t, p) => t + (sent.get(p.id) ?? 0), 0);

  // Names only: never expose payer/payee PayNow numbers to the page.
  return json({
    event: { name: event.name, status: event.status },
    totals: {
      collectedCents: sum('received') - paidBackCents,
      paidBackCents,
      pendingCents: sum('pending'),
    },
    payments: payments.map((p) => ({
      ref: p.ref,
      description: p.description,
      payerName: p.payerName ?? null,
      amountCents: p.amountCents,
      paidBackCents: sent.get(p.id) ?? 0,
      netCents: p.amountCents - (sent.get(p.id) ?? 0),
      status: p.status,
      createdAt: p.createdAt,
      receivedAt: p.receivedAt,
    })),
  });
}

/** Static shell; data is fetched from the API and written with textContent (names are user input). */
function renderPage(ref: string, botUsername: string): string {
  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Event payments</title>
<style>
body{font:16px system-ui,sans-serif;margin:0 auto;max-width:56rem;padding:1rem;color:#222}
table{border-collapse:collapse;width:100%}th,td{text-align:left;padding:.4rem .5rem;border-bottom:1px solid #ddd}
.num{text-align:right}.voided{color:#999;text-decoration:line-through}.totals{display:flex;gap:2rem;margin:1rem 0}
.muted{color:#666}
</style></head><body>
<h1 id="title">Event payments</h1>
<p id="msg" class="muted">Loading…</p>
<div id="login" hidden>
<p>Sign in with Telegram to view this event.</p>
<script async src="https://telegram.org/js/telegram-widget.js?22" data-telegram-login="${botUsername.replace(/[^A-Za-z0-9_]/g, '')}" data-size="large" data-auth-url="/api/login?ref=${ref}" data-request-access="write"></script>
</div>
<div id="data" hidden>
<div class="totals"><div>Collected: <b id="collected"></b></div><div>Paid back: <b id="paidback"></b></div><div>Pending: <b id="pending"></b></div></div>
<table><thead><tr><th>Description</th><th>Payer</th><th class="num">Amount</th><th class="num">Paid back</th><th class="num">Net</th><th>Status</th><th>Ref</th><th>Created</th><th>Received</th></tr></thead><tbody id="rows"></tbody></table>
</div>
<script>
const $ = (id) => document.getElementById(id);
const sgd = (c) => 'SGD ' + (c / 100).toFixed(2);
const when = (t) => (t ? new Date(t).toLocaleString() : '');
fetch('/api/events/${ref}', { credentials: 'same-origin' }).then(async (res) => {
  if (res.status === 401) { $('msg').hidden = true; $('login').hidden = false; return; }
  if (res.status === 403) { $('msg').textContent = 'Not allowed: only chat administrators can view this event.'; return; }
  if (res.status === 404) { $('msg').textContent = 'Event not found.'; return; }
  if (!res.ok) { $('msg').textContent = 'Something went wrong.'; return; }
  const d = await res.json();
  $('title').textContent = d.event.name;
  $('collected').textContent = sgd(d.totals.collectedCents);
  $('paidback').textContent = sgd(d.totals.paidBackCents);
  $('pending').textContent = sgd(d.totals.pendingCents);
  if (d.payments.length === 0) { $('msg').textContent = 'No payments yet.'; }
  else { $('msg').hidden = true; }
  for (const p of d.payments) {
    const tr = document.createElement('tr');
    if (p.status === 'voided') tr.className = 'voided';
    [p.description, p.payerName || '', sgd(p.amountCents), sgd(p.paidBackCents), sgd(p.netCents), p.status, p.ref, when(p.createdAt), when(p.receivedAt)]
      .forEach((v, i) => { const td = document.createElement('td'); if (i >= 2 && i <= 4) td.className = 'num'; td.textContent = v; tr.appendChild(td); });
    $('rows').appendChild(tr);
  }
  $('data').hidden = false;
});
</script></body></html>`;
}
