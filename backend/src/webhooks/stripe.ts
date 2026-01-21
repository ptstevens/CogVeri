import { Request, Response } from 'express';
import Stripe from 'stripe';
import { Knex } from 'knex';
import { db } from '../config/database';
import { PRICING_TIERS } from '../services/pricing.service';
import { billingService } from '../services/billing.service';
import metricsService from '../services/metrics.service';
import { getIO } from '../services/socket.service';
import { logger } from '../utils/logger';
import {
  stripe,
  isStripeEnabled,
  STRIPE_WEBHOOK_SECRET,
  getTierByPriceId,
  GRACE_PERIOD_DAYS,
} from '../config/stripe';

/**
 * Get tier name from Stripe price ID using centralized config
 * Returns null if price ID is not recognized
 */
const getTierFromPriceId = (priceId: string): string | null => {
  const tierInfo = getTierByPriceId(priceId);
  return tierInfo?.tier || null;
};

/**
 * Helper to extract current period from subscription items
 * In newer Stripe API, current_period is on subscription items, not subscription
 */
const getCurrentPeriodFromSubscription = (subscription: Stripe.Subscription): {
  currentPeriodStart: number;
  currentPeriodEnd: number;
} => {
  // Get from first subscription item
  const firstItem = subscription.items.data[0];
  if (firstItem) {
    return {
      currentPeriodStart: firstItem.current_period_start,
      currentPeriodEnd: firstItem.current_period_end,
    };
  }
  // Fallback to start_date and cancel_at if available
  return {
    currentPeriodStart: subscription.start_date,
    currentPeriodEnd: subscription.cancel_at || subscription.start_date,
  };
};

/**
 * Attempt to claim an event for processing (atomic idempotency).
 * Uses INSERT ... ON CONFLICT to prevent race conditions.
 * Returns true if successfully claimed, false if already processed/processing.
 */
const claimEventForProcessing = async (eventId: string, eventType: string): Promise<boolean> => {
  try {
    // Atomic insert - will fail silently on conflict due to unique constraint
    const result = await db('stripe_webhook_events')
      .insert({
        event_id: eventId,
        event_type: eventType,
        status: 'processing',
        processed_at: new Date(),
      })
      .onConflict('event_id')
      .ignore();

    // Check if insert succeeded (we claimed it) - result varies by DB driver
    // For PostgreSQL with knex, check if any rows were inserted
    const rowsInserted = Array.isArray(result) ? result.length : (result as any)?.rowCount ?? 1;

    if (rowsInserted === 0) {
      // Event already exists, check if it's still processing or completed
      const existing = await db('stripe_webhook_events')
        .where('event_id', eventId)
        .first();

      if (existing?.status === 'failed') {
        // Allow retry of failed events
        await db('stripe_webhook_events')
          .where('event_id', eventId)
          .update({
            status: 'processing',
            retry_count: db.raw('COALESCE(retry_count, 0) + 1'),
            processed_at: new Date(),
          });
        return true;
      }
      return false;
    }

    return true;
  } catch (error) {
    // Table might not exist yet - try to proceed anyway
    logger.warn('Could not claim webhook event:', { error: String(error), eventId });
    return true; // Allow processing if idempotency check fails
  }
};

/**
 * Mark event as successfully completed
 */
const markEventCompleted = async (eventId: string): Promise<void> => {
  try {
    await db('stripe_webhook_events')
      .where('event_id', eventId)
      .update({
        status: 'completed',
        completed_at: new Date(),
      });
  } catch (error) {
    logger.warn('Could not mark webhook event completed:', { error: String(error), eventId });
  }
};

/**
 * Mark event as failed for potential retry
 */
const markEventFailed = async (eventId: string, errorMessage: string): Promise<void> => {
  try {
    await db('stripe_webhook_events')
      .where('event_id', eventId)
      .update({
        status: 'failed',
        error_message: errorMessage.substring(0, 1000), // Truncate long errors
      });
  } catch (error) {
    logger.warn('Could not mark webhook event failed:', { error: String(error), eventId });
  }
};

/**
 * Create audit log entry for billing events
 * Non-blocking - failures won't break the main webhook processing
 * @param trx - Optional knex transaction to use
 */
const createBillingAuditLog = async (
  organizationId: string,
  action: string,
  resourceType: string,
  resourceId: string,
  changes: Record<string, any>,
  trx?: Knex.Transaction
): Promise<void> => {
  try {
    const query = trx || db;
    await query('organization_audit_logs').insert({
      organization_id: organizationId,
      actor_id: null, // System action
      action,
      resource_type: resourceType,
      resource_id: null, // Stripe IDs are not UUIDs, store in changes instead
      changes: { ...changes, stripe_resource_id: resourceId },
      metadata: { source: 'stripe_webhook', stripe_resource_type: resourceType },
      status: 'success',
      created_at: new Date(),
    });
  } catch (error) {
    // Log but don't fail - audit logging shouldn't break billing
    logger.warn('Failed to create billing audit log (non-critical):', {
      error: String(error),
      organizationId,
      action
    });
  }
};

/**
 * Emit subscription changed event via WebSocket
 * Frontend listens for this to invalidate React Query cache
 */
