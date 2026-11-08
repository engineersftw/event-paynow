import { captionPart, recipientName } from '../commands/payer-label';
import { D1EventRepository, D1Repository } from '../db/drizzle-repository';
import { createPaybackFor } from '../db/payback-service';
import { detectProxyType } from '../db/proxy-validation';
import type { Event, Payback, Payment } from '../db/repository';
import { formatCents, parseAmount } from '../sgqr/amount';
import { bmpToPng } from '../sgqr/png';
import { renderQrPng } from '../sgqr/qr-render';
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
 * Event page: GET /events/:ref (HTML), GET /api/events/:ref (JSON), GET /api/login (Telegram
 * Login Widget redirect target), plus the payback actions (create, QR image, sent, cancel).
 * Payments themselves cannot be changed here. Everything else is 404.
 */
export async function handleWeb(
  request: Request,
  env: WebEnv,
  fetchFn: typeof fetch = fetch
): Promise<Response> {
  const url = new URL(request.url);
  if (request.method === 'POST') return handlePost(request, env, url, fetchFn);
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

  const qr = url.pathname.match(/^\/api\/events\/([^/]+)\/paybacks\/([^/]+)\/qr$/);
  if (qr && REF.test(qr[1]!) && REF.test(qr[2]!)) {
    return paybackQr(request, env, qr[1]!, qr[2]!, fetchFn);
  }

  return new Response('Not found', { status: 404 });
}

/** Session → event exists → live chat-admin check. Returns the user and event, or the refusal. */
async function eventAccess(
  request: Request,
  env: WebEnv,
  ref: string,
  fetchFn: typeof fetch
): Promise<{ userId: number; event: Event } | Response> {
  const userId = await verifySession(sessionCookie(request), env.SESSION_SECRET);
  if (userId === null) return json({ error: 'sign_in' }, 401);

  const event = await new D1EventRepository(env.paynow_db).getEventByRef(ref);
  if (!event) return json({ error: 'not_found' }, 404);
  if (!(await canViewChat(event.chatId, userId, env.TELEGRAM_BOT_TOKEN, fetchFn))) {
    return json({ error: 'forbidden' }, 403);
  }
  return { userId, event };
}

/** State-changing requests must be same-origin JSON (the cookie is also SameSite=Lax). */
function sameOriginJson(request: Request, url: URL): boolean {
  return (
    request.headers.get('Origin') === url.origin &&
    (request.headers.get('Content-Type') ?? '').includes('application/json')
  );
}

async function handlePost(
  request: Request,
  env: WebEnv,
  url: URL,
  fetchFn: typeof fetch
): Promise<Response> {
  const create = url.pathname.match(/^\/api\/events\/([^/]+)\/payments\/([^/]+)\/paybacks$/);
  const transition = url.pathname.match(
    /^\/api\/events\/([^/]+)\/paybacks\/([^/]+)\/(sent|cancel)$/
  );
  const match = create ?? transition;
  if (!match || !REF.test(match[1]!) || !REF.test(match[2]!)) {
    return new Response('Not found', { status: 404 });
  }
  if (!sameOriginJson(request, url)) return json({ error: 'forbidden' }, 403);

  const access = await eventAccess(request, env, match[1]!, fetchFn);
  if (access instanceof Response) return access;

  return create
    ? createPayback(request, env, access, match[2]!)
    : paybackTransition(env, access, match[2]!, match[3] === 'sent' ? 'sent' : 'cancelled');
}

async function createPayback(
  request: Request,
  env: WebEnv,
  { userId, event }: { userId: number; event: Event },
  paymentRef: string
): Promise<Response> {
  let body: { amount?: unknown; recipient?: unknown };
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return json({ error: 'invalid_request' }, 400);
  }

  const amountCents = parseAmount(String(body.amount ?? ''));
  if (amountCents === null) return json({ error: 'invalid_amount' }, 400);

  const repo = new D1Repository(env.paynow_db);
  const payment = await repo.getPaymentByRef(paymentRef);
  if (!payment || payment.eventId !== event.id) return json({ error: 'not_found' }, 404);
  if (payment.status !== 'received') return json({ error: 'not_received' }, 409);

  // Recipient: an entered one applies to this payback only; otherwise the stored payer
  let recipient: { type: Payment['payeeType']; value: string } | null = null;
  const entered = typeof body.recipient === 'string' ? body.recipient.trim() : '';
  if (entered) {
    const proxy = detectProxyType(entered);
    if (!proxy) return json({ error: 'invalid_recipient' }, 400);
    recipient = { type: proxy.type, value: proxy.normalized };
  } else if (payment.payerType && payment.payerValue) {
    recipient = { type: payment.payerType, value: payment.payerValue };
  } else {
    return json({ error: 'recipient_required' }, 400);
  }

  const result = await createPaybackFor(repo, {
    paymentId: payment.id,
    paymentRef: payment.ref,
    recipientType: recipient.type,
    recipientValue: recipient.value,
    amountCents,
    createdBy: userId,
  });
  if (!result.ok) {
    return result.reason === 'payment_not_found'
      ? json({ error: 'not_found' }, 404)
      : json({ error: 'over_bound', remainingCents: result.remainingCents }, 409);
  }
  return json(
    { payback: { ref: result.payback.ref, amountCents, status: result.payback.status } },
    201
  );
}

