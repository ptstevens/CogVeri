import { stripe, isStripeEnabled, getTierByPriceId } from '../config/stripe';
import { db } from '../config/database';
import { logger } from '../utils/logger';
import { PRICING_TIERS } from './pricing.service';
import Stripe from 'stripe';

/**
 * Stripe Sync Service
 *
 * This service provides synchronization between Stripe and the local database.
 * It's designed to:
 * 1. Detect and fix state drift between Stripe and local database
 * 2. Run as a daily scheduled job for reconciliation
 * 3. Provide manual sync capability for individual organizations
 *
 * IMPORTANT: Stripe is always the source of truth for billing state.
 */

interface SyncResult {
  synced: boolean;
  changes: string[];
  errors?: string[];
}

interface BatchSyncResult {
  total: number;
  synced: number;
  errors: number;
  details: Array<{
    organizationId: string;
    changes: string[];
    error?: string;
  }>;
}

class StripeSyncService {
  /**
   * Sync a single organization's subscription state from Stripe
   * @param organizationId - The organization to sync
   * @returns Sync result with list of changes made
   */
  async syncOrganization(organizationId: string): Promise<SyncResult> {
    if (!isStripeEnabled() || !stripe) {
      return { synced: false, changes: [], errors: ['Stripe not enabled'] };
    }

    const org = await db('organizations').where('id', organizationId).first();

    if (!org) {
      return { synced: false, changes: [], errors: ['Organization not found'] };
    }

    if (!org.stripe_subscription_id) {
      // No subscription to sync
      return { synced: true, changes: [] };
    }

    try {
      // Expand price data to access metadata for tier detection
      const stripeSubscription = await stripe.subscriptions.retrieve(org.stripe_subscription_id, {
        expand: ['items.data.price'],
      });

      const changes: string[] = [];
      const updates: Record<string, any> = {};

      // Check and sync tier from Stripe price
      const price = stripeSubscription.items.data[0]?.price;
      const priceId = typeof price === 'string' ? price : price?.id;
      const priceMetadata = price && typeof price === 'object' ? price.metadata : null;

      // Get tier from price metadata (primary) or price ID mapping (fallback)
      const stripeTierName =
        priceMetadata?.tier || (priceId ? getTierByPriceId(priceId)?.tier : null);

      if (stripeTierName && stripeTierName !== org.subscription_tier) {
        const tier = PRICING_TIERS[stripeTierName];
        if (tier) {
          changes.push(`tier: ${org.subscription_tier} -> ${stripeTierName}`);
          updates.subscription_tier = stripeTierName;
          // Also update limits based on tier
          updates.max_members = tier.limits.maxMembers === -1 ? 999999 : tier.limits.maxMembers;
          updates.max_recordings_gb =
            tier.limits.maxStorageGb === -1 ? 999999 : tier.limits.maxStorageGb;
          updates.max_tasks_per_month =
            tier.limits.maxTasksPerMonth === -1 ? 999999 : tier.limits.maxTasksPerMonth;
        }
      }

      // Check status mismatch
      if (org.subscription_status !== stripeSubscription.status) {
        changes.push(`status: ${org.subscription_status} -> ${stripeSubscription.status}`);
        updates.subscription_status = stripeSubscription.status;
      }

      // Check cancel_at_period_end mismatch
      if (org.cancel_at_period_end !== stripeSubscription.cancel_at_period_end) {
        changes.push(
          `cancel_at_period_end: ${org.cancel_at_period_end} -> ${stripeSubscription.cancel_at_period_end}`
        );
        updates.cancel_at_period_end = stripeSubscription.cancel_at_period_end;
      }

      // Check cancel_at mismatch
      const stripeCancelAt = stripeSubscription.cancel_at
        ? new Date(stripeSubscription.cancel_at * 1000)
        : null;
      const orgCancelAt = org.cancel_at ? new Date(org.cancel_at) : null;

      if (stripeCancelAt?.getTime() !== orgCancelAt?.getTime()) {
        changes.push(`cancel_at: ${orgCancelAt} -> ${stripeCancelAt}`);
        updates.cancel_at = stripeCancelAt;
      }

      // Check if subscription was deleted in Stripe
      if (stripeSubscription.status === 'canceled' && org.subscription_status !== 'canceled') {
        changes.push('subscription canceled in Stripe but not locally');
        updates.subscription_status = 'canceled';
        updates.subscription_tier = 'free';
        updates.stripe_subscription_id = null;
      }

      // Apply updates if any
      if (Object.keys(updates).length > 0) {
        updates.updated_at = new Date();

        await db.transaction(async (trx) => {
          await trx('organizations').where('id', organizationId).update(updates);

          // Log the sync in audit trail
          await trx('audit_logs').insert({
            organization_id: organizationId,
            actor_id: null,
            action: 'stripe_sync',
            object_type: 'subscription',
            object_id: org.stripe_subscription_id,
            changes: { changes, updates },
            ip_address: null,
            user_agent: 'Stripe Sync Service',
            created_at: new Date(),
          });
        });

        logger.info('Organization synced with Stripe', {
          organizationId,
          changes,
          updates,
        });
      }

      return { synced: true, changes };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);

      // Handle specific Stripe errors
      if (error instanceof Stripe.errors.StripeError) {
        if (error.code === 'resource_missing') {
          // Subscription doesn't exist in Stripe anymore
          logger.warn('Subscription not found in Stripe, clearing local reference', {
            organizationId,
            subscriptionId: org.stripe_subscription_id,
          });

          await db('organizations').where('id', organizationId).update({
            stripe_subscription_id: null,
            subscription_status: 'canceled',
            subscription_tier: 'free',
            updated_at: new Date(),
          });

          return {
            synced: true,
            changes: ['Subscription not found in Stripe - cleared local reference'],
          };
        }
      }

      logger.error('Failed to sync organization with Stripe', {
        organizationId,
        error: errorMessage,
      });

      return { synced: false, changes: [], errors: [errorMessage] };
    }
  }

  /**
   * Sync customer information from Stripe
   * @param organizationId - The organization to sync
   */
  async syncCustomer(organizationId: string): Promise<SyncResult> {
    if (!isStripeEnabled() || !stripe) {
      return { synced: false, changes: [], errors: ['Stripe not enabled'] };
    }

    const org = await db('organizations').where('id', organizationId).first();

    if (!org || !org.stripe_customer_id) {
      return { synced: false, changes: [], errors: ['No customer to sync'] };
    }

    try {
      const customer = await stripe.customers.retrieve(org.stripe_customer_id);

      if (customer.deleted) {
        // Customer was deleted in Stripe
        await db('organizations').where('id', organizationId).update({
          stripe_customer_id: null,
          stripe_subscription_id: null,
          subscription_status: 'canceled',
          subscription_tier: 'free',
          updated_at: new Date(),
        });

        return {
          synced: true,
          changes: ['Customer deleted in Stripe - cleared local reference'],
        };
      }

      return { synced: true, changes: [] };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      return { synced: false, changes: [], errors: [errorMessage] };
    }
  }

  /**
   * Scheduled job to sync all organizations with Stripe
   * Should run daily during low-traffic hours
   * @returns Summary of sync results
   */
  async syncAllOrganizations(): Promise<BatchSyncResult> {
    if (!isStripeEnabled() || !stripe) {
      return {
        total: 0,
        synced: 0,
        errors: 0,
        details: [],
      };
    }

    const orgs = await db('organizations')
      .whereNotNull('stripe_subscription_id')
      .select('id', 'name');

    let synced = 0;
    let errors = 0;
    const details: BatchSyncResult['details'] = [];

    logger.info('Starting Stripe sync job', { totalOrganizations: orgs.length });

    for (const org of orgs) {
      try {
        const result = await this.syncOrganization(org.id);

        if (result.synced) {
          if (result.changes.length > 0) {
            synced++;
            details.push({
              organizationId: org.id,
              changes: result.changes,
            });
          }
        } else {
          errors++;
          details.push({
            organizationId: org.id,
            changes: [],
            error: result.errors?.join(', '),
          });
        }
      } catch (error) {
        errors++;
        details.push({
          organizationId: org.id,
          changes: [],
          error: error instanceof Error ? error.message : String(error),
        });
      }

      // Rate limiting - Stripe allows 100 req/sec, be conservative
      await new Promise((resolve) => setTimeout(resolve, 50));
    }

    logger.info('Stripe sync job completed', {
      total: orgs.length,
      synced,
      errors,
    });

    return {
      total: orgs.length,
      synced,
      errors,
      details,
    };
  }

  /**
   * Check for and process any expired grace periods
   * Should run hourly or daily
   */
  async processExpiredGracePeriods(): Promise<{
    processed: number;
    suspended: string[];
  }> {
    const now = new Date();

    // Find organizations with expired grace periods that aren't suspended
    const expiredOrgs = await db('organizations')
      .where('is_suspended', false)
      .whereNotNull('grace_period_expires_at')
      .where('grace_period_expires_at', '<', now)
      .where('subscription_status', 'past_due')
      .select('id', 'name', 'grace_period_expires_at');

    const suspended: string[] = [];

    for (const org of expiredOrgs) {
      try {
        await db('organizations').where('id', org.id).update({
          is_suspended: true,
          suspended_at: now,
          suspension_reason: 'grace_period_expired',
          updated_at: now,
        });

        suspended.push(org.id);

        logger.warn('Organization suspended due to expired grace period', {
          organizationId: org.id,
          organizationName: org.name,
          gracePeriodExpiredAt: org.grace_period_expires_at,
        });
      } catch (error) {
        logger.error('Failed to suspend organization', {
          organizationId: org.id,
          error: error instanceof Error ? error.message : String(error),
        });
      }
    }

    return {
      processed: expiredOrgs.length,
      suspended,
    };
  }

  /**
   * Verify a specific subscription matches Stripe state
   * Useful for debugging or manual verification
   */
  async verifySubscription(subscriptionId: string): Promise<{
    matches: boolean;
    stripeState: Record<string, any> | null;
    localState: Record<string, any> | null;
    differences: string[];
  }> {
    if (!isStripeEnabled() || !stripe) {
      return {
        matches: false,
        stripeState: null,
        localState: null,
        differences: ['Stripe not enabled'],
      };
    }

    const org = await db('organizations').where('stripe_subscription_id', subscriptionId).first();

    if (!org) {
      return {
        matches: false,
        stripeState: null,
        localState: null,
        differences: ['No organization found with this subscription ID'],
      };
    }

    try {
      const stripeSubscription = await stripe.subscriptions.retrieve(subscriptionId);

      const localState = {
        status: org.subscription_status,
        cancel_at_period_end: org.cancel_at_period_end,
        cancel_at: org.cancel_at,
        tier: org.subscription_tier,
      };

      const stripeState = {
        status: stripeSubscription.status,
        cancel_at_period_end: stripeSubscription.cancel_at_period_end,
        cancel_at: stripeSubscription.cancel_at
          ? new Date(stripeSubscription.cancel_at * 1000).toISOString()
          : null,
      };

      const differences: string[] = [];

      if (localState.status !== stripeState.status) {
        differences.push(`status: local=${localState.status}, stripe=${stripeState.status}`);
      }

      if (localState.cancel_at_period_end !== stripeState.cancel_at_period_end) {
        differences.push(
          `cancel_at_period_end: local=${localState.cancel_at_period_end}, stripe=${stripeState.cancel_at_period_end}`
        );
      }

      return {
        matches: differences.length === 0,
        stripeState,
        localState,
        differences,
      };
    } catch (error) {
      return {
        matches: false,
        stripeState: null,
        localState: null,
        differences: [error instanceof Error ? error.message : String(error)],
      };
    }
  }
}

export const stripeSyncService = new StripeSyncService();
export default stripeSyncService;