const emitSubscriptionChanged = (
  organizationId: string,
  event: 'created' | 'updated' | 'deleted' | 'restored',
  tier: string | null,
  status: string
): void => {
  try {
    const io = getIO();
    if (io) {
      io.to(`org:${organizationId}`).emit('subscription:changed', {
        event,
        tier,
        status,
        timestamp: new Date().toISOString(),
      });
      logger.debug(`Emitted subscription:changed event to org ${organizationId}`);
    }
  } catch (error) {
    // Non-blocking - WebSocket failure shouldn't break webhook processing
    logger.warn('Failed to emit subscription changed event:', { error: String(error) });
  }
};

/**
 * Handle checkout.session.completed - New subscription created via checkout
 * Uses database transaction to ensure atomicity
 */
const handleCheckoutSessionCompleted = async (
  session: Stripe.Checkout.Session
): Promise<void> => {
  const organizationId = session.metadata?.organizationId;

  if (!organizationId) {
    logger.warn('Checkout session completed without organizationId in metadata', {
      sessionId: session.id,
    });
    return;
  }

  if (session.mode !== 'subscription') {
    logger.info('Checkout session is not for subscription, skipping', {
      sessionId: session.id,
      mode: session.mode,
    });
    return;
  }

  const subscriptionId = session.subscription as string;
  const customerId = session.customer as string;

  // Fetch the full subscription from Stripe to get tier info
  // This ensures instant tier update even if customer.subscription.created webhook is delayed
  let tierName: string | null = null;
  let subscriptionStatus: string = 'active';
  let currentPeriodEnd: number | null = null;

  if (stripe && subscriptionId) {
    try {
      // Expand price data to access metadata
      const subscription = await stripe.subscriptions.retrieve(subscriptionId, {
        expand: ['items.data.price'],
      });
      const price = subscription.items.data[0]?.price;
      const priceId = price?.id;

      // Primary: Get tier from price metadata (most reliable)
      // Fallback: Use PRICE_ID_TO_TIER map (requires env vars)
      const priceMetadata = price && typeof price === 'object' ? price.metadata : null;
      tierName = priceMetadata?.tier || (priceId ? getTierFromPriceId(priceId) : null);

      subscriptionStatus = subscription.status;
      // Use helper to extract current period from subscription items (newer Stripe API)
      const periodInfo = getCurrentPeriodFromSubscription(subscription);
      currentPeriodEnd = periodInfo.currentPeriodEnd;

      logger.info('Retrieved subscription details for checkout completion', {
        subscriptionId,
        priceId,
        tierName,
        tierSource: priceMetadata?.tier ? 'price_metadata' : 'price_id_map',
        status: subscriptionStatus,
      });
    } catch (err) {
      logger.error('Failed to retrieve subscription from Stripe', {
        subscriptionId,
        error: err instanceof Error ? err.message : String(err),
      });
      // Continue with basic update - subscription.created webhook will handle tier
    }
  }

  // Use transaction to ensure atomicity
  await db.transaction(async (trx) => {
    // Build update object with all subscription details
    const updates: Record<string, any> = {
      stripe_customer_id: customerId,
      stripe_subscription_id: subscriptionId,
      subscription_status: subscriptionStatus,
      updated_at: new Date(),
    };

    // Update tier and limits if we successfully got the tier info
    if (tierName) {
      const tier = PRICING_TIERS[tierName];
      if (tier) {
        updates.subscription_tier = tierName;
        updates.max_members = tier.limits.maxMembers === -1 ? 999999 : tier.limits.maxMembers;
        updates.max_recordings_gb = tier.limits.maxStorageGb === -1 ? 999999 : tier.limits.maxStorageGb;
        updates.max_tasks_per_month = tier.limits.maxTasksPerMonth === -1 ? 999999 : tier.limits.maxTasksPerMonth;
      }
    }

    if (currentPeriodEnd) {
      updates.subscription_expiry = new Date(currentPeriodEnd * 1000);
    }

    // Update organization with Stripe IDs and subscription details
    await trx('organizations').where('id', organizationId).update(updates);

    // Ensure organization_subscriptions record exists (quota-enforcer middleware depends on this)
    const existingSub = await trx('organization_subscriptions')
      .where('organization_id', organizationId)
      .first();

    const subscriptionRecord = {
      organization_id: organizationId,
      tier: tierName || 'free',
      status: subscriptionStatus === 'trialing' ? 'trialing' : 'active',
      billing_interval: 'monthly',
      is_trial: subscriptionStatus === 'trialing',
      current_period_start: new Date(),
      current_period_end: currentPeriodEnd ? new Date(currentPeriodEnd * 1000) : new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
      stripe_subscription_id: subscriptionId,
      stripe_customer_id: customerId,
      updated_at: new Date(),
    };

    if (existingSub) {
      await trx('organization_subscriptions')
        .where('organization_id', organizationId)
        .update(subscriptionRecord);
    } else {
      await trx('organization_subscriptions').insert({
        ...subscriptionRecord,
        created_at: new Date(),
      });
    }

    // Create audit log within same transaction
    await createBillingAuditLog(
      organizationId,
      'checkout_completed',
      'subscription',
      subscriptionId,
      {
        customerId,
        sessionId: session.id,
        tier: tierName,
        status: subscriptionStatus,
      },
      trx
    );
  });

  // Invalidate cache so new limits take effect immediately
  metricsService.invalidateOrganizationCache(organizationId);
  metricsService.invalidateRateLimitCache(organizationId);

  // Notify frontend via WebSocket to refresh billing data
  emitSubscriptionChanged(organizationId, 'created', tierName, subscriptionStatus);

  logger.info('Checkout completed - organization updated with subscription', {
    organizationId,
    subscriptionId,
    customerId,
    tier: tierName,
    status: subscriptionStatus,
  });
};

