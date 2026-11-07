import type { Context } from 'grammy';
import { InlineKeyboard } from 'grammy';
import { ConversationDO, type ConversationState } from '../worker/conversation-do.js';
import { detectProxyType } from '../db/proxy-validation.js';
import { formatCents } from '../sgqr/amount.js';
import type { Repository, Payment } from '../db/repository.js';

/**
 * /payback command handler - initiates payback flow for a payment
 * 
 * Flow:
 * 1. User sends /payback <ref>
 * 2. Bot verifies payment exists and belongs to user
 * 3. Bot prompts for payer's PayNow reference (mobile/UEN)
 * 4. User provides payer reference
 * 5. Bot validates and echoes for confirmation
 * 6. User confirms
 * 7. Bot prompts for payback amount (default to original amount)
 * 8. User provides amount
 * 9. Bot validates amount and generates payback QR
 * 10. Bot sends QR and stores payback record
 */

export class PaybackCommandHandler {
  private conversationDO: ConversationDO;
  private repository: Repository;

  constructor(conversationDO: ConversationDO, repository: Repository) {
    this.conversationDO = conversationDO;
    this.repository = repository;
  }

  /**
   * Handle /payback command with payment reference
   */
  async start(ctx: Context, paymentRef?: string): Promise<void> {
    const userId = ctx.from!.id;

    if (!paymentRef) {
      await ctx.reply('❌ Please provide a payment reference.\n\nUsage: /payback <ref>\n\nUse /payments to see your payment references.');
      return;
    }

    try {
      // Verify payment exists and belongs to user
      const payment = await this.repository.getPaymentByRef(paymentRef);
      
      if (!payment) {
        await ctx.reply(`❌ Payment with reference \`${paymentRef}\` not found.`, { parse_mode: 'Markdown' });
        return;
      }

      if (payment.userId !== userId) {
        await ctx.reply('❌ You do not own this payment.');
        return;
      }

      if (payment.status !== 'received') {
        await ctx.reply('⚠️ You can only create paybacks for received payments.');
        return;
      }

      // Initialize conversation state for payback flow
      await this.setState({
        flow: 'payback',
        step: 1, // waiting for payer reference
        context: { 
          paymentRef,
          paymentAmount: payment.amountCents,
          paymentDescription: payment.description
        },
        lastActivity: new Date().toISOString()
      });

      await ctx.reply(
        `💸 *Payback for Payment*\n\n` +
        `Reference: \`${paymentRef}\`\n` +
        `Amount: $${formatCents(payment.amountCents)}\n` +
        `Description: ${payment.description}\n\n` +
        `Please enter the payer's PayNow reference (mobile number or UEN):`,
        { parse_mode: 'Markdown' }
      );

    } catch (error) {
      console.error('Failed to start payback:', error);
      await ctx.reply('❌ Failed to start payback flow. Please try again.');
    }
  }

  /**
   * Handle user input during payback flow
   */
  async handleInput(ctx: Context): Promise<boolean> {
    const state = await this.getState();
    
    if (!state || state.flow !== 'payback') {
      return false; // Not in payback flow
    }

    const text = ctx.message?.text?.trim();
    if (!text) {
      return true; // Still in payback flow
    }

    switch (state.step) {
      case 1:
        await this.handlePayerReferenceInput(ctx, text, state);
        break;
      case 2:
        await this.handlePayerConfirmation(ctx, text, state);
        break;
      case 3:
        await this.handleAmountInput(ctx, text, state);
        break;
      case 4:
        await this.handleAmountConfirmation(ctx, text, state);
        break;
    }

    return true; // Still in payback flow
  }

  /**
   * Step 1: Validate payer reference and echo for confirmation
   */
  private async handlePayerReferenceInput(ctx: Context, input: string, state: ConversationState): Promise<void> {
    const normalized = detectProxyType(input);

    if (!normalized) {
      await ctx.reply('❌ Invalid PayNow reference. Please enter:\n• Mobile number (8 digits, starting with 6/8/9)\n• UEN (9-13 characters)\n\nTry again:');
      return;
    }

    // Store normalized payer reference for confirmation
    await this.setState({
      flow: 'payback',
      step: 2,
      context: {
        ...state.context,
        pendingPayer: normalized
      },
      lastActivity: new Date().toISOString()
    });

    const typeLabel = normalized.type === 'mobile' ? 'Mobile number' : 'UEN';
    await ctx.reply(`📱 Payer ${typeLabel}: ${normalized.normalized}\n\nType "confirm" to continue, or "cancel" to abort:`);
  }

