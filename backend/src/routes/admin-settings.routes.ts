import { Router, Response } from 'express';
import { enhancedAuthenticate, EnhancedAuthRequest } from '../middleware/enhanced-auth.middleware';
import { requireSystemAdmin } from '../middleware/system-admin.middleware';
import { systemSettingsService } from '../services/system-settings.service';
import { broadcastAdminConfigChange } from '../services/socket.service';
import { logger } from '../utils/logger';

const router = Router();

// All admin settings routes require enhanced authentication + system admin check
router.use(enhancedAuthenticate);
router.use(requireSystemAdmin);

/**
 * Get all system settings
 * GET /api/admin/settings
 */
router.get('/', async (_req: EnhancedAuthRequest, res: Response): Promise<void> => {
  try {
    const settings = await systemSettingsService.getAllSettings();
    res.json({
      success: true,
      settings,
    });
  } catch (error) {
    logger.error('Error getting system settings:', error);
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});

/**
 * Get trial settings
 * GET /api/admin/settings/trial
 */
router.get('/trial', async (_req: EnhancedAuthRequest, res: Response): Promise<void> => {
  try {
    const trialDurationDays = await systemSettingsService.getTrialDurationDays();
    res.json({
      success: true,
      settings: {
        trialDurationDays,
      },
    });
  } catch (error) {
    logger.error('Error getting trial settings:', error);
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});

/**
 * Update trial settings
 * PUT /api/admin/settings/trial
 * Body: { trialDurationDays: number }
 */
router.put('/trial', async (req: EnhancedAuthRequest, res: Response): Promise<void> => {
  try {
    const { trialDurationDays } = req.body;

    if (typeof trialDurationDays !== 'number') {
      res.status(400).json({
        success: false,
        error: 'trialDurationDays must be a number',
      });
      return;
    }

    if (trialDurationDays < 1 || trialDurationDays > 90) {
      res.status(400).json({
        success: false,
        error: 'trialDurationDays must be between 1 and 90',
      });
      return;
    }

    await systemSettingsService.setTrialDurationDays(trialDurationDays, req.user!.id);

    // Broadcast to all clients
    broadcastAdminConfigChange('trial_settings_updated', { trialDurationDays });

    res.json({
      success: true,
      message: 'Trial settings updated successfully',
      settings: {
        trialDurationDays,
      },
    });
  } catch (error) {
    logger.error('Error updating trial settings:', error);
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});

export default router;