/**
 * Handle customer.subscription.created
 * Uses database transaction to ensure atomicity
 */
const handleSubscriptionCreated = async (
  subscription: Stripe.Subscription
): Promise<void> => {
  const organizationId = subscription.metadata?.organizationId;
  const customerId = subscription.customer as string;

  // Find organization by customer ID if not in metadata
  let orgId = organizationId;
  if (!orgId) {
    const org = await db('organizations')
      .where('stripe_customer_id', customerId)
      .first();
    orgId = org?.id;
  }

  if (!orgId) {
    logger.warn('Subscription created but could not find organization', {
      subscriptionId: subscription.id,
      customerId,
    });
    return;
  }

  // Get tier from price metadata (primary) or price ID map (fallback)
  const price = subscription.items.data[0]?.price;
  const priceId = typeof price === 'string' ? price : price?.id;
  const priceMetadata = price && typeof price === 'object' ? price.metadata : null;
  const tierName = priceMetadata?.tier || (priceId ? getTierFromPriceId(priceId) : null);

  // Get current period from subscription items
  const { currentPeriodEnd } = getCurrentPeriodFromSubscription(subscription);

  // Update organization
  const updates: Record<string, any> = {
    stripe_subscription_id: subscription.id,
    subscription_status: subscription.status,
    updated_at: new Date(),
  };

  if (tierName && PRICING_TIERS[tierName]) {
    updates.subscription_tier = tierName;
    // Also update limits based on new tier
    const tier = PRICING_TIERS[tierName];
    updates.max_members = tier.limits.maxMembers === -1 ? 999999 : tier.limits.maxMembers;
    updates.max_recordings_gb = tier.limits.maxStorageGb === -1 ? 999999 : tier.limits.maxStorageGb;
    updates.max_tasks_per_month =
      tier.limits.maxTasksPerMonth === -1 ? 999999 : tier.limits.maxTasksPerMonth;
  }

  if (currentPeriodEnd) {
    updates.subscription_expiry = new Date(currentPeriodEnd * 1000);
  }

  // Use transaction to ensure atomicity
  await db.transaction(async (trx) => {
    await trx('organizations').where('id', orgId).update(updates);

    // Ensure organization_subscriptions record exists (quota-enforcer middleware depends on this)
    const existingSub = await trx('organization_subscriptions')
      .where('organization_id', orgId)
      .first();

    const subscriptionRecord = {
      organization_id: orgId,
      tier: tierName || 'free',
      status: subscription.status === 'trialing' ? 'trialing' : 'active',
      billing_interval: 'monthly',
      is_trial: subscription.status === 'trialing',
      current_period_start: new Date(),
      current_period_end: currentPeriodEnd ? new Date(currentPeriodEnd * 1000) : new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
      stripe_subscription_id: subscription.id,
      stripe_customer_id: customerId,
      updated_at: new Date(),
    };

    if (existingSub) {
      await trx('organization_subscriptions')
        .where('organization_id', orgId)
        .update(subscriptionRecord);
    } else {
      await trx('organization_subscriptions').insert({
        ...subscriptionRecord,
        created_at: new Date(),
      });
    }

    await createBillingAuditLog(orgId, 'subscription_created', 'subscription', subscription.id, {
      status: subscription.status,
      tier: tierName,
      priceId,
      currentPeriodEnd,
    }, trx);
  });

  // Invalidate cache so new limits take effect immediately
  metricsService.invalidateOrganizationCache(orgId);
  metricsService.invalidateRateLimitCache(orgId);

  // Notify frontend via WebSocket to refresh billing data
  emitSubscriptionChanged(orgId, 'created', tierName, subscription.status);

  logger.info('Subscription created', {
    organizationId: orgId,
    subscriptionId: subscription.id,
    status: subscription.status,
    tier: tierName,
  });
};

/**
 * Handle customer.subscription.updated
 * Uses database transaction to ensure atomicity
 */
