import { Router, Response } from 'express';
import { enhancedAuthenticate, EnhancedAuthRequest } from '../middleware/enhanced-auth.middleware';
import { requireSystemAdmin, setTargetOrgContext } from '../middleware/system-admin.middleware';
import { featureGrantService } from '../services/feature-grant.service';
import { logger } from '../utils/logger';

const router = Router();

// All feature grant routes require enhanced authentication + system admin check
router.use(enhancedAuthenticate);
router.use(requireSystemAdmin);

/**
 * Get all feature grants for an organization
 * GET /api/admin/organizations/:organizationId/feature-grants
 */
router.get(
  '/organizations/:organizationId/feature-grants',
  setTargetOrgContext(),
  async (req: EnhancedAuthRequest, res: Response): Promise<void> => {
    try {
      const { organizationId } = req.params;
      const { includeExpired, limit, offset } = req.query;

      if (!organizationId) {
        res.status(400).json({ success: false, error: 'Organization ID required' });
        return;
      }

      const [activeGrants, history] = await Promise.all([
        featureGrantService.getActiveGrants(organizationId),
        featureGrantService.getGrantHistory(organizationId, {
          includeExpired: includeExpired === 'true',
          limit: limit ? parseInt(limit as string, 10) : undefined,
          offset: offset ? parseInt(offset as string, 10) : undefined,
        }),
      ]);

      res.json({
        success: true,
        activeGrants,
        history: history.grants,
        total: history.total,
      });
    } catch (error) {
      logger.error('Error getting feature grants:', error);
      res.status(500).json({
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  }
);

/**
 * Create a feature grant for an organization
 * POST /api/admin/organizations/:organizationId/feature-grants
 * Body: { featureName: string, expiresAt: string (ISO date), reason?: string }
 */
router.post(
  '/organizations/:organizationId/feature-grants',
  setTargetOrgContext(),
  async (req: EnhancedAuthRequest, res: Response): Promise<void> => {
    try {
      const { organizationId } = req.params;
      const { featureName, expiresAt, reason } = req.body;

      if (!organizationId) {
        res.status(400).json({ success: false, error: 'Organization ID required' });
        return;
      }

      if (!featureName || typeof featureName !== 'string') {
        res.status(400).json({ success: false, error: 'featureName is required' });
        return;
      }

      if (!expiresAt) {
        res.status(400).json({ success: false, error: 'expiresAt is required' });
        return;
      }

      const expiresAtDate = new Date(expiresAt);
      if (isNaN(expiresAtDate.getTime())) {
        res.status(400).json({ success: false, error: 'expiresAt must be a valid date' });
        return;
      }

      if (expiresAtDate <= new Date()) {
        res.status(400).json({ success: false, error: 'expiresAt must be in the future' });
        return;
      }

      const grant = await featureGrantService.grantFeature(
        organizationId,
        featureName,
        expiresAtDate,
        req.user!.id,
        reason
      );

      res.status(201).json({
        success: true,
        message: 'Feature grant created successfully',
        grant,
      });
    } catch (error) {
      logger.error('Error creating feature grant:', error);

      if (error instanceof Error && error.message.includes('already has an active grant')) {
        res.status(409).json({
          success: false,
          error: error.message,
        });
        return;
      }

      res.status(500).json({
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  }
);

/**
 * Revoke a feature grant
 * DELETE /api/admin/organizations/:organizationId/feature-grants/:grantId
 * Body: { reason?: string }
 */
router.delete(
  '/organizations/:organizationId/feature-grants/:grantId',
  setTargetOrgContext(),
  async (req: EnhancedAuthRequest, res: Response): Promise<void> => {
    try {
      const { grantId } = req.params;
      const { reason } = req.body;

      if (!grantId) {
        res.status(400).json({ success: false, error: 'Grant ID required' });
        return;
      }

      await featureGrantService.revokeGrant(grantId, req.user!.id, reason);

      res.json({
        success: true,
        message: 'Feature grant revoked successfully',
      });
    } catch (error) {
      logger.error('Error revoking feature grant:', error);

      if (error instanceof Error && error.message.includes('not found')) {
        res.status(404).json({
          success: false,
          error: error.message,
        });
        return;
      }

      res.status(500).json({
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  }
);

/**
 * Extend a feature grant
 * PATCH /api/admin/organizations/:organizationId/feature-grants/:grantId/extend
 * Body: { newExpiresAt: string (ISO date) }
 */
router.patch(
  '/organizations/:organizationId/feature-grants/:grantId/extend',
  setTargetOrgContext(),
  async (req: EnhancedAuthRequest, res: Response): Promise<void> => {
    try {
      const { grantId } = req.params;
      const { newExpiresAt } = req.body;

      if (!grantId) {
        res.status(400).json({ success: false, error: 'Grant ID required' });
        return;
      }

      if (!newExpiresAt) {
        res.status(400).json({ success: false, error: 'newExpiresAt is required' });
        return;
      }

      const expiresAtDate = new Date(newExpiresAt);
      if (isNaN(expiresAtDate.getTime())) {
        res.status(400).json({ success: false, error: 'newExpiresAt must be a valid date' });
        return;
      }

      const grant = await featureGrantService.extendGrant(grantId, expiresAtDate, req.user!.id);

      res.json({
        success: true,
        message: 'Feature grant extended successfully',
        grant,
      });
    } catch (error) {
      logger.error('Error extending feature grant:', error);

      if (error instanceof Error && error.message.includes('not found')) {
        res.status(404).json({
          success: false,
          error: error.message,
        });
        return;
      }

      res.status(500).json({
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  }
);

export default router;
