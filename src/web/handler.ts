import { isChatAdmin } from '../access/chat-admin';
import { captionPart, recipientName } from '../commands/payer-label';
import { D1EventRepository, D1Repository } from '../db/drizzle-repository';
import { createPaybackFor } from '../db/payback-service';
import { detectProxyType } from '../db/proxy-validation';
import type { Event, Payback, Payment, PaymentStatus } from '../db/repository';
import { createPaymentRequest, paymentImageLines } from '../payments/payment-request';
import { formatCents, parseAmount } from '../sgqr/amount';
import { paymentReferenceFromPayload } from '../sgqr/paynow';
import { bmpToPng } from '../sgqr/png';
import { renderQrPng } from '../sgqr/qr-render';
import { SESSION_MAX_AGE_SEC, signSession, verifySession, verifyTelegramLogin } from './auth';
import { renderPage, renderPayerPage } from './page';
import { postPaymentQr, sendPaymentDm } from './telegram';

/** Bindings of the Pages project (see web/wrangler.toml). */
export interface WebEnv {
  paynow_db: D1Database;
  TELEGRAM_BOT_TOKEN: string;
  SESSION_SECRET: string;
  BOT_USERNAME: string;
}

const REF = /^[A-Za-z0-9_-]{1,40}$/;
const MAX_PAYER_NAME = 40; // same limit as /start
const PAGE_SIZE = 20;
const MAX_LIMIT = 200; // the page refetches the rows it already shows after an action
const MAX_SEARCH = 40;
const PAYMENT_STATUSES = ['pending', 'received', 'voided'];

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
  });

function cookieValue(request: Request, name: string): string | undefined {
  return request.headers
    .get('Cookie')
    ?.split(';')
    .map((c) => c.trim())
    .find((c) => c.startsWith(`${name}=`))
    ?.slice(name.length + 1);
}

const sessionCookie = (request: Request) => cookieValue(request, 'session');

const COOKIE_FLAGS = 'HttpOnly; Secure; SameSite=Lax; Path=/';
const MAX_DISPLAY_NAME = 64;

/** Name shown next to Sign out: first + last name, else @username, else empty. Display only. */
function displayName(params: URLSearchParams): string {
  const full = [params.get('first_name'), params.get('last_name')].filter(Boolean).join(' ').trim();
  const username = params.get('username');
  return (full || (username ? `@${username}` : '')).slice(0, MAX_DISPLAY_NAME);
}

/** The remembered display name, or null (absent, empty or malformed cookie). */
function storedName(request: Request): string | null {
  const raw = cookieValue(request, 'tg_name');
  if (!raw) return null;
  try {
    return decodeURIComponent(raw).slice(0, MAX_DISPLAY_NAME) || null;
  } catch {
    return null;
  }
}

/** Who is signed in, for the header of both pages. Never an error: no session is `user: null`. */
async function me(request: Request, env: WebEnv): Promise<Response> {
  const userId = await verifySession(sessionCookie(request), env.SESSION_SECRET);
  return json({ user: userId === null ? null : { name: storedName(request) } });
}

