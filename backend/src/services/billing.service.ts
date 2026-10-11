import { db } from '../config/database';
import { logger } from '../utils/logger';
import { BadRequestError, NotFoundError, ConflictError } from '../utils/AppError';
import { stripeService } from './stripe.service';
import pricingService, { PRICING_TIERS } from './pricing.service';
import { billingEmailService } from './billing-email.service';
import { TRIAL_PERIOD_DAYS, isPaidTier, getPriceIdByTier, isStripeEnabled } from '../config/stripe';

/**
 * Subscription status type matching the database enum
 */
type SubscriptionStatus =
  | 'trialing'
  | 'active'
  | 'past_due'
  | 'canceled'
  | 'unpaid'
  | 'incomplete'
  | 'incomplete_expired'
  | 'paused';

/**
 * Subscription record from database
 */
interface SubscriptionRecord {
  id: string;
  organization_id: string;
  stripe_customer_id: string;
  stripe_subscription_id: string | null;
  stripe_price_id: string | null;
  status: SubscriptionStatus;
  current_period_start: Date;
  current_period_end: Date;
  cancel_at_period_end: boolean;
  canceled_at: Date | null;
  trial_start: Date | null;
  trial_end: Date | null;
  billing_interval: string;
  metadata: Record<string, any>;
  created_at: Date;
  updated_at: Date;
}

/**
 * Billing Service
 *
 * Business logic layer for subscription management that:
 * - Creates/manages subscriptions in our database
 * - Maps Stripe subscription to our pricing tier
 * - Handles subscription lifecycle (create, update, cancel)
 * - Syncs with pricing.service to update organization tier
 */
class BillingService {
  /**
   * Get or create a subscription record for an organization
   * @param organizationId - The organization's ID
   */
  async getOrCreateSubscription(organizationId: string): Promise<SubscriptionRecord> {
    try {
      // Check for existing subscription
      let subscription = await db('subscriptions').where('organization_id', organizationId).first();

      if (subscription) {
        return subscription;
      }

      // Get organization details
      const organization = await db('organizations').where('id', organizationId).first();

      if (!organization) {
        throw new NotFoundError(`Organization not found: ${organizationId}`);
      }

      // Create Stripe customer if not exists
      let stripeCustomerId = organization.stripe_customer_id;

      if (!stripeCustomerId && isStripeEnabled()) {
        const owner = await db('users').where('id', organization.owner_id).first();

        const customer = await stripeService.createCustomer(
          organizationId,
          organization.billing_email || owner?.email || '',
          organization.name
        );

        stripeCustomerId = customer.id;

        // Update organization with Stripe customer ID
        await db('organizations').where('id', organizationId).update({
          stripe_customer_id: stripeCustomerId,
          billing_enabled: true,
          updated_at: new Date(),
        });
      }

      // Create subscription record with trial status
      const now = new Date();
      const trialEnd = new Date(now.getTime() + TRIAL_PERIOD_DAYS * 24 * 60 * 60 * 1000);

      [subscription] = await db('subscriptions')
        .insert({
          organization_id: organizationId,
          stripe_customer_id: stripeCustomerId || '',
          status: 'trialing',
          current_period_start: now,
          current_period_end: trialEnd,
          trial_start: now,
          trial_end: trialEnd,
          billing_interval: 'monthly',
          metadata: {},
        })
        .returning('*');

      logger.info(`Subscription record created for organization: ${organizationId}`);

      return subscription;
    } catch (error) {
      logger.error('Error getting/creating subscription:', error);
      throw error;
    }
  }

