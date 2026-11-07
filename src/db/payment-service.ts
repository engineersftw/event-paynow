import type { Repository, Payment, PaymentStatus, ReceiptSource } from './repository';

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
   * @returns The updated payment, or null if payment not found or already received
   */
  markPaymentReceived(ref: string, source: ReceiptSource): Promise<Payment | null>;
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
      
      // Update payment status through the repository (single transition entry point)
      const now = new Date().toISOString();
      const status: PaymentStatus = 'received';
      const updated = await repo.updatePaymentStatus(ref, status, source, now);
      if (!updated) {
        throw new Error(`Payment ${ref} disappeared during update`);
      }
      
      return updated;
    },
  };
}
