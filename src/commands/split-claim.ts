import type { Context } from 'grammy';
import { InlineKeyboard, InputFile } from 'grammy';
import { CLAIM_TTL_MS, type Claim, type SplitDirectory } from '../db/split-repository';
import {
  SPLIT_CLAIM_COLLECTED,
  SPLIT_QR_DM,
  sgDay,
  type UsageCounter,
} from '../db/usage-repository';
import { formatCents } from '../sgqr/amount';
import { renderQrPng } from '../sgqr/qr-render';

/** Waiting QRs: a mentioned person the bot could not message yet gets a "Get my QR" button. */

const sgd = (cents: number) => `SGD ${formatCents(cents)}`;

/** Add one to each metric for today. Best effort: counting must never affect the user, and logs nothing. */
export async function countAll(counter: UsageCounter | undefined, metrics: string[]) {
  if (!counter) return;
  const day = sgDay();
  for (const metric of metrics) {
    try {
      await counter.increment(metric, day);
    } catch {
      // swallowed on purpose
    }
  }
}

/** The text under a QR sent by direct message, and the lines drawn on the image. */
export function directMessage(organiser: string, cents: number, description: string | null) {
  const what = `${sgd(cents)}${description ? ` (${description})` : ''}`;
  return {
    lines: [...(description ? [description] : []), sgd(cents)],
    caption:
      // An empty organiser name marks the organiser's own share
      `${organiser ? `${organiser} asks you for ${what}` : `Your share: ${what}`}.\n\n` +
      'Scan with your banking app. Check the payee name before you pay.',
  };
}

/** 16 random characters, safe in a Telegram start payload. */
export function newToken(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(12));
  return btoa(String.fromCharCode(...bytes))
    .replace(/\+/g, '-')
    .replace(/\//g, '_');
}

export const newExpiry = (now: Date = new Date()) =>
  new Date(now.getTime() + CLAIM_TTL_MS).toISOString();

/** The one waiting message: who is still to collect, with a button each. */
export function waitingMessage(claims: Claim[], botUsername: string | undefined) {
  if (claims.length === 0) return { text: 'Everyone has their QR.', markup: undefined };
  const text =
    'Waiting for their QR. Tap your button to get it by direct message:\n' +
    claims.map((c) => `• ${c.name}: ${sgd(c.amountCents)}`).join('\n');
  if (!botUsername) return { text, markup: undefined };
  const markup = new InlineKeyboard();
  for (const c of claims) {
    markup.url(`Get my QR: ${c.name}`, `https://t.me/${botUsername}?start=claim_${c.token}`).row();
  }
  return { text, markup };
}

/** Save the claims, post the waiting message, and remember its id on them. */
export async function postWaiting(
  ctx: Context,
  directory: SplitDirectory,
  claims: Omit<Claim, 'messageId'>[],
  botUsername: string | undefined
): Promise<void> {
  if (claims.length === 0 || !ctx.chat) return;
  for (const c of claims) await directory.createClaim(c);
  const { text, markup } = waitingMessage(
    claims.map((c) => ({ ...c, messageId: null })),
    botUsername
  );
  const sent = await ctx.reply(text, markup ? { reply_markup: markup } : undefined);
  await directory.setClaimsMessage(
    claims.map((c) => c.token),
    sent.message_id
  );
}

/** `/start claim_<token>` in a private chat: check it is the right person, send the QR once. */
export async function collectClaim(
  ctx: Context,
  directory: SplitDirectory,
  token: string,
  botUsername: string | undefined,
  counter?: UsageCounter
): Promise<void> {
  const from = ctx.from;
  if (!from) return;
  const claim = await directory.getClaim(token);
  if (!claim) {
    await ctx.reply('That request has expired or was already collected.');
    return;
  }
  const mine =
    claim.userId !== null
      ? claim.userId === from.id
      : claim.username !== null && from.username?.toLowerCase() === claim.username;
  if (!mine) {
    await ctx.reply('This QR is for someone else.');
    return;
  }
  // Delete first: of two taps at once, only one wins and sends
  if (!(await directory.deleteClaim(token))) {
    await ctx.reply('That request has expired or was already collected.');
    return;
  }
  const { lines, caption } = directMessage(claim.organiser, claim.amountCents, claim.description);
  try {
    const image = await renderQrPng(claim.payload, lines);
    await ctx.replyWithPhoto(new InputFile(image, 'paynow-qr.bmp'), { caption });
  } catch {
    await ctx.reply('Could not make the QR. Ask the organiser to send /split again.');
    return;
  }
  await countAll(counter, [SPLIT_CLAIM_COLLECTED, SPLIT_QR_DM]);
  if (from.username) await directory.saveContact(from.username.toLowerCase(), from.id);
  if (claim.messageId !== null) {
    const left = await directory.claimsForMessage(claim.chatId, claim.messageId);
    const { text, markup } = waitingMessage(left, botUsername);
    await ctx.api
      .editMessageText(claim.chatId, claim.messageId, text, markup ? { reply_markup: markup } : {})
      .catch(() => undefined); // the message may be gone: not our problem
  }
}
