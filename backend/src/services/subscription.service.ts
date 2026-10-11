import Stripe from 'stripe';
import { db } from '../config/database';
import { logger } from '../utils/logger';
import { stripeService } from './stripe.service';
import pricingService from './pricing.service';
import { getTierByPriceId, isStripeEnabled } from '../config/stripe';
import { emailService } from './email.service';

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
 * Helper to get subscription period from first item
 * In newer Stripe API versions, period info is on the subscription item
 */
function getSubscriptionPeriod(subscription: Stripe.Subscription): {
  current_period_start: number;
  current_period_end: number;
} {
  const firstItem = subscription.items?.data?.[0];
  if (firstItem) {
    return {
      current_period_start: firstItem.current_period_start,
      current_period_end: firstItem.current_period_end,
    };
  }
  // Fallback - use subscription created timestamp
  return {
    current_period_start: subscription.created,
    current_period_end: subscription.created + 30 * 24 * 60 * 60, // 30 days default
  };
}

/**
 * Subscription Service
 *
 * Handles subscription status syncing between Stripe and our database.
 * Processes Stripe webhook events for subscription lifecycle management.
 */
class SubscriptionService {
  /**
   * Sync local subscription record from a Stripe subscription object
   * @param stripeSubscription - The Stripe subscription object
   */
  async syncFromStripe(stripeSubscription: Stripe.Subscription): Promise<void> {
    try {
      const customerId =
        typeof stripeSubscription.customer === 'string'
          ? stripeSubscription.customer
          : stripeSubscription.customer.id;

      const organizationId = stripeSubscription.metadata?.organization_id;

      if (!organizationId) {
        // Try to find organization by customer ID
        const subscription = await db('subscriptions')
          .where('stripe_customer_id', customerId)
          .first();

        if (!subscription) {
          logger.warn(`No organization found for Stripe subscription: ${stripeSubscription.id}`);
          return;
        }
      }

      // Get the organization ID from our records if not in metadata
      let orgId = organizationId;
      if (!orgId) {
        const sub = await db('subscriptions')
          .where('stripe_subscription_id', stripeSubscription.id)
          .orWhere('stripe_customer_id', customerId)
          .first();
        orgId = sub?.organization_id;
      }

      if (!orgId) {
        logger.warn(`Cannot determine organization for subscription: ${stripeSubscription.id}`);
        return;
      }

      // Map Stripe status to our status enum
      const status = this.mapStripeStatus(stripeSubscription.status);

      // Get the current item price ID
      const currentPriceId = stripeSubscription.items.data[0]?.price?.id || null;

      // Get period from subscription item
      const period = getSubscriptionPeriod(stripeSubscription);

      // ★ Transaction: Ensure subscription update and tier change are atomic
      // If one fails, both should rollback to prevent inconsistent state
      await db.transaction(async (trx) => {
        // Update subscription record
        await trx('subscriptions')
          .where('organization_id', orgId)
          .update({
            stripe_subscription_id: stripeSubscription.id,
            stripe_price_id: currentPriceId,
            status,
            current_period_start: new Date(period.current_period_start * 1000),
            current_period_end: new Date(period.current_period_end * 1000),
            cancel_at_period_end: stripeSubscription.cancel_at_period_end,
            canceled_at: stripeSubscription.canceled_at
              ? new Date(stripeSubscription.canceled_at * 1000)
              : null,
            trial_start: stripeSubscription.trial_start
              ? new Date(stripeSubscription.trial_start * 1000)
              : null,
            trial_end: stripeSubscription.trial_end
              ? new Date(stripeSubscription.trial_end * 1000)
              : null,
            updated_at: new Date(),
          });

        // Update organization tier based on price (within same transaction)
        if (currentPriceId) {
          const tierInfo = getTierByPriceId(currentPriceId);
          if (tierInfo) {
            await pricingService.updateOrganizationTier(orgId, tierInfo.tier, trx);
          }
        }
      });

      logger.info(`Subscription synced from Stripe: ${stripeSubscription.id} for org: ${orgId}`);
    } catch (error) {
      logger.error('Error syncing subscription from Stripe:', error);
      throw error;
    }
  }