/** Clear this browser's session. Sessions are stateless, so a copied cookie stays valid until expiry. */
function logout(): Response {
  const headers = new Headers();
  for (const name of ['session', 'tg_name']) {
    headers.append('Set-Cookie', `${name}=; ${COOKIE_FLAGS}; Max-Age=0`);
  }
  return new Response(null, { status: 204, headers });
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
    const next = url.searchParams.get('next');
    const cookie = await signSession(userId, env.SESSION_SECRET);
    const headers = new Headers({ Location: `${next === 'pay' ? '/pay' : '/events'}/${ref}` });
    const age = `Max-Age=${SESSION_MAX_AGE_SEC}`;
    headers.append('Set-Cookie', `session=${cookie}; ${COOKIE_FLAGS}; ${age}`);
    headers.append(
      'Set-Cookie',
      `tg_name=${encodeURIComponent(displayName(url.searchParams))}; ${COOKIE_FLAGS}; ${age}`
    );
    return new Response(null, { status: 302, headers });
  }

  if (url.pathname === '/api/me') return me(request, env);

  const payerPage = url.pathname.match(/^\/pay\/([^/]+)$/);
  if (payerPage && REF.test(payerPage[1]!)) {
    return new Response(renderPayerPage(payerPage[1]!, env.BOT_USERNAME), {
      headers: { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' },
    });
  }

  const payerApi = url.pathname.match(/^\/api\/pay\/([^/]+)$/);
  if (payerApi && REF.test(payerApi[1]!)) {
    return payerData(request, env, payerApi[1]!);
  }

  const payerList = url.pathname.match(/^\/api\/pay\/([^/]+)\/payments$/);
  if (payerList && REF.test(payerList[1]!)) {
    return payerHistory(request, env, payerList[1]!);
  }

  const payerQr = url.pathname.match(/^\/api\/pay\/([^/]+)\/payments\/([^/]+)\/qr$/);
  if (payerQr && REF.test(payerQr[1]!) && REF.test(payerQr[2]!)) {
    return payerQrImage(request, env, payerQr[1]!, payerQr[2]!);
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

  const paymentQr = url.pathname.match(/^\/api\/events\/([^/]+)\/payments\/([^/]+)\/qr$/);
  if (paymentQr && REF.test(paymentQr[1]!) && REF.test(paymentQr[2]!)) {
    return paymentQrImage(request, env, paymentQr[1]!, paymentQr[2]!, fetchFn);
  }

  return new Response('Not found', { status: 404 });
}

async function payerAccess(
  request: Request,
  env: WebEnv,
  ref: string
): Promise<{ userId: number | null; event: Event } | Response> {
  // No, invalid or expired session = anonymous (userId null); only an unknown event is refused
  const userId = await verifySession(sessionCookie(request), env.SESSION_SECRET);
  const event = await new D1EventRepository(env.paynow_db).getEventByRef(ref);
  if (!event) return json({ error: 'not_found' }, 404);
  return { userId, event };
}

/** Anonymous creations allowed per event in the window (signed-in users are not limited). */
const ANON_LIMIT = 30;
const ANON_WINDOW_MS = 10 * 60 * 1000;

/** PNG bytes as a data URL, so an anonymous payer needs no authenticated image route. */
function pngDataUrl(png: Uint8Array): string {
  let bin = '';
  for (let i = 0; i < png.length; i += 0x8000) {
    bin += String.fromCharCode(...png.subarray(i, i + 0x8000));
  }
  return `data:image/png;base64,${btoa(bin)}`;
}

async function payerData(request: Request, env: WebEnv, ref: string): Promise<Response> {
  const access = await payerAccess(request, env, ref);
  if (access instanceof Response) return access;
  return json({
    event: {
      name: access.event.name,
      status: access.event.status,
      defaultAmountCents: access.event.defaultAmountCents,
    },
    signedIn: access.userId !== null,
  });
}

/** The signed-in user's own requests for this event (no PayNow numbers), newest first. */
async function payerHistory(request: Request, env: WebEnv, ref: string): Promise<Response> {
  const access = await payerAccess(request, env, ref);
  if (access instanceof Response) return access;
  if (access.userId === null) return json({ error: 'sign_in' }, 401);
  const payments = await new D1Repository(env.paynow_db).listPaymentsByUserAndEvent(
    access.userId,
    access.event.id
  );
  return json({
    payments: payments.map((p) => ({
      ref: p.ref,
      amountCents: p.amountCents,
      status: p.status,
      payerName: p.payerName ?? null,
      createdAt: p.createdAt,
    })),
  });
}

async function createPayerPayment(
  request: Request,
  env: WebEnv,
  ref: string,
  fetchFn: typeof fetch
): Promise<Response> {
  const access = await payerAccess(request, env, ref);
  if (access instanceof Response) return access;
  if (access.event.status !== 'open') return json({ error: 'event_closed' }, 409);

  let body: { payer?: unknown; name?: unknown; amount?: unknown };
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return json({ error: 'invalid_request' }, 400);
  }

  const payer = detectProxyType(String(body.payer ?? ''));
  if (!payer) return json({ error: 'invalid_payer' }, 400);
  const name = typeof body.name === 'string' ? body.name.trim().slice(0, MAX_PAYER_NAME) : '';
  const amountCents = access.event.defaultAmountCents ?? parseAmount(String(body.amount ?? ''));
  if (amountCents === null) return json({ error: 'invalid_amount' }, 400);

  const repo = new D1Repository(env.paynow_db);
  if (access.userId === null) {
    const since = new Date(Date.now() - ANON_WINDOW_MS).toISOString();
    if ((await repo.countRecentAnonymousPayments(access.event.id, since)) >= ANON_LIMIT) {
      return json({ error: 'rate_limited' }, 429);
    }
  }

  const payment = await createPaymentRequest(repo, access.event, {
    payerType: payer.type,
    payerValue: payer.normalized,
    payerName: name || null,
    amountCents,
    userId: access.userId ?? 0,
  });
  const bmp = await renderQrPng(payment.qrPayload, paymentImageLines(access.event, payment));
  // Private copy only for signed-in users; best-effort (they may never have started the bot)
  const dm =
    access.userId === null
      ? undefined
      : await sendPaymentDm(env.TELEGRAM_BOT_TOKEN, access.userId, payment, bmp, fetchFn);
  return json(
    {
      payment: {
        ref: payment.ref,
        amountCents: payment.amountCents,
        status: payment.status,
        payerName: payment.payerName ?? null,
        qr: pngDataUrl(await bmpToPng(bmp)),
        ...(dm === undefined ? {} : { dm }),
      },
    },
    201
  );
}