const handleSubscriptionUpdated = async (
  subscription: Stripe.Subscription
): Promise<void> => {
  const customerId = subscription.customer as string;

  // Find organization by subscription ID or customer ID
  let org = await db('organizations')
    .where('stripe_subscription_id', subscription.id)
    .first();

  if (!org) {
    org = await db('organizations').where('stripe_customer_id', customerId).first();
  }

  if (!org) {
    logger.warn('Subscription updated but could not find organization', {
      subscriptionId: subscription.id,
      customerId,
    });
    return;
  }

  // Get tier from price metadata (primary) or price ID map (fallback)
  const price = subscription.items.data[0]?.price;
  const priceId = typeof price === 'string' ? price : price?.id;
  const priceMetadata = price && typeof price === 'object' ? price.metadata : null;
  const tierName = priceMetadata?.tier || (priceId ? getTierFromPriceId(priceId) : null);

  const previousTier = org.subscription_tier;
  const previousStatus = org.subscription_status;

  // Get current period from subscription items
  const { currentPeriodEnd } = getCurrentPeriodFromSubscription(subscription);

  // Update organization
  const updates: Record<string, any> = {
    stripe_subscription_id: subscription.id,
    subscription_status: subscription.status,
    updated_at: new Date(),
  };

  if (tierName && PRICING_TIERS[tierName]) {
    updates.subscription_tier = tierName;
    // Update limits based on tier
    const tier = PRICING_TIERS[tierName];
    updates.max_members = tier.limits.maxMembers === -1 ? 999999 : tier.limits.maxMembers;
    updates.max_recordings_gb = tier.limits.maxStorageGb === -1 ? 999999 : tier.limits.maxStorageGb;
    updates.max_tasks_per_month =
      tier.limits.maxTasksPerMonth === -1 ? 999999 : tier.limits.maxTasksPerMonth;
  }

  if (currentPeriodEnd) {
    updates.subscription_expiry = new Date(currentPeriodEnd * 1000);
  }

  // Handle cancellation scheduled
  if (subscription.cancel_at_period_end) {
    updates.cancel_at_period_end = true;
    updates.cancel_at = subscription.cancel_at
      ? new Date(subscription.cancel_at * 1000)
      : null;
  } else {
    updates.cancel_at_period_end = false;
    updates.cancel_at = null;
  }

  // Use transaction to ensure atomicity
  await db.transaction(async (trx) => {
    await trx('organizations').where('id', org.id).update(updates);

    // Ensure organization_subscriptions record is kept in sync
    const existingSub = await trx('organization_subscriptions')
      .where('organization_id', org.id)
      .first();

    // Map Stripe status to our status
    let subStatus: 'active' | 'trialing' | 'canceled' | 'expired' | 'past_due' = 'active';
    if (subscription.status === 'trialing') subStatus = 'trialing';
    else if (subscription.status === 'canceled') subStatus = 'canceled';
    else if (subscription.status === 'past_due') subStatus = 'past_due';
    else if (subscription.status === 'unpaid') subStatus = 'expired';

    const subscriptionRecord = {
      organization_id: org.id,
      tier: tierName || org.subscription_tier || 'free',
      status: subStatus,
      is_trial: subscription.status === 'trialing',
      current_period_end: currentPeriodEnd ? new Date(currentPeriodEnd * 1000) : new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
      stripe_subscription_id: subscription.id,
      stripe_customer_id: customerId,
      cancel_at_period_end: subscription.cancel_at_period_end || false,
      canceled_at: subscription.canceled_at ? new Date(subscription.canceled_at * 1000) : null,
      updated_at: new Date(),
    };

    if (existingSub) {
      await trx('organization_subscriptions')
        .where('organization_id', org.id)
        .update(subscriptionRecord);
    } else {
      await trx('organization_subscriptions').insert({
        ...subscriptionRecord,
        billing_interval: 'monthly',
        current_period_start: new Date(),
        created_at: new Date(),
      });
    }

    await createBillingAuditLog(org.id, 'subscription_updated', 'subscription', subscription.id, {
      status: subscription.status,
      previousStatus,
      tier: tierName,
      previousTier,
      priceId,
      cancelAtPeriodEnd: subscription.cancel_at_period_end,
      currentPeriodEnd,
    }, trx);
  });

  // Invalidate cache so new limits take effect immediately
  metricsService.invalidateOrganizationCache(org.id);
  metricsService.invalidateRateLimitCache(org.id);

  // Notify frontend via WebSocket to refresh billing data
  emitSubscriptionChanged(org.id, 'updated', tierName, subscription.status);

  logger.info('Subscription updated', {
    organizationId: org.id,
    subscriptionId: subscription.id,
    status: subscription.status,
    previousStatus,
    tier: tierName,
    previousTier,
    cancelAtPeriodEnd: subscription.cancel_at_period_end,
  });
};

/**
 * Handle customer.subscription.deleted
 * Uses database transaction to ensure atomicity
 */
const handleSubscriptionDeleted = async (
  subscription: Stripe.Subscription
): Promise<void> => {
  const customerId = subscription.customer as string;

  // Find organization
  let org = await db('organizations')
    .where('stripe_subscription_id', subscription.id)
    .first();

  if (!org) {
    org = await db('organizations').where('stripe_customer_id', customerId).first();
  }

  if (!org) {
    logger.warn('Subscription deleted but could not find organization', {
      subscriptionId: subscription.id,
      customerId,
    });
    return;
  }

  const previousTier = org.subscription_tier;

  // Downgrade to free tier
  const freeTier = PRICING_TIERS.free!;

  // Use transaction to ensure atomicity
  await db.transaction(async (trx) => {
    await trx('organizations')
      .where('id', org.id)
      .update({
        subscription_status: 'canceled',
        subscription_tier: 'free',
        stripe_subscription_id: null, // Clear subscription ID
        subscription_expiry: null,
        cancel_at_period_end: false,
        cancel_at: null,
        max_members: freeTier.limits.maxMembers,
        max_recordings_gb: freeTier.limits.maxStorageGb,
        max_tasks_per_month: freeTier.limits.maxTasksPerMonth,
        updated_at: new Date(),
      });

    await createBillingAuditLog(org.id, 'subscription_deleted', 'subscription', subscription.id, {
      previousTier,
      newTier: 'free',
      reason: subscription.cancellation_details?.reason,
    }, trx);
  });

  // Invalidate cache so new limits take effect immediately
  metricsService.invalidateOrganizationCache(org.id);
  metricsService.invalidateRateLimitCache(org.id);

  // Notify frontend via WebSocket to refresh billing data
  emitSubscriptionChanged(org.id, 'deleted', 'free', 'canceled');

  logger.info('Subscription deleted - organization downgraded to free', {
    organizationId: org.id,
    subscriptionId: subscription.id,
    previousTier,
  });
};

