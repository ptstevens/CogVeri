import { Response, NextFunction } from 'express';
import Stripe from 'stripe';
import { EnhancedAuthRequest } from '../middleware/enhanced-auth.middleware';
import { db } from '../config/database';
import pricingService from '../services/pricing.service';
import {
  BadRequestError,
  NotFoundError,
  UnauthorizedError,
  ForbiddenError,
} from '../utils/AppError';
import { logger } from '../utils/logger';
import { z } from 'zod';
import { stripe, isStripeEnabled, getTierByPriceId } from '../config/stripe';
import { PRICING_TIERS } from '../services/pricing.service';

// Helper to ensure Stripe is available before operations
const requireStripe = (): Stripe => {
  if (!isStripeEnabled() || !stripe) {
    throw new BadRequestError('Billing is not configured. Please contact support.');
  }
  return stripe;
};

// Frontend URL for redirects (default to environment variable or common pattern)
const getFrontendUrl = () => process.env.FRONTEND_URL || 'https://cogveri.com';

// Validation schemas
const createCheckoutSchema = z.object({
  priceId: z.string().min(1).optional(),
  tierName: z.string().min(1).optional(), // Dynamic tiers - validated against DB
  isAnnual: z.boolean().optional().default(false),
  successUrl: z.string().url().optional(),
  cancelUrl: z.string().url().optional(),
  billingCycle: z.enum(['monthly', 'yearly']).optional().default('monthly'),
}).refine(data => data.priceId || data.tierName, {
  message: 'Either priceId or tierName is required',
});

const updateSubscriptionSchema = z.object({
  tierName: z.string().min(1).optional(), // Dynamic tiers - validated against DB
  priceId: z.string().min(1).optional(),
  isAnnual: z.boolean().optional().default(false),
}).refine(data => data.tierName || data.priceId, {
  message: 'Either tierName or priceId is required',
});

// Tier order for determining upgrade vs downgrade
const TIER_ORDER = ['free', 'enterprise'] as const;

const getTierRank = (tier: string): number => {
  const index = TIER_ORDER.indexOf(tier.toLowerCase() as typeof TIER_ORDER[number]);
  return index >= 0 ? index : 0;
};

const cancelSubscriptionSchema = z.object({
  cancelImmediately: z.boolean().optional().default(false),
  cancellationReason: z.string().optional(),
});

const paginationSchema = z.object({
  limit: z.coerce.number().min(1).max(100).optional().default(10),
  startingAfter: z.string().optional(),
});

/**
 * Helper to ensure user has billing permissions (OWNER or ADMIN)
 */
const requireBillingPermission = (req: EnhancedAuthRequest): void => {
  if (!req.user) {
    throw new UnauthorizedError('Authentication required');
  }
  if (!req.user.org_id) {
    throw new UnauthorizedError('Organization context required');
  }
  const role = req.user.org_role?.toUpperCase();
  if (!['OWNER', 'ADMIN'].includes(role)) {
    throw new ForbiddenError('Only organization owners and admins can manage billing');
  }
};

/**
 * Helper to get or create Stripe customer for organization
 */
const getOrCreateStripeCustomer = async (
  organizationId: string
): Promise<{ customerId: string; organization: any }> => {
  const stripeClient = requireStripe();
  const organization = await db('organizations').where('id', organizationId).first();

  if (!organization) {
    throw new NotFoundError('Organization not found');
  }

  // If customer already exists, return it
  if (organization.stripe_customer_id) {
    return { customerId: organization.stripe_customer_id, organization };
  }

  // Get owner email for customer creation
  const owner = await db('users').where('id', organization.owner_id).first();

  // Create new Stripe customer
  const customer = await stripeClient.customers.create({
    email: owner?.email,
    name: organization.name,
    metadata: {
      organizationId: organizationId,
      organizationName: organization.name,
    },
  });

  // Save customer ID to organization
  await db('organizations')
    .where('id', organizationId)
    .update({
      stripe_customer_id: customer.id,
      updated_at: new Date(),
    });

  logger.info(`Created Stripe customer ${customer.id} for organization ${organizationId}`);

  return { customerId: customer.id, organization: { ...organization, stripe_customer_id: customer.id } };
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
 * GET /api/billing/subscription
 * Get current subscription details
 */
export const getSubscription = async (
  req: EnhancedAuthRequest,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    if (!req.user?.org_id) {
      throw new UnauthorizedError('Organization context required');
    }

    const organization = await db('organizations').where('id', req.user.org_id).first();

    if (!organization) {
      throw new NotFoundError('Organization not found');
    }

    // If no Stripe subscription, return tier info in expected format
    if (!organization.stripe_subscription_id) {
      const tier = await pricingService.getPricingTier(organization.subscription_tier || 'free');

      res.json({
        success: true,
        data: {
          id: null,
          status: 'none',
          tier: tier.name,
          tierDisplayName: tier.displayName,
          currentPeriodStart: null,
          currentPeriodEnd: null,
          cancelAtPeriodEnd: false,
          canceledAt: null,
          trialStart: null,
          trialEnd: null,
          nextInvoiceAmount: null,
          currency: 'usd',
        },
      });
      return;
    }

    const stripeClient = requireStripe();
    // Fetch subscription from Stripe
    const subscription = await stripeClient.subscriptions.retrieve(organization.stripe_subscription_id, {
      expand: ['default_payment_method', 'latest_invoice'],
    });

    const tier = await pricingService.getPricingTier(organization.subscription_tier || 'free');
    const { currentPeriodStart, currentPeriodEnd } = getCurrentPeriodFromSubscription(subscription);

    // Get latest invoice for next payment amount
    const latestInvoice = subscription.latest_invoice;
    let nextInvoiceAmount: number | null = null;
    if (latestInvoice && typeof latestInvoice !== 'string') {
      nextInvoiceAmount = latestInvoice.amount_due;
    }

    // Get trial dates if applicable
    const trialStart = subscription.trial_start
      ? new Date(subscription.trial_start * 1000).toISOString()
      : null;
    const trialEnd = subscription.trial_end
      ? new Date(subscription.trial_end * 1000).toISOString()
      : null;

    res.json({
      success: true,
      data: {
        id: subscription.id,
        status: subscription.status,
        tier: tier.name,
        tierDisplayName: tier.displayName,
        currentPeriodStart: new Date(currentPeriodStart * 1000).toISOString(),
        currentPeriodEnd: new Date(currentPeriodEnd * 1000).toISOString(),
        cancelAtPeriodEnd: subscription.cancel_at_period_end,
        canceledAt: subscription.canceled_at
          ? new Date(subscription.canceled_at * 1000).toISOString()
          : null,
        trialStart,
        trialEnd,
        nextInvoiceAmount,
        currency: subscription.currency || 'usd',
      },
    });
  } catch (error) {
    next(error);
  }
};

