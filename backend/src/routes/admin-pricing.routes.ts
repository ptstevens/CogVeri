import { Router, Response } from 'express';
import { enhancedAuthenticate, EnhancedAuthRequest } from '../middleware/enhanced-auth.middleware';
import { requireSystemAdmin } from '../middleware/system-admin.middleware';
import pricingService from '../services/pricing.service';
import { stripeTierService } from '../services/stripe';
import { tierAuditService } from '../services/tier-audit.service';
import { broadcastAdminConfigChange } from '../services/socket.service';
import { logger } from '../utils/logger';
import { z } from 'zod';

const router = Router();

// All pricing admin routes require enhanced authentication + system admin check
// Note: Pricing tiers are global resources, no RLS context needed
router.use(enhancedAuthenticate);
router.use(requireSystemAdmin);

// Validation schemas
const createTierSchema = z.object({
  name: z.string().min(1).max(50).regex(/^[a-z0-9_-]+$/, 'Name must be lowercase alphanumeric'),
  displayName: z.string().min(1).max(100),
  description: z.string().optional(),
  monthlyPrice: z.number().min(0),
  yearlyPrice: z.number().min(0),
  stripePriceIdMonthly: z.string().optional(),
  stripePriceIdYearly: z.string().optional(),
  limits: z.object({
    maxMembers: z.number(),
    maxStorageGb: z.number(),
    maxTasksPerMonth: z.number(),
    maxVideosPerMonth: z.number(),
    maxVideoLengthMinutes: z.number(),
    maxExternalContributors: z.number(),
    maxWorkspaces: z.number(),
  }),
  features: z.record(z.string(), z.boolean()),
  highlighted: z.boolean().optional(),
  ctaText: z.string().optional(),
  sortOrder: z.number().optional(),
});

const updateTierSchema = z.object({
  displayName: z.string().min(1).max(100).optional(),
  description: z.string().optional(),
  monthlyPrice: z.number().min(0).optional(),
  yearlyPrice: z.number().min(0).optional(),
  stripePriceIdMonthly: z.string().nullable().optional(),
  stripePriceIdYearly: z.string().nullable().optional(),
  limits: z.record(z.number()).optional(),
  features: z.record(z.boolean()).optional(),
  highlighted: z.boolean().optional(),
  ctaText: z.string().optional(),
  sortOrder: z.number().optional(),
  isActive: z.boolean().optional(),
});

/**
 * Get all pricing tiers (admin view - includes inactive)
 * GET /api/admin/pricing/tiers
 */
router.get('/tiers', async (_req: EnhancedAuthRequest, res: Response): Promise<void> => {
  try {
    const tiers = await pricingService.getAllPricingTiersAdmin();
    res.json({
      success: true,
      data: { tiers },
    });
  } catch (error: any) {
    logger.error('Error fetching admin pricing tiers:', error);
    res.status(500).json({
      error: error.message || 'Failed to fetch pricing tiers',
    });
  }
});

/**
 * Get single pricing tier by name
 * GET /api/admin/pricing/tiers/:tierName
 */
router.get('/tiers/:tierName', async (req: EnhancedAuthRequest, res: Response): Promise<void> => {
  try {
    const tierName = req.params.tierName;
    if (!tierName) {
      res.status(400).json({ error: 'Tier name is required' });
      return;
    }
    const tier = await pricingService.getPricingTierFromDb(tierName);

    if (!tier) {
      res.status(404).json({ error: `Tier '${tierName}' not found` });
      return;
    }

    res.json({
      success: true,
      data: { tier },
    });
  } catch (error: any) {
    logger.error('Error fetching pricing tier:', error);
    res.status(500).json({
      error: error.message || 'Failed to fetch pricing tier',
    });
  }
});

/**
 * Create a new pricing tier
 * POST /api/admin/pricing/tiers
 */
