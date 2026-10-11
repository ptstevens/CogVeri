import { Router, Response } from 'express';
import { enhancedAuthenticate, EnhancedAuthRequest } from '../middleware/enhanced-auth.middleware';
import { requireSystemAdmin, setTargetOrgContext } from '../middleware/system-admin.middleware';
import trialService from '../services/trial.service';
import { logger } from '../utils/logger';

const router = Router();

// All trial management routes require enhanced authentication + system admin check
router.use(enhancedAuthenticate);
router.use(requireSystemAdmin);

/**
 * Get all trials with filtering
 * GET /api/admin/trials
 * Query: status, expiringWithinDays, page, limit
 */
router.get('/trials', async (req: EnhancedAuthRequest, res: Response): Promise<void> => {
  try {
    const { status, expiringWithinDays, page, limit } = req.query;

    const result = await trialService.getTrials({
      status: status as 'trialing' | 'expired' | 'converted' | 'canceled' | undefined,
      expiringWithinDays: expiringWithinDays
        ? parseInt(expiringWithinDays as string, 10)
        : undefined,
      page: page ? parseInt(page as string, 10) : undefined,
      limit: limit ? parseInt(limit as string, 10) : undefined,
    });

    res.json({
      success: true,
      trials: result.trials,
      total: result.total,
    });
  } catch (error) {
    logger.error('Error getting trials:', error);
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});

/**
 * Get organization trial details
 * GET /api/admin/organizations/:organizationId/trial
 */
router.get(
  '/organizations/:organizationId/trial',
  setTargetOrgContext(),
  async (req: EnhancedAuthRequest, res: Response): Promise<void> => {
    try {
      const { organizationId } = req.params;

      if (!organizationId) {
        res.status(400).json({ success: false, error: 'Organization ID required' });
        return;
      }

      const trial = await trialService.getTrialDetails(organizationId);

      if (!trial) {
        res.status(404).json({
          success: false,
          error: 'No trial found for this organization',
        });
        return;
      }

      res.json({
        success: true,
        trial,
      });
    } catch (error) {
      logger.error('Error getting trial details:', error);
      res.status(500).json({
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  }
);

/**
 * Extend organization trial
 * POST /api/admin/organizations/:organizationId/trial/extend
 * Body: { additionalDays: number }
 */
router.post(
  '/organizations/:organizationId/trial/extend',
  setTargetOrgContext(),
  async (req: EnhancedAuthRequest, res: Response): Promise<void> => {
    try {
      const { organizationId } = req.params;
      const { additionalDays } = req.body;

      if (!organizationId) {
        res.status(400).json({ success: false, error: 'Organization ID required' });
        return;
      }

      if (typeof additionalDays !== 'number' || additionalDays < 1) {
        res.status(400).json({
          success: false,
          error: 'additionalDays must be a positive number',
        });
        return;
      }

      if (additionalDays > 90) {
        res.status(400).json({
          success: false,
          error: 'Cannot extend trial by more than 90 days at a time',
        });
        return;
      }

      const trial = await trialService.extendTrial(organizationId, additionalDays);

      res.json({
        success: true,
        message: `Trial extended by ${additionalDays} days`,
        trial,
      });
    } catch (error) {
      logger.error('Error extending trial:', error);

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
 * Shorten organization trial
 * POST /api/admin/organizations/:organizationId/trial/shorten
 * Body: { newEndDate: string (ISO date) }
 */
router.post(
  '/organizations/:organizationId/trial/shorten',
  setTargetOrgContext(),
  async (req: EnhancedAuthRequest, res: Response): Promise<void> => {
    try {
      const { organizationId } = req.params;
      const { newEndDate } = req.body;

      if (!organizationId) {
        res.status(400).json({ success: false, error: 'Organization ID required' });
        return;
      }

      if (!newEndDate) {
        res.status(400).json({ success: false, error: 'newEndDate is required' });
        return;
      }

      const newEndDateObj = new Date(newEndDate);
      if (isNaN(newEndDateObj.getTime())) {
        res.status(400).json({ success: false, error: 'newEndDate must be a valid date' });
        return;
      }

      const trial = await trialService.shortenTrial(organizationId, newEndDateObj, req.user!.id);

      res.json({
        success: true,
        message: 'Trial end date updated',
        trial,
      });
    } catch (error) {
      logger.error('Error shortening trial:', error);

      if (error instanceof Error && error.message.includes('not found')) {
        res.status(404).json({
          success: false,
          error: error.message,
        });
        return;
      }

      if (error instanceof Error && error.message.includes('must be before')) {
        res.status(400).json({
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
