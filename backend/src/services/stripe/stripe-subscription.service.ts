import Stripe from 'stripe';
import { getStripeClient, TRIAL_PERIOD_DAYS } from './stripe-client';
import { logger } from '../../utils/logger';
import { BadRequestError, NotFoundError } from '../../utils/AppError';

/**
 * Stripe Subscription Service
 *
 * Handles subscription lifecycle operations:
 * - Creating subscriptions
 * - Retrieving subscription details
 * - Updating/changing plans
 * - Canceling and reactivating subscriptions
 * - Checkout sessions for new subscriptions
 * - Billing portal sessions for self-service
 */
class StripeSubscriptionService {
  /**
   * Create a Checkout Session for new subscriptions
   * @param organizationId - The organization's ID
   * @param priceId - The Stripe price ID
   * @param successUrl - Redirect URL on success
   * @param cancelUrl - Redirect URL on cancel
   * @param customerId - Optional existing Stripe customer ID
   * @param trialDays - Optional trial period days (defaults to TRIAL_PERIOD_DAYS)
   */
  async createCheckoutSession(
    organizationId: string,
    priceId: string,
    successUrl: string,
    cancelUrl: string,
    customerId?: string,
    trialDays: number = TRIAL_PERIOD_DAYS
  ): Promise<Stripe.Checkout.Session> {
    const stripeClient = getStripeClient();

    try {
      logger.info(
        `Creating checkout session for organization: ${organizationId}, price: ${priceId}`
      );

      const sessionParams: Stripe.Checkout.SessionCreateParams = {
        mode: 'subscription',
        payment_method_types: ['card'],
        line_items: [
          {
            price: priceId,
            quantity: 1,
          },
        ],
        success_url: successUrl,
        cancel_url: cancelUrl,
        metadata: {
          organization_id: organizationId,
        },
        subscription_data: {
          metadata: {
            organization_id: organizationId,
          },
          trial_period_days: trialDays,
        },
        allow_promotion_codes: true,
        billing_address_collection: 'required',
        tax_id_collection: {
          enabled: true,
        },
      };

      // Use existing customer if provided
      if (customerId) {
        sessionParams.customer = customerId;
      } else {
        sessionParams.customer_creation = 'always';
      }

      // Idempotency Key: Prevents duplicate sessions from retried requests
      // Uses org + price + timestamp (1-minute window) for uniqueness
      const idempotencyKey = `checkout_${organizationId}_${priceId}_${Math.floor(Date.now() / 60000)}`;

      const session = await stripeClient.checkout.sessions.create(sessionParams, {
        idempotencyKey,
      });

      logger.info(
        `Checkout session created: ${session.id} for organization: ${organizationId} (idempotencyKey: ${idempotencyKey})`
      );

      return session;
    } catch (error) {
      logger.error('Error creating checkout session:', error);
      throw error;
    }
  }

  /**
   * Create a Billing Portal session for customer self-service
   * @param stripeCustomerId - The Stripe customer ID
   * @param returnUrl - URL to return to after portal session
   */
  async createBillingPortalSession(
    stripeCustomerId: string,
    returnUrl: string
  ): Promise<Stripe.BillingPortal.Session> {
    const stripeClient = getStripeClient();

    try {
      logger.info(`Creating billing portal session for customer: ${stripeCustomerId}`);

      const session = await stripeClient.billingPortal.sessions.create({
        customer: stripeCustomerId,
        return_url: returnUrl,
      });

      logger.info(`Billing portal session created: ${session.id}`);

      return session;
    } catch (error) {
      logger.error('Error creating billing portal session:', error);
      throw error;
    }
  }

  /**
   * Create a subscription directly (without checkout)
   * @param customerId - Stripe customer ID
   * @param priceId - Stripe price ID
   * @param trialDays - Optional trial period
   * @param metadata - Additional metadata
   */
  async createSubscription(
    customerId: string,
    priceId: string,
    trialDays?: number,
    metadata?: Record<string, string>
  ): Promise<Stripe.Subscription> {
    const stripeClient = getStripeClient();

    try {
      logger.info(`Creating subscription for customer: ${customerId}, price: ${priceId}`);

      const subscriptionParams: Stripe.SubscriptionCreateParams = {
        customer: customerId,
        items: [{ price: priceId }],
        metadata: metadata || {},
        payment_behavior: 'default_incomplete',
        payment_settings: {
          save_default_payment_method: 'on_subscription',
        },
        expand: ['latest_invoice.payment_intent'],
      };

      if (trialDays && trialDays > 0) {
        subscriptionParams.trial_period_days = trialDays;
      }

      // Idempotency Key: Prevents duplicate subscriptions from retried requests
      // Uses customer + price + timestamp (5-minute window) for uniqueness
      const idempotencyKey = `subscription_${customerId}_${priceId}_${Math.floor(Date.now() / 300000)}`;

      const subscription = await stripeClient.subscriptions.create(subscriptionParams, {
        idempotencyKey,
      });

      logger.info(
        `Subscription created: ${subscription.id} for customer: ${customerId} (idempotencyKey: ${idempotencyKey})`
      );

      return subscription;
    } catch (error) {
      logger.error('Error creating subscription:', error);
      throw error;
    }
  }

