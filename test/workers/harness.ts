import type { D1Database } from '@cloudflare/workers-types';
import type { Update } from 'grammy/types';

/**
 * Shared Workers-pool e2e harness for bot-level tests.
 *
 * Provides:
 * - applyTestSchema(): idempotent D1 table creation (mirrors drizzle migrations)
 * - TelegramStub: grammY `client.fetch` stub that captures outbound API calls,
 *   including the attach://-indirected multipart file uploads grammY emits
 * - Update builders that include the bot_command entity grammY's
 *   bot.command() requires to match
 * - bmpToRgba(): decode the pure-JS isolate BMP renderer output for jsQR
 *
 * See AGENTS.md "Workers e2e Bot Harness" for the runtime gotchas this encodes.
 */

// ---------------------------------------------------------------------------
// Schema
// ---------------------------------------------------------------------------

const TEST_SCHEMA_STATEMENTS = [
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
  `CREATE INDEX IF NOT EXISTS idx_paybacks_ref ON paybacks(ref)`,
];

export async function applyTestSchema(db: D1Database): Promise<void> {
  for (const stmt of TEST_SCHEMA_STATEMENTS) {
    await db.prepare(stmt).run();
  }
}

// ---------------------------------------------------------------------------
// grammY bot info (skips the getMe bootstrap when passed to Bot config)
// ---------------------------------------------------------------------------

export const TEST_BOT_INFO = {
  id: 777000,
  is_bot: true,
  first_name: 'Test Bot',
  username: 'event_paynow_bot',
  can_join_groups: true,
  can_read_all_group_messages: false,
  supports_inline_queries: false,
};

// ---------------------------------------------------------------------------
// Telegram API fetch stub
// ---------------------------------------------------------------------------

export interface CapturedSend {
  chatId: string;
  text: string;
  replyMarkup?: Record<string, unknown>;
  parseMode?: string;
}

export interface CapturedPhoto {
  chatId: string;
  caption: string;
  filename: string;
  bytes: Uint8Array;
  replyMarkup?: { inline_keyboard: Array<Array<{ text: string; callback_data?: string }>> };
}

export interface CapturedEdit {
  chatId: string;
  text: string;
  replyMarkup?: { inline_keyboard: Array<Array<{ text: string; callback_data?: string }>> };
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
  throw new Error('unsupported request body type in Telegram fetch stub');
}

/**
 * Parse grammY's hand-rolled multipart stream into named fields.
 * Headers look like: content-disposition:form-data;name="photo";filename=x.bmp
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

/**
 * Captures every outbound Telegram API call a grammY Bot makes when driven
 * via handleUpdate. Pass `stub.fetch` as `client.fetch` in the Bot config.
 */
export class TelegramStub {
  sentMessages: CapturedSend[] = [];
  sentPhotos: CapturedPhoto[] = [];
  editedMessages: CapturedEdit[] = [];
  callbackAnswers: string[] = [];
  otherCalls: { method: string; body: string }[] = [];

  private messageId = 1000;

  reset(): void {
    this.sentMessages = [];
    this.sentPhotos = [];
    this.editedMessages = [];
    this.callbackAnswers = [];
    this.otherCalls = [];
  }

  /** Last captured sendMessage text (convenience for step assertions). */
  lastText(): string {
    return this.sentMessages[this.sentMessages.length - 1]?.text ?? '';
  }

