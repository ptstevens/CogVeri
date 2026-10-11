import { Request, Response } from 'express';
import storageService from '../services/storage.service';
import { sendErrorResponse } from '../utils/response';
import { logger } from '../utils/logger';

/**
 * Storage Controller
 * Handles storage metrics, usage tracking, and quota alert management
 */

export const getStorageMetrics = async (req: Request, res: Response): Promise<void> => {
  try {
    const organizationId = req.user?.org_id;
    if (!organizationId) {
      sendErrorResponse(res, 400, 'Organization ID required');
      return;
    }

    const metrics = await storageService.getStorageMetrics(organizationId);
    if (!metrics) {
      sendErrorResponse(res, 404, 'Storage metrics not found');
      return;
    }

    res.json({
      success: true,
      data: metrics,
    });
  } catch (error) {
    logger.error('Error fetching storage metrics:', error);
    sendErrorResponse(res, 500, 'Failed to fetch storage metrics');
  }
};

export const getStorageUsage = async (req: Request, res: Response): Promise<void> => {
  try {
    const organizationId = req.user?.org_id;
    if (!organizationId) {
      sendErrorResponse(res, 400, 'Organization ID required');
      return;
    }

    const metrics = await storageService.getStorageMetrics(organizationId);
    if (!metrics) {
      sendErrorResponse(res, 404, 'Storage metrics not found');
      return;
    }

    const remaining = await storageService.getStorageRemaining(organizationId);
    const percentageUsed = await storageService.getStoragePercentageUsed(organizationId);

    // Convert BigInt to Number for JSON serialization
    const usedGB = Number(metrics.totalBytesUsed) / (1024 * 1024 * 1024);
    const maxGB = Number(metrics.maxBytesAllowed) / (1024 * 1024 * 1024);
    const remainingGB = Number(remaining) / (1024 * 1024 * 1024);

    res.json({
      success: true,
      data: {
        usedGB: Number(usedGB.toFixed(2)),
        maxGB: Number(maxGB.toFixed(2)),
        remainingGB: Number(remainingGB.toFixed(2)),
        percentageUsed: percentageUsed,
        recordingCount: metrics.recordingCount,
        lastCalculatedAt: metrics.lastCalculatedAt,
      },
    });
  } catch (error) {
    logger.error('Error fetching storage usage:', error);
    sendErrorResponse(res, 500, 'Failed to fetch storage usage');
  }
};

export const recalculateStorageMetrics = async (req: Request, res: Response): Promise<void> => {
  try {
    const organizationId = req.user?.org_id;
    if (!organizationId) {
      sendErrorResponse(res, 400, 'Organization ID required');
      return;
    }

    const metrics = await storageService.recalculateStorageMetrics(organizationId);

    res.json({
      success: true,
      message: 'Storage metrics recalculated successfully',
      data: metrics,
    });
  } catch (error) {
    logger.error('Error recalculating storage metrics:', error);
    sendErrorResponse(res, 500, 'Failed to recalculate storage metrics');
  }
};

export const createStorageQuotaAlert = async (req: Request, res: Response): Promise<void> => {
  try {
    const organizationId = req.user?.org_id;
    if (!organizationId) {
      sendErrorResponse(res, 400, 'Organization ID required');
      return;
    }

    const { thresholdPercentage, alertType } = req.body;

    // Validate input
    if (!thresholdPercentage || !alertType) {
      sendErrorResponse(res, 400, 'thresholdPercentage and alertType are required');
      return;
    }

    if (
      typeof thresholdPercentage !== 'number' ||
      thresholdPercentage < 0 ||
      thresholdPercentage > 100
    ) {
      sendErrorResponse(res, 400, 'thresholdPercentage must be between 0 and 100');
      return;
    }

    if (!['warning', 'critical'].includes(alertType)) {
      sendErrorResponse(res, 400, 'alertType must be "warning" or "critical"');
      return;
    }

    const alert = await storageService.createStorageQuotaAlert(
      organizationId,
      thresholdPercentage,
      alertType
    );

    res.json({
      success: true,
      message: 'Storage quota alert created successfully',
      data: alert,
    });
  } catch (error) {
    logger.error('Error creating storage quota alert:', error);
    sendErrorResponse(res, 500, 'Failed to create storage quota alert');
  }
};

