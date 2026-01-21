import Stripe from 'stripe';
import { getStripeClient } from './stripe-client';
import { logger } from '../../utils/logger';

/**
 * Stripe Payment Service
 *
 * Handles payment method operations:
 * - Attaching/detaching payment methods
 * - Listing payment methods
 * - Creating setup intents for collecting payment details
 */
class StripePaymentService {
  /**
   * Attach a payment method to a customer
   * @param paymentMethodId - Stripe payment method ID
   * @param customerId - Stripe customer ID
   * @param setAsDefault - Whether to set as default payment method
   */
  async attachPaymentMethod(
    paymentMethodId: string,
    customerId: string,
    setAsDefault: boolean = true
  ): Promise<Stripe.PaymentMethod> {
    const stripeClient = getStripeClient();

    try {
      logger.info(`Attaching payment method ${paymentMethodId} to customer ${customerId}`);

      const paymentMethod = await stripeClient.paymentMethods.attach(paymentMethodId, {
        customer: customerId,
      });

      if (setAsDefault) {
        await stripeClient.customers.update(customerId, {
          invoice_settings: {
            default_payment_method: paymentMethodId,
          },
        });
      }

      logger.info(`Payment method attached: ${paymentMethodId}`);

      return paymentMethod;
    } catch (error) {
      logger.error('Error attaching payment method:', error);
      throw error;
    }
  }

  /**
   * Detach a payment method from a customer
   * @param paymentMethodId - Stripe payment method ID
   */
  async detachPaymentMethod(paymentMethodId: string): Promise<Stripe.PaymentMethod> {
    const stripeClient = getStripeClient();

    try {
      logger.info(`Detaching payment method: ${paymentMethodId}`);

      const paymentMethod = await stripeClient.paymentMethods.detach(paymentMethodId);

      logger.info(`Payment method detached: ${paymentMethodId}`);

      return paymentMethod;
    } catch (error) {
      logger.error('Error detaching payment method:', error);
      throw error;
    }
  }

  /**
   * List payment methods for a customer
   * @param customerId - Stripe customer ID
   * @param type - Payment method type (default: card)
   */
  async listPaymentMethods(
    customerId: string,
    type: 'card' | 'us_bank_account' = 'card'
  ): Promise<Stripe.PaymentMethod[]> {
    const stripeClient = getStripeClient();

    try {
      const paymentMethods = await stripeClient.paymentMethods.list({
        customer: customerId,
        type,
      });

      return paymentMethods.data;
    } catch (error) {
      logger.error('Error listing payment methods:', error);
      throw error;
    }
  }

  /**
   * Create a setup intent for collecting payment details
   * @param customerId - Stripe customer ID
   */
  async createSetupIntent(customerId: string): Promise<Stripe.SetupIntent> {
    const stripeClient = getStripeClient();

    try {
      const setupIntent = await stripeClient.setupIntents.create({
        customer: customerId,
        payment_method_types: ['card'],
      });

      return setupIntent;
    } catch (error) {
      logger.error('Error creating setup intent:', error);
      throw error;
    }
  }
}

export const stripePaymentService = new StripePaymentService();
export default stripePaymentService;
