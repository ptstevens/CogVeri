/**
 * Admin Observability Routes
 *
 * Provides admin endpoints for debugging and monitoring the analysis pipeline.
 * All endpoints require system admin authentication.
 */

import { Router } from 'express';
import { enhancedAuthenticate } from '../middleware/enhanced-auth.middleware';
import { requireSystemAdmin } from '../middleware/system-admin.middleware';
import {
  getAnalysisDebugLog,
  getRecordingDebugLogs,
  getVarianceAlerts,
  getTemplateCalibrationStats,
  getPerformanceMetrics,
  getAnalysisHealthDashboard,
} from '../controllers/analysis-observability.controller';

const router = Router();

// All admin observability routes require enhanced authentication + system admin check
router.use(enhancedAuthenticate);
router.use(requireSystemAdmin);

/**
 * GET /api/admin/observability/health
 * Get analysis health dashboard with overall status and recommendations
 */
router.get('/health', getAnalysisHealthDashboard);

/**
 * GET /api/admin/observability/metrics
 * Get aggregate performance metrics
 * Query params: startDate, endDate, organizationId
 */
router.get('/metrics', getPerformanceMetrics);

/**
 * GET /api/admin/observability/variance-alerts
 * Get recordings with inconsistent scores across multiple analyses
 */
router.get('/variance-alerts', getVarianceAlerts);

/**
 * GET /api/admin/observability/analysis/:analysisJobId
 * Get detailed debug log for a specific analysis
 */
router.get('/analysis/:analysisJobId', getAnalysisDebugLog);

/**
 * GET /api/admin/observability/recording/:recordingId
 * Get all debug logs for a recording
 */
router.get('/recording/:recordingId', getRecordingDebugLogs);

/**
 * GET /api/admin/observability/template/:templateId/calibration
 * Get calibration stats for a template (self-score monitoring)
 */
router.get('/template/:templateId/calibration', getTemplateCalibrationStats);

export default router;