  /**
   * Step 2: Handle payer confirmation
   */
  private async handlePayerConfirmation(ctx: Context, input: string, state: ConversationState): Promise<void> {
    if (input.toLowerCase() === 'confirm') {
      const paymentAmount = state.context.paymentAmount as number;
      
      await this.setState({
        flow: 'payback',
        step: 3,
        context: state.context,
        lastActivity: new Date().toISOString()
      });

      await ctx.reply(
        `💵 Enter payback amount (in dollars):\n\n` +
        `Original payment: $${formatCents(paymentAmount)}\n` +
        `Maximum payback: $${formatCents(paymentAmount)}\n\n` +
        `You can enter a partial amount or the full amount.`,
        { parse_mode: 'Markdown' }
      );
    } else if (input.toLowerCase() === 'cancel') {
      await this.setState({
        flow: 'idle',
        step: 0,
        context: {},
        lastActivity: new Date().toISOString()
      });
      await ctx.reply('❌ Payback cancelled.');
    } else {
      await ctx.reply('Please type "confirm" to continue or "cancel" to abort:');
    }
  }

  /**
   * Step 3: Validate amount and echo for confirmation
   */
  private async handleAmountInput(ctx: Context, input: string, state: ConversationState): Promise<void> {
    const paymentAmount = state.context.paymentAmount as number;
    const amountDollars = parseFloat(input);

    if (isNaN(amountDollars) || amountDollars <= 0) {
      await ctx.reply('❌ Invalid amount. Please enter a positive number.\n\nTry again:');
      return;
    }

    const amountCents = Math.round(amountDollars * 100);
    
    if (amountCents > paymentAmount) {
      await ctx.reply(
        `❌ Payback amount ($${formatCents(amountCents)}) exceeds original payment amount ($${formatCents(paymentAmount)}).\n\n` +
        `Please enter a smaller amount:`
      );
      return;
    }

    // Store amount for confirmation
    await this.setState({
      flow: 'payback',
      step: 4,
      context: {
        ...state.context,
        paybackAmount: amountCents
      },
      lastActivity: new Date().toISOString()
    });

    await ctx.reply(
      `💰 Payback amount: $${formatCents(amountCents)}\n\n` +
      `Type "confirm" to generate payback QR, or "cancel" to abort:`
    );
  }

  /**
   * Step 4: Handle amount confirmation and generate payback QR
   */
  private async handleAmountConfirmation(ctx: Context, input: string, state: ConversationState): Promise<void> {
    if (input.toLowerCase() === 'confirm') {
      await this.generatePaybackQR(ctx, state);
    } else if (input.toLowerCase() === 'cancel') {
      await this.setState({
        flow: 'idle',
        step: 0,
        context: {},
        lastActivity: new Date().toISOString()
      });
      await ctx.reply('❌ Payback cancelled.');
    } else {
      await ctx.reply('Please type "confirm" to generate payback QR or "cancel" to abort:');
    }
  }

  /**
   * Generate payback QR code and send to user
   */
  private async generatePaybackQR(ctx: Context, state: ConversationState): Promise<void> {
    try {
      const paymentRef = state.context.paymentRef as string;
      const payerProxy = state.context.pendingPayer as { type: string; normalized: string };
      const paybackAmount = state.context.paybackAmount as number;
      const paymentAmount = state.context.paymentAmount as number;
      const paymentDescription = state.context.paymentDescription as string;

      // Generate payback QR payload
      // Note: In payback, the payer becomes the payee
      // This will be implemented in task 7.3
      const paybackRef = `PB-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
      
      // For now, just acknowledge - actual QR generation in task 7.3
      await ctx.reply(
        `✅ *Payback QR Generated!*\n\n` +
        `Reference: \`${paybackRef}\`\n` +
        `Amount: $${formatCents(paybackAmount)}\n` +
        `Payer: ${payerProxy.normalized}\n` +
        `Original Payment: ${paymentRef}\n\n` +
        `_QR image will be generated in task 7.3_`,
        { parse_mode: 'Markdown' }
      );

      // Reset conversation state
      await this.setState({
        flow: 'idle',
        step: 0,
        context: {},
        lastActivity: new Date().toISOString()
      });

    } catch (error) {
      console.error('Failed to generate payback QR:', error);
      await ctx.reply('❌ Failed to generate payback QR. Please try again.');
    }
  }

  /**
   * Get conversation state from DO
   */
  private async getState(): Promise<ConversationState | null> {
    const response = await this.conversationDO.fetch(new Request('http://localhost/state', { method: 'GET' }));
    if (response.status !== 200) return null;
    return await response.json() as ConversationState;
  }

  /**
   * Set conversation state in DO
   */
  private async setState(state: ConversationState): Promise<void> {
    await this.conversationDO.fetch(new Request('http://localhost/state', {
      method: 'POST',
      body: JSON.stringify(state)
    }));
  }
}
