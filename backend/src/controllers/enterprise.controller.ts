import { Response, NextFunction } from 'express';
import { EnhancedAuthRequest } from '../middleware/enhanced-auth.middleware';
import { db } from '../config/database';
import { BadRequestError, NotFoundError, ForbiddenError } from '../utils/AppError';
import { logger } from '../utils/logger';
import { z } from 'zod';
import { PRICING_TIERS } from '../services/pricing.service';
import stripeService from '../services/stripe.service';

// Validation schema for custom limits (matches PricingTier.limits)
const customLimitsSchema = z.object({
  maxMembers: z.number().int().min(-1).optional(), // -1 = unlimited
  maxStorageGb: z.number().int().min(-1).optional(),
  maxTasksPerMonth: z.number().int().min(-1).optional(),
  maxVideosPerMonth: z.number().int().min(-1).optional(),
  maxVideoLengthMinutes: z.number().int().min(-1).optional(),
  maxExternalContributors: z.number().int().min(-1).optional(),
  maxWorkspaces: z.number().int().min(-1).optional(),
}).partial();

// Validation schema for custom features (matches PricingTier.features)
const customFeaturesSchema = z.object({
  // Recording & Playback
  removeWatermark: z.boolean().optional(),
  customThumbnails: z.boolean().optional(),
  downloadRecordings: z.boolean().optional(),
  hdRecording: z.boolean().optional(),
  // Transcription & AI
  basicTranscription: z.boolean().optional(),
  advancedTranscription: z.boolean().optional(),
  aiSummaries: z.boolean().optional(),
  // Collaboration
  timestampedComments: z.boolean().optional(),
  reviewWorkflows: z.boolean().optional(),
  teamWorkspaces: z.boolean().optional(),
  // Analytics
  basicAnalytics: z.boolean().optional(),
  advancedAnalytics: z.boolean().optional(),
  // Integrations
  slackIntegration: z.boolean().optional(),
  webhooks: z.boolean().optional(),
  apiAccess: z.boolean().optional(),
  // Branding & Customization
  customBranding: z.boolean().optional(),
  customDomain: z.boolean().optional(),
  // Security & Admin
  ssoSaml: z.boolean().optional(),
  scimProvisioning: z.boolean().optional(),
  auditLogs: z.boolean().optional(),
  advancedPermissions: z.boolean().optional(),
  ipWhitelist: z.boolean().optional(),
  customDataRetention: z.boolean().optional(),
  // Support
  emailSupport: z.boolean().optional(),
  prioritySupport: z.boolean().optional(),
  dedicatedCsm: z.boolean().optional(),
}).partial();

// Schema for applying enterprise plan
const applyEnterpriseSchema = z.object({
  organizationId: z.string().uuid(),
  customLimits: customLimitsSchema.optional(),
  customFeatures: customFeaturesSchema.optional(),
  enterpriseConfig: z.object({
    contractValue: z.number().optional(),
    billingContact: z.string().email().optional(),
    accountManager: z.string().optional(),
  }).optional(),
  notes: z.string().optional(),
  contractStartDate: z.string().optional(), // ISO date
  contractEndDate: z.string().optional(), // ISO date
});

// Schema for updating enterprise config
const updateEnterpriseSchema = applyEnterpriseSchema.omit({ organizationId: true });

// Schema for creating enterprise invoice
const createInvoiceSchema = z.object({
  organizationId: z.string().uuid(),
  description: z.string().min(1, 'Description is required'),
  amount: z.number().min(100, 'Amount must be at least $1.00 (100 cents)'),
  quantity: z.number().int().min(1).optional().default(1),
  daysUntilDue: z.number().int().min(1).max(90).optional().default(30),
  contractMonths: z.number().int().min(1).max(60).optional().default(12),
  autoSend: z.boolean().optional().default(true),
  notes: z.string().optional(),
});

// Schema for creating enterprise subscription
const createSubscriptionSchema = z.object({
  organizationId: z.string().uuid(),
  description: z.string().min(1, 'Description is required'),
  amount: z.number().min(100, 'Amount must be at least $1.00 (100 cents)'),
  interval: z.enum(['month', 'year']),
  trialDays: z.number().int().min(0).max(90).optional().default(0),
});

/**
 * Helper to ensure user is system admin
 */