  /**
   * Handle subscription.created webhook event
   */
  async handleSubscriptionCreated(subscription: Stripe.Subscription): Promise<void> {
    try {
      logger.info(`Processing subscription.created: ${subscription.id}`);

      const customerId =
        typeof subscription.customer === 'string'
          ? subscription.customer
          : subscription.customer.id;

      const organizationId = subscription.metadata?.organization_id;

      if (!organizationId) {
        logger.warn(`No organization_id in subscription metadata: ${subscription.id}`);
        // Try to find by customer ID
        const existingSub = await db('subscriptions')
          .where('stripe_customer_id', customerId)
          .first();

        if (existingSub) {
          // Update existing subscription
          await this.syncFromStripe(subscription);
          await this.logWebhookEvent(
            existingSub.organization_id,
            'subscription.created',
            subscription
          );
          return;
        }

        logger.warn(`Cannot process subscription.created - no matching organization`);
        return;
      }

      // Sync the subscription
      await this.syncFromStripe(subscription);

      // Log the event
      await this.logWebhookEvent(organizationId, 'subscription.created', subscription);

      // Send confirmation email
      await this.sendSubscriptionEmail(organizationId, 'created', subscription);

      logger.info(`Subscription created handled: ${subscription.id}`);
    } catch (error) {
      logger.error('Error handling subscription.created:', error);
      throw error;
    }
  }

  /**
   * Handle subscription.updated webhook event
   */
  async handleSubscriptionUpdated(subscription: Stripe.Subscription): Promise<void> {
    try {
      logger.info(`Processing subscription.updated: ${subscription.id}`);

      // Get previous state to detect changes
      const existingSub = await db('subscriptions')
        .where('stripe_subscription_id', subscription.id)
        .first();

      // Sync the updated subscription
      await this.syncFromStripe(subscription);

      const organizationId = subscription.metadata?.organization_id || existingSub?.organization_id;

      if (!organizationId) {
        logger.warn(`No organization found for subscription update: ${subscription.id}`);
        return;
      }

      // Check for status changes that need notification
      if (existingSub) {
        const oldStatus = existingSub.status;
        const newStatus = this.mapStripeStatus(subscription.status);

        if (oldStatus !== newStatus) {
          await this.handleStatusChange(organizationId, oldStatus, newStatus, subscription);
        }

        // Check for plan changes
        const oldPriceId = existingSub.stripe_price_id;
        const newPriceId = subscription.items.data[0]?.price?.id;

        if (oldPriceId !== newPriceId && newPriceId) {
          await this.handlePlanChange(organizationId, oldPriceId, newPriceId, subscription);
        }
      }

      // Log the event
      await this.logWebhookEvent(organizationId, 'subscription.updated', subscription);

      logger.info(`Subscription updated handled: ${subscription.id}`);
    } catch (error) {
      logger.error('Error handling subscription.updated:', error);
      throw error;
    }
  }

  /**
   * Handle subscription.deleted webhook event
   */
  async handleSubscriptionDeleted(subscription: Stripe.Subscription): Promise<void> {
    try {
      logger.info(`Processing subscription.deleted: ${subscription.id}`);

      const existingSub = await db('subscriptions')
        .where('stripe_subscription_id', subscription.id)
        .first();

      if (!existingSub) {
        logger.warn(
          `No local subscription found for deleted Stripe subscription: ${subscription.id}`
        );
        return;
      }

      const organizationId = existingSub.organization_id;

      // Update subscription status
      await db('subscriptions').where('id', existingSub.id).update({
        status: 'canceled',
        canceled_at: new Date(),
        updated_at: new Date(),
      });

      // Downgrade organization to free tier
      await pricingService.updateOrganizationTier(organizationId, 'free');

      // Log the event
      await this.logWebhookEvent(organizationId, 'subscription.deleted', subscription);

      // Send cancellation email
      await this.sendSubscriptionEmail(organizationId, 'canceled', subscription);

      logger.info(`Subscription deleted handled: ${subscription.id}`);
    } catch (error) {
      logger.error('Error handling subscription.deleted:', error);
      throw error;
    }
  }

  /**
   * Handle invoice.paid webhook event
   */
  async handleInvoicePaid(invoice: Stripe.Invoice): Promise<void> {
    try {
      logger.info(`Processing invoice.paid: ${invoice.id}`);

      const customerId =
        typeof invoice.customer === 'string' ? invoice.customer : invoice.customer?.id;

      if (!customerId) {
        logger.warn(`No customer ID in invoice: ${invoice.id}`);
        return;
      }

      // Find organization by customer ID
      const subscription = await db('subscriptions')
        .where('stripe_customer_id', customerId)
        .first();

      if (!subscription) {
        logger.warn(`No subscription found for customer: ${customerId}`);
        return;
      }

      const organizationId = subscription.organization_id;

      // Store invoice record
      await this.storeInvoice(organizationId, invoice);

      // If subscription was past_due, restore to active
      if (subscription.status === 'past_due') {
        await db('subscriptions').where('id', subscription.id).update({
          status: 'active',
          updated_at: new Date(),
        });

        logger.info(`Subscription restored to active after payment: ${subscription.id}`);
      }

      // Log the event
      await this.logWebhookEvent(organizationId, 'invoice.paid', invoice);

      // Send receipt email
      await this.sendPaymentEmail(organizationId, 'paid', invoice);

      logger.info(`Invoice paid handled: ${invoice.id}`);
    } catch (error) {
      logger.error('Error handling invoice.paid:', error);
      throw error;
    }
  }