async function payerQrImage(
  request: Request,
  env: WebEnv,
  eventRef: string,
  paymentRef: string
): Promise<Response> {
  const access = await payerAccess(request, env, eventRef);
  if (access instanceof Response) return access;
  if (access.userId === null) return json({ error: 'sign_in' }, 401);
  const payment = await new D1Repository(env.paynow_db).getPaymentByRef(paymentRef);
  if (!payment || payment.eventId !== access.event.id || payment.userId !== access.userId) {
    return json({ error: 'not_found' }, 404);
  }
  const png = await bmpToPng(
    await renderQrPng(payment.qrPayload, paymentImageLines(access.event, payment))
  );
  return new Response(png, {
    headers: { 'Content-Type': 'image/png', 'Cache-Control': 'no-store' },
  });
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
  if (!(await isChatAdmin(event.chatId, userId, env.TELEGRAM_BOT_TOKEN, fetchFn))) {
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
  const path = url.pathname;
  if (path === '/api/logout') {
    if (!sameOriginJson(request, url)) return json({ error: 'forbidden' }, 403);
    return logout();
  }
  const payerCreate = path.match(/^\/api\/pay\/([^/]+)\/payments$/);
  if (payerCreate && REF.test(payerCreate[1]!)) {
    if (!sameOriginJson(request, url)) return json({ error: 'forbidden' }, 403);
    return createPayerPayment(request, env, payerCreate[1]!, fetchFn);
  }
  const newPayment = path.match(/^\/api\/events\/([^/]+)\/payments$/);
  const newPayback = path.match(/^\/api\/events\/([^/]+)\/payments\/([^/]+)\/paybacks$/);
  const settle = path.match(/^\/api\/events\/([^/]+)\/payments\/([^/]+)\/(received|void)$/);
  const transition = path.match(/^\/api\/events\/([^/]+)\/paybacks\/([^/]+)\/(sent|cancel)$/);
  const scan = path.match(/^\/api\/events\/([^/]+)\/scan$/);
  const checkIn = path.match(/^\/api\/events\/([^/]+)\/payments\/([^/]+)\/check-in$/);
  const match = newPayment ?? newPayback ?? settle ?? transition ?? scan ?? checkIn;
  if (!match || !REF.test(match[1]!) || (match[2] !== undefined && !REF.test(match[2]))) {
    return new Response('Not found', { status: 404 });
  }
  if (!sameOriginJson(request, url)) return json({ error: 'forbidden' }, 403);

  const access = await eventAccess(request, env, match[1]!, fetchFn);
  if (access instanceof Response) return access;

  if (scan) return scanRoute(request, env, access);
  if (checkIn) return checkInRoute(env, access, match[2]!);
  if (newPayment) return createPaymentRequestRoute(request, env, access, fetchFn);
  if (newPayback) return createPayback(request, env, access, match[2]!);
  if (settle) return settlePayment(env, access, match[2]!, match[3] as 'received' | 'void');
  return paybackTransition(env, access, match[2]!, match[3] === 'sent' ? 'sent' : 'cancelled');
}

/**
 * Resolve a scanned QR (`{ payload }`, which must be exactly this event's stored payment QR) or a
 * typed reference (`{ ref }`) to one of this event's payments, whether or not it is on a loaded page.
 */
async function scanRoute(
  request: Request,
  env: WebEnv,
  { event }: { event: Event }
): Promise<Response> {
  let body: { payload?: unknown; ref?: unknown };
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return json({ error: 'invalid_request' }, 400);
  }
  const payload = typeof body.payload === 'string' ? body.payload : null;
  const typed = typeof body.ref === 'string' ? body.ref.trim().toUpperCase() : null;
  if (!payload && !typed) return json({ error: 'invalid_request' }, 400);

  const ref = payload !== null ? paymentReferenceFromPayload(payload) : typed;
  const repo = new D1Repository(env.paynow_db);
  const payment = ref && REF.test(ref) ? await repo.getPaymentByRef(ref) : null;
  // The QR must be this payment's own: other events, payback QRs and edited codes are not found
  if (
    !payment ||
    payment.eventId !== event.id ||
    (payload !== null && payload !== payment.qrPayload)
  ) {
    return json({ error: 'not_found' }, 404);
  }
  return json({ payment: (await paymentViews(repo, [payment]))[0] });
}