const requireSystemAdminAccess = (req: EnhancedAuthRequest): void => {
  if (!req.user?.is_system_admin) {
    throw new ForbiddenError('System administrator access required');
  }
};

/**
 * GET /api/admin/enterprise/organizations
 * List all enterprise organizations
 */
export const listEnterpriseOrganizations = async (
  req: EnhancedAuthRequest,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    requireSystemAdminAccess(req);

    const organizations = await db('organizations')
      .where('subscription_tier', 'enterprise')
      .orWhereNotNull('custom_limits')
      .select(
        'id',
        'name',
        'subscription_tier',
        'custom_limits',
        'custom_features',
        'enterprise_config',
        'enterprise_notes',
        'contract_start_date',
        'contract_end_date',
        'enterprise_configured_by',
        'enterprise_configured_at',
        'created_at'
      )
      .orderBy('enterprise_configured_at', 'desc');

    // Get configured by user names
    const configuredByIds = organizations
      .map(o => o.enterprise_configured_by)
      .filter(Boolean);

    const configuredByUsers = configuredByIds.length > 0
      ? await db('users')
          .whereIn('id', configuredByIds)
          .select('id', 'email', 'display_name')
      : [];

    const userMap = new Map(configuredByUsers.map(u => [u.id, u]));

    const enrichedOrgs = organizations.map(org => ({
      ...org,
      configuredByUser: org.enterprise_configured_by
        ? userMap.get(org.enterprise_configured_by)
        : null,
    }));

    res.json({
      success: true,
      data: {
        organizations: enrichedOrgs,
        count: enrichedOrgs.length,
      },
    });
  } catch (error) {
    next(error);
  }
};

/**
 * GET /api/admin/enterprise/organizations/:organizationId
 * Get enterprise details for a specific organization
 */
export const getEnterpriseDetails = async (
  req: EnhancedAuthRequest,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    requireSystemAdminAccess(req);

    const { organizationId } = req.params;

    const organization = await db('organizations')
      .where('id', organizationId)
      .first();

    if (!organization) {
      throw new NotFoundError('Organization not found');
    }

    // Get the base tier limits/features for comparison
    const baseTier = PRICING_TIERS[organization.subscription_tier] || PRICING_TIERS.free;

    // Calculate effective limits (custom overrides base tier)
    const effectiveLimits = {
      ...(baseTier?.limits || {}),
      ...(organization.custom_limits || {}),
    };

    const effectiveFeatures = {
      ...(baseTier?.features || {}),
      ...(organization.custom_features || {}),
    };

    res.json({
      success: true,
      data: {
        organization: {
          id: organization.id,
          name: organization.name,
          subscriptionTier: organization.subscription_tier,
        },
        customLimits: organization.custom_limits,
        customFeatures: organization.custom_features,
        enterpriseConfig: organization.enterprise_config,
        notes: organization.enterprise_notes,
        contractStartDate: organization.contract_start_date,
        contractEndDate: organization.contract_end_date,
        configuredBy: organization.enterprise_configured_by,
        configuredAt: organization.enterprise_configured_at,
        // Computed values
        baseTier: baseTier ? {
          name: baseTier.name,
          limits: baseTier.limits,
          features: baseTier.features,
        } : null,
        effectiveLimits,
        effectiveFeatures,
      },
    });
  } catch (error) {
    next(error);
  }
};

/**
 * POST /api/admin/enterprise/apply
 * Apply enterprise plan to an organization with custom limits/features
 */