/**
 * GET /api/billing/usage
 * Get current usage against limits (delegates to pricing service)
 * Transforms response to match frontend UsageMetric[] format
 */
export const getUsage = async (
  req: EnhancedAuthRequest,
  res: Response,
  next: NextFunction
) => {
  try {
    if (!req.user?.org_id) {
      throw new UnauthorizedError('Organization context required');
    }

    const usageData = await pricingService.getOrganizationUsage(req.user.org_id);

    // Transform to frontend-expected format
    const metrics = [
      {
        feature: 'members',
        label: 'Team Members',
        current: usageData.usage.members.current,
        limit: usageData.usage.members.limit,
        unit: 'members',
        percentageUsed: usageData.usage.members.percentageUsed,
      },
      {
        feature: 'storage',
        label: 'Storage',
        current: usageData.usage.storage.current,
        limit: usageData.usage.storage.limit,
        unit: 'GB',
        percentageUsed: usageData.usage.storage.percentageUsed,
      },
      {
        feature: 'tasks',
        label: 'Tasks This Month',
        current: usageData.usage.tasks.current,
        limit: usageData.usage.tasks.limit,
        unit: 'tasks',
        percentageUsed: usageData.usage.tasks.percentageUsed,
      },
      {
        feature: 'videos',
        label: 'Videos This Month',
        current: usageData.usage.videos.current,
        limit: usageData.usage.videos.limit,
        unit: 'videos',
        percentageUsed: usageData.usage.videos.percentageUsed,
      },
      {
        feature: 'externalContributors',
        label: 'External Contributors',
        current: usageData.usage.externalContributors.current,
        limit: usageData.usage.externalContributors.limit,
        unit: 'contributors',
        percentageUsed: usageData.usage.externalContributors.percentageUsed,
      },
    ];

    res.json({
      success: true,
      data: {
        organizationId: usageData.organization.id,
        tier: usageData.tier.name,
        metrics,
        warningThreshold: 80,
        warnings: usageData.warnings,
      },
    });
  } catch (error) {
    next(error);
  }
};

/**
 * GET /api/billing/invoices
 * Get past invoices
 */
export const getBillingHistory = async (
  req: EnhancedAuthRequest,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    if (!req.user?.org_id) {
      throw new UnauthorizedError('Organization context required');
    }

    const { limit, startingAfter } = paginationSchema.parse(req.query);

    const organization = await db('organizations').where('id', req.user.org_id).first();

    if (!organization) {
      throw new NotFoundError('Organization not found');
    }

    if (!organization.stripe_customer_id) {
      res.json({
        success: true,
        data: {
          invoices: [],
          hasMore: false,
        },
      });
      return;
    }

    const stripeClient = requireStripe();
    const invoices = await stripeClient.invoices.list({
      customer: organization.stripe_customer_id,
      limit,
      starting_after: startingAfter,
    });

    res.json({
      success: true,
      data: {
        invoices: invoices.data.map((invoice) => ({
          id: invoice.id,
          number: invoice.number || `INV-${invoice.id.slice(-8)}`,
          status: invoice.status,
          // Frontend expects these field names:
          amount: invoice.amount_paid || invoice.amount_due || 0,
          date: new Date(invoice.created * 1000).toISOString(),
          pdfUrl: invoice.invoice_pdf,
          // Additional fields:
          amountDue: invoice.amount_due,
          amountPaid: invoice.amount_paid,
          amountRemaining: invoice.amount_remaining,
          currency: invoice.currency,
          dueDate: invoice.due_date ? new Date(invoice.due_date * 1000).toISOString() : null,
          paidAt: invoice.status_transitions?.paid_at
            ? new Date(invoice.status_transitions.paid_at * 1000).toISOString()
            : null,
          hostedInvoiceUrl: invoice.hosted_invoice_url,
          periodStart: invoice.period_start
            ? new Date(invoice.period_start * 1000).toISOString()
            : null,
          periodEnd: invoice.period_end
            ? new Date(invoice.period_end * 1000).toISOString()
            : null,
          lines: invoice.lines?.data.map((line) => ({
            description: line.description,
            amount: line.amount,
            quantity: line.quantity,
          })),
        })),
        hasMore: invoices.has_more,
      },
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      next(
        new BadRequestError(`Validation error: ${error.errors.map((e) => e.message).join(', ')}`)
      );
      return;
    }
    next(error);
  }
};

/**
 * GET /api/billing/invoices/:id
 * Get single invoice details
 */
export const getInvoice = async (
  req: EnhancedAuthRequest,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    if (!req.user?.org_id) {
      throw new UnauthorizedError('Organization context required');
    }

    const { id } = req.params;

    if (!id) {
      throw new BadRequestError('Invoice ID is required');
    }

    const organization = await db('organizations').where('id', req.user.org_id).first();

    if (!organization) {
      throw new NotFoundError('Organization not found');
    }

    if (!organization.stripe_customer_id) {
      throw new NotFoundError('No billing history found');
    }

    const stripeClient = requireStripe();
    const invoice = await stripeClient.invoices.retrieve(id, {
      expand: ['charge', 'subscription'],
    });

    // Verify invoice belongs to this organization
    if (invoice.customer !== organization.stripe_customer_id) {
      throw new ForbiddenError('Invoice not found');
    }

    res.json({
      success: true,
      data: {
        invoice: {
          id: invoice.id,
          number: invoice.number,
          status: invoice.status,
          amountDue: invoice.amount_due,
          amountPaid: invoice.amount_paid,
          amountRemaining: invoice.amount_remaining,
          currency: invoice.currency,
          created: new Date(invoice.created * 1000).toISOString(),
          dueDate: invoice.due_date ? new Date(invoice.due_date * 1000).toISOString() : null,
          paidAt: invoice.status_transitions?.paid_at
            ? new Date(invoice.status_transitions.paid_at * 1000).toISOString()
            : null,
          hostedInvoiceUrl: invoice.hosted_invoice_url,
          invoicePdf: invoice.invoice_pdf,
          periodStart: invoice.period_start
            ? new Date(invoice.period_start * 1000).toISOString()
            : null,
          periodEnd: invoice.period_end
            ? new Date(invoice.period_end * 1000).toISOString()
            : null,
          subtotal: invoice.subtotal,
          total: invoice.total,
          lines: invoice.lines?.data.map((line) => ({
            description: line.description,
            amount: line.amount,
            quantity: line.quantity,
          })),
          customerEmail: invoice.customer_email,
          customerName: invoice.customer_name,
        },
      },
    });
  } catch (error) {
    if (error instanceof Stripe.errors.StripeError && error.code === 'resource_missing') {
      next(new NotFoundError('Invoice not found'));
      return;
    }
    next(error);
  }
};

