import type { Repository, PaymentStatus, ReceiptSource } from './repository';

/**
 * Payment service - single entry point for payment status transitions.
 * All payment state changes must go through this service.
 */

export interface PaymentService {
  /**
   * Mark a payment as received.
   * This is the single entry point for all payment status transitions.
   * 
   * @param ref - Payment reference
   * @param source - Source of the status change ('manual' or 'notification')
   * @returns The updated payment, or null if payment not found
   */
  markPaymentReceived(ref: string, source: ReceiptSource): Promise<Payment | null>;
}

export interface Payment {
  ref: string;
  userId: string;
  amount: number;
  status: PaymentStatus;
  source: ReceiptSource | null;
  receivedAt: string | null;
  createdAt: string;
}

export function createPaymentService(repo: Repository): PaymentService {
  return {
    async markPaymentReceived(ref: string, source: ReceiptSource): Promise<Payment | null> {
      const payment = await repo.getPaymentByRef(ref);
      
      // Payment not found
      if (!payment) {
        return null;
      }
      
      // Already received - duplicate request
      if (payment.status === 'received') {
        return null;
      }
      
      // Update payment status
      const now = new Date().toISOString();
      await repo.updatePayment(ref, {
        status: 'received',
        source,
        receivedAt: now,
      });
      
      // Fetch and return updated payment
      const updated = await repo.getPaymentByRef(ref);
      if (!updated) {
        throw new Error(`Payment ${ref} disappeared after update`);
      }
      
      return updated;
    },
  };
}
