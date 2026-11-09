import type { Context } from 'grammy';
import { InlineKeyboard, InputFile } from 'grammy';
import { detectProxyType } from '../db/proxy-validation';
import {
  SIMPLE_AMOUNT_EDITABLE,
  SIMPLE_AMOUNT_FIXED,
  SIMPLE_AMOUNT_SKIPPED,
  SIMPLE_QR,
  sgDay,
  type UsageCounter,
} from '../db/usage-repository';
import { formatCents, parseAmount } from '../sgqr/amount';
import { buildPayNowPayload, truncateAnsi } from '../sgqr/paynow';
import { renderQrPng } from '../sgqr/qr-render';
import type { ConversationDO, ConversationState } from '../worker/conversation-do';

/** Steps of the `simple` flow. */
const PAYEE = 1;
const AMOUNT = 2;
const EDITABLE = 3; // only asked when an amount was given
const DESCRIPTION = 4;
const CONFIRM = 5; // summary with Confirm / Cancel; the QR is made only after Confirm

const MAX_DESCRIPTION = 25;

export const SIMPLE_HELP =
  'Simple PayNow Bot makes a PayNow QR code.\n\n' +
  '/start - make a QR: payee, then an optional amount, then an optional description\n' +
  '/cancel - stop\n\n' +
  'The QR never shows the payee number. Check the payee name in your banking app when you scan it. ' +
  'Descriptions can be up to 25 characters; symbols a QR cannot carry are dropped.';

/** Everything the user entered, for the confirmation step. The payee number is shown here only. */
function summary(c: Record<string, unknown>): string {
  const cents = c.amountCents as number | undefined;
  const lines = [
    'Please check your PayNow QR details:',
    '',
    `Payee: ${c.payeeType === 'uen' ? 'UEN' : 'Mobile'} ${c.payeeValue as string}`,
    cents === undefined ? 'Amount: set by payer' : `Amount: SGD ${formatCents(cents)}`,
  ];
  if (cents !== undefined) lines.push(`Payer can change the amount: ${c.editable ? 'Yes' : 'No'}`);
  lines.push(`Description: ${(c.description as string | undefined) ?? 'none'}`);
  return lines.join('\n');
}

const skip = (data: string) => new InlineKeyboard().text('Skip', data);

/** The amount line shared by the picture and the caption (never the payee number). */
function amountLine(amountCents: number | undefined, editable: boolean): string {
  if (amountCents === undefined) return 'Amount: set by payer';
  return `SGD ${formatCents(amountCents)}${editable ? ' (payer can change)' : ''}`;
}

/**
 * Simple_PayNow_Bot conversation: payee -> amount -> (payer may change it?) -> description -> QR.
 * Private chats only (the bot factory guards that), so there is one user per conversation and no
 * owner tracking. Nothing is persisted: answers live in the DO state until the QR is sent.
 */
export class SimpleCommandHandler {
  /** `counter` records anonymous daily counts after a QR is sent; absent in tests that do not need it. */
  constructor(
    private readonly conversationDO: ConversationDO,
    private readonly counter?: UsageCounter
  ) {}

  async start(ctx: Context): Promise<void> {
    await this.setState({ flow: 'simple', step: PAYEE, context: {} });
    await ctx.reply('Who should be paid? Send a Singapore mobile number or a UEN.');
  }

  async cancel(ctx: Context): Promise<void> {
    const state = await this.getState();
    if (state.flow !== 'simple') {
      await ctx.reply('Nothing to cancel.');
      return;
    }
    await this.setState({ flow: 'idle', step: 0, context: {} });
    await ctx.reply('Cancelled. Nothing was created.');
  }

  /** Free text; false when it is not part of a simple conversation (caller ignores it). */
  async handleText(ctx: Context): Promise<boolean> {
    const text = ctx.message?.text?.trim() ?? '';
    const state = await this.getState();
    if (state.flow !== 'simple') return false;

    if (state.step === PAYEE) {
      const payee = detectProxyType(text);
      if (!payee) {
        await ctx.reply(
          'That is not a valid payee. Send a Singapore mobile number (e.g. 91234567 or +6591234567) or a UEN (9 to 13 letters and digits).'
        );
        return true;
      }
      await this.setState({
        flow: 'simple',
        step: AMOUNT,
        context: { payeeType: payee.type, payeeValue: payee.normalized },
      });
      await ctx.reply(
        'How much, in SGD (e.g. 12.50)? Tap Skip to let the payer key in the amount.',
        { reply_markup: skip('simple_skip_amount') }
      );
      return true;
    }

    if (state.step === AMOUNT) {
      const cents = parseAmount(text);
      if (cents === null) {
        await ctx.reply('Send a positive amount with up to 2 decimals, e.g. 12.50.');
        return true;
      }
      await this.askEditable(ctx, state, cents);
      return true;
    }

    if (state.step === EDITABLE) {
      await ctx.reply('Please tap Yes or No.');
      return true;
    }

    if (state.step === DESCRIPTION) {
      const description = truncateAnsi(text, 1000); // what the QR can actually carry
      if (!description) {
        await ctx.reply('Send a short description using letters, numbers or common symbols.');
        return true;
      }
      if (description.length > MAX_DESCRIPTION) {
        await ctx.reply(`Keep the description to ${MAX_DESCRIPTION} characters or fewer.`);
        return true;
      }
      await this.askConfirm(ctx, state, description);
      return true;
    }

    if (state.step === CONFIRM) {
      await ctx.reply('Please tap Confirm or Cancel on the summary above.');
      return true;
    }
    return false;
  }

