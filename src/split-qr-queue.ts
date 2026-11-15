import { Api, GrammyError } from 'grammy';
import { qrPhoto } from './commands/qr-photo';
import { countAll, D1UsageRepository, SPLIT_QR_CHAT } from './db/usage-repository';
import type { Env } from './env';

/**
 * Split_PayNow_Bot QRs are posted through a Cloudflare Queue, one message per QR, so a split with
 * many amounts never runs into the 30 seconds Cloudflare gives a background update, and a QR that
 * Telegram refuses for a moment is tried again instead of being lost. A message holds the QR data
 * (payee, amount, description) and the names it is for until it is posted or given up; it is
 * never logged.
 */
export const SPLIT_QR_QUEUE = 'split-qr-sends';
export const MAX_ATTEMPTS = 5;

export interface SplitQrMessage {
  v: 1;
  chatId: number;
  /** Forum topic to post into, when the split runs in one. */
  threadId?: number;
  /** The SGQR payload the QR encodes. */
  payload: string;
  /** The text under the QR: description, amount, names. */
  lines: string[];
  caption: string;
  /** Amount and names, for the notice when the QR is finally not sent ("SGD 30.00 Bob"). */
  label: string;
}

export async function queueSplitQrs(queue: Queue<SplitQrMessage>, messages: SplitQrMessage[]) {
  await queue.sendBatch(messages.map((body) => ({ body })));
}

type QueuedQr = Pick<Message<SplitQrMessage>, 'body' | 'attempts' | 'ack' | 'retry'>;

/** The queue consumer: post each QR on its own, retry what may work later, report what never will. */
export async function handleSplitQrBatch(
  batch: { messages: readonly QueuedQr[] },
  env: Env,
  fetchFn?: typeof fetch
): Promise<void> {
  const token = env.SPLIT_BOT_TOKEN;
  if (!token) {
    console.error('split qr queue: no SPLIT_BOT_TOKEN, dropping the batch');
    for (const msg of batch.messages) msg.ack();
    return;
  }
  const api = new Api(token, fetchFn ? { fetch: fetchFn } : undefined);
  const counter = new D1UsageRepository(env.paynow_db);
  for (const msg of batch.messages) await sendOne(api, counter, msg);
}

async function sendOne(api: Api, counter: D1UsageRepository, msg: QueuedQr): Promise<void> {
  const { chatId, threadId, payload, lines, caption, label } = msg.body;
  const where = threadId ? { message_thread_id: threadId } : {};
  try {
    await api.sendPhoto(chatId, await qrPhoto(payload, lines), { caption, ...where });
    msg.ack();
    await countAll(counter, [SPLIT_QR_CHAT]);
    return;
  } catch (error) {
    const tg = error instanceof GrammyError ? error : undefined;
    // The error code and Telegram's description only: never the QR data or names
    console.error(
      `split qr send failed (attempt ${msg.attempts}): ${
        tg
          ? `${tg.error_code} ${tg.description}`
          : (error instanceof Error ? error.message : String(error)).slice(0, 200)
      }`
    );
    // 400 (chat not found) and 403 (the bot was removed or blocked) will not get better
    if (tg && (tg.error_code === 400 || tg.error_code === 403)) {
      msg.ack();
      return;
    }
    if (msg.attempts < MAX_ATTEMPTS) {
      const delaySeconds =
        tg?.error_code === 429 ? (tg.parameters.retry_after ?? 5) : 2 ** msg.attempts;
      msg.retry({ delaySeconds });
      return;
    }
    msg.ack();
    await api
      .sendMessage(
        chatId,
        `Could not send the QR for ${label}. Please send /split to try again.`,
        where
      )
      .catch(() => undefined); // best effort: it may fail for the same reason
  }
}
