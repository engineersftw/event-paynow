import { describe, it, expect, beforeAll, beforeEach } from 'vitest';
import { env } from 'cloudflare:test';
import { Bot } from 'grammy';
import type { Update } from 'grammy/types';
import jsQR from 'jsqr';
import { D1Repository } from '../../src/db/drizzle-repository';
import { StartCommandHandler } from '../../src/commands/start-handler';
import type { ConversationDO } from '../../src/worker/conversation-do';
import type { User } from '../../src/db/repository';

/**
 * Task 5.3 stage (a): end-to-end /start flow inside the Workers runtime with
 * real bindings — D1 (Drizzle riding env.DB), the per-chat conversation DO
 * (real FSM via the CHAT_SESSION binding), and grammY with a stubbed fetch
 * that captures the outbound sendPhoto/upload calls.
 *
 * Verifies per task text:
 * - captured photo bytes decode back to the stored payload (jsQR round-trip of
 *   the isolate-rendered QR)
 * - caption = `description / SGD amount / ref / "Forward this message to share"`
 * - the payment row is persisted (status pending, payee snapshot, base32 ref)
 * Plus the 5.1 guard, 5.2 mid-flow /cancel, and the 5.4 payee-snapshot
 * immutability check on the same live path.
 */

// Apply schema once before all tests (idempotent)
beforeAll(async () => {
  const statements = [
    `CREATE TABLE IF NOT EXISTS users (
      telegram_id INTEGER PRIMARY KEY,
      payee_type TEXT NOT NULL CHECK(payee_type IN ('mobile', 'uen')),
      payee_value TEXT NOT NULL,
      display_name TEXT NOT NULL,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    )`,
    `CREATE TABLE IF NOT EXISTS payments (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      ref TEXT NOT NULL UNIQUE,
      user_id INTEGER NOT NULL,
      description TEXT NOT NULL,
      amount_cents INTEGER NOT NULL,
      payee_type TEXT NOT NULL CHECK(payee_type IN ('mobile', 'uen')),
      payee_value TEXT NOT NULL,
      status TEXT NOT NULL CHECK(status IN ('pending', 'received')),
      source TEXT NOT NULL CHECK(source IN ('manual', 'notification')),
      qr_payload TEXT NOT NULL,
      created_at TEXT NOT NULL,
      received_at TEXT,
      FOREIGN KEY (user_id) REFERENCES users(telegram_id)
    )`,
    `CREATE TABLE IF NOT EXISTS paybacks (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      ref TEXT NOT NULL UNIQUE,
      payment_id INTEGER NOT NULL,
      payer_type TEXT NOT NULL CHECK(payer_type IN ('mobile', 'uen')),
      payer_value TEXT NOT NULL,
      amount_cents INTEGER NOT NULL,
      status TEXT NOT NULL CHECK(status IN ('pending', 'sent')),
      qr_payload TEXT NOT NULL,
      created_at TEXT NOT NULL,
      sent_at TEXT,
      FOREIGN KEY (payment_id) REFERENCES payments(id)
    )`,
    `CREATE INDEX IF NOT EXISTS idx_payments_user_id ON payments(user_id)`,
    `CREATE INDEX IF NOT EXISTS idx_payments_ref ON payments(ref)`,
    `CREATE INDEX IF NOT EXISTS idx_paybacks_payment_id ON paybacks(payment_id)`,
    `CREATE INDEX IF NOT EXISTS idx_paybacks_ref ON paybacks(ref)`
  ];

  for (const stmt of statements) {
    await env.DB.prepare(stmt).run();
  }
});

const T0 = '2024-01-01T00:00:00Z';

// ---------------------------------------------------------------------------
// Telegram API fetch stub (passed to grammY via `client.fetch`)
// ---------------------------------------------------------------------------

interface CapturedSend {
  chatId: string;
  text: string;
}

interface CapturedPhoto {
  chatId: string;
  caption: string;
  filename: string;
  bytes: Uint8Array;
}

const sentMessages: CapturedSend[] = [];
const sentPhotos: CapturedPhoto[] = [];
let messageId = 1000;

function jsonResponse(payload: unknown): Response {
  return new Response(JSON.stringify(payload), {
    headers: { 'content-type': 'application/json' },
  });
}