/**
 * GET /api/billing/upcoming-invoice
 * Preview next charge
 */
export const getUpcomingInvoice = async (
  req: EnhancedAuthRequest,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    if (!req.user?.org_id) {
      throw new UnauthorizedError('Organization context required');
    }

    const organization = await db('organizations').where('id', req.user.org_id).first();

    if (!organization) {
      throw new NotFoundError('Organization not found');
    }

    if (!organization.stripe_customer_id || !organization.stripe_subscription_id) {
      res.json({
        success: true,
        data: {
          upcomingInvoice: null,
        },
      });
      return;
    }

    const stripeClient = requireStripe();
    try {
      const upcomingInvoice = await stripeClient.invoices.createPreview({
        customer: organization.stripe_customer_id,
        subscription: organization.stripe_subscription_id,
      });

      res.json({
        success: true,
        data: {
          upcomingInvoice: {
            amountDue: upcomingInvoice.amount_due,
            amountRemaining: upcomingInvoice.amount_remaining,
            currency: upcomingInvoice.currency,
            periodStart: upcomingInvoice.period_start
              ? new Date(upcomingInvoice.period_start * 1000).toISOString()
              : null,
            periodEnd: upcomingInvoice.period_end
              ? new Date(upcomingInvoice.period_end * 1000).toISOString()
              : null,
            subtotal: upcomingInvoice.subtotal,
            total: upcomingInvoice.total,
            lines: upcomingInvoice.lines?.data.map((line) => ({
              description: line.description,
              amount: line.amount,
              quantity: line.quantity,
            })),
            nextPaymentAttempt: upcomingInvoice.next_payment_attempt
              ? new Date(upcomingInvoice.next_payment_attempt * 1000).toISOString()
              : null,
          },
        },
      });
    } catch (error) {
      // No upcoming invoice (subscription might be cancelled or no active subscription)
      if (error instanceof Stripe.errors.StripeError && error.code === 'invoice_upcoming_none') {
        res.json({
          success: true,
          data: {
            upcomingInvoice: null,
          },
        });
        return;
      }
      throw error;
    }
  } catch (error) {
    next(error);
  }
};

/**
 * POST /api/billing/checkout
 * Create Stripe checkout session for upgrade
 * Accepts tierName+isAnnual or direct priceId
 * Auto-generates success/cancel URLs if not provided
 */
export const createCheckoutSession = async (
  req: EnhancedAuthRequest,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    requireBillingPermission(req);
    const stripeClient = requireStripe();

    const { priceId: directPriceId, tierName, isAnnual, successUrl, cancelUrl } = createCheckoutSchema.parse(req.body);

    // Resolve price ID from tierName or use direct priceId
    const priceId = tierName ? getStripePriceId(tierName, isAnnual) : directPriceId!;

    // Generate default URLs if not provided
    const frontendUrl = getFrontendUrl();
    const finalSuccessUrl = successUrl || `${frontendUrl}/organizations/settings?tab=billing&success=true&session_id={CHECKOUT_SESSION_ID}`;
    const finalCancelUrl = cancelUrl || `${frontendUrl}/organizations/settings?tab=billing&canceled=true`;

    const { customerId, organization } = await getOrCreateStripeCustomer(req.user!.org_id);

    // Check if already has an active subscription
    if (organization.stripe_subscription_id) {
      const existingSubscription = await stripeClient.subscriptions.retrieve(
        organization.stripe_subscription_id
      );

      if (['active', 'trialing'].includes(existingSubscription.status)) {
        throw new BadRequestError(
          'Organization already has an active subscription. Use update subscription to change plans.'
        );
      }
    }

    // ★ Idempotency Key: Prevents duplicate checkout sessions from retried requests
    const idempotencyKey = `checkout_${req.user!.org_id}_${priceId}_${Math.floor(Date.now() / 60000)}`;

    const session = await stripeClient.checkout.sessions.create({
      customer: customerId,
      mode: 'subscription',
      payment_method_types: ['card'],
      line_items: [
        {
          price: priceId,
          quantity: 1,
        },
      ],
      success_url: finalSuccessUrl,
      cancel_url: finalCancelUrl,
      subscription_data: {
        metadata: {
          organizationId: req.user!.org_id,
        },
      },
      metadata: {
        organizationId: req.user!.org_id,
        userId: req.user!.id,
      },
      allow_promotion_codes: true,
      billing_address_collection: 'required',
      customer_update: {
        address: 'auto',
        name: 'auto',
      },
    }, {
      idempotencyKey,
    });

    logger.info(`Created checkout session ${session.id} for organization ${req.user!.org_id} (idempotencyKey: ${idempotencyKey})`);

    res.json({
      success: true,
      data: {
        sessionId: session.id,
        url: session.url,
      },
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      next(
        new BadRequestError(`Validation error: ${error.errors.map((e) => e.message).join(', ')}`)
      );
      return;
    }
    next(error);
  }
};

/**
 * POST /api/billing/portal
 * Create customer portal session
 * Auto-generates returnUrl if not provided
 */