  /**
   * Start a trial for an organization on a specific tier
   * @param organizationId - The organization's ID
   * @param tierName - The tier to trial (pro, team, business)
   */
  async startTrial(
    organizationId: string,
    tierName: string
  ): Promise<{
    subscription: SubscriptionRecord;
    trialEndsAt: Date;
    tierName: string;
  }> {
    try {
      // Validate tier
      const tier = PRICING_TIERS[tierName.toLowerCase()];
      if (!tier) {
        throw new BadRequestError(`Invalid tier: ${tierName}`);
      }

      // Check for existing active subscription
      const existingSubscription = await db('subscriptions')
        .where('organization_id', organizationId)
        .whereIn('status', ['active', 'trialing'])
        .first();

      if (existingSubscription) {
        if (existingSubscription.status === 'active') {
          throw new ConflictError('Organization already has an active subscription');
        }
        // Allow restarting trial for trialing subscriptions
      }

      const subscription = await this.getOrCreateSubscription(organizationId);

      const now = new Date();
      const trialEnd = new Date(now.getTime() + TRIAL_PERIOD_DAYS * 24 * 60 * 60 * 1000);

      // Update subscription with trial info
      const [updatedSubscription] = await db('subscriptions')
        .where('id', subscription.id)
        .update({
          status: 'trialing',
          trial_start: now,
          trial_end: trialEnd,
          current_period_start: now,
          current_period_end: trialEnd,
          metadata: {
            ...subscription.metadata,
            trial_tier: tierName,
          },
          updated_at: new Date(),
        })
        .returning('*');

      // Update organization tier for trial period
      await pricingService.updateOrganizationTier(organizationId, tierName);

      // Log billing event
      await this.logBillingEvent(organizationId, 'trial.started', {
        tier: tierName,
        trial_end: trialEnd,
      });

      logger.info(`Trial started for organization ${organizationId} on tier ${tierName}`);

      return {
        subscription: updatedSubscription,
        trialEndsAt: trialEnd,
        tierName,
      };
    } catch (error) {
      logger.error('Error starting trial:', error);
      throw error;
    }
  }

  /**
   * Upgrade an organization to a new tier
   * @param organizationId - The organization's ID
   * @param newTierName - The new tier to upgrade to
   * @param paymentMethodId - Optional payment method ID
   * @param interval - Billing interval (monthly or yearly)
   */
  async upgradeTier(
    organizationId: string,
    newTierName: string,
    paymentMethodId?: string,
    interval: 'monthly' | 'yearly' = 'monthly'
  ): Promise<{
    subscription: SubscriptionRecord;
    previousTier: string;
    newTier: string;
  }> {
    try {
      // Validate tier
      const tier = PRICING_TIERS[newTierName.toLowerCase()];
      if (!tier) {
        throw new BadRequestError(`Invalid tier: ${newTierName}`);
      }

      // Get current subscription
      const subscription = await this.getOrCreateSubscription(organizationId);
      const organization = await db('organizations').where('id', organizationId).first();

      const previousTier = organization.subscription_tier;

      // If upgrading to a paid tier, ensure Stripe is set up
      if (isPaidTier(newTierName)) {
        if (!isStripeEnabled()) {
          throw new BadRequestError('Billing is not enabled');
        }

        const priceId = getPriceIdByTier(newTierName, interval);
        if (!priceId) {
          throw new BadRequestError(`No price configured for tier: ${newTierName}`);
        }

        // Attach payment method if provided
        if (paymentMethodId && subscription.stripe_customer_id) {
          await stripeService.attachPaymentMethod(
            paymentMethodId,
            subscription.stripe_customer_id,
            true
          );
        }

        // Create or update Stripe subscription
        if (subscription.stripe_subscription_id) {
          // Update existing subscription
          await stripeService.updateSubscription(subscription.stripe_subscription_id, priceId);
        } else {
          // Create new subscription in Stripe
          const stripeSubscription = await stripeService.createSubscription(
            subscription.stripe_customer_id,
            priceId,
            subscription.status === 'trialing' ? this.calculateTrialDaysRemaining(subscription) : 0,
            { organization_id: organizationId }
          );

          // Update local subscription with Stripe IDs
          await db('subscriptions').where('id', subscription.id).update({
            stripe_subscription_id: stripeSubscription.id,
            stripe_price_id: priceId,
            billing_interval: interval,
            updated_at: new Date(),
          });
        }
      }

      // Update subscription status
      const [updatedSubscription] = await db('subscriptions')
        .where('id', subscription.id)
        .update({
          stripe_price_id: getPriceIdByTier(newTierName, interval),
          billing_interval: interval,
          status: subscription.status === 'trialing' ? 'trialing' : 'active',
          metadata: {
            ...subscription.metadata,
            previous_tier: previousTier,
          },
          updated_at: new Date(),
        })
        .returning('*');

      // Update organization tier
      await pricingService.updateOrganizationTier(organizationId, newTierName);

      // Log billing event
      await this.logBillingEvent(organizationId, 'tier.upgraded', {
        previous_tier: previousTier,
        new_tier: newTierName,
        interval,
      });

      logger.info(`Organization ${organizationId} upgraded from ${previousTier} to ${newTierName}`);

      return {
        subscription: updatedSubscription,
        previousTier,
        newTier: newTierName,
      };
    } catch (error) {
      logger.error('Error upgrading tier:', error);
      throw error;
    }
  }