  fetch = async (url: string | URL, init?: RequestInit): Promise<Response> => {
    const u = String(url);
    const method = u.split('/').pop()?.split('?')[0] ?? '';

    if (method === 'sendMessage') {
      const body = JSON.parse(String(init?.body)) as {
        chat_id: number | string;
        text: string;
        parse_mode?: string;
        reply_markup?: Record<string, unknown>;
      };
      this.sentMessages.push({
        chatId: String(body.chat_id),
        text: body.text,
        replyMarkup: body.reply_markup,
        parseMode: body.parse_mode,
      });
      this.messageId += 1;
      return this.ok(this.message(this.messageId, String(body.chat_id)));
    }

    if (method === 'sendPhoto') {
      const headers = new Headers(init?.headers as HeadersInit | undefined);
      const boundaryMatch = /boundary=([^\s;]+)/.exec(headers.get('content-type') ?? '');
      if (!boundaryMatch?.[1]) {
        throw new Error(`sendPhoto without multipart boundary: ${headers.get('content-type')}`);
      }
      const fields = parseMultipart(await collectBody(init?.body), boundaryMatch[1]);

      // grammY uploads files via attach:// indirection: the `photo` part holds
      // `attach://<token>` and the bytes arrive as a separate part named <token>.
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

      const chatId = fields.chat_id?.value ?? '0';
      const replyMarkupRaw = fields.reply_markup?.value;
      let replyMarkup: CapturedPhoto['replyMarkup'] | undefined;
      if (replyMarkupRaw) {
        try {
          replyMarkup = JSON.parse(replyMarkupRaw);
        } catch {
          /* ignore malformed reply_markup */
        }
      }
      this.sentPhotos.push({
        chatId,
        caption: fields.caption?.value ?? '',
        filename: photoName,
        bytes: photoBytes,
        replyMarkup,
      });
      this.messageId += 1;
      return this.ok(this.message(this.messageId, chatId));
    }

    if (method === 'editMessageText') {
      const body = JSON.parse(String(init?.body)) as {
        chat_id: number | string;
        text: string;
        reply_markup?: CapturedEdit['replyMarkup'];
      };
      this.editedMessages.push({
        chatId: String(body.chat_id),
        text: body.text,
        replyMarkup: body.reply_markup,
      });
      this.messageId += 1;
      return this.ok(this.message(this.messageId, String(body.chat_id)));
    }

    if (method === 'answerCallbackQuery') {
      const body = JSON.parse(String(init?.body)) as { text?: string };
      this.callbackAnswers.push(body.text ?? '');
      return this.ok(true);
    }

    this.otherCalls.push({ method, body: String(init?.body ?? '') });
    return this.ok(true);
  };

  private ok(result: unknown): Response {
    return new Response(JSON.stringify({ ok: true, result }), {
      headers: { 'content-type': 'application/json' },
    });
  }

  private message(id: number, chatId: string): Record<string, unknown> {
    return {
      message_id: id,
      date: Math.floor(Date.now() / 1000),
      chat: { id: Number(chatId), type: 'private' },
    };
  }
}

// ---------------------------------------------------------------------------
// Update builders
// ---------------------------------------------------------------------------

/** Private-chat text message update; commands include the bot_command entity. */
export function textUpdate(userId: number, text: string, updateId = 1): Update {
  const message: Record<string, unknown> = {
    message_id: updateId,
    date: Math.floor(Date.now() / 1000),
    chat: { id: userId, type: 'private' },
    from: { id: userId, is_bot: false, first_name: 'Test User' },
    text,
  };
  if (text.startsWith('/')) {
    message.entities = [{ type: 'bot_command', offset: 0, length: text.split(' ')[0]!.length }];
  }
  return { update_id: updateId, message } as Update;
}

/** Callback-query update (inline button press) on a message in the chat. */
export function callbackUpdate(
  userId: number,
  data: string,
  sourceMessageId = 500,
  updateId = 2
): Update {
  return {
    update_id: updateId,
    callback_query: {
      id: `cb-${updateId}`,
      from: { id: userId, is_bot: false, first_name: 'Test User' },
      chat_instance: 'ci',
      data,
      message: {
        message_id: sourceMessageId,
        date: Math.floor(Date.now() / 1000),
        chat: { id: userId, type: 'private' },
        from: { id: userId, is_bot: false, first_name: 'Test User' },
        text: 'source message',
      },
    },
  } as unknown as Update;
}

// ---------------------------------------------------------------------------
// BMP → RGBA so jsQR can decode the isolate-rendered QR
// ---------------------------------------------------------------------------

export function bmpToRgba(bytes: Uint8Array): {
  data: Uint8ClampedArray;
  width: number;
  height: number;
} {
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
      data[j] = bytes[i + 2] ?? 0; // R
      data[j + 1] = bytes[i + 1] ?? 0; // G
      data[j + 2] = bytes[i] ?? 0; // B
      data[j + 3] = 255; // A
    }
  }
  return { data, width, height };
}