export const applyEnterprisePlan = async (
  req: EnhancedAuthRequest,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    requireSystemAdminAccess(req);

    const validatedData = applyEnterpriseSchema.parse(req.body);
    const {
      organizationId,
      customLimits,
      customFeatures,
      enterpriseConfig,
      notes,
      contractStartDate,
      contractEndDate,
    } = validatedData;

    // Verify organization exists
    const organization = await db('organizations')
      .where('id', organizationId)
      .first();

    if (!organization) {
      throw new NotFoundError('Organization not found');
    }

    const previousTier = organization.subscription_tier;

    // Update organization with enterprise plan
    await db('organizations')
      .where('id', organizationId)
      .update({
        subscription_tier: 'enterprise',
        custom_limits: customLimits ? JSON.stringify(customLimits) : null,
        custom_features: customFeatures ? JSON.stringify(customFeatures) : null,
        enterprise_config: enterpriseConfig ? JSON.stringify(enterpriseConfig) : null,
        enterprise_notes: notes || null,
        contract_start_date: contractStartDate || null,
        contract_end_date: contractEndDate || null,
        enterprise_configured_by: req.user!.id,
        enterprise_configured_at: new Date(),
        updated_at: new Date(),
      });

    // Create audit log
    await db('audit_logs').insert({
      organization_id: organizationId,
      actor_id: req.user!.id,
      action: 'enterprise_plan_applied',
      object_type: 'organization',
      object_id: organizationId,
      changes: {
        previousTier,
        newTier: 'enterprise',
        customLimits,
        customFeatures,
        enterpriseConfig,
        contractStartDate,
        contractEndDate,
      },
      created_at: new Date(),
    });

    logger.info(
      `Enterprise plan applied to organization ${organizationId} by system admin ${req.user!.id}`
    );

    res.json({
      success: true,
      message: 'Enterprise plan applied successfully',
      data: {
        organizationId,
        previousTier,
        newTier: 'enterprise',
        customLimits,
        customFeatures,
      },
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return next(
        new BadRequestError(`Validation error: ${error.errors.map(e => e.message).join(', ')}`)
      );
    }
    next(error);
  }
};

/**
 * PATCH /api/admin/enterprise/organizations/:organizationId
 * Update enterprise configuration for an organization
 */
export const updateEnterpriseConfig = async (
  req: EnhancedAuthRequest,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    requireSystemAdminAccess(req);

    const { organizationId } = req.params;
    const validatedData = updateEnterpriseSchema.parse(req.body);

    // Verify organization exists and is enterprise
    const organization = await db('organizations')
      .where('id', organizationId)
      .first();

    if (!organization) {
      throw new NotFoundError('Organization not found');
    }

    // Build update object (only include provided fields)
    const updateData: Record<string, any> = {
      updated_at: new Date(),
      enterprise_configured_by: req.user!.id,
      enterprise_configured_at: new Date(),
    };

    if (validatedData.customLimits !== undefined) {
      updateData.custom_limits = validatedData.customLimits
        ? JSON.stringify(validatedData.customLimits)
        : null;
    }

    if (validatedData.customFeatures !== undefined) {
      updateData.custom_features = validatedData.customFeatures
        ? JSON.stringify(validatedData.customFeatures)
        : null;
    }

    if (validatedData.enterpriseConfig !== undefined) {
      updateData.enterprise_config = validatedData.enterpriseConfig
        ? JSON.stringify(validatedData.enterpriseConfig)
        : null;
    }

    if (validatedData.notes !== undefined) {
      updateData.enterprise_notes = validatedData.notes || null;
    }

    if (validatedData.contractStartDate !== undefined) {
      updateData.contract_start_date = validatedData.contractStartDate || null;
    }

    if (validatedData.contractEndDate !== undefined) {
      updateData.contract_end_date = validatedData.contractEndDate || null;
    }

    await db('organizations')
      .where('id', organizationId)
      .update(updateData);

    // Create audit log
    await db('audit_logs').insert({
      organization_id: organizationId,
      actor_id: req.user!.id,
      action: 'enterprise_config_updated',
      object_type: 'organization',
      object_id: organizationId,
      changes: validatedData,
      created_at: new Date(),
    });

    logger.info(
      `Enterprise config updated for organization ${organizationId} by system admin ${req.user!.id}`
    );

    res.json({
      success: true,
      message: 'Enterprise configuration updated successfully',
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return next(
        new BadRequestError(`Validation error: ${error.errors.map(e => e.message).join(', ')}`)
      );
    }
    next(error);
  }
};

/**
 * DELETE /api/admin/enterprise/organizations/:organizationId
 * Remove enterprise status from an organization (revert to a standard tier)
 */