export const createPortalSession = async (
  req: EnhancedAuthRequest,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    requireBillingPermission(req);
    const stripeClient = requireStripe();

    const { returnUrl } = req.body;

    // Generate default return URL if not provided
    const finalReturnUrl = returnUrl || `${getFrontendUrl()}/organizations/settings?tab=billing`;

    const { customerId } = await getOrCreateStripeCustomer(req.user!.org_id);

    const session = await stripeClient.billingPortal.sessions.create({
      customer: customerId,
      return_url: finalReturnUrl,
    });

    logger.info(`Created portal session for organization ${req.user!.org_id}`);

    res.json({
      success: true,
      data: {
        url: session.url,
      },
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Helper to get Stripe price ID from tier name
 */
const getStripePriceId = (tierName: string, isAnnual: boolean): string => {
  const interval = isAnnual ? 'YEARLY' : 'MONTHLY';
  const envVar = `STRIPE_PRICE_${tierName.toUpperCase()}_${interval}`;
  const priceId = process.env[envVar];

  logger.info(`getStripePriceId: tier=${tierName}, interval=${interval}, envVar=${envVar}, priceId=${priceId ? priceId.substring(0, 20) + '...' : 'null'}`);

  if (!priceId) {
    throw new BadRequestError(`Stripe price not configured for ${tierName} (${interval.toLowerCase()}). Missing env var: ${envVar}`);
  }

  return priceId;
};

/**
 * PATCH /api/billing/subscription
 * Update/change subscription tier
 * - Upgrades: Take effect immediately with prorated billing
 * - Downgrades: Take effect at end of current billing period
 * - Downgrade to free: Cancels subscription at end of period
 */
export const updateSubscription = async (
  req: EnhancedAuthRequest,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    requireBillingPermission(req);
    const stripeClient = requireStripe();

    const { tierName, priceId: directPriceId, isAnnual } = updateSubscriptionSchema.parse(req.body);

    const organization = await db('organizations').where('id', req.user!.org_id).first();

    if (!organization) {
      throw new NotFoundError('Organization not found');
    }

    if (!organization.stripe_subscription_id) {
      throw new BadRequestError(
        'No active subscription found. Use checkout to create a new subscription.'
      );
    }

    // Get current subscription
    const subscription = await stripeClient.subscriptions.retrieve(organization.stripe_subscription_id);

    if (!['active', 'trialing'].includes(subscription.status)) {
      throw new BadRequestError(
        `Cannot update subscription with status: ${subscription.status}`
      );
    }

    // Get current tier from subscription metadata or organization
    const currentTier = organization.subscription_tier || 'free';
    const newTier = tierName || 'enterprise'; // Default to enterprise if only priceId provided

    // Determine if this is an upgrade or downgrade
    const currentRank = getTierRank(currentTier);
    const newRank = getTierRank(newTier);
    const isUpgrade = newRank > currentRank;
    const isDowngradeToFree = newTier === 'free';

    // Handle downgrade to free tier (cancel subscription at period end)
    if (isDowngradeToFree) {
      const canceledSubscription = await stripeClient.subscriptions.update(
        organization.stripe_subscription_id,
        {
          cancel_at_period_end: true,
          metadata: {
            organizationId: req.user!.org_id,
            canceledBy: req.user!.id,
            canceledAt: new Date().toISOString(),
            reason: 'downgrade_to_free',
          },
        }
      );

      // Update local subscription record
      await db('subscriptions')
        .where('organization_id', req.user!.org_id)
        .update({
          cancel_at_period_end: true,
          updated_at: new Date(),
        });

      logger.info(
        `Subscription ${subscription.id} scheduled for cancellation (downgrade to free) for organization ${req.user!.org_id}`
      );

      // Create audit log
      await db('audit_logs').insert({
        organization_id: req.user!.org_id,
        actor_id: req.user!.id,
        action: 'subscription_downgrade_to_free',
        object_type: 'subscription',
        object_id: subscription.id,
        changes: {
          previousTier: currentTier,
          newTier: 'free',
          effectiveAt: 'end_of_period',
        },
        created_at: new Date(),
      });

      const { currentPeriodEnd } = getCurrentPeriodFromSubscription(canceledSubscription);

      res.json({
        success: true,
        message: 'Your subscription will be downgraded to Free at the end of your current billing period',
        data: {
          subscription: {
            id: canceledSubscription.id,
            status: canceledSubscription.status,
            cancelAtPeriodEnd: true,
            currentPeriodEnd: new Date(currentPeriodEnd * 1000).toISOString(),
          },
          isDowngrade: true,
          effectiveAt: new Date(currentPeriodEnd * 1000).toISOString(),
        },
      });
      return;
    }

    // Resolve price ID for the new tier
    const priceId = tierName ? getStripePriceId(tierName, isAnnual) : directPriceId!;

    if (!priceId) {
      throw new BadRequestError(`No price configured for tier: ${tierName}`);
    }

    let updatedSubscription: Stripe.Subscription;

    if (isUpgrade) {
      // Upgrade: Apply immediately with proration
      updatedSubscription = await stripeClient.subscriptions.update(
        organization.stripe_subscription_id,
        {
          items: [
            {
              id: subscription.items.data[0]!.id,
              price: priceId,
            },
          ],
          proration_behavior: 'create_prorations',
          // Clear any pending cancellation if upgrading
          cancel_at_period_end: false,
          metadata: {
            organizationId: req.user!.org_id,
            updatedBy: req.user!.id,
            updatedAt: new Date().toISOString(),
            changeType: 'upgrade',
          },
        }
      );

      // Update organization tier immediately for upgrades
      await db('organizations')
        .where('id', req.user!.org_id)
        .update({
          subscription_tier: newTier,
          updated_at: new Date(),
        });

      logger.info(
        `Upgraded subscription ${subscription.id} to ${newTier} (price: ${priceId}) for organization ${req.user!.org_id}`
      );
    } else {
      // Downgrade to lower paid tier: Schedule change at end of period
      updatedSubscription = await stripeClient.subscriptions.update(
        organization.stripe_subscription_id,
        {
          // Use subscription schedules for end-of-period changes
          items: [
            {
              id: subscription.items.data[0]!.id,
              price: priceId,
            },
          ],
          proration_behavior: 'none',
          billing_cycle_anchor: 'unchanged',
          metadata: {
            organizationId: req.user!.org_id,
            updatedBy: req.user!.id,
            updatedAt: new Date().toISOString(),
            changeType: 'downgrade',
            scheduledTier: newTier,
          },
        }
      );

      logger.info(
        `Scheduled downgrade of subscription ${subscription.id} to ${newTier} for organization ${req.user!.org_id}`
      );
    }

    // Update local subscription record (subscriptions table tracks Stripe sync state)
    await db('subscriptions')
      .where('organization_id', req.user!.org_id)
      .update({
        cancel_at_period_end: false,
        updated_at: new Date(),
        metadata: db.raw(`metadata || ?::jsonb`, [JSON.stringify({
          pendingTier: isUpgrade ? null : newTier,
          lastChange: new Date().toISOString(),
          changeType: isUpgrade ? 'upgrade' : 'downgrade',
        })]),
      });

    // Update organization tier (only immediately for upgrades; downgrades happen at period end via webhook)
    if (isUpgrade) {
      await db('organizations')
        .where('id', req.user!.org_id)
        .update({
          subscription_tier: newTier,
          updated_at: new Date(),
        });
    }

    // Create audit log
    await db('audit_logs').insert({
      organization_id: req.user!.org_id,
      actor_id: req.user!.id,
      action: isUpgrade ? 'subscription_upgraded' : 'subscription_downgraded',
      object_type: 'subscription',
      object_id: subscription.id,
      changes: {
        previousTier: currentTier,
        newTier: newTier,
        previousPriceId: subscription.items.data[0]!.price.id,
        newPriceId: priceId,
        effectiveAt: isUpgrade ? 'immediate' : 'end_of_period',
        prorated: isUpgrade,
      },
      created_at: new Date(),
    });

    const { currentPeriodEnd } = getCurrentPeriodFromSubscription(updatedSubscription);

    res.json({
      success: true,
      message: isUpgrade
        ? `Successfully upgraded to ${newTier}. You will be charged a prorated amount.`
        : `Your plan will change to ${newTier} at the end of your current billing period.`,
      data: {
        subscription: {
          id: updatedSubscription.id,
          status: updatedSubscription.status,
          currentPeriodEnd: new Date(currentPeriodEnd * 1000).toISOString(),
        },
        isUpgrade,
        isDowngrade: !isUpgrade,
        effectiveAt: isUpgrade ? 'immediate' : new Date(currentPeriodEnd * 1000).toISOString(),
        prorated: isUpgrade,
      },
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      next(
        new BadRequestError(`Validation error: ${error.errors.map((e) => e.message).join(', ')}`)
      );
      return;
    }
    next(error);
  }
};

/**
 * DELETE /api/billing/subscription
 * Cancel subscription
 */
export const cancelSubscription = async (
  req: EnhancedAuthRequest,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    requireBillingPermission(req);
    const stripeClient = requireStripe();

    const { cancelImmediately, cancellationReason } = cancelSubscriptionSchema.parse(req.body);

    const organization = await db('organizations').where('id', req.user!.org_id).first();

    if (!organization) {
      throw new NotFoundError('Organization not found');
    }

    if (!organization.stripe_subscription_id) {
      throw new BadRequestError('No active subscription to cancel');
    }

    const subscription = await stripeClient.subscriptions.retrieve(organization.stripe_subscription_id);

    if (['canceled', 'incomplete_expired'].includes(subscription.status)) {
      throw new BadRequestError('Subscription is already canceled');
    }

    let updatedSubscription: Stripe.Subscription;

    if (cancelImmediately) {
      // Cancel immediately
      updatedSubscription = await stripeClient.subscriptions.cancel(organization.stripe_subscription_id, {
        cancellation_details: {
          comment: cancellationReason,
        },
      });
    } else {
      // Cancel at period end
      updatedSubscription = await stripeClient.subscriptions.update(organization.stripe_subscription_id, {
        cancel_at_period_end: true,
        cancellation_details: {
          comment: cancellationReason,
        },
      });
    }

    logger.info(
      `Canceled subscription ${subscription.id} for organization ${req.user!.org_id} (immediate: ${cancelImmediately})`
    );

    // Create audit log
    await db('audit_logs').insert({
      organization_id: req.user!.org_id,
      actor_id: req.user!.id,
      action: 'subscription_canceled',
      object_type: 'subscription',
      object_id: subscription.id,
      changes: {
        cancelImmediately,
        cancellationReason,
        cancelAt: updatedSubscription.cancel_at
          ? new Date(updatedSubscription.cancel_at * 1000).toISOString()
          : null,
      },
      created_at: new Date(),
    });

    const { currentPeriodEnd } = getCurrentPeriodFromSubscription(updatedSubscription);

    res.json({
      success: true,
      message: cancelImmediately
        ? 'Subscription canceled immediately'
        : 'Subscription will be canceled at the end of the billing period',
      data: {
        subscription: {
          id: updatedSubscription.id,
          status: updatedSubscription.status,
          cancelAtPeriodEnd: updatedSubscription.cancel_at_period_end,
          cancelAt: updatedSubscription.cancel_at
            ? new Date(updatedSubscription.cancel_at * 1000).toISOString()
            : null,
          currentPeriodEnd: new Date(currentPeriodEnd * 1000).toISOString(),
        },
      },
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      next(
        new BadRequestError(`Validation error: ${error.errors.map((e) => e.message).join(', ')}`)
      );
      return;
    }
    next(error);
  }
};

/**
 * POST /api/billing/subscription/reactivate
 * Reactivate a canceled subscription
 */
export const reactivateSubscription = async (
  req: EnhancedAuthRequest,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    requireBillingPermission(req);
    const stripeClient = requireStripe();

    const organization = await db('organizations').where('id', req.user!.org_id).first();

    if (!organization) {
      throw new NotFoundError('Organization not found');
    }

    if (!organization.stripe_subscription_id) {
      throw new BadRequestError('No subscription to reactivate');
    }

    const subscription = await stripeClient.subscriptions.retrieve(organization.stripe_subscription_id);

    // Can only reactivate if subscription is set to cancel at period end
    if (!subscription.cancel_at_period_end) {
      throw new BadRequestError('Subscription is not scheduled for cancellation');
    }

    if (subscription.status === 'canceled') {
      throw new BadRequestError(
        'Subscription has already been canceled. Please create a new subscription.'
      );
    }

    // Reactivate by removing cancel_at_period_end
    const updatedSubscription = await stripeClient.subscriptions.update(
      organization.stripe_subscription_id,
      {
        cancel_at_period_end: false,
      }
    );

    logger.info(
      `Reactivated subscription ${subscription.id} for organization ${req.user!.org_id}`
    );

    // Create audit log
    await db('audit_logs').insert({
      organization_id: req.user!.org_id,
      actor_id: req.user!.id,
      action: 'subscription_reactivated',
      object_type: 'subscription',
      object_id: subscription.id,
      changes: {
        previousStatus: 'scheduled_for_cancellation',
        newStatus: 'active',
      },
      created_at: new Date(),
    });

    const { currentPeriodEnd } = getCurrentPeriodFromSubscription(updatedSubscription);

    res.json({
      success: true,
      message: 'Subscription reactivated successfully',
      data: {
        subscription: {
          id: updatedSubscription.id,
          status: updatedSubscription.status,
          cancelAtPeriodEnd: updatedSubscription.cancel_at_period_end,
          currentPeriodEnd: new Date(currentPeriodEnd * 1000).toISOString(),
        },
      },
    });
  } catch (error) {
    next(error);
  }
};

/**
 * GET /api/billing/payment-methods
 * List payment methods
 */
export const getPaymentMethods = async (
  req: EnhancedAuthRequest,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    if (!req.user?.org_id) {
      throw new UnauthorizedError('Organization context required');
    }

    const organization = await db('organizations').where('id', req.user.org_id).first();

    if (!organization) {
      throw new NotFoundError('Organization not found');
    }

    if (!organization.stripe_customer_id) {
      res.json({
        success: true,
        data: {
          paymentMethods: [],
          defaultPaymentMethodId: null,
        },
      });
      return;
    }

    const stripeClient = requireStripe();
    const paymentMethods = await stripeClient.paymentMethods.list({
      customer: organization.stripe_customer_id,
      type: 'card',
    });

    // Get customer to find default payment method
    const customer = await stripeClient.customers.retrieve(organization.stripe_customer_id);

    let defaultPaymentMethodId: string | null = null;
    // Check if customer is not deleted and has invoice_settings
    if ('invoice_settings' in customer && customer.invoice_settings) {
      const defaultPm = customer.invoice_settings.default_payment_method;
      defaultPaymentMethodId = typeof defaultPm === 'string' ? defaultPm : defaultPm?.id || null;
    }

    res.json({
      success: true,
      data: {
        paymentMethods: paymentMethods.data.map((pm) => ({
          id: pm.id,
          type: pm.type,
          card: pm.card
            ? {
                brand: pm.card.brand,
                last4: pm.card.last4,
                expMonth: pm.card.exp_month,
                expYear: pm.card.exp_year,
                funding: pm.card.funding,
              }
            : null,
          billingDetails: {
            name: pm.billing_details?.name,
            email: pm.billing_details?.email,
            address: pm.billing_details?.address,
          },
          isDefault: pm.id === defaultPaymentMethodId,
          created: new Date(pm.created * 1000).toISOString(),
        })),
        defaultPaymentMethodId,
      },
    });
  } catch (error) {
    next(error);
  }
};

/**
 * POST /api/billing/payment-methods
 * Add payment method (creates setup intent for client-side completion)
 */
export const addPaymentMethod = async (
  req: EnhancedAuthRequest,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    requireBillingPermission(req);
    const stripeClient = requireStripe();

    const { customerId } = await getOrCreateStripeCustomer(req.user!.org_id);

    // Create a setup intent for the client to complete
    const setupIntent = await stripeClient.setupIntents.create({
      customer: customerId,
      payment_method_types: ['card'],
      metadata: {
        organizationId: req.user!.org_id,
        userId: req.user!.id,
      },
    });

    logger.info(`Created setup intent ${setupIntent.id} for organization ${req.user!.org_id}`);

    res.json({
      success: true,
      data: {
        clientSecret: setupIntent.client_secret,
        setupIntentId: setupIntent.id,
      },
    });
  } catch (error) {
    next(error);
  }
};