  /**
   * Downgrade an organization to a lower tier (takes effect at period end)
   * @param organizationId - The organization's ID
   * @param newTierName - The new tier to downgrade to
   */
  async downgradeTier(
    organizationId: string,
    newTierName: string
  ): Promise<{
    subscription: SubscriptionRecord;
    effectiveDate: Date;
    previousTier: string;
    newTier: string;
  }> {
    try {
      // Validate tier
      const tier = PRICING_TIERS[newTierName.toLowerCase()];
      if (!tier) {
        throw new BadRequestError(`Invalid tier: ${newTierName}`);
      }

      const subscription = await db('subscriptions')
        .where('organization_id', organizationId)
        .first();

      if (!subscription) {
        throw new NotFoundError('Subscription not found');
      }

      const organization = await db('organizations').where('id', organizationId).first();

      const previousTier = organization.subscription_tier;

      // Schedule downgrade in Stripe if applicable
      if (subscription.stripe_subscription_id && isStripeEnabled()) {
        const newPriceId = getPriceIdByTier(
          newTierName,
          subscription.billing_interval as 'monthly' | 'yearly'
        );

        if (newPriceId) {
          // Update subscription to apply at period end
          // Note: Stripe doesn't have built-in scheduled downgrades,
          // so we handle this via metadata and webhook processing
          // Fetch subscription to validate it exists (result not needed for metadata update)
          await stripeService.getSubscription(subscription.stripe_subscription_id);

          // Store pending downgrade in metadata
          await db('subscriptions')
            .where('id', subscription.id)
            .update({
              metadata: {
                ...subscription.metadata,
                pending_downgrade: {
                  new_tier: newTierName,
                  effective_date: subscription.current_period_end,
                  previous_tier: previousTier,
                },
              },
              updated_at: new Date(),
            });
        }
      }

      // For free tier downgrade or if no Stripe, apply immediately at period end
      if (newTierName === 'free' || !subscription.stripe_subscription_id) {
        await db('subscriptions')
          .where('id', subscription.id)
          .update({
            metadata: {
              ...subscription.metadata,
              pending_downgrade: {
                new_tier: newTierName,
                effective_date: subscription.current_period_end,
                previous_tier: previousTier,
              },
            },
            updated_at: new Date(),
          });
      }

      const updatedSubscription = await db('subscriptions').where('id', subscription.id).first();

      // Log billing event
      await this.logBillingEvent(organizationId, 'tier.downgrade_scheduled', {
        previous_tier: previousTier,
        new_tier: newTierName,
        effective_date: subscription.current_period_end,
      });

      logger.info(
        `Downgrade scheduled for organization ${organizationId}: ${previousTier} -> ${newTierName} at ${subscription.current_period_end}`
      );

      return {
        subscription: updatedSubscription,
        effectiveDate: subscription.current_period_end,
        previousTier,
        newTier: newTierName,
      };
    } catch (error) {
      logger.error('Error downgrading tier:', error);
      throw error;
    }
  }

  /**
   * Cancel an organization's subscription
   * @param organizationId - The organization's ID
   * @param immediately - If true, cancel immediately; if false, cancel at period end
   */
  async cancelSubscription(
    organizationId: string,
    immediately: boolean = false
  ): Promise<{
    subscription: SubscriptionRecord;
    canceledAt: Date;
    effectiveDate: Date;
  }> {
    try {
      const subscription = await db('subscriptions')
        .where('organization_id', organizationId)
        .first();

      if (!subscription) {
        throw new NotFoundError('Subscription not found');
      }

      if (subscription.status === 'canceled') {
        throw new ConflictError('Subscription is already canceled');
      }

      const canceledAt = new Date();
      const effectiveDate = immediately ? canceledAt : subscription.current_period_end;

      // Cancel in Stripe if applicable
      if (subscription.stripe_subscription_id && isStripeEnabled()) {
        await stripeService.cancelSubscription(subscription.stripe_subscription_id, immediately);
      }

      // Update local subscription
      const updateData: Partial<SubscriptionRecord> = {
        cancel_at_period_end: !immediately,
        canceled_at: canceledAt,
        updated_at: new Date(),
      } as any;

      if (immediately) {
        updateData.status = 'canceled';
      }

      const [updatedSubscription] = await db('subscriptions')
        .where('id', subscription.id)
        .update(updateData)
        .returning('*');

      // If immediate cancellation, downgrade to free tier
      if (immediately) {
        await pricingService.updateOrganizationTier(organizationId, 'free');
      }

      // Log billing event
      await this.logBillingEvent(organizationId, 'subscription.canceled', {
        immediately,
        effective_date: effectiveDate,
      });

      logger.info(
        `Subscription canceled for organization ${organizationId}, effective: ${effectiveDate}`
      );

      return {
        subscription: updatedSubscription,
        canceledAt,
        effectiveDate,
      };
    } catch (error) {
      logger.error('Error canceling subscription:', error);
      throw error;
    }
  }