export const removeEnterprisePlan = async (
  req: EnhancedAuthRequest,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    requireSystemAdminAccess(req);

    const { organizationId } = req.params;
    const { revertToTier = 'free' } = req.body;

    // Validate revert tier (only free by default, custom tiers can be added)
    if (revertToTier !== 'free') {
      throw new BadRequestError('Invalid revert tier. Must be free.');
    }

    // Verify organization exists
    const organization = await db('organizations')
      .where('id', organizationId)
      .first();

    if (!organization) {
      throw new NotFoundError('Organization not found');
    }

    // Clear enterprise configuration
    await db('organizations')
      .where('id', organizationId)
      .update({
        subscription_tier: revertToTier,
        custom_limits: null,
        custom_features: null,
        enterprise_config: null,
        enterprise_notes: null,
        contract_start_date: null,
        contract_end_date: null,
        // Keep configured_by and configured_at for historical reference
        updated_at: new Date(),
      });

    // Create audit log
    await db('audit_logs').insert({
      organization_id: organizationId,
      actor_id: req.user!.id,
      action: 'enterprise_plan_removed',
      object_type: 'organization',
      object_id: organizationId,
      changes: {
        previousTier: organization.subscription_tier,
        newTier: revertToTier,
        previousCustomLimits: organization.custom_limits,
        previousCustomFeatures: organization.custom_features,
      },
      created_at: new Date(),
    });

    logger.info(
      `Enterprise plan removed from organization ${organizationId}, reverted to ${revertToTier} by system admin ${req.user!.id}`
    );

    res.json({
      success: true,
      message: `Organization reverted to ${revertToTier} plan`,
      data: {
        organizationId,
        newTier: revertToTier,
      },
    });
  } catch (error) {
    next(error);
  }
};

/**
 * GET /api/admin/enterprise/limits-template
 * Get the default enterprise limits template (all unlimited)
 */
export const getEnterpriseTemplate = async (
  req: EnhancedAuthRequest,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    requireSystemAdminAccess(req);

    // Enterprise template with all limits set to unlimited (-1)
    // and all features enabled
    const template = {
      limits: {
        maxMembers: -1,
        maxStorageGb: -1,
        maxTasksPerMonth: -1,
        maxVideosPerMonth: -1,
        maxVideoLengthMinutes: -1,
        maxExternalContributors: -1,
        maxWorkspaces: -1,
      },
      features: {
        removeWatermark: true,
        customThumbnails: true,
        downloadRecordings: true,
        hdRecording: true,
        basicTranscription: true,
        advancedTranscription: true,
        aiSummaries: true,
        timestampedComments: true,
        reviewWorkflows: true,
        teamWorkspaces: true,
        basicAnalytics: true,
        advancedAnalytics: true,
        slackIntegration: true,
        webhooks: true,
        apiAccess: true,
        customBranding: true,
        customDomain: true,
        ssoSaml: true,
        scimProvisioning: true,
        auditLogs: true,
        advancedPermissions: true,
        ipWhitelist: true,
        customDataRetention: true,
        emailSupport: true,
        prioritySupport: true,
        dedicatedCsm: true,
      },
    };

    res.json({
      success: true,
      data: {
        template,
        allTiers: Object.keys(PRICING_TIERS),
        tierDetails: PRICING_TIERS,
      },
    });
  } catch (error) {
    next(error);
  }
};

// ============================================================
// ENTERPRISE INVOICING ENDPOINTS
// ============================================================

/**
 * POST /api/admin/enterprise/invoice
 * Create and send an invoice to an enterprise customer
 * Used for custom pricing / one-time payments
 */