router.post('/tiers', async (req: EnhancedAuthRequest, res: Response): Promise<void> => {
  try {
    const validation = createTierSchema.safeParse(req.body);
    if (!validation.success) {
      res.status(400).json({
        error: 'Validation failed',
        details: validation.error.errors,
      });
      return;
    }

    // Check if tier name is available
    const isAvailable = await pricingService.isTierNameAvailable(validation.data.name);
    if (!isAvailable) {
      res.status(409).json({
        error: `Tier name '${validation.data.name}' is already in use`,
      });
      return;
    }

    const tier = await pricingService.createPricingTier(validation.data);

    // Auto-sync to Stripe if it's a paid tier
    let stripeSync = null;
    if (validation.data.monthlyPrice > 0 || validation.data.yearlyPrice > 0) {
      try {
        stripeSync = await stripeTierService.syncTierToStripe(validation.data.name, req.user!.id);
        if (!stripeSync.synced) {
          logger.warn(`Stripe sync failed for new tier ${validation.data.name}:`, stripeSync.errors);
        }
      } catch (syncError) {
        logger.error(`Error auto-syncing new tier ${validation.data.name} to Stripe:`, syncError);
      }
    }

    // Broadcast to all clients so they see updated pricing
    broadcastAdminConfigChange('pricing_tier_created', { tierName: validation.data.name });

    res.status(201).json({
      success: true,
      data: { tier },
      stripeSync: stripeSync ? {
        synced: stripeSync.synced,
        productId: stripeSync.productId,
        changes: stripeSync.changes,
        errors: stripeSync.errors,
      } : null,
    });
  } catch (error: any) {
    logger.error('Error creating pricing tier:', error);
    res.status(500).json({
      error: error.message || 'Failed to create pricing tier',
    });
  }
});

/**
 * Update a pricing tier
 * PUT /api/admin/pricing/tiers/:tierName
 */
router.put('/tiers/:tierName', async (req: EnhancedAuthRequest, res: Response): Promise<void> => {
  try {
    const tierName = req.params.tierName;
    if (!tierName) {
      res.status(400).json({ error: 'Tier name is required' });
      return;
    }
    const validation = updateTierSchema.safeParse(req.body);

    if (!validation.success) {
      res.status(400).json({
        error: 'Validation failed',
        details: validation.error.errors,
      });
      return;
    }

    // Get OLD tier data BEFORE updating to detect price changes (includes stripe IDs)
    const oldTier = await pricingService.getPricingTierFromDbAdmin(tierName);
    if (!oldTier) {
      res.status(404).json({ error: `Tier '${tierName}' not found` });
      return;
    }

    // Old prices are already in dollars (mapDbRowToTier converts from cents)
    const oldMonthlyPrice = oldTier.monthlyPrice;
    const oldYearlyPrice = oldTier.yearlyPrice;

    // Update the tier in the database
    let tier = await pricingService.updatePricingTier(tierName, validation.data);

    // Detect actual price changes
    const newMonthlyPrice = validation.data.monthlyPrice ?? oldMonthlyPrice;
    const newYearlyPrice = validation.data.yearlyPrice ?? oldYearlyPrice;
    const monthlyPriceChanged = newMonthlyPrice !== oldMonthlyPrice;
    const yearlyPriceChanged = newYearlyPrice !== oldYearlyPrice;
    const hasPriceChange = monthlyPriceChanged || yearlyPriceChanged;

    let stripeSync: {
      synced: boolean;
      productId: string | null;
      changes: string[];
      errors: string[];
    } | null = null;

    // Handle Stripe sync
    if (tier.monthlyPrice > 0 || tier.yearlyPrice > 0) {
      try {
        // First, ensure product exists (sync creates it if missing)
        const syncResult = await stripeTierService.syncTierToStripe(tierName, req.user!.id);

        if (syncResult.synced && hasPriceChange && syncResult.productId) {
          // Product exists, now handle price changes by creating new prices
          const priceChanges: string[] = [...syncResult.changes];

          if (monthlyPriceChanged && newMonthlyPrice > 0) {
            // Create new monthly price in Stripe (prices are immutable)
            const newPriceId = await stripeTierService.createNewPrice(
              syncResult.productId,
              Math.round(newMonthlyPrice * 100), // Convert to cents
              'month',
              tierName,
              oldTier.stripePriceIdMonthly || undefined
            );
            // Update tier with new price ID
            await pricingService.updatePricingTier(tierName, { stripePriceIdMonthly: newPriceId });
            priceChanges.push(`Created new monthly price: ${newPriceId} ($${newMonthlyPrice}/mo)`);
          } else if (monthlyPriceChanged && newMonthlyPrice === 0 && oldTier.stripePriceIdMonthly) {
            // Archive the old monthly price
            await stripeTierService.archivePrice(oldTier.stripePriceIdMonthly);
            await pricingService.updatePricingTier(tierName, { stripePriceIdMonthly: null });
            priceChanges.push('Archived monthly price (now free)');
          }

          if (yearlyPriceChanged && newYearlyPrice > 0) {
            // Create new yearly price in Stripe
            const newPriceId = await stripeTierService.createNewPrice(
              syncResult.productId,
              Math.round(newYearlyPrice * 100), // Convert to cents
              'year',
              tierName,
              oldTier.stripePriceIdYearly || undefined
            );
            // Update tier with new price ID
            await pricingService.updatePricingTier(tierName, { stripePriceIdYearly: newPriceId });
            priceChanges.push(`Created new yearly price: ${newPriceId} ($${newYearlyPrice}/yr)`);
          } else if (yearlyPriceChanged && newYearlyPrice === 0 && oldTier.stripePriceIdYearly) {
            // Archive the old yearly price
            await stripeTierService.archivePrice(oldTier.stripePriceIdYearly);
            await pricingService.updatePricingTier(tierName, { stripePriceIdYearly: null });
            priceChanges.push('Archived yearly price (now free)');
          }

          stripeSync = {
            synced: true,
            productId: syncResult.productId,
            changes: priceChanges,
            errors: [],
          };
        } else {
          stripeSync = {
            synced: syncResult.synced,
            productId: syncResult.productId,
            changes: syncResult.changes,
            errors: syncResult.errors,
          };
        }

        if (!stripeSync.synced) {
          logger.warn(`Stripe sync failed for updated tier ${tierName}:`, stripeSync.errors);
        }
      } catch (syncError) {
        logger.error(`Error auto-syncing updated tier ${tierName} to Stripe:`, syncError);
        stripeSync = {
          synced: false,
          productId: null,
          changes: [],
          errors: [syncError instanceof Error ? syncError.message : 'Unknown error'],
        };
      }
    }

    // Refetch tier to get updated Stripe IDs
    const updatedTier = await pricingService.getPricingTierFromDbAdmin(tierName);
    const tierResponse = updatedTier || tier;

    // Broadcast to all clients so they see updated pricing
    broadcastAdminConfigChange('pricing_tier_updated', { tierName });

    res.json({
      success: true,
      data: { tier: tierResponse },
      stripeSync: stripeSync ? {
        synced: stripeSync.synced,
        productId: stripeSync.productId,
        changes: stripeSync.changes,
        errors: stripeSync.errors,
      } : null,
    });
  } catch (error: any) {
    if (error.message?.includes('not found')) {
      res.status(404).json({ error: error.message });
      return;
    }
    logger.error('Error updating pricing tier:', error);
    res.status(500).json({
      error: error.message || 'Failed to update pricing tier',
    });
  }
});