function stubResponse(chatId: string) {
  messageId += 1;
  return jsonResponse({
    ok: true,
    result: {
      message_id: messageId,
      date: Math.floor(Date.now() / 1000),
      chat: { id: Number(chatId), type: 'private' },
    },
  });
}

const asciiEnc = new TextEncoder();

function indexOfBytes(hay: Uint8Array, needle: Uint8Array, from: number): number {
  outer: for (let i = from; i <= hay.length - needle.length; i++) {
    for (let j = 0; j < needle.length; j++) {
      if (hay[i + j] !== needle[j]) continue outer;
    }
    return i;
  }
  return -1;
}

async function collectBody(body: unknown): Promise<Uint8Array> {
  if (body instanceof Uint8Array) return body;
  if (typeof body === 'string') return asciiEnc.encode(body);
  if (body && typeof body === 'object' && 'getReader' in body) {
    const reader = (body as ReadableStream<Uint8Array>).getReader();
    const chunks: Uint8Array[] = [];
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      if (value) chunks.push(value);
    }
    const total = chunks.reduce((n, c) => n + c.length, 0);
    const out = new Uint8Array(total);
    let off = 0;
    for (const c of chunks) {
      out.set(c, off);
      off += c.length;
    }
    return out;
  }
  throw new Error('unsupported request body type in fetch stub');
}

/**
 * Parse grammY's hand-rolled multipart stream into named fields.
 * grammY emits headers like `content-disposition:form-data;name="photo";filename=x.bmp`.
 */
function parseMultipart(
  body: Uint8Array,
  boundary: string
): Record<string, { value?: string; bytes?: Uint8Array; filename?: string }> {
  const out: Record<string, { value?: string; bytes?: Uint8Array; filename?: string }> = {};
  const delim = asciiEnc.encode(`--${boundary}`);
  const headerSep = asciiEnc.encode('\r\n\r\n');

  let pos = indexOfBytes(body, delim, 0);
  while (pos >= 0) {
    const next = indexOfBytes(body, delim, pos + delim.length);
    const end = next < 0 ? body.length : next;
    let seg = body.subarray(pos + delim.length, end);
    if (seg.length >= 2 && seg[0] === 13 && seg[1] === 10) seg = seg.subarray(2);
    if (seg.length >= 2 && seg[seg.length - 2] === 13 && seg[seg.length - 1] === 10) {
      seg = seg.subarray(0, seg.length - 2);
    }

    const hsep = indexOfBytes(seg, headerSep, 0);
    if (hsep >= 0) {
      const headerText = new TextDecoder().decode(seg.subarray(0, hsep));
      const rawBody = seg.subarray(hsep + 4);
      const nameMatch = /name="([^"]+)"/.exec(headerText);
      const fileMatch = /filename=([^;\r\n]+)/.exec(headerText);
      if (nameMatch?.[1] !== undefined) {
        if (fileMatch?.[1] !== undefined) {
          out[nameMatch[1]] = { filename: fileMatch[1], bytes: rawBody.slice() };
        } else {
          out[nameMatch[1]] = { value: new TextDecoder().decode(rawBody) };
        }
      }
    }

    if (next < 0) break;
    pos = next;
  }
  return out;
}

async function telegramFetch(url: string | URL, init?: RequestInit): Promise<Response> {
  const u = String(url);

  if (u.includes('/sendMessage')) {
    const body = JSON.parse(String(init?.body)) as { chat_id: number | string; text: string };
    sentMessages.push({ chatId: String(body.chat_id), text: body.text });
    return stubResponse(String(body.chat_id));
  }

  if (u.includes('/sendPhoto')) {
    const headers = new Headers(init?.headers as HeadersInit | undefined);
    const boundaryMatch = /boundary=([^\s;]+)/.exec(headers.get('content-type') ?? '');
    if (!boundaryMatch?.[1]) throw new Error(`sendPhoto without multipart boundary: ${headers.get('content-type')}`);
    const fields = parseMultipart(await collectBody(init?.body), boundaryMatch[1]);

    // grammY uploads files via attach:// indirection: the `photo` part holds
    // `attach://<token>` and the bytes arrive as a separate part named `<token>`.
    const photoField = fields.photo;
    let photoBytes: Uint8Array | undefined;
    let photoName = '';
    if (photoField?.bytes) {
      photoBytes = photoField.bytes;
      photoName = photoField.filename ?? '';
    } else if (photoField?.value?.startsWith('attach://')) {
      const attached = fields[photoField.value.slice('attach://'.length)];
      if (!attached?.bytes) throw new Error('sendPhoto: attach:// target part missing');
      photoBytes = attached.bytes;
      photoName = attached.filename ?? '';
    }
    if (!photoBytes) throw new Error('sendPhoto: no photo file part captured');

    sentPhotos.push({
      chatId: fields.chat_id?.value ?? '',
      caption: fields.caption?.value ?? '',
      filename: photoName,
      bytes: photoBytes,
    });
    return stubResponse(fields.chat_id?.value ?? '0');
  }

  // Any other Telegram method: harmless success
  return jsonResponse({ ok: true, result: true });
}

