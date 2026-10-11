import { Router, Response } from 'express';
import {
  getPricingTiers,
  getPricingTier,
  getOrganizationUsage,
  checkFeatureLimit,
  upgradeOrganization,
  getFeatureAccess,
} from '../controllers/pricing.controller';
import { enhancedAuthenticate } from '../middleware/enhanced-auth.middleware';
import { requirePermission } from '../middleware/permissions-v2.middleware';
import { systemSettingsService } from '../services/system-settings.service';

const router = Router();

/**
 * Public endpoints (no authentication required)
 */

/**
 * GET /pricing/tiers
 * Get all available pricing tiers with features and limits
 */
router.get('/tiers', getPricingTiers);

/**
 * GET /pricing/tiers/:tierName
 * Get details for specific pricing tier
 */
router.get('/tiers/:tierName', getPricingTier);

/**
 * GET /pricing/trial-info
 * Get public trial information (duration, etc.) for pricing page
 */
router.get('/trial-info', async (_req, res: Response): Promise<void> => {
  try {
    const trialDurationDays = await systemSettingsService.getTrialDurationDays();
    res.json({
      success: true,
      trial: {
        durationDays: trialDurationDays,
        creditCardRequired: false,
      },
    });
  } catch {
    // Return default if settings service fails
    res.json({
      success: true,
      trial: {
        durationDays: 7,
        creditCardRequired: false,
      },
    });
  }
});

/**
 * Authenticated endpoints
 */

/**
 * GET /pricing/organization/usage
 * Get organization's current usage against tier limits
 * Requires authentication with organization context
 */
router.get('/organization/usage', enhancedAuthenticate, getOrganizationUsage);

/**
 * GET /pricing/organization/check-limit
 * Check if organization has reached specific feature limit
 * Query params: feature=members|storage|tasks
 */
router.get('/organization/check-limit', enhancedAuthenticate, checkFeatureLimit);

/**
 * GET /pricing/organization/features
 * Get list of available features based on current tier
 */
router.get('/organization/features', enhancedAuthenticate, getFeatureAccess);

/**
 * POST /pricing/organization/upgrade
 * Upgrade organization to new pricing tier
 * Requires OWNER role
 */
router.post(
  '/organization/upgrade',
  enhancedAuthenticate,
  requirePermission('org:update'),
  upgradeOrganization
);

export default router;