  /**
   * Handle invoice.payment_failed webhook event
   */
  async handleInvoicePaymentFailed(invoice: Stripe.Invoice): Promise<void> {
    try {
      logger.info(`Processing invoice.payment_failed: ${invoice.id}`);

      const customerId =
        typeof invoice.customer === 'string' ? invoice.customer : invoice.customer?.id;

      if (!customerId) {
        logger.warn(`No customer ID in invoice: ${invoice.id}`);
        return;
      }

      // Find organization by customer ID
      const subscription = await db('subscriptions')
        .where('stripe_customer_id', customerId)
        .first();

      if (!subscription) {
        logger.warn(`No subscription found for customer: ${customerId}`);
        return;
      }

      const organizationId = subscription.organization_id;

      // Store invoice record
      await this.storeInvoice(organizationId, invoice);

      // Update subscription status
      await db('subscriptions')
        .where('id', subscription.id)
        .update({
          status: 'past_due',
          metadata: {
            ...subscription.metadata,
            last_payment_failure: new Date().toISOString(),
            payment_failure_count: (subscription.metadata?.payment_failure_count || 0) + 1,
          },
          updated_at: new Date(),
        });

      // Log the event
      await this.logWebhookEvent(organizationId, 'invoice.payment_failed', invoice);

      // Send payment failed email
      await this.sendPaymentEmail(organizationId, 'failed', invoice);

      // Check if we should suspend access
      const failureCount = (subscription.metadata?.payment_failure_count || 0) + 1;
      if (failureCount >= 3) {
        logger.warn(
          `Organization ${organizationId} has ${failureCount} payment failures - considering suspension`
        );
        // Could implement automatic suspension here after grace period
      }

      logger.info(`Invoice payment failed handled: ${invoice.id}`);
    } catch (error) {
      logger.error('Error handling invoice.payment_failed:', error);
      throw error;
    }
  }

  /**
   * Check and verify subscription status against Stripe
   * @param organizationId - The organization's ID
   */
  async checkSubscriptionStatus(organizationId: string): Promise<{
    inSync: boolean;
    localStatus: SubscriptionStatus | null;
    stripeStatus: string | null;
    details: string;
  }> {
    try {
      const subscription = await db('subscriptions')
        .where('organization_id', organizationId)
        .first();

      if (!subscription) {
        return {
          inSync: true,
          localStatus: null,
          stripeStatus: null,
          details: 'No subscription found',
        };
      }

      if (!subscription.stripe_subscription_id || !isStripeEnabled()) {
        return {
          inSync: true,
          localStatus: subscription.status,
          stripeStatus: null,
          details: 'No Stripe subscription to verify',
        };
      }

      // Fetch from Stripe
      const stripeSubscription = await stripeService.getSubscription(
        subscription.stripe_subscription_id
      );

      const localStatus = subscription.status;
      const stripeStatus = this.mapStripeStatus(stripeSubscription.status);

      const inSync = localStatus === stripeStatus;

      if (!inSync) {
        logger.warn(
          `Subscription status mismatch for org ${organizationId}: local=${localStatus}, stripe=${stripeStatus}`
        );

        // Auto-sync if out of sync
        await this.syncFromStripe(stripeSubscription);
      }

      return {
        inSync,
        localStatus,
        stripeStatus,
        details: inSync ? 'Status is in sync' : 'Status was out of sync - now corrected',
      };
    } catch (error) {
      logger.error('Error checking subscription status:', error);
      throw error;
    }
  }