export const getStorageQuotaAlerts = async (req: Request, res: Response): Promise<void> => {
  try {
    const organizationId = req.user?.org_id;
    if (!organizationId) {
      sendErrorResponse(res, 400, 'Organization ID required');
      return;
    }

    const { activeOnly } = req.query;
    const db = require('../config/database');

    let query = db('storage_quota_alerts')
      .where('organization_id', organizationId)
      .orderBy('threshold_percentage', 'asc');

    if (activeOnly === 'true') {
      query = query.where('is_resolved', false);
    }

    const alerts = await query;

    res.json({
      success: true,
      data: alerts || [],
    });
  } catch (error) {
    logger.error('Error fetching storage quota alerts:', error);
    sendErrorResponse(res, 500, 'Failed to fetch storage quota alerts');
  }
};

export const updateStorageQuotaAlert = async (req: Request, res: Response): Promise<void> => {
  try {
    const organizationId = req.user?.org_id;
    if (!organizationId) {
      sendErrorResponse(res, 400, 'Organization ID required');
      return;
    }

    const { alertId } = req.params;
    const { thresholdPercentage, notificationChannels } = req.body;

    if (!alertId) {
      sendErrorResponse(res, 400, 'Alert ID is required');
      return;
    }

    const db = require('../config/database');

    // Verify alert belongs to organization
    const alert = await db('storage_quota_alerts')
      .where('id', alertId)
      .where('organization_id', organizationId)
      .first();

    if (!alert) {
      sendErrorResponse(res, 404, 'Storage quota alert not found');
      return;
    }

    const updateData: any = {};
    if (thresholdPercentage !== undefined) {
      if (
        typeof thresholdPercentage !== 'number' ||
        thresholdPercentage < 0 ||
        thresholdPercentage > 100
      ) {
        sendErrorResponse(res, 400, 'thresholdPercentage must be between 0 and 100');
        return;
      }
      updateData.threshold_percentage = thresholdPercentage;
    }

    if (notificationChannels !== undefined) {
      updateData.notification_channels = JSON.stringify(notificationChannels);
    }

    updateData.updated_at = new Date();

    const updatedAlert = await db('storage_quota_alerts')
      .where('id', alertId)
      .update(updateData)
      .returning('*')
      .then((result: any[]) => result[0]);

    res.json({
      success: true,
      message: 'Storage quota alert updated successfully',
      data: updatedAlert,
    });
  } catch (error) {
    logger.error('Error updating storage quota alert:', error);
    sendErrorResponse(res, 500, 'Failed to update storage quota alert');
  }
};

export const deleteStorageQuotaAlert = async (req: Request, res: Response): Promise<void> => {
  try {
    const organizationId = req.user?.org_id;
    if (!organizationId) {
      sendErrorResponse(res, 400, 'Organization ID required');
      return;
    }

    const { alertId } = req.params;

    if (!alertId) {
      sendErrorResponse(res, 400, 'Alert ID is required');
      return;
    }

    const db = require('../config/database');

    // Verify alert belongs to organization
    const alert = await db('storage_quota_alerts')
      .where('id', alertId)
      .where('organization_id', organizationId)
      .first();

    if (!alert) {
      sendErrorResponse(res, 404, 'Storage quota alert not found');
      return;
    }

    // Soft delete by marking as resolved
    await db('storage_quota_alerts').where('id', alertId).update({
      is_resolved: true,
      resolved_at: new Date(),
      updated_at: new Date(),
    });

    res.json({
      success: true,
      message: 'Storage quota alert deleted successfully',
    });
  } catch (error) {
    logger.error('Error deleting storage quota alert:', error);
    sendErrorResponse(res, 500, 'Failed to delete storage quota alert');
  }
};

export const checkStorageAlerts = async (req: Request, res: Response): Promise<void> => {
  try {
    const organizationId = req.user?.org_id;
    if (!organizationId) {
      sendErrorResponse(res, 400, 'Organization ID required');
      return;
    }

    // Check and update alert status based on current storage usage
    const alerts = await storageService.checkStorageAlerts(organizationId);

    res.json({
      success: true,
      message: 'Storage alerts checked and updated',
      data: alerts,
    });
  } catch (error) {
    logger.error('Error checking storage alerts:', error);
    sendErrorResponse(res, 500, 'Failed to check storage alerts');
  }
};

export default {
  getStorageMetrics,
  getStorageUsage,
  recalculateStorageMetrics,
  createStorageQuotaAlert,
  getStorageQuotaAlerts,
  updateStorageQuotaAlert,
  deleteStorageQuotaAlert,
  checkStorageAlerts,
};