  /**
   * Reactivate a canceled subscription (before period end)
   * @param organizationId - The organization's ID
   */
  async reactivateSubscription(organizationId: string): Promise<SubscriptionRecord> {
    try {
      const subscription = await db('subscriptions')
        .where('organization_id', organizationId)
        .first();

      if (!subscription) {
        throw new NotFoundError('Subscription not found');
      }

      if (!subscription.cancel_at_period_end) {
        throw new ConflictError('Subscription is not pending cancellation');
      }

      // Reactivate in Stripe if applicable
      if (subscription.stripe_subscription_id && isStripeEnabled()) {
        await stripeService.reactivateSubscription(subscription.stripe_subscription_id);
      }

      // Update local subscription
      const [updatedSubscription] = await db('subscriptions')
        .where('id', subscription.id)
        .update({
          cancel_at_period_end: false,
          canceled_at: null,
          updated_at: new Date(),
        })
        .returning('*');

      // Log billing event
      await this.logBillingEvent(organizationId, 'subscription.reactivated', {});

      logger.info(`Subscription reactivated for organization ${organizationId}`);

      return updatedSubscription;
    } catch (error) {
      logger.error('Error reactivating subscription:', error);
      throw error;
    }
  }

  /**
   * Get current subscription for an organization
   * @param organizationId - The organization's ID
   */
  async getCurrentSubscription(organizationId: string): Promise<SubscriptionRecord | null> {
    try {
      const subscription = await db('subscriptions')
        .where('organization_id', organizationId)
        .first();

      return subscription || null;
    } catch (error) {
      logger.error('Error getting current subscription:', error);
      throw error;
    }
  }

  /**
   * Get subscription history for an organization
   * @param organizationId - The organization's ID
   */
  async getSubscriptionHistory(organizationId: string): Promise<any[]> {
    try {
      const events = await db('billing_events')
        .where('organization_id', organizationId)
        .orderBy('created_at', 'desc')
        .limit(50);

      return events;
    } catch (error) {
      logger.error('Error getting subscription history:', error);
      throw error;
    }
  }

  /**
   * Check if an organization is in an active trial
   * @param organizationId - The organization's ID
   */
  async isTrialActive(organizationId: string): Promise<boolean> {
    try {
      const subscription = await db('subscriptions')
        .where('organization_id', organizationId)
        .where('status', 'trialing')
        .first();

      if (!subscription || !subscription.trial_end) {
        return false;
      }

      return new Date() < new Date(subscription.trial_end);
    } catch (error) {
      logger.error('Error checking trial status:', error);
      return false;
    }
  }

  /**
   * Get remaining trial days from a subscription record (sync helper)
   * @param subscription - The subscription record
   */
  private calculateTrialDaysRemaining(subscription: SubscriptionRecord | null): number {
    if (!subscription || !subscription.trial_end) {
      return 0;
    }

    const now = new Date();
    const trialEnd = new Date(subscription.trial_end);
    const diffMs = trialEnd.getTime() - now.getTime();
    const diffDays = Math.ceil(diffMs / (1000 * 60 * 60 * 24));

    return Math.max(0, diffDays);
  }

  /**
   * Get remaining trial days for an organization
   * @param organizationId - The organization's ID
   */
  async getTrialDaysRemaining(organizationId: string): Promise<number> {
    try {
      const subscription = await db('subscriptions')
        .where('organization_id', organizationId)
        .first();

      return this.calculateTrialDaysRemaining(subscription);
    } catch (error) {
      logger.error('Error getting trial days remaining:', error);
      return 0;
    }
  }

  /**
   * Get subscription with enriched details
   * @param organizationId - The organization's ID
   */
  async getSubscriptionDetails(organizationId: string): Promise<{
    subscription: SubscriptionRecord | null;
    organization: any;
    tier: any;
    trialDaysRemaining: number;
    isTrialActive: boolean;
    upcomingInvoice: any | null;
  }> {
    try {
      const subscription = await this.getCurrentSubscription(organizationId);
      const organization = await db('organizations').where('id', organizationId).first();

      if (!organization) {
        throw new NotFoundError('Organization not found');
      }

      const tier = await pricingService.getPricingTier(organization.subscription_tier);
      const trialDaysRemaining = this.calculateTrialDaysRemaining(subscription);
      const isTrialActive = await this.isTrialActive(organizationId);

      let upcomingInvoice = null;
      if (subscription?.stripe_customer_id && isStripeEnabled()) {
        try {
          upcomingInvoice = await stripeService.getUpcomingInvoice(
            subscription.stripe_customer_id,
            subscription.stripe_subscription_id || undefined
          );
        } catch (error) {
          // Ignore errors fetching upcoming invoice
        }
      }

      return {
        subscription,
        organization,
        tier,
        trialDaysRemaining,
        isTrialActive,
        upcomingInvoice,
      };
    } catch (error) {
      logger.error('Error getting subscription details:', error);
      throw error;
    }
  }