  /**
   * Get subscription details
   * @param subscriptionId - Stripe subscription ID
   */
  async getSubscription(subscriptionId: string): Promise<Stripe.Subscription> {
    const stripeClient = getStripeClient();

    try {
      const subscription = await stripeClient.subscriptions.retrieve(subscriptionId, {
        expand: ['default_payment_method', 'latest_invoice'],
      });
      return subscription;
    } catch (error) {
      if (error instanceof Stripe.errors.StripeInvalidRequestError) {
        throw new NotFoundError(`Subscription not found: ${subscriptionId}`);
      }
      logger.error('Error retrieving subscription:', error);
      throw error;
    }
  }

  /**
   * Cancel a subscription
   * @param subscriptionId - Stripe subscription ID
   * @param immediately - If true, cancel immediately; if false, cancel at period end
   */
  async cancelSubscription(
    subscriptionId: string,
    immediately: boolean = false
  ): Promise<Stripe.Subscription> {
    const stripeClient = getStripeClient();

    try {
      logger.info(`Canceling subscription: ${subscriptionId}, immediately: ${immediately}`);

      let subscription: Stripe.Subscription;

      if (immediately) {
        subscription = await stripeClient.subscriptions.cancel(subscriptionId);
      } else {
        subscription = await stripeClient.subscriptions.update(subscriptionId, {
          cancel_at_period_end: true,
        });
      }

      logger.info(`Subscription canceled: ${subscriptionId}`);

      return subscription;
    } catch (error) {
      logger.error('Error canceling subscription:', error);
      throw error;
    }
  }

  /**
   * Update subscription to a new price/plan
   * @param subscriptionId - Stripe subscription ID
   * @param newPriceId - New Stripe price ID
   * @param prorationBehavior - How to handle proration
   */
  async updateSubscription(
    subscriptionId: string,
    newPriceId: string,
    prorationBehavior: 'create_prorations' | 'none' | 'always_invoice' = 'create_prorations'
  ): Promise<Stripe.Subscription> {
    const stripeClient = getStripeClient();

    try {
      logger.info(`Updating subscription: ${subscriptionId} to price: ${newPriceId}`);

      // Get current subscription to find the item to update
      const currentSubscription = await stripeClient.subscriptions.retrieve(subscriptionId);
      const subscriptionItemId = currentSubscription.items.data[0]?.id;

      if (!subscriptionItemId) {
        throw new BadRequestError('Subscription has no items to update');
      }

      const subscription = await stripeClient.subscriptions.update(subscriptionId, {
        items: [
          {
            id: subscriptionItemId,
            price: newPriceId,
          },
        ],
        proration_behavior: prorationBehavior,
      });

      logger.info(`Subscription updated: ${subscriptionId} to price: ${newPriceId}`);

      return subscription;
    } catch (error) {
      logger.error('Error updating subscription:', error);
      throw error;
    }
  }

  /**
   * Reactivate a canceled subscription (before period end)
   * @param subscriptionId - Stripe subscription ID
   */
  async reactivateSubscription(subscriptionId: string): Promise<Stripe.Subscription> {
    const stripeClient = getStripeClient();

    try {
      logger.info(`Reactivating subscription: ${subscriptionId}`);

      const subscription = await stripeClient.subscriptions.update(subscriptionId, {
        cancel_at_period_end: false,
      });

      logger.info(`Subscription reactivated: ${subscriptionId}`);

      return subscription;
    } catch (error) {
      logger.error('Error reactivating subscription:', error);
      throw error;
    }
  }

  /**
   * Create an enterprise subscription with custom pricing
   * Enterprise customers can have custom recurring billing
   * @param customerId - Stripe customer ID
   * @param options - Subscription configuration
   */
  async createEnterpriseSubscription(
    customerId: string,
    options: {
      amount: number; // Amount in cents per billing period
      interval: 'month' | 'year';
      description: string;
      metadata?: Record<string, string>;
      trialDays?: number;
    }
  ): Promise<Stripe.Subscription> {
    const stripeClient = getStripeClient();

    try {
      const { amount, interval, description, metadata = {}, trialDays = 0 } = options;

      logger.info(`Creating enterprise subscription for customer: ${customerId}`);

      // Create a custom price for this enterprise customer
      const price = await stripeClient.prices.create({
        unit_amount: amount,
        currency: 'usd',
        recurring: { interval },
        product_data: {
          name: `CogVeri Enterprise - ${description}`,
          metadata: {
            tier: 'enterprise',
            custom: 'true',
          },
        },
        metadata: {
          tier: 'enterprise',
          customer: customerId,
        },
      });

      // Create the subscription
      const subscription = await stripeClient.subscriptions.create({
        customer: customerId,
        items: [{ price: price.id }],
        collection_method: 'send_invoice',
        days_until_due: 30,
        trial_period_days: trialDays || undefined,
        metadata: {
          ...metadata,
          tier: 'enterprise',
          type: 'enterprise_subscription',
        },
      });

      logger.info(`Enterprise subscription created: ${subscription.id}`);

      return subscription;
    } catch (error) {
      logger.error('Error creating enterprise subscription:', error);
      throw error;
    }
  }
}

export const stripeSubscriptionService = new StripeSubscriptionService();
export default stripeSubscriptionService;