export const createEnterpriseInvoice = async (
  req: EnhancedAuthRequest,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    requireSystemAdminAccess(req);

    const validatedData = createInvoiceSchema.parse(req.body);
    const {
      organizationId,
      description,
      amount,
      quantity,
      daysUntilDue,
      contractMonths,
      autoSend,
      notes,
    } = validatedData;

    // Verify organization exists
    const organization = await db('organizations')
      .where('id', organizationId)
      .first();

    if (!organization) {
      throw new NotFoundError('Organization not found');
    }

    // Get or create Stripe customer
    let stripeCustomerId = organization.stripe_customer_id;

    if (!stripeCustomerId) {
      // Get organization owner for customer creation
      const owner = await db('users')
        .where('organization_id', organizationId)
        .whereIn('role', ['OWNER', 'owner'])
        .first();

      if (!owner) {
        throw new BadRequestError('Organization has no owner - cannot create Stripe customer');
      }

      const customer = await stripeService.createCustomer(
        organizationId,
        owner.email,
        owner.display_name || owner.email
      );

      stripeCustomerId = customer.id;

      // Update organization with Stripe customer ID
      await db('organizations')
        .where('id', organizationId)
        .update({
          stripe_customer_id: stripeCustomerId,
          updated_at: new Date(),
        });
    }

    // Create the invoice
    const invoice = await stripeService.createEnterpriseInvoice(stripeCustomerId, {
      description,
      amount,
      quantity,
      daysUntilDue,
      contractMonths,
      autoSend,
      metadata: {
        organization_id: organizationId,
        organization_name: organization.name,
        created_by: req.user!.id,
      },
    });

    // Create audit log
    await db('audit_logs').insert({
      organization_id: organizationId,
      actor_id: req.user!.id,
      action: 'enterprise_invoice_created',
      object_type: 'invoice',
      object_id: invoice.id,
      changes: {
        invoiceId: invoice.id,
        amount: amount * (quantity || 1),
        description,
        daysUntilDue,
        autoSend,
        notes,
      },
      created_at: new Date(),
    });

    logger.info(
      `Enterprise invoice ${invoice.id} created for organization ${organizationId} by system admin ${req.user!.id}`
    );

    res.json({
      success: true,
      message: autoSend ? 'Invoice created and sent to customer' : 'Invoice created (not yet sent)',
      data: {
        invoiceId: invoice.id,
        invoiceNumber: invoice.number,
        invoiceUrl: invoice.hosted_invoice_url,
        invoicePdf: invoice.invoice_pdf,
        amount: invoice.amount_due,
        currency: invoice.currency,
        status: invoice.status,
        dueDate: invoice.due_date ? new Date(invoice.due_date * 1000).toISOString() : null,
      },
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return next(
        new BadRequestError(`Validation error: ${error.errors.map(e => e.message).join(', ')}`)
      );
    }
    next(error);
  }
};

/**
 * POST /api/admin/enterprise/subscription
 * Create a recurring subscription with custom pricing for enterprise customer
 */
export const createEnterpriseSubscription = async (
  req: EnhancedAuthRequest,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    requireSystemAdminAccess(req);

    const validatedData = createSubscriptionSchema.parse(req.body);
    const {
      organizationId,
      description,
      amount,
      interval,
      trialDays,
    } = validatedData;

    // Verify organization exists
    const organization = await db('organizations')
      .where('id', organizationId)
      .first();

    if (!organization) {
      throw new NotFoundError('Organization not found');
    }

    // Get or create Stripe customer
    let stripeCustomerId = organization.stripe_customer_id;

    if (!stripeCustomerId) {
      const owner = await db('users')
        .where('organization_id', organizationId)
        .whereIn('role', ['OWNER', 'owner'])
        .first();

      if (!owner) {
        throw new BadRequestError('Organization has no owner - cannot create Stripe customer');
      }

      const customer = await stripeService.createCustomer(
        organizationId,
        owner.email,
        owner.display_name || owner.email
      );

      stripeCustomerId = customer.id;

      await db('organizations')
        .where('id', organizationId)
        .update({
          stripe_customer_id: stripeCustomerId,
          updated_at: new Date(),
        });
    }

    // Create the subscription
    const subscription = await stripeService.createEnterpriseSubscription(stripeCustomerId, {
      description,
      amount,
      interval,
      trialDays,
      metadata: {
        organization_id: organizationId,
        organization_name: organization.name,
        created_by: req.user!.id,
      },
    });

    // Update organization with subscription info
    await db('organizations')
      .where('id', organizationId)
      .update({
        stripe_subscription_id: subscription.id,
        subscription_tier: 'enterprise',
        subscription_status: subscription.status,
        updated_at: new Date(),
      });

    // Create audit log
    await db('audit_logs').insert({
      organization_id: organizationId,
      actor_id: req.user!.id,
      action: 'enterprise_subscription_created',
      object_type: 'subscription',
      object_id: subscription.id,
      changes: {
        subscriptionId: subscription.id,
        amount,
        interval,
        description,
        trialDays,
      },
      created_at: new Date(),
    });

    logger.info(
      `Enterprise subscription ${subscription.id} created for organization ${organizationId} by system admin ${req.user!.id}`
    );

    // Access subscription period dates - cast needed for Stripe SDK type compatibility
    const subAny = subscription as { current_period_start?: number; current_period_end?: number };

    res.json({
      success: true,
      message: 'Enterprise subscription created',
      data: {
        subscriptionId: subscription.id,
        status: subscription.status,
        currentPeriodStart: subAny.current_period_start
          ? new Date(subAny.current_period_start * 1000).toISOString()
          : null,
        currentPeriodEnd: subAny.current_period_end
          ? new Date(subAny.current_period_end * 1000).toISOString()
          : null,
        amount,
        interval,
      },
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return next(
        new BadRequestError(`Validation error: ${error.errors.map(e => e.message).join(', ')}`)
      );
    }
    next(error);
  }
};