/**
 * PATCH /api/billing/payment-methods/:id/default
 * Set default payment method
 */
export const setDefaultPaymentMethod = async (
  req: EnhancedAuthRequest,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    requireBillingPermission(req);
    const stripeClient = requireStripe();

    const { id: paymentMethodId } = req.params;

    if (!paymentMethodId) {
      throw new BadRequestError('Payment method ID is required');
    }

    const organization = await db('organizations').where('id', req.user!.org_id).first();

    if (!organization) {
      throw new NotFoundError('Organization not found');
    }

    if (!organization.stripe_customer_id) {
      throw new BadRequestError('No billing account found');
    }

    // Verify payment method belongs to this customer
    const paymentMethod = await stripeClient.paymentMethods.retrieve(paymentMethodId);

    if (paymentMethod.customer !== organization.stripe_customer_id) {
      throw new ForbiddenError('Payment method not found');
    }

    // Update customer default payment method
    await stripeClient.customers.update(organization.stripe_customer_id, {
      invoice_settings: {
        default_payment_method: paymentMethodId,
      },
    });

    // Also update subscription if exists
    if (organization.stripe_subscription_id) {
      await stripeClient.subscriptions.update(organization.stripe_subscription_id, {
        default_payment_method: paymentMethodId,
      });
    }

    logger.info(
      `Set default payment method ${paymentMethodId} for organization ${req.user!.org_id}`
    );

    // Create audit log
    await db('audit_logs').insert({
      organization_id: req.user!.org_id,
      actor_id: req.user!.id,
      action: 'payment_method_default_changed',
      object_type: 'payment_method',
      object_id: paymentMethodId,
      changes: {
        newDefaultPaymentMethod: paymentMethodId,
      },
      created_at: new Date(),
    });

    res.json({
      success: true,
      message: 'Default payment method updated',
      data: {
        paymentMethodId,
      },
    });
  } catch (error) {
    if (error instanceof Stripe.errors.StripeError && error.code === 'resource_missing') {
      next(new NotFoundError('Payment method not found'));
      return;
    }
    next(error);
  }
};