/**
 * Helper to get subscription ID from invoice
 * In newer Stripe API, subscription is accessed via parent.subscription_details.subscription
 */
const getSubscriptionIdFromInvoice = (invoice: Stripe.Invoice): string | null => {
  const subscriptionDetails = invoice.parent?.subscription_details;
  if (!subscriptionDetails) {
    return null;
  }
  const subscription = subscriptionDetails.subscription;
  return typeof subscription === 'string' ? subscription : subscription?.id || null;
};

/**
 * Handle invoice.paid - Successful payment
 * Uses database transaction to ensure atomicity
 */
const handleInvoicePaid = async (invoice: Stripe.Invoice): Promise<void> => {
  const customerId = invoice.customer as string;
  // Get subscription ID from invoice
  const subscriptionId = getSubscriptionIdFromInvoice(invoice);

  if (!subscriptionId) {
    // One-time payment, not subscription-related
    return;
  }

  const org = await db('organizations').where('stripe_customer_id', customerId).first();

  if (!org) {
    logger.warn('Invoice paid but could not find organization', {
      invoiceId: invoice.id,
      customerId,
    });
    return;
  }

  // Use transaction to ensure atomicity
  await db.transaction(async (trx) => {
    // Ensure subscription is marked as active and clear any suspension
    await trx('organizations')
      .where('id', org.id)
      .update({
        subscription_status: 'active',
        payment_failed_at: null, // Clear any previous payment failure
        payment_failure_count: 0,
        grace_period_expires_at: null, // Clear grace period
        is_suspended: false, // Restore access if suspended
        suspended_at: null,
        suspension_reason: null,
        updated_at: new Date(),
      });

    await createBillingAuditLog(org.id, 'invoice_paid', 'invoice', invoice.id, {
      amount: invoice.amount_paid,
      currency: invoice.currency,
      subscriptionId,
      invoiceNumber: invoice.number,
      wasSuspended: org.is_suspended,
    }, trx);
  });

  // Invalidate cache so restored access takes effect immediately
  metricsService.invalidateOrganizationCache(org.id);
  metricsService.invalidateRateLimitCache(org.id);

  // Notify frontend via WebSocket to refresh billing data
  emitSubscriptionChanged(org.id, 'restored', org.subscription_tier, 'active');

  logger.info('Invoice paid', {
    organizationId: org.id,
    invoiceId: invoice.id,
    amount: invoice.amount_paid,
    currency: invoice.currency,
    restoredFromSuspension: org.is_suspended,
  });
};

/**
 * Handle invoice.payment_failed - Payment failed (triggers dunning)
 * Uses database transaction to ensure atomicity
 * Enforces grace period before suspension
 */
const handleInvoicePaymentFailed = async (invoice: Stripe.Invoice): Promise<void> => {
  const customerId = invoice.customer as string;
  // Get subscription ID from invoice
  const subscriptionId = getSubscriptionIdFromInvoice(invoice);

  if (!subscriptionId) {
    return;
  }

  const org = await db('organizations').where('stripe_customer_id', customerId).first();

  if (!org) {
    logger.warn('Invoice payment failed but could not find organization', {
      invoiceId: invoice.id,
      customerId,
    });
    return;
  }

  // Track payment failure
  const failureCount = (org.payment_failure_count || 0) + 1;
  const now = new Date();

  // Determine first failure timestamp (don't overwrite if already set)
  const firstFailureAt = org.payment_failed_at || now;

  // Calculate grace period expiry
  const gracePeriodExpiry = new Date(firstFailureAt);
  gracePeriodExpiry.setDate(gracePeriodExpiry.getDate() + GRACE_PERIOD_DAYS);

  // Check if grace period has expired
  const isGracePeriodExpired = now > gracePeriodExpiry;

  // Prepare update
  const updates: Record<string, any> = {
    subscription_status: 'past_due',
    payment_failed_at: firstFailureAt,
    payment_failure_count: failureCount,
    grace_period_expires_at: gracePeriodExpiry,
    updated_at: now,
  };

  // Suspend if grace period expired
  if (isGracePeriodExpired && !org.is_suspended) {
    updates.is_suspended = true;
    updates.suspended_at = now;
    updates.suspension_reason = 'grace_period_expired';
    logger.warn('Organization suspended due to expired grace period', {
      organizationId: org.id,
      firstFailureAt,
      gracePeriodExpiry,
      failureCount,
    });
  }

  // Use transaction to ensure atomicity
  await db.transaction(async (trx) => {
    await trx('organizations').where('id', org.id).update(updates);

    await createBillingAuditLog(org.id, 'payment_failed', 'invoice', invoice.id, {
      amount: invoice.amount_due,
      currency: invoice.currency,
      subscriptionId,
      attemptCount: invoice.attempt_count,
      failureCount,
      nextPaymentAttempt: invoice.next_payment_attempt,
      gracePeriodExpiry: gracePeriodExpiry.toISOString(),
      isGracePeriodExpired,
      suspended: isGracePeriodExpired && !org.is_suspended,
    }, trx);
  });

  // Invalidate cache so suspension status takes effect immediately
  metricsService.invalidateOrganizationCache(org.id);
  metricsService.invalidateRateLimitCache(org.id);

  // Notify frontend via WebSocket to refresh billing data
  emitSubscriptionChanged(org.id, 'updated', org.subscription_tier, 'past_due');

  logger.warn('Invoice payment failed', {
    organizationId: org.id,
    invoiceId: invoice.id,
    amount: invoice.amount_due,
    attemptCount: invoice.attempt_count,
    failureCount,
    gracePeriodExpiry: gracePeriodExpiry.toISOString(),
    isGracePeriodExpired,
  });

  // Send dunning email to organization owner
  await billingService.sendDunningEmail(
    org.id,
    failureCount,
    invoice.amount_due,
    invoice.currency,
    invoice.next_payment_attempt,
    invoice.hosted_invoice_url
  );
};