  /** Button taps; false when the data is not ours. */
  async handleCallback(ctx: Context, data: string): Promise<boolean> {
    if (!data.startsWith('simple_')) return false;
    const state = await this.getState();
    const step = state.flow === 'simple' ? state.step : 0;
    const expected =
      data === 'simple_skip_amount'
        ? AMOUNT
        : data === 'simple_edit_yes' || data === 'simple_edit_no'
          ? EDITABLE
          : data === 'simple_skip_description'
            ? DESCRIPTION
            : data === 'simple_confirm' || data === 'simple_cancel'
              ? CONFIRM
              : -1;
    if (step !== expected) {
      await ctx.answerCallbackQuery({ text: 'That step is over.' });
      return true;
    }
    await ctx.answerCallbackQuery();

    if (data === 'simple_skip_amount') {
      // No amount: nothing to decide about editing, go straight to the description
      await this.askDescription(ctx, state, {});
    } else if (data === 'simple_edit_yes' || data === 'simple_edit_no') {
      await this.askDescription(ctx, state, { editable: data === 'simple_edit_yes' });
    } else if (data === 'simple_skip_description') {
      await this.askConfirm(ctx, state, undefined);
    } else if (data === 'simple_confirm') {
      await this.finish(ctx);
    } else {
      await this.setState({ flow: 'idle', step: 0, context: {} });
      await this.dropButtons(ctx);
      await ctx.reply('Cancelled. Nothing was created. Send /start to begin again.');
    }
    return true;
  }

  private async askEditable(ctx: Context, state: ConversationState, cents: number) {
    await this.setState({
      flow: 'simple',
      step: EDITABLE,
      context: { ...state.context, amountCents: cents },
    });
    await ctx.reply(`Amount: SGD ${formatCents(cents)}. Can the payer change the amount?`, {
      reply_markup: new InlineKeyboard()
        .text('Yes', 'simple_edit_yes')
        .text('No', 'simple_edit_no'),
    });
  }

  private async askDescription(
    ctx: Context,
    state: ConversationState,
    extra: { editable?: boolean }
  ) {
    await this.setState({
      flow: 'simple',
      step: DESCRIPTION,
      context: { ...state.context, ...extra },
    });
    await ctx.reply(`Add a short description (up to ${MAX_DESCRIPTION} characters), or tap Skip.`, {
      reply_markup: skip('simple_skip_description'),
    });
  }

  /** Store the description (if any) and show everything entered, for the user to confirm. */
  private async askConfirm(
    ctx: Context,
    state: ConversationState,
    description: string | undefined
  ) {
    const context = { ...state.context, ...(description ? { description } : {}) };
    await this.setState({ flow: 'simple', step: CONFIRM, context });
    await ctx.reply(summary(context), {
      reply_markup: new InlineKeyboard()
        .text('✅ Confirm', 'simple_confirm')
        .text('❌ Cancel', 'simple_cancel'),
    });
  }

  /** Take the buttons off the summary once it has been answered (best effort). */
  private async dropButtons(ctx: Context): Promise<void> {
    await ctx.editMessageReplyMarkup().catch(() => undefined);
  }

  /** Claim the conversation (exactly once, and the state is wiped), then build and send the QR. */
  private async finish(ctx: Context): Promise<void> {
    const claimed = await this.conversationDO.fetch(
      new Request('http://localhost/claim', {
        method: 'POST',
        body: JSON.stringify({ flow: 'simple', step: CONFIRM }),
      })
    );
    if (claimed.status !== 200) {
      await claimed.body?.cancel();
      return; // a double tap: the other tap is already sending the QR
    }
    const state = (await claimed.json()) as ConversationState;
    await this.dropButtons(ctx);
    const c = state.context;
    const description = c.description as string | undefined;
    const amountCents = c.amountCents as number | undefined;
    const editable = amountCents === undefined || c.editable === true;

    let sent = false;
    try {
      const payload = buildPayNowPayload({
        proxyType: c.payeeType as 'mobile' | 'uen',
        proxyValue: c.payeeValue as string,
        ...(amountCents !== undefined ? { amountCents } : {}),
        editable,
        ...(description ? { description } : {}),
      });
      const lines = [...(description ? [description] : []), amountLine(amountCents, editable)];
      const image = await renderQrPng(payload, lines);
      await ctx.replyWithPhoto(new InputFile(image, 'paynow-qr.bmp'), {
        caption: `${lines.join('\n')}\n\nScan with your banking app. Check the payee name before you pay. Send /start for another QR.`,
      });
      sent = true;
    } catch {
      // No console logging: the answers are payee numbers
      await ctx.reply('Could not make the QR. Please send /start to try again.');
    }
    if (sent) await this.count(amountCents, c.editable === true);
  }

  /**
   * Anonymous daily counts: one QR, and which amount choice was made. Best effort: a failure here
   * must never affect the user (the QR is already sent) and nothing is logged.
   */
  private async count(amountCents: number | undefined, payerMayChange: boolean): Promise<void> {
    if (!this.counter) return;
    const day = sgDay();
    const choice =
      amountCents === undefined
        ? SIMPLE_AMOUNT_SKIPPED
        : payerMayChange
          ? SIMPLE_AMOUNT_EDITABLE
          : SIMPLE_AMOUNT_FIXED;
    try {
      await this.counter.increment(SIMPLE_QR, day);
      await this.counter.increment(choice, day);
    } catch {
      // swallowed on purpose
    }
  }

  private async getState(): Promise<ConversationState> {
    const response = await this.conversationDO.fetch(new Request('http://localhost/state'));
    return (await response.json()) as ConversationState;
  }

  private async setState(state: Pick<ConversationState, 'flow' | 'step' | 'context'>) {
    const response = await this.conversationDO.fetch(
      new Request('http://localhost/state', { method: 'POST', body: JSON.stringify(state) })
    );
    await response.body?.cancel();
  }
}