/**
 * DELETE /api/billing/payment-methods/:id
 * Remove a payment method
 */
export const removePaymentMethod = async (
  req: EnhancedAuthRequest,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    requireBillingPermission(req);
    const stripeClient = requireStripe();

    const { id: paymentMethodId } = req.params;

    if (!paymentMethodId) {
      throw new BadRequestError('Payment method ID is required');
    }

    const organization = await db('organizations').where('id', req.user!.org_id).first();

    if (!organization) {
      throw new NotFoundError('Organization not found');
    }

    if (!organization.stripe_customer_id) {
      throw new BadRequestError('No billing account found');
    }

    // Verify payment method belongs to this customer
    const paymentMethod = await stripeClient.paymentMethods.retrieve(paymentMethodId);

    if (paymentMethod.customer !== organization.stripe_customer_id) {
      throw new ForbiddenError('Payment method not found');
    }

    // Check if this is the default payment method
    const customer = await stripeClient.customers.retrieve(organization.stripe_customer_id);

    if (
      'invoice_settings' in customer &&
      customer.invoice_settings?.default_payment_method === paymentMethodId
    ) {
      throw new BadRequestError(
        'Cannot remove default payment method. Please set another payment method as default first.'
      );
    }

    // Detach payment method
    await stripeClient.paymentMethods.detach(paymentMethodId);

    logger.info(
      `Removed payment method ${paymentMethodId} for organization ${req.user!.org_id}`
    );

    // Create audit log
    await db('audit_logs').insert({
      organization_id: req.user!.org_id,
      actor_id: req.user!.id,
      action: 'payment_method_removed',
      object_type: 'payment_method',
      object_id: paymentMethodId,
      changes: {
        removedPaymentMethod: paymentMethodId,
        cardLast4: paymentMethod.card?.last4,
      },
      created_at: new Date(),
    });

    res.json({
      success: true,
      message: 'Payment method removed',
    });
  } catch (error) {
    if (error instanceof Stripe.errors.StripeError && error.code === 'resource_missing') {
      next(new NotFoundError('Payment method not found'));
      return;
    }
    next(error);
  }
};