/**
 * Activate a pricing tier
 * PATCH /api/admin/pricing/tiers/:tierName/activate
 */
router.patch('/tiers/:tierName/activate', async (req: EnhancedAuthRequest, res: Response): Promise<void> => {
  try {
    const tierName = req.params.tierName;
    if (!tierName) {
      res.status(400).json({ error: 'Tier name is required' });
      return;
    }
    await pricingService.activatePricingTier(tierName);

    // Broadcast to all clients
    broadcastAdminConfigChange('pricing_tier_updated', { tierName, action: 'activated' });

    res.json({
      success: true,
      message: `Tier '${tierName}' has been activated`,
    });
  } catch (error: any) {
    logger.error('Error activating pricing tier:', error);
    res.status(500).json({
      error: error.message || 'Failed to activate pricing tier',
    });
  }
});

/**
 * Deactivate a pricing tier
 * PATCH /api/admin/pricing/tiers/:tierName/deactivate
 */
router.patch('/tiers/:tierName/deactivate', async (req: EnhancedAuthRequest, res: Response): Promise<void> => {
  try {
    const tierName = req.params.tierName;
    if (!tierName) {
      res.status(400).json({ error: 'Tier name is required' });
      return;
    }
    const result = await pricingService.deactivatePricingTier(tierName);

    if (!result.success) {
      res.status(400).json({
        error: `Cannot deactivate tier: ${result.organizationsUsingTier} organization(s) are currently using this tier`,
        organizationsUsingTier: result.organizationsUsingTier,
      });
      return;
    }

    // Broadcast to all clients
    broadcastAdminConfigChange('pricing_tier_updated', { tierName, action: 'deactivated' });

    res.json({
      success: true,
      message: `Tier '${tierName}' has been deactivated`,
    });
  } catch (error: any) {
    logger.error('Error deactivating pricing tier:', error);
    res.status(500).json({
      error: error.message || 'Failed to deactivate pricing tier',
    });
  }
});

/**
 * Reorder pricing tiers
 * POST /api/admin/pricing/tiers/reorder
 */
router.post('/tiers/reorder', async (req: EnhancedAuthRequest, res: Response): Promise<void> => {
  try {
    const { tierOrder } = req.body;

    if (!Array.isArray(tierOrder) || tierOrder.length === 0) {
      res.status(400).json({
        error: 'tierOrder must be a non-empty array of tier names',
      });
      return;
    }

    await pricingService.reorderPricingTiers(tierOrder);

    res.json({
      success: true,
      message: 'Tiers reordered successfully',
    });
  } catch (error: any) {
    logger.error('Error reordering pricing tiers:', error);
    res.status(500).json({
      error: error.message || 'Failed to reorder pricing tiers',
    });
  }
});