  /**
   * Create a checkout session for upgrading to a paid tier
   * @param organizationId - The organization's ID
   * @param tierName - The tier to subscribe to
   * @param interval - Billing interval (monthly or yearly)
   * @param successUrl - URL to redirect on success
   * @param cancelUrl - URL to redirect on cancel
   */
  async createCheckoutSession(
    organizationId: string,
    tierName: string,
    interval: 'monthly' | 'yearly',
    successUrl: string,
    cancelUrl: string
  ): Promise<string> {
    try {
      if (!isStripeEnabled()) {
        throw new BadRequestError('Billing is not enabled');
      }

      const priceId = getPriceIdByTier(tierName, interval);
      if (!priceId) {
        throw new BadRequestError(`No price configured for tier: ${tierName}`);
      }

      const subscription = await this.getOrCreateSubscription(organizationId);

      const session = await stripeService.createCheckoutSession(
        organizationId,
        priceId,
        successUrl,
        cancelUrl,
        subscription.stripe_customer_id || undefined,
        subscription.status === 'trialing' ? this.calculateTrialDaysRemaining(subscription) : 0
      );

      return session.url || '';
    } catch (error) {
      logger.error('Error creating checkout session:', error);
      throw error;
    }
  }

  /**
   * Create a billing portal session for customer self-service
   * @param organizationId - The organization's ID
   * @param returnUrl - URL to return to after portal session
   */
  async createBillingPortalSession(organizationId: string, returnUrl: string): Promise<string> {
    try {
      if (!isStripeEnabled()) {
        throw new BadRequestError('Billing is not enabled');
      }

      const subscription = await this.getCurrentSubscription(organizationId);

      if (!subscription?.stripe_customer_id) {
        throw new BadRequestError('No billing account found for this organization');
      }

      const session = await stripeService.createBillingPortalSession(
        subscription.stripe_customer_id,
        returnUrl
      );

      return session.url;
    } catch (error) {
      logger.error('Error creating billing portal session:', error);
      throw error;
    }
  }

  /**
   * Log a billing event for audit trail
   */
  private async logBillingEvent(
    organizationId: string,
    eventType: string,
    eventData: Record<string, any>,
    stripeEventId?: string
  ): Promise<void> {
    try {
      await db('billing_events').insert({
        organization_id: organizationId,
        event_type: eventType,
        stripe_event_id: stripeEventId,
        event_data: eventData,
        status: 'processed',
        processed_at: new Date(),
        created_at: new Date(),
      });
    } catch (error) {
      logger.error('Error logging billing event:', error);
      // Don't throw - logging failure shouldn't break the main operation
    }
  }

  /**
   * Send dunning email for failed payment
   * Notifies organization owner about payment failure and actions needed
   *
   * @param organizationId - The organization's ID
   * @param failureCount - Number of failed payment attempts
   * @param amountDue - Amount that failed to charge (in cents)
   * @param currency - Currency code (e.g., 'usd')
   * @param nextAttempt - Unix timestamp of next retry attempt (optional)
   * @param hostedInvoiceUrl - URL to pay the invoice manually (optional)
   */
  async sendDunningEmail(
    organizationId: string,
    failureCount: number,
    amountDue: number,
    currency: string,
    nextAttempt?: number | null,
    hostedInvoiceUrl?: string | null
  ): Promise<boolean> {
    return billingEmailService.sendDunningEmail(
      organizationId,
      failureCount,
      amountDue,
      currency,
      nextAttempt,
      hostedInvoiceUrl
    );
  }

  /**
   * Send payment action required email (e.g., 3D Secure authentication needed)
   *
   * @param organizationId - The organization's ID
   * @param hostedInvoiceUrl - URL where user can complete authentication
   */
  async sendPaymentActionRequiredEmail(
    organizationId: string,
    hostedInvoiceUrl: string
  ): Promise<boolean> {
    return billingEmailService.sendPaymentActionRequiredEmail(organizationId, hostedInvoiceUrl);
  }
}

export const billingService = new BillingService();
export default billingService;