/**
 * GET /api/billing/tiers
 * Get all available pricing tiers (public endpoint)
 */
export const getTiers = async (
  _req: EnhancedAuthRequest,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const tiers = await pricingService.getPricingTiers();

    // Get Stripe price IDs for each tier
    const tiersWithPrices = tiers.map((tier) => ({
      ...tier,
      stripePrices: {
        monthly: process.env[`STRIPE_PRICE_${tier.name.toUpperCase()}_MONTHLY`] || null,
        yearly: process.env[`STRIPE_PRICE_${tier.name.toUpperCase()}_YEARLY`] || null,
      },
    }));

    res.json({
      success: true,
      data: {
        tiers: tiersWithPrices,
      },
    });
  } catch (error) {
    next(error);
  }
};

/**
 * POST /api/billing/enterprise-contact
 * Submit enterprise contact form (public endpoint)
 */
const enterpriseContactSchema = z.object({
  name: z.string().min(1, 'Name is required'),
  email: z.string().email('Valid email required'),
  company: z.string().min(1, 'Company name is required'),
  teamSize: z.string().optional(),
  message: z.string().optional(),
  phone: z.string().optional(),
});

const updateBillingContactSchema = z.object({
  billingEmail: z.string().email('Valid email required'),
  billingName: z.string().min(1, 'Name is required'),
});

export const submitEnterpriseContact = async (
  req: EnhancedAuthRequest,
  res: Response,
  next: NextFunction
) => {
  try {
    const data = enterpriseContactSchema.parse(req.body);

    // Store the contact request
    let contactId: string | null = null;
    try {
      const [inserted] = await db('enterprise_contacts').insert({
        name: data.name,
        email: data.email,
        company: data.company,
        team_size: data.teamSize || null,
        message: data.message || null,
        phone: data.phone || null,
        status: 'new',
        created_at: new Date(),
      }).returning('id');
      contactId = inserted?.id;
    } catch (dbError) {
      // Table might not exist yet, log and continue
      logger.info('Enterprise contact request received (table may not exist)', { data });
    }

    // Send notification email to sales team
    const salesEmail = process.env.SALES_TEAM_EMAIL || process.env.ADMIN_EMAIL;
    if (salesEmail) {
      try {
        const { emailService } = await import('../services/email.service');
        const { generateEmailTemplate, createDetailsList, BRAND_COLORS } = await import('../utils/email-templates');

        const frontendUrl = process.env.FRONTEND_URL || 'https://cogveri.com';

        // Send to sales team
        await emailService.sendEmail({
          to: salesEmail,
          subject: `🏢 New Enterprise Inquiry: ${data.company}`,
          html: generateEmailTemplate({
            title: 'New Enterprise Contact Request',
            preheader: `${data.name} from ${data.company} is interested in Enterprise`,
            content: `
              <p>A new enterprise inquiry has been submitted:</p>

              ${createDetailsList([
                { label: 'Name', value: data.name },
                { label: 'Email', value: data.email },
                { label: 'Company', value: data.company },
                { label: 'Team Size', value: data.teamSize || 'Not specified' },
                { label: 'Phone', value: data.phone || 'Not provided' },
              ])}

              ${data.message ? `
                <div style="margin-top: 20px; padding: 15px; background-color: #f8f9fa; border-radius: 8px;">
                  <h3 style="margin: 0 0 10px 0; font-size: 14px; color: ${BRAND_COLORS.textMuted};">Message</h3>
                  <p style="margin: 0; color: ${BRAND_COLORS.text};">${data.message}</p>
                </div>
              ` : ''}
            `,
            ctaButton: contactId ? {
              text: 'View in Admin',
              url: `${frontendUrl}/admin/enterprise-contacts/${contactId}`,
            } : undefined,
          }),
        });

        // Send confirmation to the requester
        await emailService.sendEmail({
          to: data.email,
          subject: 'Thank you for your interest in CogVeri Enterprise',
          html: generateEmailTemplate({
            title: 'We received your request!',
            preheader: 'Our team will reach out within 1 business day',
            content: `
              <p>Hi ${data.name},</p>
              <p>Thank you for your interest in <strong>CogVeri Enterprise</strong>. We've received your inquiry and our team will review it promptly.</p>
              <p>You can expect to hear from us within <strong>1 business day</strong>.</p>
              <p>In the meantime, feel free to check out our <a href="${frontendUrl}/pricing" style="color: ${BRAND_COLORS.primary};">pricing page</a> for more information about our plans and features.</p>
            `,
          }),
        });

        logger.info('Enterprise contact emails sent', {
          email: data.email,
          company: data.company,
          salesNotified: salesEmail,
        });
      } catch (emailError) {
        // Don't fail the request if email fails
        logger.error('Failed to send enterprise contact emails', {
          error: emailError instanceof Error ? emailError.message : String(emailError),
          email: data.email,
          company: data.company,
        });
      }
    } else {
      logger.warn('No SALES_TEAM_EMAIL or ADMIN_EMAIL configured - enterprise contact emails not sent');
    }

    logger.info('Enterprise contact form submitted', {
      email: data.email,
      company: data.company,
      contactId,
    });

    res.json({
      success: true,
      message: 'Thank you for your interest! Our team will contact you within 1 business day.',
    });
  } catch (error) {
    next(error);
  }
};

/**
 * GET /api/billing/contact
 * Get billing contact for the organization
 * Returns the billing contact email/name and the subscriber (owner) info
 */
export const getBillingContact = async (
  req: EnhancedAuthRequest,
  res: Response,
  next: NextFunction
) => {
  try {
    if (!req.user?.org_id) {
      throw new UnauthorizedError('Organization context required');
    }

    const organizationId = req.user.org_id;

    // Get organization with owner info
    const organization = await db('organizations')
      .where('id', organizationId)
      .first();

    if (!organization) {
      throw new NotFoundError('Organization not found');
    }

    // Get owner (subscriber) info
    const owner = await db('users')
      .where('id', organization.owner_id)
      .select('id', 'email', 'name')
      .first();

    res.json({
      success: true,
      data: {
        billingContact: {
          email: organization.billing_email || owner?.email || '',
          name: organization.billing_name || owner?.name || '',
        },
        subscriber: {
          id: owner?.id || '',
          email: owner?.email || '',
          name: owner?.name || '',
        },
        // Whether billing contact is different from subscriber
        isDifferentFromSubscriber:
          organization.billing_email &&
          owner?.email &&
          organization.billing_email.toLowerCase() !== owner.email.toLowerCase(),
      },
    });
  } catch (error) {
    next(error);
  }
};