/**
 * Get feature definitions (for building admin UI)
 * GET /api/admin/pricing/feature-definitions
 */
router.get('/feature-definitions', (_req: EnhancedAuthRequest, res: Response): void => {
  try {
    const featureDescriptions = pricingService.getFeatureDescriptions();
    res.json({
      success: true,
      data: { features: featureDescriptions },
    });
  } catch (error: any) {
    res.status(500).json({
      error: error.message || 'Failed to fetch feature definitions',
    });
  }
});

/**
 * Get limit definitions (for building admin UI)
 * GET /api/admin/pricing/limit-definitions
 */
router.get('/limit-definitions', (_req: EnhancedAuthRequest, res: Response): void => {
  try {
    const limitDescriptions = pricingService.getLimitDescriptions();
    res.json({
      success: true,
      data: { limits: limitDescriptions },
    });
  } catch (error: any) {
    res.status(500).json({
      error: error.message || 'Failed to fetch limit definitions',
    });
  }
});

// ============================================================
// TIER ARCHIVE MANAGEMENT
// ============================================================

/**
 * Get tier archive info (orgs affected before archiving)
 * GET /api/admin/pricing/tiers/:tierName/archive-info
 */
router.get('/tiers/:tierName/archive-info', async (req: EnhancedAuthRequest, res: Response): Promise<void> => {
  try {
    const tierName = req.params.tierName;
    if (!tierName) {
      res.status(400).json({ error: 'Tier name is required' });
      return;
    }

    const info = await pricingService.getTierArchiveInfo(tierName);
    res.json({
      success: true,
      data: info,
    });
  } catch (error: any) {
    if (error.message?.includes('not found')) {
      res.status(404).json({ error: error.message });
      return;
    }
    logger.error('Error getting tier archive info:', error);
    res.status(500).json({
      error: error.message || 'Failed to get tier archive info',
    });
  }
});

/**
 * Archive a pricing tier (soft delete)
 * PATCH /api/admin/pricing/tiers/:tierName/archive
 */
router.patch('/tiers/:tierName/archive', async (req: EnhancedAuthRequest, res: Response): Promise<void> => {
  try {
    const tierName = req.params.tierName;
    if (!tierName) {
      res.status(400).json({ error: 'Tier name is required' });
      return;
    }

    const result = await pricingService.archivePricingTier(tierName, req.user!.id);

    // Broadcast to all clients
    broadcastAdminConfigChange('pricing_tier_archived', { tierName });

    res.json({
      success: true,
      message: `Tier '${tierName}' has been archived`,
      organizationsAffected: result.organizationsAffected,
      warnings: result.warnings,
    });
  } catch (error: any) {
    if (error.message?.includes('not found')) {
      res.status(404).json({ error: error.message });
      return;
    }
    if (error.message?.includes('already archived') || error.message?.includes('Cannot archive')) {
      res.status(409).json({ error: error.message });
      return;
    }
    logger.error('Error archiving pricing tier:', error);
    res.status(500).json({
      error: error.message || 'Failed to archive pricing tier',
    });
  }
});

/**
 * Reactivate an archived pricing tier
 * PATCH /api/admin/pricing/tiers/:tierName/reactivate
 */
router.patch('/tiers/:tierName/reactivate', async (req: EnhancedAuthRequest, res: Response): Promise<void> => {
  try {
    const tierName = req.params.tierName;
    if (!tierName) {
      res.status(400).json({ error: 'Tier name is required' });
      return;
    }

    await pricingService.reactivatePricingTier(tierName, req.user!.id);

    // Broadcast to all clients
    broadcastAdminConfigChange('pricing_tier_reactivated', { tierName });

    res.json({
      success: true,
      message: `Tier '${tierName}' has been reactivated`,
    });
  } catch (error: any) {
    if (error.message?.includes('not found')) {
      res.status(404).json({ error: error.message });
      return;
    }
    if (error.message?.includes('not archived')) {
      res.status(409).json({ error: error.message });
      return;
    }
    logger.error('Error reactivating pricing tier:', error);
    res.status(500).json({
      error: error.message || 'Failed to reactivate pricing tier',
    });
  }
});

/**
 * Get organizations on a specific tier
 * GET /api/admin/pricing/tiers/:tierName/organizations
 */