/**
 * GET /api/admin/enterprise/invoices/:organizationId
 * List invoices for an organization
 */
export const listOrganizationInvoices = async (
  req: EnhancedAuthRequest,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    requireSystemAdminAccess(req);

    const { organizationId } = req.params;
    const limit = Math.min(parseInt(req.query.limit as string) || 20, 100);

    const organization = await db('organizations')
      .where('id', organizationId)
      .first();

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

    const invoices = await stripeService.listInvoices(organization.stripe_customer_id, limit);

    res.json({
      success: true,
      data: {
        invoices: invoices.map(inv => ({
          id: inv.id,
          number: inv.number,
          status: inv.status,
          amount: inv.amount_due,
          amountPaid: inv.amount_paid,
          currency: inv.currency,
          created: new Date(inv.created * 1000).toISOString(),
          dueDate: inv.due_date ? new Date(inv.due_date * 1000).toISOString() : null,
          paidAt: inv.status_transitions?.paid_at
            ? new Date(inv.status_transitions.paid_at * 1000).toISOString()
            : null,
          hostedInvoiceUrl: inv.hosted_invoice_url,
          invoicePdf: inv.invoice_pdf,
        })),
        hasMore: invoices.length === limit,
      },
    });
  } catch (error) {
    next(error);
  }
};

/**
 * POST /api/admin/enterprise/invoices/:invoiceId/void
 * Void an unpaid invoice
 */
export const voidEnterpriseInvoice = async (
  req: EnhancedAuthRequest,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    requireSystemAdminAccess(req);

    const { invoiceId } = req.params;

    if (!invoiceId) {
      throw new BadRequestError('Invoice ID is required');
    }

    const invoice = await stripeService.voidInvoice(invoiceId);

    // Create audit log
    if (invoice.metadata?.organization_id) {
      await db('audit_logs').insert({
        organization_id: invoice.metadata.organization_id,
        actor_id: req.user!.id,
        action: 'enterprise_invoice_voided',
        object_type: 'invoice',
        object_id: invoiceId,
        changes: { reason: req.body.reason || 'Voided by admin' },
        created_at: new Date(),
      });
    }

    logger.info(`Invoice ${invoiceId} voided by system admin ${req.user!.id}`);

    res.json({
      success: true,
      message: 'Invoice voided successfully',
      data: {
        invoiceId: invoice.id,
        status: invoice.status,
      },
    });
  } catch (error) {
    next(error);
  }
};

/**
 * POST /api/admin/enterprise/invoices/:invoiceId/mark-paid
 * Mark an invoice as paid (for offline/manual payments)
 */
export const markInvoicePaid = async (
  req: EnhancedAuthRequest,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    requireSystemAdminAccess(req);

    const { invoiceId } = req.params;

    if (!invoiceId) {
      throw new BadRequestError('Invoice ID is required');
    }

    const invoice = await stripeService.markInvoicePaid(invoiceId);

    // Create audit log
    if (invoice.metadata?.organization_id) {
      await db('audit_logs').insert({
        organization_id: invoice.metadata.organization_id,
        actor_id: req.user!.id,
        action: 'enterprise_invoice_marked_paid',
        object_type: 'invoice',
        object_id: invoiceId,
        changes: {
          paymentMethod: req.body.paymentMethod || 'manual',
          notes: req.body.notes || 'Marked paid by admin',
        },
        created_at: new Date(),
      });
    }

    logger.info(`Invoice ${invoiceId} marked as paid by system admin ${req.user!.id}`);

    res.json({
      success: true,
      message: 'Invoice marked as paid',
      data: {
        invoiceId: invoice.id,
        status: invoice.status,
        amountPaid: invoice.amount_paid,
      },
    });
  } catch (error) {
    next(error);
  }
};