/** Check a payment in at the event: one guarded write, so a repeat or a race reports who won. */
async function checkInRoute(
  env: WebEnv,
  { userId, event }: { userId: number; event: Event },
  paymentRef: string
): Promise<Response> {
  const repo = new D1Repository(env.paynow_db);
  const payment = await repo.getPaymentByRef(paymentRef);
  if (!payment || payment.eventId !== event.id) return json({ error: 'not_found' }, 404);

  const updated = await repo.checkInPayment(paymentRef, userId, new Date().toISOString());
  if (!updated) {
    const current = await repo.getPaymentByRef(paymentRef);
    return current?.status === 'voided'
      ? json({ error: 'voided' }, 409)
      : json({ error: 'already_checked_in', checkedInAt: current?.checkedInAt ?? null }, 409);
  }
  return json({ payment: (await paymentViews(repo, [updated]))[0] });
}

async function createPaymentRequestRoute(
  request: Request,
  env: WebEnv,
  { userId, event }: { userId: number; event: Event },
  fetchFn: typeof fetch
): Promise<Response> {
  let body: { payer?: unknown; name?: unknown; amount?: unknown };
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return json({ error: 'invalid_request' }, 400);
  }

  const payer = detectProxyType(String(body.payer ?? ''));
  if (!payer) return json({ error: 'invalid_payer' }, 400);
  const amountCents = parseAmount(String(body.amount ?? ''));
  if (amountCents === null) return json({ error: 'invalid_amount' }, 400);
  if (event.status !== 'open') return json({ error: 'event_closed' }, 409);

  const name = typeof body.name === 'string' ? body.name.trim().slice(0, MAX_PAYER_NAME) : '';
  const payment = await createPaymentRequest(new D1Repository(env.paynow_db), event, {
    payerType: payer.type,
    payerValue: payer.normalized,
    payerName: name || null,
    amountCents,
    userId,
  });

  // Same QR as the page shows, posted to the event's chat; a failure keeps the payment
  const bmp = await renderQrPng(payment.qrPayload, paymentImageLines(event, payment));
  const posted = await postPaymentQr(env.TELEGRAM_BOT_TOKEN, event, payment, bmp, fetchFn);
  return json({ payment: { ref: payment.ref, amountCents, status: payment.status, posted } }, 201);
}