beforeEach(() => {
  sentMessages.length = 0;
  sentPhotos.length = 0;
});

// ---------------------------------------------------------------------------
// Test harness: wire handlers into a Bot the way the webhook would
// ---------------------------------------------------------------------------

function makeStub(userId: number) {
  const repo = new D1Repository(env.DB);
  const doStub = env.CHAT_SESSION.get(env.CHAT_SESSION.idFromName(`chat-${userId}`));
  const handler = new StartCommandHandler(doStub as unknown as ConversationDO, repo);

  const bot = new Bot('test-secret-token', {
    // botInfo skips grammY's getMe bootstrap; client.fetch captures every call
    botInfo: {
      id: 777000,
      is_bot: true,
      first_name: 'Test Bot',
      username: 'event_paynow_bot',
      can_join_groups: true,
      can_read_all_group_messages: false,
      supports_inline_queries: false,
    },
    client: { fetch: telegramFetch },
  });
  bot.command('start', (ctx) => handler.start(ctx));
  bot.command('cancel', (ctx) => handler.cancel(ctx));
  // Return the promise (not `void`) so grammY awaits DO/DB work before the update completes
  bot.on('message:text', (ctx) => {
    return handler.handleInput(ctx) as Promise<void>;
  });

  return { repo, handler, bot };
}

function textUpdate(userId: number, text: string): Update {
  messageId += 1;
  const message: Record<string, unknown> = {
    message_id: messageId,
    date: Math.floor(Date.now() / 1000),
    chat: { id: userId, type: 'private' },
    from: { id: userId, is_bot: false, first_name: 'Test User' },
    text,
  };
  // grammY's bot.command() only matches when Telegram's bot_command entity is present
  if (text.startsWith('/')) {
    message.entities = [{ type: 'bot_command', offset: 0, length: text.split(' ')[0]!.length }];
  }
  return {
    update_id: messageId,
    message,
  } as Update;
}

async function seedPayeeUser(repo: D1Repository, telegramId: number): Promise<User> {
  return repo.upsertUser({
    telegramId,
    payeeType: 'mobile',
    payeeValue: '+6591234567',
    displayName: 'ACME PTE LTD',
    timestamp: T0,
  });
}

/** Read the DO conversation state directly through the binding. */
async function readDoFlow(userId: number): Promise<string> {
  const stub = env.CHAT_SESSION.get(env.CHAT_SESSION.idFromName(`chat-${userId}`));
  const res = await stub.fetch(new Request('http://localhost/state', { method: 'GET' }));
  const state = (await res.json()) as { flow: string };
  return state.flow;
}

// ---------------------------------------------------------------------------
// BMP → RGBA so jsQR can decode the isolate-rendered QR
// ---------------------------------------------------------------------------

