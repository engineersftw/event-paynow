import type { Bot } from 'grammy';
import type { Update } from 'grammy/types';
import jsQR from 'jsqr';
import { expect, vi } from 'vitest';
import type { Env } from '../../src/env';
import { parseAmount } from '../../src/sgqr/amount';
import { createWorkerFetch } from '../../src/worker';
import {
  bmpToRgba,
  type CapturedPhoto,
  callbackUpdate,
  photoUpdate,
  TEST_BOT_INFO,
  TelegramStub,
  textUpdate,
} from './harness';

const routes = {
  event: { path: '/webhook', secret: 'event-test-secret' },
  simple: { path: '/webhook/simple', secret: 'simple-test-secret' },
  split: { path: '/webhook/split', secret: 'split-test-secret' },
};

type BotConfig = { botInfo: typeof TEST_BOT_INFO; client: { fetch: TelegramStub['fetch'] } };
type ButtonMessage = { messageId?: number; replyMarkup?: unknown };

function callbacks(message: ButtonMessage | undefined): string[] {
  const keyboard = message?.replyMarkup as CapturedPhoto['replyMarkup'];
  return (keyboard?.inline_keyboard ?? []).flat().flatMap((b) => b.callback_data ?? []);
}

export function webhookChat(
  kind: keyof typeof routes,
  bindings: Env,
  userId: number,
  makeBot: (env: Env, config: BotConfig) => Bot
) {
  const telegram = new TelegramStub(true);
  // Pass only local bindings needed by the scenarios, even if .dev.vars exists.
  const env: Env = {
    paynow_db: bindings.paynow_db,
    CHAT_SESSION: bindings.CHAT_SESSION,
    TELEGRAM_BOT_TOKEN: 'event-test-token',
    TELEGRAM_WEBHOOK_SECRET: routes.event.secret,
    SIMPLE_BOT_TOKEN: 'simple-test-token',
    SIMPLE_WEBHOOK_SECRET: routes.simple.secret,
    SPLIT_BOT_TOKEN: 'split-test-token',
    SPLIT_WEBHOOK_SECRET: routes.split.secret,
  };
  const bot = makeBot(env, { botInfo: TEST_BOT_INFO, client: { fetch: telegram.fetch } });
  const unexpectedBot = async () => {
    throw new Error(`Request for ${kind} reached another bot provider`);
  };
  const route = createWorkerFetch({
    event: unexpectedBot,
    simple: unexpectedBot,
    split: unexpectedBot,
    [kind]: async () => bot,
  });
  let updateId = 0;

  async function post(update: Update) {
    const pending: Promise<unknown>[] = [];
    const errors = vi.spyOn(console, 'error');
    try {
      const { path, secret } = routes[kind];
      const response = await route(
        new Request(`https://bot.test${path}`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'X-Telegram-Bot-Api-Secret-Token': secret,
          },
          body: JSON.stringify(update),
        }),
        env,
        { waitUntil: (work: Promise<unknown>) => pending.push(work) } as ExecutionContext
      );
      expect(response.status).toBe(200);
      expect(await response.text()).toBe('ok');
      expect(pending.length).toBeGreaterThan(0);
      for (const work of pending) await work;
      expect(errors.mock.calls).toEqual([]);
      expect(
        telegram.otherCalls
          .map(({ method }) => method)
          .filter((method) => method !== 'editMessageReplyMarkup')
      ).toEqual([]);
    } finally {
      errors.mockRestore();
    }
  }

  return {
    telegram,
    lastText: () => telegram.lastText(),
    buttons: () => callbacks(telegram.sentMessages.at(-1)),
    say: (message: string) => post(textUpdate(userId, message, ++updateId)),
    uploadPhoto: () => post(photoUpdate(userId, userId, 'synthetic-photo', ++updateId)),
    tap(data: string, source: ButtonMessage | undefined = telegram.sentMessages.at(-1)) {
      if (source?.messageId === undefined || !callbacks(source).includes(data)) {
        throw new Error(`Button ${data} was not present on the captured message`);
      }
      return post(callbackUpdate(userId, data, source.messageId, ++updateId, 'bytes' in source));
    },
  };
}

export function qrAmount(photo: CapturedPhoto): number {
  const { data, width, height } = bmpToRgba(photo.bytes);
  const qr = jsQR(data, width, height);
  if (!qr) throw new Error('Could not decode the captured PayNow QR');
  // Read the top-level SGQR TLV fields so an amount inside a nested field cannot match.
  for (let offset = 0; offset + 4 <= qr.data.length; ) {
    const tag = qr.data.slice(offset, offset + 2);
    const length = Number(qr.data.slice(offset + 2, offset + 4));
    const end = offset + 4 + length;
    if (!Number.isInteger(length) || end > qr.data.length) break;
    if (tag === '54') {
      const cents = parseAmount(qr.data.slice(offset + 4, end));
      if (cents !== null) return cents;
      break;
    }
    offset = end;
  }
  throw new Error('Captured PayNow QR has no valid transaction amount');
}
