import type { Context } from 'grammy';
import { InlineKeyboard } from 'grammy';
import { DEFAULT_IDLE_MINUTES } from '../worker/conversation-do';

/**
 * What the Simple and Event bots say when someone taps a button of a conversation that is no longer
 * open, or types into one. "No conversation is open" reads the same whether it timed out, finished
 * or was cancelled (nothing is kept to tell them apart), so the text names all three. The minutes are
 * the Durable Object's own default, so the text cannot disagree with the real time. (Telegram cuts a
 * popup at 200 characters; every text built here is well under that.)
 */

export function closedRequestText(command: string, then = 'start again'): string {
  return `This request is no longer open: it finished, was cancelled, or timed out after ${DEFAULT_IDLE_MINUTES} minutes without an answer. Send ${command} to ${then}.`;
}

/** Answer the tap with a popup that stays until dismissed. */
export async function closedRequestAnswer(
  ctx: Context,
  command: string,
  then?: string
): Promise<void> {
  await ctx.answerCallbackQuery({ text: closedRequestText(command, then), show_alert: true });
}

/** The popup, and the buttons go from the tapped message so a dead button cannot be tapped again. */
export async function closedRequestTap(
  ctx: Context,
  command: string,
  then?: string
): Promise<void> {
  await closedRequestAnswer(ctx, command, then);
  await ctx.editMessageReplyMarkup({ reply_markup: new InlineKeyboard() }).catch(() => undefined);
}

/** The Simple bot's reply to typed text when no request is open. */
export const SIMPLE_NO_REQUEST = `No QR is being made. Send /start to make one. (A request is forgotten after ${DEFAULT_IDLE_MINUTES} minutes without an answer.)`;

/** The Event bot's reply to typed text in a private chat when no conversation is open. */
export const EVENT_NOTHING_WAITING = `Nothing is waiting for an answer. Send /help to see what I can do. (A request is forgotten after ${DEFAULT_IDLE_MINUTES} minutes without an answer.)`;
