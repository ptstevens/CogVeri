import { Request, Response } from 'express';
import metricsService from '../services/metrics.service';
import { sendErrorResponse } from '../utils/response';
import { logger } from '../utils/logger';

/**
 * Metrics Controller
 * Handles API metrics, usage analytics, and rate limiting management
 */

export const getUsageSummary = async (req: Request, res: Response): Promise<void> => {
  try {
    const organizationId = req.user?.org_id;
    if (!organizationId) {
      sendErrorResponse(res, 400, 'Organization ID required');
      return;
    }

    const { startDate, endDate } = req.query;
    const start = startDate ? new Date(startDate as string) : undefined;
    const end = endDate ? new Date(endDate as string) : undefined;

    const summary = await metricsService.getUsageSummary(organizationId, start, end);

    res.json({
      success: true,
      data: {
        ...summary,
        totalDataTransferredGb: Number((summary.totalDataTransferred / (1024 * 1024 * 1024)).toFixed(2)),
      },
    });
  } catch (error) {
    logger.error('Error getting usage summary:', error);
    sendErrorResponse(res, 500, 'Failed to get usage summary');
  }
};

export const getUsageByEndpoint = async (req: Request, res: Response): Promise<void> => {
  try {
    const organizationId = req.user?.org_id;
    if (!organizationId) {
      sendErrorResponse(res, 400, 'Organization ID required');
      return;
    }

    const { startDate, endDate } = req.query;
    const start = startDate ? new Date(startDate as string) : undefined;
    const end = endDate ? new Date(endDate as string) : undefined;

    const endpoints = await metricsService.getUsageByEndpoint(organizationId, start, end);

    res.json({
      success: true,
      data: endpoints,
    });
  } catch (error) {
    logger.error('Error getting usage by endpoint:', error);
    sendErrorResponse(res, 500, 'Failed to get usage by endpoint');
  }
};

export const getUsageByUser = async (req: Request, res: Response): Promise<void> => {
  try {
    const organizationId = req.user?.org_id;
    if (!organizationId) {
      sendErrorResponse(res, 400, 'Organization ID required');
      return;
    }

    const { startDate, endDate, limit = '10' } = req.query;
    const start = startDate ? new Date(startDate as string) : undefined;
    const end = endDate ? new Date(endDate as string) : undefined;

    const users = await metricsService.getUsageByUser(
      organizationId,
      start,
      end,
      parseInt(limit as string, 10) || 10
    );

    // Convert bytes to GB for display
    const usersWithGb = users.map((u) => ({
      ...u,
      totalDataTransferredGb: Number((u.totalDataTransferred / (1024 * 1024 * 1024)).toFixed(2)),
    }));

    res.json({
      success: true,
      data: usersWithGb,
    });
  } catch (error) {
    logger.error('Error getting usage by user:', error);
    sendErrorResponse(res, 500, 'Failed to get usage by user');
  }
};

export const getFeatureUsage = async (req: Request, res: Response): Promise<void> => {
  try {
    const organizationId = req.user?.org_id;
    if (!organizationId) {
      sendErrorResponse(res, 400, 'Organization ID required');
      return;
    }

    const { startDate, endDate } = req.query;
    const start = startDate ? new Date(startDate as string) : undefined;
    const end = endDate ? new Date(endDate as string) : undefined;

    const features = await metricsService.getFeatureUsageStats(organizationId, start, end);

    res.json({
      success: true,
      data: features,
    });
  } catch (error) {
    logger.error('Error getting feature usage:', error);
    sendErrorResponse(res, 500, 'Failed to get feature usage');
  }
};

export const createApiKey = async (req: Request, res: Response): Promise<void> => {
  try {
    const organizationId = req.user?.org_id;
    const userId = req.user?.id;

    if (!organizationId || !userId) {
      sendErrorResponse(res, 400, 'Organization and User ID required');
      return;
    }

    const { name, scopes, expiresAt } = req.body;

    if (!name) {
      sendErrorResponse(res, 400, 'API key name is required');
      return;
    }

    const expiry = expiresAt ? new Date(expiresAt) : undefined;

    const apiKey = await metricsService.createApiKey(
      organizationId,
      userId,
      name,
      scopes,
      expiry
    );

    res.json({
      success: true,
      message: 'API key created successfully. Save the key value - it will not be shown again.',
      data: {
        id: apiKey.id,
        keyPrefix: apiKey.keyPrefix,
        keyFull: apiKey.keyFull, // Only shown on creation
      },
    });
  } catch (error) {
    logger.error('Error creating API key:', error);
    sendErrorResponse(res, 500, 'Failed to create API key');
  }
};

export const getApiKeys = async (req: Request, res: Response): Promise<void> => {
  try {
    const organizationId = req.user?.org_id;
    if (!organizationId) {
      sendErrorResponse(res, 400, 'Organization ID required');
      return;
    }

    const keys = await metricsService.getApiKeys(organizationId);

    res.json({
      success: true,
      data: keys,
    });
  } catch (error) {
    logger.error('Error getting API keys:', error);
    sendErrorResponse(res, 500, 'Failed to get API keys');
  }
};

export const revokeApiKey = async (req: Request, res: Response): Promise<void> => {
  try {
    const organizationId = req.user?.org_id;
    if (!organizationId) {
      sendErrorResponse(res, 400, 'Organization ID required');
      return;
    }

    const { keyId } = req.params;
    if (!keyId) {
      sendErrorResponse(res, 400, 'Key ID is required');
      return;
    }

    await metricsService.revokeApiKey(organizationId, keyId);

    res.json({
      success: true,
      message: 'API key revoked successfully',
    });
  } catch (error) {
    logger.error('Error revoking API key:', error);
    sendErrorResponse(res, 500, 'Failed to revoke API key');
  }
};

export const getRateLimitStatus = async (req: Request, res: Response): Promise<void> => {
  try {
    const organizationId = req.user?.org_id;
    const userId = req.user?.id;

    if (!organizationId) {
      sendErrorResponse(res, 400, 'Organization ID required');
      return;
    }

    const { endpoint } = req.query;

    if (!endpoint) {
      sendErrorResponse(res, 400, 'Endpoint is required');
      return;
    }

    const status = await metricsService.checkRateLimit(
      organizationId,
      userId,
      endpoint as string
    );

    res.json({
      success: true,
      data: {
        allowed: status.allowed,
        remaining: status.remaining,
        resetAt: status.resetAt,
      },
    });
  } catch (error) {
    logger.error('Error getting rate limit status:', error);
    sendErrorResponse(res, 500, 'Failed to get rate limit status');
  }
};

export default {
  getUsageSummary,
  getUsageByEndpoint,
  getUsageByUser,
  getFeatureUsage,
  createApiKey,
  getApiKeys,
  revokeApiKey,
  getRateLimitStatus,
};