  /**
   * Handle trial ending soon
   * @param subscription - Stripe subscription
   */
  async handleTrialWillEnd(subscription: Stripe.Subscription): Promise<void> {
    try {
      logger.info(`Processing trial_will_end for subscription: ${subscription.id}`);

      const existingSub = await db('subscriptions')
        .where('stripe_subscription_id', subscription.id)
        .first();

      if (!existingSub) {
        logger.warn(`No local subscription found: ${subscription.id}`);
        return;
      }

      const organizationId = existingSub.organization_id;

      // Log the event
      await this.logWebhookEvent(
        organizationId,
        'customer.subscription.trial_will_end',
        subscription
      );

      // Send trial ending email
      await this.sendTrialEndingEmail(organizationId, subscription);

      logger.info(`Trial will end handled: ${subscription.id}`);
    } catch (error) {
      logger.error('Error handling trial_will_end:', error);
      throw error;
    }
  }

  /**
   * Handle payment method updated
   * @param paymentMethod - Stripe payment method
   */
  async handlePaymentMethodUpdated(paymentMethod: Stripe.PaymentMethod): Promise<void> {
    try {
      logger.info(`Processing payment method update: ${paymentMethod.id}`);

      if (!paymentMethod.customer) {
        return;
      }

      const customerId =
        typeof paymentMethod.customer === 'string'
          ? paymentMethod.customer
          : paymentMethod.customer.id;

      // Find subscription by customer ID
      const subscription = await db('subscriptions')
        .where('stripe_customer_id', customerId)
        .first();

      if (!subscription) {
        return;
      }

      // Update payment method record
      const existingPM = await db('payment_methods')
        .where('stripe_payment_method_id', paymentMethod.id)
        .first();

      const paymentMethodData = {
        organization_id: subscription.organization_id,
        stripe_payment_method_id: paymentMethod.id,
        type: paymentMethod.type,
        last_four: paymentMethod.card?.last4 || null,
        brand: paymentMethod.card?.brand || null,
        exp_month: paymentMethod.card?.exp_month || null,
        exp_year: paymentMethod.card?.exp_year || null,
        funding: paymentMethod.card?.funding || null,
        is_active: true,
      };

      if (existingPM) {
        await db('payment_methods').where('id', existingPM.id).update(paymentMethodData);
      } else {
        await db('payment_methods').insert({
          ...paymentMethodData,
          created_at: new Date(),
        });
      }

      logger.info(`Payment method updated: ${paymentMethod.id}`);
    } catch (error) {
      logger.error('Error handling payment method update:', error);
      throw error;
    }
  }

  /**
   * Map Stripe subscription status to our status enum
   */
  private mapStripeStatus(stripeStatus: Stripe.Subscription.Status): SubscriptionStatus {
    const statusMap: Record<Stripe.Subscription.Status, SubscriptionStatus> = {
      active: 'active',
      past_due: 'past_due',
      canceled: 'canceled',
      unpaid: 'unpaid',
      incomplete: 'incomplete',
      incomplete_expired: 'incomplete_expired',
      trialing: 'trialing',
      paused: 'paused',
    };

    return statusMap[stripeStatus] || 'active';
  }

  /**
   * Handle subscription status changes
   */
  private async handleStatusChange(
    organizationId: string,
    oldStatus: SubscriptionStatus,
    newStatus: SubscriptionStatus,
    subscription: Stripe.Subscription
  ): Promise<void> {
    logger.info(
      `Subscription status changed for org ${organizationId}: ${oldStatus} -> ${newStatus}`
    );

    // Handle specific status transitions
    if (oldStatus === 'trialing' && newStatus === 'active') {
      // Trial converted to paid
      await this.sendSubscriptionEmail(organizationId, 'trial_converted', subscription);
    } else if (newStatus === 'past_due') {
      // Payment failed
      await this.sendSubscriptionEmail(organizationId, 'past_due', subscription);
    } else if (oldStatus === 'past_due' && newStatus === 'active') {
      // Payment recovered
      await this.sendSubscriptionEmail(organizationId, 'recovered', subscription);
    } else if (newStatus === 'canceled') {
      // Subscription canceled
      await pricingService.updateOrganizationTier(organizationId, 'free');
    }
  }

  /**
   * Handle plan/price changes
   */
  private async handlePlanChange(
    organizationId: string,
    oldPriceId: string | null,
    newPriceId: string,
    _subscription: Stripe.Subscription
  ): Promise<void> {
    const oldTier = oldPriceId ? getTierByPriceId(oldPriceId) : null;
    const newTier = getTierByPriceId(newPriceId);

    if (newTier) {
      logger.info(
        `Plan changed for org ${organizationId}: ${oldTier?.tier || 'none'} -> ${newTier.tier}`
      );

      // Update organization tier
      await pricingService.updateOrganizationTier(organizationId, newTier.tier);

      // Send plan change email
      await this.sendPlanChangeEmail(organizationId, oldTier?.tier || 'free', newTier.tier);
    }
  }