/** A payback of this event (found through the event's payments), with its payment. */
async function findPayback(
  env: WebEnv,
  event: Event,
  paybackRef: string
): Promise<{ payback: Payback; payment: Payment } | null> {
  const repo = new D1Repository(env.paynow_db);
  const payback = await repo.getPaybackByRef(paybackRef);
  if (!payback) return null;
  const payment = (await repo.listPaymentsByEvent(event.id)).find(
    (p) => p.id === payback.paymentId
  );
  return payment ? { payback, payment } : null;
}

async function paybackTransition(
  env: WebEnv,
  { userId, event }: { userId: number; event: Event },
  paybackRef: string,
  target: 'sent' | 'cancelled'
): Promise<Response> {
  const found = await findPayback(env, event, paybackRef);
  if (!found) return json({ error: 'not_found' }, 404);

  const repo = new D1Repository(env.paynow_db);
  // Pending-only compare-and-set: racing or repeated requests have exactly one winner
  const updated = await repo.updatePaybackStatus(
    paybackRef,
    target,
    new Date().toISOString(),
    userId
  );
  if (!updated) {
    const current = await repo.getPaybackByRef(paybackRef);
    return json({ error: 'not_pending', status: current?.status ?? null }, 409);
  }
  return json({ payback: { ref: updated.ref, status: updated.status } });
}

async function paybackQr(
  request: Request,
  env: WebEnv,
  eventRef: string,
  paybackRef: string,
  fetchFn: typeof fetch
): Promise<Response> {
  const access = await eventAccess(request, env, eventRef, fetchFn);
  if (access instanceof Response) return access;
  const found = await findPayback(env, access.event, paybackRef);
  if (!found) return json({ error: 'not_found' }, 404);

  const { payback, payment } = found;
  // Names only as text; the recipient's number is only inside the QR itself
  const lines = [
    `Payback for ${payment.ref}`,
    `SGD ${formatCents(payback.amountCents)}`,
    payback.ref,
    ...captionPart('To', recipientName(payment.payerValue, payment.payerName, payback.payerValue)),
  ];
  const png = await bmpToPng(await renderQrPng(payback.qrPayload, lines));
  return new Response(png, {
    headers: { 'Content-Type': 'image/png', 'Cache-Control': 'no-store' },
  });
}