/**
 * Handle invoice.payment_action_required - 3D Secure required
 */
const handlePaymentActionRequired = async (invoice: Stripe.Invoice): Promise<void> => {
  const customerId = invoice.customer as string;

  const org = await db('organizations').where('stripe_customer_id', customerId).first();

  if (!org) {
    logger.warn('Payment action required but could not find organization', {
      invoiceId: invoice.id,
      customerId,
    });
    return;
  }

  logger.info('Payment action required (3DS)', {
    organizationId: org.id,
    invoiceId: invoice.id,
    hostedInvoiceUrl: invoice.hosted_invoice_url,
  });

  await createBillingAuditLog(org.id, 'payment_action_required', 'invoice', invoice.id, {
    hostedInvoiceUrl: invoice.hosted_invoice_url,
  });

  // Send email to organization owner about required action
  if (invoice.hosted_invoice_url) {
    await billingService.sendPaymentActionRequiredEmail(
      org.id,
      invoice.hosted_invoice_url
    );
  }
};

/**
 * Handle customer.updated
 */
const handleCustomerUpdated = async (customer: Stripe.Customer): Promise<void> => {
  const org = await db('organizations')
    .where('stripe_customer_id', customer.id)
    .first();

  if (!org) {
    // Customer might not be linked to an organization yet
    return;
  }

  logger.info('Customer updated', {
    organizationId: org.id,
    customerId: customer.id,
    email: customer.email,
  });
};

/**
 * Handle payment_method.attached
 */
const handlePaymentMethodAttached = async (
  paymentMethod: Stripe.PaymentMethod
): Promise<void> => {
  const customerId = paymentMethod.customer as string;

  if (!customerId) {
    return;
  }

  const org = await db('organizations').where('stripe_customer_id', customerId).first();

  if (!org) {
    return;
  }

  logger.info('Payment method attached', {
    organizationId: org.id,
    paymentMethodId: paymentMethod.id,
    type: paymentMethod.type,
    cardBrand: paymentMethod.card?.brand,
    cardLast4: paymentMethod.card?.last4,
  });

  await createBillingAuditLog(
    org.id,
    'payment_method_attached',
    'payment_method',
    paymentMethod.id,
    {
      type: paymentMethod.type,
      cardBrand: paymentMethod.card?.brand,
      cardLast4: paymentMethod.card?.last4,
    }
  );
};

/**
 * Handle payment_method.detached
 */
const handlePaymentMethodDetached = async (
  paymentMethod: Stripe.PaymentMethod
): Promise<void> => {
  // Note: customer might be null if already detached
  // We log this but can't easily link to organization without customer

  logger.info('Payment method detached', {
    paymentMethodId: paymentMethod.id,
    type: paymentMethod.type,
    cardLast4: paymentMethod.card?.last4,
  });
};

/**
 * Handle charge.dispute.created - Customer disputed a charge
 * CRITICAL: Disputes are serious and require immediate attention
 */
const handleChargeDisputeCreated = async (dispute: Stripe.Dispute): Promise<void> => {
  const chargeId = typeof dispute.charge === 'string'
    ? dispute.charge
    : (dispute.charge)?.id;

  if (!chargeId) {
    logger.warn('Dispute created without charge ID', { disputeId: dispute.id });
    return;
  }

  // Get the charge to find the customer
  let customerId: string | null = null;
  try {
    if (stripe) {
      const charge = await stripe.charges.retrieve(chargeId);
      customerId = typeof charge.customer === 'string'
        ? charge.customer
        : (charge.customer as Stripe.Customer)?.id || null;
    }
  } catch (error) {
    logger.error('Failed to retrieve charge for dispute', {
      disputeId: dispute.id,
      chargeId,
      error: String(error),
    });
    return;
  }

  if (!customerId) {
    logger.warn('Dispute charge has no customer', { disputeId: dispute.id, chargeId });
    return;
  }

  const org = await db('organizations')
    .where('stripe_customer_id', customerId)
    .first();

  if (!org) {
    logger.warn('Dispute for unknown customer', { disputeId: dispute.id, customerId });
    return;
  }

  // Use transaction to ensure atomicity
  await db.transaction(async (trx) => {
    // Record the dispute
    await trx('billing_disputes').insert({
      organization_id: org.id,
      stripe_dispute_id: dispute.id,
      stripe_charge_id: chargeId,
      amount: dispute.amount,
      currency: dispute.currency,
      reason: dispute.reason,
      status: dispute.status,
      created_at: new Date(),
      updated_at: new Date(),
    }).onConflict('stripe_dispute_id').ignore();

    // Create audit log
    await createBillingAuditLog(
      org.id,
      'charge_disputed',
      'dispute',
      dispute.id,
      {
        amount: dispute.amount,
        currency: dispute.currency,
        reason: dispute.reason,
        chargeId,
        status: dispute.status,
      },
      trx
    );
  });

  // Alert the team - disputes are serious and can result in penalties
  logger.error('CHARGE DISPUTED - Requires immediate attention', {
    organizationId: org.id,
    organizationName: org.name,
    disputeId: dispute.id,
    amount: dispute.amount / 100,
    currency: dispute.currency,
    reason: dispute.reason,
  });
};