function bmpToRgba(bytes: Uint8Array): { data: Uint8ClampedArray; width: number; height: number } {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  if (view.getUint8(0) !== 0x42 || view.getUint8(1) !== 0x4d) {
    throw new Error('not a BMP');
  }
  const dataOffset = view.getUint32(10, true);
  const width = view.getInt32(18, true);
  const heightRaw = view.getInt32(22, true); // negative = top-down rows
  const height = Math.abs(heightRaw);
  const bpp = view.getUint16(28, true);
  if (bpp !== 24) throw new Error(`unsupported bpp: ${bpp}`);

  const paddedRow = Math.ceil((width * 3) / 4) * 4;
  const data = new Uint8ClampedArray(width * height * 4);

  for (let y = 0; y < height; y++) {
    const srcRow = dataOffset + (heightRaw < 0 ? y * paddedRow : (height - 1 - y) * paddedRow);
    for (let x = 0; x < width; x++) {
      const i = srcRow + x * 3;
      const j = (y * width + x) * 4;
      data[j] = bytes[i + 2] ?? 0;     // R
      data[j + 1] = bytes[i + 1] ?? 0; // G
      data[j + 2] = bytes[i] ?? 0;     // B
      data[j + 3] = 255;               // A
    }
  }
  return { data, width, height };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('/start end-to-end (task 5.3 stage a)', () => {
  it('prompts an unconfigured user to run /init and creates nothing (5.1)', async () => {
    const userId = 500000200;
    const { repo, bot } = makeStub(userId);

    await bot.handleUpdate(textUpdate(userId, '/start'));

    expect(sentPhotos).toHaveLength(0);
    const lastText = sentMessages[sentMessages.length - 1]?.text ?? '';
    expect(lastText).toContain('run /init first');

    // No payment created, conversation left idle
    expect(await repo.listPaymentsByUser(userId)).toHaveLength(0);
    expect(await readDoFlow(userId)).toBe('idle');
  });

  it('/start → description → amount creates the payment and uploads a decodable QR (5.3)', async () => {
    const userId = 500000100;
    const { repo, bot } = makeStub(userId);
    await seedPayeeUser(repo, userId);

    await bot.handleUpdate(textUpdate(userId, '/start'));
    expect(sentMessages[sentMessages.length - 1]?.text).toContain('Enter a short description');

    await bot.handleUpdate(textUpdate(userId, 'Dinner split'));
    expect(sentMessages[sentMessages.length - 1]?.text).toContain('Enter the amount');

    await bot.handleUpdate(textUpdate(userId, '12.50'));

    // --- outbound sendPhoto captured --------------------------------------
    expect(sentPhotos).toHaveLength(1);
    const photo = sentPhotos[0]!;
    expect(photo.chatId).toBe(String(userId));
    expect(photo.filename).toBe('paynow-qr.bmp');
    expect(photo.bytes[0]).toBe(0x42);
    expect(photo.bytes[1]).toBe(0x4d);

    // Caption: description / SGD amount / ref / share hint
    const captionParts = photo.caption.split(' / ');
    expect(captionParts[0]).toBe('Dinner split');
    expect(captionParts[1]).toBe('SGD 12.50');
    expect(captionParts[2]).toMatch(/^[A-Z2-7]{10}$/);
    expect(captionParts[3]).toBe('Forward this message to share');
    const ref = captionParts[2]!;

    // --- QR bytes decode back via jsQR (2.4 path) --------------------------
    const { data, width, height } = bmpToRgba(photo.bytes);
    const decoded = jsQR(data, width, height);
    expect(decoded).not.toBeNull();
    const payload = decoded!.data;

    // Fixed-amount QR with the payee proxy, ref, and amount embedded
    expect(payload).toContain('000201010212');       // PFI + dynamic initiation
    expect(payload).toContain('SG.PAYNOW');
    expect(payload).toContain('+6591234567');        // payee proxy
    expect(payload).toContain('03010');              // 26.03=0 amount not editable
    expect(payload).toContain('540512.50');          // tag 54 amount
    expect(payload).toContain(ref);                  // 26.05 embedded reference

    // --- the persisted payment row matches the delivered QR ---------------
    const payment = await repo.getPaymentByRef(ref);
    expect(payment).not.toBeNull();
    expect(payment!.qrPayload).toBe(payload);       // uploaded QR == stored payload
    expect(payment!.status).toBe('pending');
    expect(payment!.source).toBe('manual');
    expect(payment!.amountCents).toBe(1250);
    expect(payment!.userId).toBe(userId);
    expect(payment!.description).toBe('Dinner split');
    expect(payment!.payeeType).toBe('mobile');
    expect(payment!.payeeValue).toBe('+6591234567');
    expect(await repo.listPaymentsByUser(userId)).toHaveLength(1);

    // Conversation reset to idle after completion; tracking hint sent
    expect(await readDoFlow(userId)).toBe('idle');
    expect(sentMessages[sentMessages.length - 1]?.text).toContain('/payments');
  });

  it('re-prompts an invalid amount and creates nothing, then completes on a valid one', async () => {
    const userId = 500000150;
    const { repo, bot } = makeStub(userId);
    await seedPayeeUser(repo, userId);

    await bot.handleUpdate(textUpdate(userId, '/start'));
    await bot.handleUpdate(textUpdate(userId, 'Coffee'));
    await bot.handleUpdate(textUpdate(userId, '12.505'));

    expect(sentMessages[sentMessages.length - 1]?.text).toContain('Invalid amount');
    expect(sentPhotos).toHaveLength(0);
    expect(await repo.listPaymentsByUser(userId)).toHaveLength(0);

    await bot.handleUpdate(textUpdate(userId, '4.00'));
    expect(sentPhotos).toHaveLength(1);
    expect(await repo.listPaymentsByUser(userId)).toHaveLength(1);
  });

  it('/cancel mid-flow ends the conversation and writes nothing (5.2)', async () => {
    const userId = 500000300;
    const { repo, bot } = makeStub(userId);
    await seedPayeeUser(repo, userId);

    await bot.handleUpdate(textUpdate(userId, '/start'));
    await bot.handleUpdate(textUpdate(userId, 'Lunch'));
    await bot.handleUpdate(textUpdate(userId, '/cancel'));

    expect(sentMessages[sentMessages.length - 1]?.text).toContain('Start cancelled. No payment was created.');
    expect(sentPhotos).toHaveLength(0);
    expect(await repo.listPaymentsByUser(userId)).toHaveLength(0);
    expect(await readDoFlow(userId)).toBe('idle');

    // Late amount input after cancel creates nothing (flow ended)
    await bot.handleUpdate(textUpdate(userId, '8.00'));
    expect(await repo.listPaymentsByUser(userId)).toHaveLength(0);
    expect(sentPhotos).toHaveLength(0);
  });
});

describe('payee snapshot immutability (task 5.4)', () => {
  it('a later /init rewrite leaves the stored payment row and qr_payload unchanged', async () => {
    const userId = 500000400;
    const { repo, bot } = makeStub(userId);
    await seedPayeeUser(repo, userId);

    // Collect a payment via the live /start flow
    await bot.handleUpdate(textUpdate(userId, '/start'));
    await bot.handleUpdate(textUpdate(userId, 'Team photo'));
    await bot.handleUpdate(textUpdate(userId, '25.00'));
    expect(sentPhotos).toHaveLength(1);
    const ref = sentPhotos[0]!.caption.split(' / ')[2]!;

    const before = await repo.getPaymentByRef(ref);
    expect(before).not.toBeNull();

    // Simulate re-running /init: persist a new payee for the same user
    await repo.upsertUser({
      telegramId: userId,
      payeeType: 'uen',
      payeeValue: '201234567B',
      displayName: 'Renamed User',
      timestamp: '2024-02-02T00:00:00Z',
    });

    // The users row changed…
    const updatedUser = await repo.getUser(userId);
    expect(updatedUser!.payeeType).toBe('uen');
    expect(updatedUser!.payeeValue).toBe('201234567B');

    // …but the payment keeps its snapshot: payee columns and embedded payload
    // are byte-for-byte identical
    const after = await repo.getPaymentByRef(ref);
    expect(after!.payeeType).toBe('mobile');
    expect(after!.payeeValue).toBe('+6591234567');
    expect(after!.qrPayload).toBe(before!.qrPayload);
    expect(after!.amountCents).toBe(2500);
    expect(after!.description).toBe('Team photo');
    expect(after!.ref).toBe(ref);

    // And the payload still encodes the ORIGINAL payee + merchant name
    expect(after!.qrPayload).toContain('+6591234567');
    expect(after!.qrPayload).toContain('ACME PTE LTD');
    expect(after!.qrPayload).not.toContain('201234567B');
    expect(after!.qrPayload).not.toContain('Renamed User');
  });
});