  /**
   * Store invoice in database
   */
  private async storeInvoice(organizationId: string, invoice: Stripe.Invoice): Promise<void> {
    try {
      // Get subscription ID from parent_subscription or lines
      let subscriptionId: string | null = null;
      if (
        invoice.parent &&
        typeof invoice.parent === 'object' &&
        'subscription_details' in invoice.parent
      ) {
        subscriptionId = (invoice.parent as any).subscription_details?.subscription || null;
      }
      if (!subscriptionId && invoice.lines?.data?.[0]?.subscription) {
        subscriptionId = invoice.lines.data[0].subscription as string;
      }

      // Get payment intent ID from payment settings or payment field
      let paymentIntentId: string | null = null;
      const paymentIntent = (invoice as any).payment_intent;
      if (typeof paymentIntent === 'string') {
        paymentIntentId = paymentIntent;
      } else if (paymentIntent && typeof paymentIntent === 'object') {
        paymentIntentId = paymentIntent.id;
      }

      // Check if invoice already exists
      const existing = await db('invoices').where('stripe_invoice_id', invoice.id).first();

      const invoiceData = {
        organization_id: organizationId,
        stripe_invoice_id: invoice.id,
        stripe_subscription_id: subscriptionId,
        stripe_payment_intent_id: paymentIntentId,
        amount_due: invoice.amount_due,
        amount_paid: invoice.amount_paid,
        amount_remaining: invoice.amount_remaining,
        subtotal: invoice.subtotal,
        tax: invoice.total_taxes?.[0]?.amount || 0,
        total: invoice.total,
        currency: invoice.currency,
        status: invoice.status,
        invoice_pdf: invoice.invoice_pdf,
        hosted_invoice_url: invoice.hosted_invoice_url,
        period_start: new Date(invoice.period_start * 1000),
        period_end: new Date(invoice.period_end * 1000),
        number: invoice.number,
        description: invoice.description,
        paid_at: invoice.status === 'paid' ? new Date() : null,
        due_date: invoice.due_date ? new Date(invoice.due_date * 1000) : null,
        attempt_count: invoice.attempt_count,
        next_payment_attempt: invoice.next_payment_attempt
          ? new Date(invoice.next_payment_attempt * 1000)
          : null,
      };

      if (existing) {
        await db('invoices').where('id', existing.id).update(invoiceData);
      } else {
        await db('invoices').insert({
          ...invoiceData,
          created_at: new Date(),
        });
      }
    } catch (error) {
      logger.error('Error storing invoice:', error);
      // Don't throw - invoice storage failure shouldn't break webhook processing
    }
  }

  /**
   * Log webhook event for audit trail
   */
  private async logWebhookEvent(
    organizationId: string,
    eventType: string,
    eventData: any,
    stripeEventId?: string
  ): Promise<void> {
    try {
      await db('billing_events').insert({
        organization_id: organizationId,
        event_type: eventType,
        stripe_event_id: stripeEventId || eventData.id,
        stripe_subscription_id: eventData.id,
        event_data: eventData,
        status: 'processed',
        processed_at: new Date(),
        created_at: new Date(),
      });
    } catch (error) {
      logger.error('Error logging webhook event:', error);
      // Don't throw - logging failure shouldn't break webhook processing
    }
  }

  /**
   * Send subscription-related email
   */
  private async sendSubscriptionEmail(
    organizationId: string,
    type: 'created' | 'canceled' | 'trial_converted' | 'past_due' | 'recovered',
    _subscription: Stripe.Subscription
  ): Promise<void> {
    try {
      const organization = await db('organizations').where('id', organizationId).first();

      if (!organization) {
        return;
      }

      const owner = await db('users').where('id', organization.owner_id).first();
      if (!owner) {
        return;
      }

      const emailTemplates: Record<string, { subject: string; html: string }> = {
        created: {
          subject: `Welcome to ${organization.name} on CogVeri!`,
          html: `
            <p>Your subscription has been created successfully.</p>
            <p>You now have access to all the features of your plan.</p>
          `,
        },
        canceled: {
          subject: `Your CogVeri subscription has been canceled`,
          html: `
            <p>Your subscription for ${organization.name} has been canceled.</p>
            <p>You'll continue to have access until the end of your billing period.</p>
          `,
        },
        trial_converted: {
          subject: `Your trial has converted to a paid subscription`,
          html: `
            <p>Great news! Your trial for ${organization.name} has successfully converted to a paid subscription.</p>
            <p>Thank you for choosing CogVeri!</p>
          `,
        },
        past_due: {
          subject: `Action required: Payment failed for ${organization.name}`,
          html: `
            <p>We were unable to process your payment for ${organization.name}.</p>
            <p>Please update your payment method to avoid service interruption.</p>
          `,
        },
        recovered: {
          subject: `Payment successful - Your subscription is active`,
          html: `
            <p>We've successfully processed your payment for ${organization.name}.</p>
            <p>Your subscription is now active again.</p>
          `,
        },
      };

      const template = emailTemplates[type];
      if (!template) {
        return;
      }

      await emailService.sendEmail({
        to: owner.email,
        subject: template.subject,
        html: template.html,
      });
    } catch (error) {
      logger.error('Error sending subscription email:', error);
      // Don't throw - email failure shouldn't break webhook processing
    }
  }