/**
 * Handle charge.dispute.closed - Dispute has been resolved
 */
const handleChargeDisputeClosed = async (dispute: Stripe.Dispute): Promise<void> => {
  try {
    await db('billing_disputes')
      .where('stripe_dispute_id', dispute.id)
      .update({
        status: dispute.status,
        updated_at: new Date(),
      });

    logger.info('Dispute closed', {
      disputeId: dispute.id,
      status: dispute.status, // won, lost, warning_closed
    });
  } catch (error) {
    logger.warn('Could not update dispute status', {
      disputeId: dispute.id,
      error: String(error),
    });
  }
};

/**
 * Handle charge.refunded - A charge was refunded
 */
const handleChargeRefunded = async (charge: Stripe.Charge): Promise<void> => {
  const customerId = typeof charge.customer === 'string'
    ? charge.customer
    : (charge.customer as Stripe.Customer)?.id || null;

  if (!customerId) {
    logger.info('Refunded charge has no customer', { chargeId: charge.id });
    return;
  }

  const org = await db('organizations')
    .where('stripe_customer_id', customerId)
    .first();

  if (!org) {
    logger.info('Refund for unknown customer', { chargeId: charge.id, customerId });
    return;
  }

  await createBillingAuditLog(
    org.id,
    'charge_refunded',
    'charge',
    charge.id,
    {
      amount_refunded: charge.amount_refunded,
      currency: charge.currency,
      refund_reason: charge.refunds?.data?.[0]?.reason,
      refund_id: charge.refunds?.data?.[0]?.id,
    }
  );

  logger.info('Charge refunded', {
    organizationId: org.id,
    chargeId: charge.id,
    amountRefunded: charge.amount_refunded,
    currency: charge.currency,
  });
};

/**
 * Handle customer.deleted - Customer removed from Stripe
 * Clears all Stripe references and downgrades to free tier
 */
const handleCustomerDeleted = async (customer: Stripe.Customer): Promise<void> => {
  const org = await db('organizations')
    .where('stripe_customer_id', customer.id)
    .first();

  if (!org) {
    logger.info('Deleted customer not found in database', { customerId: customer.id });
    return;
  }

  const previousTier = org.subscription_tier;
  const freeTier = PRICING_TIERS.free!;

  // Use transaction to ensure atomicity
  await db.transaction(async (trx) => {
    // Clear Stripe references and downgrade to free
    await trx('organizations').where('id', org.id).update({
      stripe_customer_id: null,
      stripe_subscription_id: null,
      subscription_status: 'canceled',
      subscription_tier: 'free',
      subscription_expiry: null,
      cancel_at_period_end: false,
      cancel_at: null,
      payment_failed_at: null,
      payment_failure_count: 0,
      grace_period_expires_at: null,
      is_suspended: false,
      suspended_at: null,
      suspension_reason: null,
      max_members: freeTier.limits.maxMembers,
      max_recordings_gb: freeTier.limits.maxStorageGb,
      max_tasks_per_month: freeTier.limits.maxTasksPerMonth,
      updated_at: new Date(),
    });

    await createBillingAuditLog(
      org.id,
      'customer_deleted',
      'customer',
      customer.id,
      {
        previousTier,
        newTier: 'free',
        reason: 'Stripe customer deleted',
      },
      trx
    );
  });

  // Invalidate cache so downgrade takes effect immediately
  metricsService.invalidateOrganizationCache(org.id);
  metricsService.invalidateRateLimitCache(org.id);

  // Notify frontend via WebSocket to refresh billing data
  emitSubscriptionChanged(org.id, 'deleted', 'free', 'canceled');

  logger.warn('Stripe customer deleted - organization downgraded to free', {
    organizationId: org.id,
    customerId: customer.id,
    previousTier,
  });
};

/**
 * Main webhook handler - processes Stripe webhook events synchronously
 * with proper error handling and idempotency.
 *
 * Key improvements:
 * - Uses centralized Stripe client from config
 * - Atomic idempotency check (prevents race conditions)
 * - Synchronous processing (returns appropriate status codes for Stripe retry)
 * - Proper error tracking for failed events
 */
