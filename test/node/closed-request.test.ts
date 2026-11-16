import type { Context } from 'grammy';
import { describe, expect, it, vi } from 'vitest';
import {
  closedRequestAnswer,
  closedRequestTap,
  closedRequestText,
  EVENT_NOTHING_WAITING,
  SIMPLE_NO_REQUEST,
} from '../../src/commands/closed-request';
import { DEFAULT_IDLE_MINUTES } from '../../src/worker/conversation-do';

describe('closed request wording', () => {
  it('names the command, the three ways a conversation ends and the real number of minutes', () => {
    const text = closedRequestText('/start');
    expect(text).toContain('no longer open');
    expect(text).toContain('finished, was cancelled, or timed out');
    expect(text).toContain(`${DEFAULT_IDLE_MINUTES} minutes`);
    expect(text).toContain('Send /start to start again.');
    expect(closedRequestText('/start', 'make a new QR')).toContain('Send /start to make a new QR.');
  });

  it('keeps every popup under the 200 characters Telegram allows', () => {
    for (const command of ['/init', '/start', '/payback <ref>', '/end_event', '/edit_event']) {
      expect(closedRequestText(command).length).toBeLessThan(200);
    }
    expect(closedRequestText('/start', 'make a new QR').length).toBeLessThan(200);
  });

  it('says how long a request is kept in both hints', () => {
    expect(SIMPLE_NO_REQUEST).toContain(`${DEFAULT_IDLE_MINUTES} minutes`);
    expect(SIMPLE_NO_REQUEST).toContain('/start');
    expect(EVENT_NOTHING_WAITING).toContain(`${DEFAULT_IDLE_MINUTES} minutes`);
    expect(EVENT_NOTHING_WAITING).toContain('/help');
  });
});

describe('closed request answers', () => {
  const fake = (failEdit = false) => {
    const calls: string[] = [];
    const ctx = {
      answerCallbackQuery: vi.fn(
        async (o: unknown) => void calls.push(`answer:${JSON.stringify(o)}`)
      ),
      editMessageReplyMarkup: vi.fn(async (o: unknown) => {
        calls.push(`markup:${JSON.stringify(o)}`);
        if (failEdit) throw new Error('message is too old');
      }),
    } as unknown as Context;
    return { ctx, calls };
  };

  it('answers a popup that stays until dismissed, then clears the keyboard', async () => {
    const { ctx, calls } = fake();
    await closedRequestTap(ctx, '/start');
    expect(calls[0]).toContain('"show_alert":true');
    expect(calls[0]).toContain('Send /start to start again.');
    expect(calls[1]).toContain('"inline_keyboard":[[]]'); // grammY's empty keyboard
  });

  it('is not undone by a message that can no longer be edited', async () => {
    const { ctx, calls } = fake(true);
    await expect(closedRequestTap(ctx, '/init')).resolves.toBeUndefined();
    expect(calls).toHaveLength(2);
  });

  it('can answer the popup alone, for handlers that already replaced the message', async () => {
    const { ctx, calls } = fake();
    await closedRequestAnswer(ctx, '/end_event');
    expect(calls).toHaveLength(1);
    expect(calls[0]).toContain('"show_alert":true');
  });
});
