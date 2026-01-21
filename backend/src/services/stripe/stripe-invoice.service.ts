import Stripe from 'stripe';
import { getStripeClient } from './stripe-client';
import { logger } from '../../utils/logger';
import { BadRequestError, NotFoundError } from '../../utils/AppError';

/**
 * Stripe Invoice Service
 *
 * Handles invoice operations:
 * - Listing invoices for a customer
 * - Retrieving invoice details
 * - Getting upcoming invoices
 * - Previewing subscription updates
 * - Retrying failed payments
 * - Enterprise invoice management
 */
class StripeInvoiceService {
  /**
   * List invoices for a customer
   * @param customerId - Stripe customer ID
   * @param limit - Number of invoices to retrieve
   */
  async listInvoices(
    customerId: string,
    limit: number = 10
  ): Promise<Stripe.Invoice[]> {
    const stripeClient = getStripeClient();

    try {
      const invoices = await stripeClient.invoices.list({
        customer: customerId,
        limit,
      });

      return invoices.data;
    } catch (error) {
      logger.error('Error listing invoices:', error);
      throw error;
    }
  }

  /**
   * Get upcoming invoice for a customer
   * @param customerId - Stripe customer ID
   * @param subscriptionId - Optional subscription ID for specific subscription
   */
  async getUpcomingInvoice(
    customerId: string,
    subscriptionId?: string
  ): Promise<Stripe.Invoice | null> {
    const stripeClient = getStripeClient();

    try {
      const params: Stripe.InvoiceCreatePreviewParams = {
        customer: customerId,
      };

      if (subscriptionId) {
        params.subscription = subscriptionId;
      }

      const invoice = await stripeClient.invoices.createPreview(params);
      return invoice;
    } catch (error) {
      // No upcoming invoice is not an error
      if (error instanceof Stripe.errors.StripeInvalidRequestError) {
        if (error.code === 'invoice_upcoming_none') {
          return null;
        }
      }
      logger.error('Error retrieving upcoming invoice:', error);
      throw error;
    }
  }

  /**
   * Get a specific invoice
   * @param invoiceId - Stripe invoice ID
   */
  async getInvoice(invoiceId: string): Promise<Stripe.Invoice> {
    const stripeClient = getStripeClient();

    try {
      const invoice = await stripeClient.invoices.retrieve(invoiceId);
      return invoice;
    } catch (error) {
      if (error instanceof Stripe.errors.StripeInvalidRequestError) {
        throw new NotFoundError(`Invoice not found: ${invoiceId}`);
      }
      logger.error('Error retrieving invoice:', error);
      throw error;
    }
  }

  /**
   * Preview invoice for a subscription update
   * @param customerId - Stripe customer ID
   * @param subscriptionId - Current subscription ID
   * @param newPriceId - New price ID
   */
  async previewSubscriptionUpdate(
    customerId: string,
    subscriptionId: string,
    newPriceId: string
  ): Promise<Stripe.Invoice> {
    const stripeClient = getStripeClient();

    try {
      const currentSubscription = await stripeClient.subscriptions.retrieve(subscriptionId);
      const subscriptionItemId = currentSubscription.items.data[0]?.id;

      if (!subscriptionItemId) {
        throw new BadRequestError('Subscription has no items');
      }

      const invoice = await stripeClient.invoices.createPreview({
        customer: customerId,
        subscription: subscriptionId,
        subscription_details: {
          items: [
            {
              id: subscriptionItemId,
              price: newPriceId,
            },
          ],
          proration_behavior: 'create_prorations',
        },
      });

      return invoice;
    } catch (error) {
      logger.error('Error previewing subscription update:', error);
      throw error;
    }
  }

  /**
   * Retry a failed invoice payment
   * @param invoiceId - Stripe invoice ID
   */
  async retryInvoicePayment(invoiceId: string): Promise<Stripe.Invoice> {
    const stripeClient = getStripeClient();

    try {
      logger.info(`Retrying payment for invoice: ${invoiceId}`);

      const invoice = await stripeClient.invoices.pay(invoiceId);

      logger.info(`Invoice payment retry successful: ${invoiceId}`);

      return invoice;
    } catch (error) {
      logger.error('Error retrying invoice payment:', error);
      throw error;
    }
  }

  /**
   * Create an enterprise invoice for custom pricing
   * Used for enterprise customers who pay via invoice rather than card
   * @param customerId - Stripe customer ID
   * @param options - Invoice configuration
   */
  async createEnterpriseInvoice(
    customerId: string,
    options: {
      description: string;
      amount: number; // Amount in cents
      quantity?: number;
      daysUntilDue?: number;
      metadata?: Record<string, string>;
      autoSend?: boolean;
      contractMonths?: number;
    }
  ): Promise<Stripe.Invoice> {
    const stripeClient = getStripeClient();

    try {
      const {
        description,
        amount,
        quantity = 1,
        daysUntilDue = 30,
        metadata = {},
        autoSend = true,
        contractMonths = 12,
      } = options;

      logger.info(`Creating enterprise invoice for customer: ${customerId}`);

      // Create invoice item first
      await stripeClient.invoiceItems.create({
        customer: customerId,
        amount: amount * quantity,
        currency: 'usd',
        description: description,
        metadata: {
          ...metadata,
          type: 'enterprise',
          contract_months: contractMonths.toString(),
        },
      });

      // Create the invoice
      const invoice = await stripeClient.invoices.create({
        customer: customerId,
        collection_method: 'send_invoice',
        days_until_due: daysUntilDue,
        auto_advance: true,
        metadata: {
          ...metadata,
          type: 'enterprise_invoice',
          tier: 'enterprise',
        },
      });

      // Finalize the invoice
      const finalizedInvoice = await stripeClient.invoices.finalizeInvoice(invoice.id);

      // Optionally send the invoice
      if (autoSend) {
        await stripeClient.invoices.sendInvoice(finalizedInvoice.id);
        logger.info(`Enterprise invoice sent: ${finalizedInvoice.id}`);
      }

      return finalizedInvoice;
    } catch (error) {
      logger.error('Error creating enterprise invoice:', error);
      throw error;
    }
  }

  /**
   * Void/cancel an unpaid invoice
   * @param invoiceId - Stripe invoice ID
   */
  async voidInvoice(invoiceId: string): Promise<Stripe.Invoice> {
    const stripeClient = getStripeClient();

    try {
      logger.info(`Voiding invoice: ${invoiceId}`);
      const invoice = await stripeClient.invoices.voidInvoice(invoiceId);
      return invoice;
    } catch (error) {
      logger.error('Error voiding invoice:', error);
      throw error;
    }
  }

  /**
   * Mark invoice as paid (for manual/offline payments)
   * @param invoiceId - Stripe invoice ID
   */
  async markInvoicePaid(invoiceId: string): Promise<Stripe.Invoice> {
    const stripeClient = getStripeClient();

    try {
      logger.info(`Marking invoice as paid: ${invoiceId}`);
      const invoice = await stripeClient.invoices.pay(invoiceId, {
        paid_out_of_band: true,
      });
      return invoice;
    } catch (error) {
      logger.error('Error marking invoice as paid:', error);
      throw error;
    }
  }
}

export const stripeInvoiceService = new StripeInvoiceService();
export default stripeInvoiceService;