  /**
   * Send payment-related email
   */
  private async sendPaymentEmail(
    organizationId: string,
    type: 'paid' | 'failed',
    invoice: Stripe.Invoice
  ): Promise<void> {
    try {
      const organization = await db('organizations').where('id', organizationId).first();

      if (!organization) {
        return;
      }

      const owner = await db('users').where('id', organization.owner_id).first();
      if (!owner) {
        return;
      }

      const amount = (invoice.amount_paid / 100).toFixed(2);
      const currency = invoice.currency.toUpperCase();

      if (type === 'paid') {
        await emailService.sendEmail({
          to: owner.email,
          subject: `Payment receipt for ${organization.name}`,
          html: `
            <p>We've received your payment of ${currency} ${amount}.</p>
            <p>Invoice: ${invoice.number}</p>
            ${invoice.hosted_invoice_url ? `<p><a href="${invoice.hosted_invoice_url}">View Invoice</a></p>` : ''}
          `,
        });
      } else {
        await emailService.sendEmail({
          to: owner.email,
          subject: `Payment failed for ${organization.name}`,
          html: `
            <p>We were unable to process your payment of ${currency} ${amount}.</p>
            <p>Please update your payment method or try again.</p>
            ${invoice.hosted_invoice_url ? `<p><a href="${invoice.hosted_invoice_url}">Pay Invoice</a></p>` : ''}
          `,
        });
      }
    } catch (error) {
      logger.error('Error sending payment email:', error);
    }
  }

  /**
   * Send trial ending email
   */
  private async sendTrialEndingEmail(
    organizationId: string,
    subscription: Stripe.Subscription
  ): Promise<void> {
    try {
      const organization = await db('organizations').where('id', organizationId).first();

      if (!organization) {
        return;
      }

      const owner = await db('users').where('id', organization.owner_id).first();
      if (!owner) {
        return;
      }

      const trialEnd = subscription.trial_end
        ? new Date(subscription.trial_end * 1000).toLocaleDateString()
        : 'soon';

      await emailService.sendEmail({
        to: owner.email,
        subject: `Your CogVeri trial ends ${trialEnd}`,
        html: `
          <p>Your trial for ${organization.name} is ending ${trialEnd}.</p>
          <p>To continue using CogVeri, please add a payment method.</p>
          <p>If you don't add a payment method, your account will be downgraded to the free tier.</p>
        `,
      });
    } catch (error) {
      logger.error('Error sending trial ending email:', error);
    }
  }

  /**
   * Send plan change email
   */
  private async sendPlanChangeEmail(
    organizationId: string,
    oldTier: string,
    newTier: string
  ): Promise<void> {
    try {
      const organization = await db('organizations').where('id', organizationId).first();

      if (!organization) {
        return;
      }

      const owner = await db('users').where('id', organization.owner_id).first();
      if (!owner) {
        return;
      }

      const isUpgrade =
        ['free', 'enterprise'].indexOf(newTier) > ['free', 'enterprise'].indexOf(oldTier);

      await emailService.sendEmail({
        to: owner.email,
        subject: `Your plan has been ${isUpgrade ? 'upgraded' : 'changed'}`,
        html: `
          <p>Your plan for ${organization.name} has been ${isUpgrade ? 'upgraded' : 'changed'} from ${oldTier} to ${newTier}.</p>
          <p>Your new features are now available.</p>
        `,
      });
    } catch (error) {
      logger.error('Error sending plan change email:', error);
    }
  }
}

export const subscriptionService = new SubscriptionService();
export default subscriptionService;