async function eventData(
  request: Request,
  env: WebEnv,
  ref: string,
  fetchFn: typeof fetch
): Promise<Response> {
  const access = await eventAccess(request, env, ref, fetchFn);
  if (access instanceof Response) return access;
  const { event } = access;

  const repo = new D1Repository(env.paynow_db);
  const payments = await repo.listPaymentsByEvent(event.id);
  const paybacksByPayment = new Map<number, Payback[]>();
  for (const b of await repo.listPaybacksByEvent(event.id)) {
    paybacksByPayment.set(b.paymentId, [...(paybacksByPayment.get(b.paymentId) ?? []), b]);
  }
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
    payments: payments.map((p) => {
      const paybacks = paybacksByPayment.get(p.id) ?? [];
      // The payable-back room counts pending + sent (cancelled free their amount)
      const committed = paybacks
        .filter((b) => b.status !== 'cancelled')
        .reduce((t, b) => t + b.amountCents, 0);
      return {
        ref: p.ref,
        description: p.description,
        payerName: p.payerName ?? null,
        amountCents: p.amountCents,
        paidBackCents: sent.get(p.id) ?? 0,
        netCents: p.amountCents - (sent.get(p.id) ?? 0),
        remainingCents: Math.max(0, p.amountCents - committed),
        needsRecipient: !p.payerValue,
        status: p.status,
        createdAt: p.createdAt,
        receivedAt: p.receivedAt,
        paybacks: paybacks.map((b) => ({
          ref: b.ref,
          amountCents: b.amountCents,
          status: b.status,
          recipientName: recipientName(p.payerValue, p.payerName, b.payerValue),
          createdAt: b.createdAt,
          sentAt: b.sentAt,
        })),
      };
    }),
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
.pb,.form{margin:.3rem 0}.pb button,.form button{margin-left:.4rem}
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
const ERRORS = {
  invalid_amount: 'Enter an amount such as 5.00 (at most 2 decimals).',
  invalid_recipient: 'The recipient must be a valid mobile number or UEN.',
  recipient_required: 'This payment has no stored payer: enter a recipient.',
  not_received: 'Only received payments can be paid back.',
  not_pending: 'That payback is no longer pending.',
  forbidden: 'Not allowed.',
  not_found: 'Not found.',
};
function say(text) { $('msg').textContent = text; $('msg').hidden = !text; }
function el(tag, text, cls) { const e = document.createElement(tag); if (text !== undefined) e.textContent = text; if (cls) e.className = cls; return e; }
async function act(path, body, button) {
  if (button) button.disabled = true;
  say('');
  const res = await fetch(path, { method: 'POST', credentials: 'same-origin', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body || {}) });
  if (!res.ok) {
    const e = await res.json().catch(() => ({}));
    say(e.error === 'over_bound' ? 'Too much: at most ' + sgd(e.remainingCents) + ' can still be paid back.' : (ERRORS[e.error] || 'Something went wrong.'));
  }
  await load();
}
function paybackForm(p) {
  const form = el('div', undefined, 'form');
  const amount = el('input'); amount.placeholder = 'Amount'; amount.value = (p.remainingCents / 100).toFixed(2); amount.size = 8;
  const recipient = el('input'); recipient.placeholder = p.needsRecipient ? 'Recipient mobile / UEN (required)' : 'Other recipient (optional)'; recipient.size = 26;
  const go = el('button', 'Pay back');
  go.onclick = () => act('/api/events/${ref}/payments/' + encodeURIComponent(p.ref) + '/paybacks', { amount: amount.value, recipient: recipient.value }, go);
  form.append(amount, recipient, go);
  return form;
}
function paybackRow(b) {
  const row = el('div', undefined, 'pb');
  row.append(el('span', sgd(b.amountCents) + (b.recipientName ? ' to ' + b.recipientName : '') + ' - ' + b.status + ' (' + b.ref + ')'));
  if (b.status === 'pending') {
    const base = '/api/events/${ref}/paybacks/' + encodeURIComponent(b.ref);
    const sent = el('button', 'Sent'); sent.onclick = () => act(base + '/sent', {}, sent);
    const cancel = el('button', 'Cancel'); cancel.onclick = () => act(base + '/cancel', {}, cancel);
    const img = el('img'); img.src = base + '/qr'; img.alt = 'Payback QR'; img.width = 220;
    row.append(sent, cancel, el('br'), img);
  }
  return row;
}
async function load() {
  const res = await fetch('/api/events/${ref}', { credentials: 'same-origin' });
  if (res.status === 401) { say(''); $('login').hidden = false; $('data').hidden = true; return; }
  if (res.status === 403) { say('Not allowed: only chat administrators can view this event.'); return; }
  if (res.status === 404) { say('Event not found.'); return; }
  if (!res.ok) { say('Something went wrong.'); return; }
  const d = await res.json();
  $('title').textContent = d.event.name;
  $('collected').textContent = sgd(d.totals.collectedCents);
  $('paidback').textContent = sgd(d.totals.paidBackCents);
  $('pending').textContent = sgd(d.totals.pendingCents);
  $('rows').replaceChildren();
  say(d.payments.length === 0 ? 'No payments yet.' : '');
  for (const p of d.payments) {
    const tr = el('tr');
    if (p.status === 'voided') tr.className = 'voided';
    [p.description, p.payerName || '', sgd(p.amountCents), sgd(p.paidBackCents), sgd(p.netCents), p.status, p.ref, when(p.createdAt), when(p.receivedAt)]
      .forEach((v, i) => tr.appendChild(el('td', v, i >= 2 && i <= 4 ? 'num' : undefined)));
    $('rows').appendChild(tr);
    const canPayback = p.status === 'received' && p.remainingCents > 0;
    if (p.paybacks.length > 0 || canPayback) {
      const sub = el('tr'); const td = el('td'); td.colSpan = 9;
      for (const b of p.paybacks) td.appendChild(paybackRow(b));
      if (canPayback) td.appendChild(paybackForm(p));
      sub.appendChild(td); $('rows').appendChild(sub);
    }
  }
  $('data').hidden = false;
}
load();
</script></body></html>`;
}