/**
 * PATCH /api/billing/contact
 * Update billing contact for the organization
 * Only OWNER and ADMIN can update billing contact
 */
export const updateBillingContact = async (
  req: EnhancedAuthRequest,
  res: Response,
  next: NextFunction
) => {
  try {
    requireBillingPermission(req);
    const organizationId = req.user!.org_id;

    const { billingEmail, billingName } = updateBillingContactSchema.parse(req.body);

    // Update organization billing contact
    await db('organizations')
      .where('id', organizationId)
      .update({
        billing_email: billingEmail,
        billing_name: billingName,
        updated_at: new Date(),
      });

    // If Stripe customer exists, update their email too
    const organization = await db('organizations')
      .where('id', organizationId)
      .first();

    if (organization?.stripe_customer_id && isStripeEnabled() && stripe) {
      try {
        await stripe.customers.update(organization.stripe_customer_id, {
          email: billingEmail,
          name: billingName,
        });
        logger.info(`Updated Stripe customer email for org ${organizationId}`);
      } catch (stripeError) {
        logger.warn('Failed to update Stripe customer email:', stripeError);
        // Don't fail the request - local update succeeded
      }
    }

    // Get owner (subscriber) info for response
    const owner = organization ? await db('users')
      .where('id', organization.owner_id)
      .select('id', 'email', 'name')
      .first() : null;

    logger.info(`Billing contact updated for org ${organizationId}`, {
      billingEmail,
      billingName,
    });

    res.json({
      success: true,
      data: {
        billingContact: {
          email: billingEmail,
          name: billingName,
        },
        subscriber: {
          id: owner?.id || '',
          email: owner?.email || '',
          name: owner?.name || '',
        },
        isDifferentFromSubscriber:
          owner?.email && billingEmail.toLowerCase() !== owner.email.toLowerCase(),
      },
      message: 'Billing contact updated successfully',
    });
  } catch (error) {
    next(error);
  }
};

/**
 * POST /api/billing/sync
 * Manually sync subscription data from Stripe
 * Useful for:
 * - Webhook failures/delays
 * - Initial setup before webhooks are configured
 * - Debugging subscription state mismatches
 * Requires OWNER or ADMIN role
 */
export const syncSubscription = async (
  req: EnhancedAuthRequest,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    requireBillingPermission(req);
    const stripeClient = requireStripe();

    const organizationId = req.user!.org_id;
    const organization = await db('organizations').where('id', organizationId).first();

    if (!organization) {
      throw new NotFoundError('Organization not found');
    }

    // Check if we have a Stripe customer ID
    if (!organization.stripe_customer_id) {
      res.json({
        success: true,
        data: {
          synced: false,
          message: 'No Stripe customer linked to this organization',
          tier: organization.subscription_tier || 'free',
        },
      });
      return;
    }

    // Fetch subscriptions from Stripe for this customer
    const subscriptions = await stripeClient.subscriptions.list({
      customer: organization.stripe_customer_id,
      status: 'all',
      limit: 1,
      expand: ['data.items.data.price'],
    });

    if (subscriptions.data.length === 0) {
      // No subscription found - reset to free
      await db('organizations').where('id', organizationId).update({
        subscription_tier: 'free',
        subscription_status: 'none',
        stripe_subscription_id: null,
        max_members: 1,
        updated_at: new Date(),
      });

      logger.info(`Synced org ${organizationId}: No subscription found, reset to free`);

      res.json({
        success: true,
        data: {
          synced: true,
          message: 'No active subscription found. Organization reset to free tier.',
          tier: 'free',
          previousTier: organization.subscription_tier,
        },
      });
      return;
    }

    // Get the most recent subscription
    const subscription = subscriptions.data[0];
    if (!subscription) {
      res.json({
        success: true,
        data: {
          synced: false,
          message: 'No subscription data available',
          tier: organization.subscription_tier || 'free',
        },
      });
      return;
    }

    const price = subscription.items.data[0]?.price;
    const priceId = price?.id;

    // Try multiple sources for tier name (same logic as webhook)
    // 1. Price metadata (most reliable - set in Stripe Dashboard)
    // 2. Price ID to tier map (from env vars)
    // 3. Default to 'free' only if nothing found
    const priceMetadata = price && typeof price === 'object' ? (price).metadata : null;
    const tierFromMetadata = priceMetadata?.tier;
    const tierInfo = priceId ? getTierByPriceId(priceId) : null;

    let tierName = tierFromMetadata || tierInfo?.tier;

    // Log diagnostic info to help debug tier mismatches
    logger.info('Sync tier resolution', {
      organizationId,
      priceId,
      tierFromMetadata,
      tierFromPriceIdMap: tierInfo?.tier,
      resolvedTier: tierName,
    });

    // Default to 'free' only if we truly can't determine the tier
    if (!tierName) {
      logger.warn(`Could not determine tier for price ${priceId} - defaulting to free. Check Stripe price metadata or STRIPE_PRICE_* env vars.`);
      tierName = 'free';
    }

    // Build updates
    const updates: Record<string, unknown> = {
      stripe_subscription_id: subscription.id,
      subscription_status: subscription.status,
      subscription_tier: tierName,
      updated_at: new Date(),
    };

    // Update limits based on tier
    const tierConfig = tierName ? PRICING_TIERS[tierName] : undefined;
    if (tierConfig) {
      updates.max_members = tierConfig.limits.maxMembers === -1 ? 999999 : tierConfig.limits.maxMembers;
      updates.max_recordings_gb = tierConfig.limits.maxStorageGb === -1 ? 999999 : tierConfig.limits.maxStorageGb;
      updates.max_tasks_per_month = tierConfig.limits.maxTasksPerMonth === -1 ? 999999 : tierConfig.limits.maxTasksPerMonth;
    }

    // Get period end
    const firstItem = subscription.items.data[0];
    if (firstItem?.current_period_end) {
      updates.subscription_expiry = new Date(firstItem.current_period_end * 1000);
    }

    await db('organizations').where('id', organizationId).update(updates);

    logger.info(`Synced org ${organizationId}: ${organization.subscription_tier} -> ${tierName}`, {
      subscriptionId: subscription.id,
      status: subscription.status,
      priceId,
    });

    res.json({
      success: true,
      data: {
        synced: true,
        message: `Subscription synced successfully. Tier updated to ${tierName}.`,
        tier: tierName,
        previousTier: organization.subscription_tier,
        subscriptionId: subscription.id,
        status: subscription.status,
      },
    });
  } catch (error) {
    next(error);
  }
};