async function settlePayment(
  env: WebEnv,
  { userId, event }: { userId: number; event: Event },
  paymentRef: string,
  action: 'received' | 'void'
): Promise<Response> {
  const repo = new D1Repository(env.paynow_db);
  const payment = await repo.getPaymentByRef(paymentRef);
  if (!payment || payment.eventId !== event.id) return json({ error: 'not_found' }, 404);

  // Pending-only compare-and-set: racing taps, here or in Telegram, have exactly one winner
  const updated =
    action === 'received'
      ? await repo.updatePaymentStatus(
          paymentRef,
          'received',
          'manual',
          new Date().toISOString(),
          userId
        )
      : await repo.voidPayment(paymentRef, userId);
  if (!updated) {
    const current = await repo.getPaymentByRef(paymentRef);
    return json({ error: 'not_pending', status: current?.status ?? null }, 409);
  }
  return json({ payment: { ref: updated.ref, status: updated.status } });
}

async function paymentQrImage(
  request: Request,
  env: WebEnv,
  eventRef: string,
  paymentRef: string,
  fetchFn: typeof fetch
): Promise<Response> {
  const access = await eventAccess(request, env, eventRef, fetchFn);
  if (access instanceof Response) return access;

  const payment = await new D1Repository(env.paynow_db).getPaymentByRef(paymentRef);
  if (!payment || payment.eventId !== access.event.id) return json({ error: 'not_found' }, 404);

  const png = await bmpToPng(
    await renderQrPng(payment.qrPayload, paymentImageLines(access.event, payment))
  );
  return new Response(png, {
    headers: { 'Content-Type': 'image/png', 'Cache-Control': 'no-store' },
  });
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

  const params = new URL(request.url).searchParams;
  const status = params.get('status') ?? undefined;
  const q = (params.get('q') ?? '').trim();
  const limitParam = params.get('limit');
  const limit = limitParam === null ? PAGE_SIZE : Number(limitParam);
  const cursor = params.get('cursor') ?? undefined;
  if (
    (status !== undefined && !PAYMENT_STATUSES.includes(status)) ||
    q.length > MAX_SEARCH ||
    !Number.isInteger(limit) ||
    limit < 1 ||
    limit > MAX_LIMIT
  ) {
    return json({ error: 'invalid_request' }, 400);
  }
  if (cursor !== undefined && !/^[^|]+\|\d+$/.test(cursor)) {
    return json({ error: 'invalid_cursor' }, 400);
  }

  const repo = new D1Repository(env.paynow_db);
  const { payments, nextCursor } = await repo.searchPaymentsByEvent(event.id, {
    ...(status ? { status: status as PaymentStatus } : {}),
    ...(q ? { q } : {}),
    limit,
    ...(cursor ? { cursor } : {}),
  });
  // Event-wide totals: independent of the page, search and filter
  const stats = await new D1EventRepository(env.paynow_db).getEventStats(event.id);

  // Names only: never expose payer/payee PayNow numbers to the page.
  return json({
    event: { name: event.name, status: event.status, defaultAmountCents: event.defaultAmountCents },
    totals: {
      collectedCents: stats.collectedCents,
      paidBackCents: stats.paidBackCents,
      pendingCents: stats.pendingCents,
    },
    nextCursor,
    payments: await paymentViews(repo, payments),
  });
}

/**
 * The page's JSON for payments: names only (never PayNow numbers), with the paybacks of exactly
 * these payments (so only what is shown is read) and their sent/committed totals.
 */
async function paymentViews(repo: D1Repository, payments: Payment[]) {
  const paybacksByPayment = new Map<number, Payback[]>();
  const sent = new Map<number, number>();
  for (const b of await repo.listPaybacksByPayments(payments.map((p) => p.id))) {
    paybacksByPayment.set(b.paymentId, [...(paybacksByPayment.get(b.paymentId) ?? []), b]);
    if (b.status === 'sent') sent.set(b.paymentId, (sent.get(b.paymentId) ?? 0) + b.amountCents);
  }
  return payments.map((p) => {
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
      checkedInAt: p.checkedInAt ?? null,
      paybacks: paybacks.map((b) => ({
        ref: b.ref,
        amountCents: b.amountCents,
        status: b.status,
        recipientName: recipientName(p.payerValue, p.payerName, b.payerValue),
        createdAt: b.createdAt,
        sentAt: b.sentAt,
      })),
    };
  });
}