router.get('/tiers/:tierName/organizations', async (req: EnhancedAuthRequest, res: Response): Promise<void> => {
  try {
    const tierName = req.params.tierName;
    const { limit, offset } = req.query;

    if (!tierName) {
      res.status(400).json({ error: 'Tier name is required' });
      return;
    }

    const result = await pricingService.getOrganizationsOnTier(tierName, {
      limit: limit ? parseInt(limit as string, 10) : undefined,
      offset: offset ? parseInt(offset as string, 10) : undefined,
    });

    res.json({
      success: true,
      data: result,
    });
  } catch (error: any) {
    logger.error('Error getting organizations on tier:', error);
    res.status(500).json({
      error: error.message || 'Failed to get organizations',
    });
  }
});

// ============================================================
// STRIPE SYNC
// ============================================================

/**
 * Sync a single tier to Stripe
 * POST /api/admin/pricing/tiers/:tierName/sync-stripe
 */
router.post('/tiers/:tierName/sync-stripe', async (req: EnhancedAuthRequest, res: Response): Promise<void> => {
  try {
    const tierName = req.params.tierName;
    if (!tierName) {
      res.status(400).json({ error: 'Tier name is required' });
      return;
    }

    const result = await stripeTierService.syncTierToStripe(tierName, req.user!.id);

    if (result.synced) {
      res.json({
        success: true,
        message: result.changes.length > 0
          ? `Stripe sync completed: ${result.changes.join(', ')}`
          : 'Tier already in sync with Stripe',
        data: {
          productId: result.productId,
          priceIdMonthly: result.priceIdMonthly,
          priceIdYearly: result.priceIdYearly,
          changes: result.changes,
        },
      });
    } else {
      res.status(400).json({
        success: false,
        error: result.errors.join(', '),
      });
    }
  } catch (error: any) {
    logger.error('Error syncing tier to Stripe:', error);
    res.status(500).json({
      error: error.message || 'Failed to sync tier to Stripe',
    });
  }
});

/**
 * Sync all tiers to Stripe
 * POST /api/admin/pricing/tiers/sync-stripe-all
 */
router.post('/tiers/sync-stripe-all', async (req: EnhancedAuthRequest, res: Response): Promise<void> => {
  try {
    const result = await stripeTierService.syncAllTiersToStripe(req.user!.id);

    res.json({
      success: true,
      message: `Synced ${result.synced}/${result.total} tiers`,
      data: {
        total: result.total,
        synced: result.synced,
        errors: result.errors,
        details: result.details,
      },
    });
  } catch (error: any) {
    logger.error('Error syncing all tiers to Stripe:', error);
    res.status(500).json({
      error: error.message || 'Failed to sync tiers to Stripe',
    });
  }
});

// ============================================================
// TIER AUDIT
// ============================================================

/**
 * Get tier audit history
 * GET /api/admin/pricing/tiers/:tierName/audit
 */
router.get('/tiers/:tierName/audit', async (req: EnhancedAuthRequest, res: Response): Promise<void> => {
  try {
    const tierName = req.params.tierName;
    const { limit, offset } = req.query;

    if (!tierName) {
      res.status(400).json({ error: 'Tier name is required' });
      return;
    }

    const result = await tierAuditService.getTierHistory(tierName, {
      limit: limit ? parseInt(limit as string, 10) : undefined,
      offset: offset ? parseInt(offset as string, 10) : undefined,
    });

    res.json({
      success: true,
      data: {
        logs: result.logs,
        total: result.total,
      },
    });
  } catch (error: any) {
    logger.error('Error getting tier audit history:', error);
    res.status(500).json({
      error: error.message || 'Failed to get tier audit history',
    });
  }
});

/**
 * Get all tier audit logs
 * GET /api/admin/pricing/audit
 */
router.get('/audit', async (req: EnhancedAuthRequest, res: Response): Promise<void> => {
  try {
    const { action, tierName, startDate, endDate, limit, offset } = req.query;

    const result = await tierAuditService.getAllAuditLogs({
      action: action as any,
      tierName: tierName as string,
      startDate: startDate ? new Date(startDate as string) : undefined,
      endDate: endDate ? new Date(endDate as string) : undefined,
      limit: limit ? parseInt(limit as string, 10) : undefined,
      offset: offset ? parseInt(offset as string, 10) : undefined,
    });

    res.json({
      success: true,
      data: {
        logs: result.logs,
        total: result.total,
      },
    });
  } catch (error: any) {
    logger.error('Error getting tier audit logs:', error);
    res.status(500).json({
      error: error.message || 'Failed to get tier audit logs',
    });
  }
});

export default router;