export const handleStripeWebhook = async (req: Request, res: Response): Promise<void> => {
  const signature = req.headers['stripe-signature'];

  // Validate signature header exists
  if (!signature) {
    logger.error('Stripe webhook missing signature');
    res.status(400).json({ error: 'Missing signature' });
    return;
  }

  // Validate Stripe is enabled
  if (!isStripeEnabled() || !stripe) {
    logger.error('Stripe is not enabled - cannot process webhook');
    res.status(500).json({ error: 'Stripe not configured' });
    return;
  }

  // Validate webhook secret is configured
  if (!STRIPE_WEBHOOK_SECRET) {
    logger.error('STRIPE_WEBHOOK_SECRET not configured');
    res.status(500).json({ error: 'Webhook secret not configured' });
    return;
  }

  let event: Stripe.Event;

  try {
    // Verify webhook signature
    // Note: req.body must be the raw buffer for signature verification
    event = stripe.webhooks.constructEvent(
      req.body,
      signature,
      STRIPE_WEBHOOK_SECRET
    );
  } catch (error) {
    logger.error('Stripe webhook signature verification failed:', { error: String(error) });
    res.status(400).json({ error: 'Invalid signature' });
    return;
  }

  // FIX #25: Validate event timestamp to prevent replay attacks
  // Stripe recommends rejecting events older than 5 minutes (300 seconds)
  const MAX_EVENT_AGE_SECONDS = 300;
  const eventAge = Math.floor(Date.now() / 1000) - event.created;

  if (eventAge > MAX_EVENT_AGE_SECONDS) {
    logger.warn('Stripe webhook event too old, potential replay attack', {
      eventId: event.id,
      eventType: event.type,
      eventAge,
      maxAge: MAX_EVENT_AGE_SECONDS,
    });
    res.status(400).json({ error: 'Event too old' });
    return;
  }

  // Also reject events from the future (clock skew tolerance: 60 seconds)
  if (eventAge < -60) {
    logger.warn('Stripe webhook event from the future', {
      eventId: event.id,
      eventType: event.type,
      eventAge,
    });
    res.status(400).json({ error: 'Invalid event timestamp' });
    return;
  }

  // Log all events for debugging
  logger.info(`Stripe webhook received: ${event.type}`, {
    eventId: event.id,
    eventType: event.type,
    livemode: event.livemode,
  });

  // Attempt to claim event atomically (prevents race conditions)
  const claimed = await claimEventForProcessing(event.id, event.type);
  if (!claimed) {
    logger.info('Webhook event already being processed or completed, skipping', {
      eventId: event.id,
      eventType: event.type,
    });
    // Return 200 - event is being/was handled, no need for Stripe to retry
    res.status(200).json({ received: true, status: 'already_processed' });
    return;
  }

  try {
    // Process event based on type
    switch (event.type) {
      case 'checkout.session.completed':
        await handleCheckoutSessionCompleted(event.data.object);
        break;

      case 'customer.subscription.created':
        await handleSubscriptionCreated(event.data.object);
        break;

      case 'customer.subscription.updated':
        await handleSubscriptionUpdated(event.data.object);
        break;

      case 'customer.subscription.deleted':
        await handleSubscriptionDeleted(event.data.object);
        break;

      case 'invoice.paid':
        await handleInvoicePaid(event.data.object);
        break;

      case 'invoice.payment_failed':
        await handleInvoicePaymentFailed(event.data.object);
        break;

      case 'invoice.payment_action_required':
        await handlePaymentActionRequired(event.data.object);
        break;

      case 'customer.updated':
        await handleCustomerUpdated(event.data.object);
        break;

      case 'payment_method.attached':
        await handlePaymentMethodAttached(event.data.object);
        break;

      case 'payment_method.detached':
        await handlePaymentMethodDetached(event.data.object);
        break;

      // Dispute handling - CRITICAL for payment health
      case 'charge.dispute.created':
        await handleChargeDisputeCreated(event.data.object);
        break;

      case 'charge.dispute.closed':
        await handleChargeDisputeClosed(event.data.object);
        break;

      // Refund tracking
      case 'charge.refunded':
        await handleChargeRefunded(event.data.object);
        break;

      // Customer lifecycle
      case 'customer.deleted':
        await handleCustomerDeleted(event.data.object);
        break;

      default:
        logger.debug(`Unhandled Stripe event type: ${event.type}`);
    }

    // Mark event as successfully completed
    await markEventCompleted(event.id);

    // Return success
    res.status(200).json({ received: true, status: 'processed' });
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    logger.error(`Error processing Stripe webhook ${event.type}:`, {
      error: errorMessage,
      eventId: event.id,
    });

    // Mark event as failed for potential retry
    await markEventFailed(event.id, errorMessage);

    // Determine if this is a permanent or transient failure
    // Permanent failures (e.g., org not found) should return 200 to stop retries
    // Transient failures (e.g., DB connection error) should return 500 to trigger retry
    const isPermanentFailure =
      errorMessage.includes('not found') ||
      errorMessage.includes('Organization not found') ||
      errorMessage.includes('invalid');

    if (isPermanentFailure) {
      logger.warn('Permanent webhook failure - not retrying', {
        eventId: event.id,
        error: errorMessage,
      });
      res.status(200).json({
        received: true,
        status: 'permanent_failure',
        error: errorMessage,
      });
    } else {
      // Return 500 to trigger Stripe retry for transient failures
      res.status(500).json({
        error: 'Processing failed',
        retryable: true,
      });
    }
  }
};

export default handleStripeWebhook;
