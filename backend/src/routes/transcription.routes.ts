/**
 * Transcription API Routes
 * Handles transcription management for recordings.
 */

import { Router, Response, NextFunction, RequestHandler } from 'express';
import { authenticateApiKey } from '../middleware/auth';
import { enhancedAuthenticate, EnhancedAuthRequest } from '../middleware/enhanced-auth.middleware';

/**
 * Wrapper for async route handlers to properly catch errors and forward to Express error handler.
 * Prevents unhandled promise rejections from crashing the Node.js process.
 */
const asyncHandler = (
  fn: (req: EnhancedAuthRequest, res: Response, next: NextFunction) => Promise<void>
): RequestHandler => {
  return (req, res, next) => {
    Promise.resolve(fn(req as EnhancedAuthRequest, res, next)).catch(next);
  };
};
import { requireFeature } from '../middleware/quota-enforcer';
import transcriptionService from '../services/transcription.service';
import pricingService from '../services/pricing.service';
import { db } from '../config/database';
import { logger } from '../utils/logger';
import { BadRequestError, NotFoundError, UnauthorizedError } from '../utils/AppError';

const router = Router();

/**
 * POST /api/transcription/callback
 * Callback endpoint for Python worker to submit results
 * Authenticated via API key (not JWT)
 *
 * IMPORTANT: This route must be defined BEFORE any /:recordingId routes
 * to prevent Express from matching "callback" as a recordingId parameter
 */
router.post(
  '/callback',
  authenticateApiKey,
  asyncHandler(async (req: EnhancedAuthRequest, res: Response) => {
    const { recordingId, transcriptText, segments, language, duration, metadata } = req.body;

    logger.info('[DIAG] Transcription callback received', {
      recordingId,
      hasTranscriptText: !!transcriptText,
      transcriptTextLength: transcriptText?.length || 0,
      segmentsCount: segments?.length || 0,
      language,
      duration,
    });

    if (!recordingId || !transcriptText) {
      throw new BadRequestError('recordingId and transcriptText are required');
    }

    await transcriptionService.handleTranscriptionCallback({
      recordingId,
      transcriptText,
      segments: segments || [],
      language: language || 'en',
      duration: duration || 0,
      metadata,
    });

    res.json({
      success: true,
      message: 'Transcription callback processed',
    });
  })
);

/**
 * GET /api/transcription/feature-access
 * Check if the user's organization has access to transcription features
 *
 * IMPORTANT: This route must be defined BEFORE any /:recordingId routes
 * to prevent Express from matching "feature-access" as a recordingId parameter
 */
router.get(
  '/feature-access',
  enhancedAuthenticate,
  asyncHandler(async (req: EnhancedAuthRequest, res: Response) => {
    const organizationId = req.user?.org_id;

    if (!organizationId) {
      throw new UnauthorizedError('Organization context required');
    }

    // Get organization's subscription tier
    const org = await db('organizations')
      .where('id', organizationId)
      .select('subscription_tier')
      .first();

    const tier = org?.subscription_tier || 'free';

    // Check transcription feature access
    const hasBasicTranscription = pricingService.hasFeatureAccess(tier, 'basicTranscription');
    const hasAdvancedTranscription = pricingService.hasFeatureAccess(tier, 'advancedTranscription');
    const hasAiSummaries = pricingService.hasFeatureAccess(tier, 'aiSummaries');

    res.json({
      success: true,
      data: {
        hasBasicTranscription,
        hasAdvancedTranscription,
        hasAiSummaries,
        tier,
      },
    });
  })
);

/**
 * POST /api/transcription/:recordingId/start
 * Start transcription for a recording
 * Requires basicTranscription feature access
 */
router.post(
  '/:recordingId/start',
  enhancedAuthenticate,
  requireFeature('basicTranscription'),
  asyncHandler(async (req: EnhancedAuthRequest, res: Response) => {
    const { recordingId } = req.params;
    const { language, includeSpeakerDiarization, includeTimestamps } = req.body;

    // Get org context from authenticated user (set by enhancedAuthenticate)
    const organizationId = req.user?.org_id;
    const userId = req.user?.id;

    if (!organizationId) {
      throw new UnauthorizedError('Organization context required');
    }

    const job = await transcriptionService.startTranscription(recordingId!, organizationId, {
      userId,
      language,
      includeSpeakerDiarization,
      includeTimestamps,
    });

    res.status(202).json({
      success: true,
      message: 'Transcription started',
      data: {
        jobId: job.id,
        status: job.status,
        progress: job.progress,
      },
    });
  })
);

/**
 * GET /api/transcription/:recordingId/status
 * Get transcription status for a recording
 */
router.get(
  '/:recordingId/status',
  enhancedAuthenticate,
  asyncHandler(async (req: EnhancedAuthRequest, res: Response) => {
    const { recordingId } = req.params;

    // Get org context from authenticated user (set by enhancedAuthenticate)
    const organizationId = req.user?.org_id;

    if (!organizationId) {
      throw new UnauthorizedError('Organization context required');
    }

    const status = await transcriptionService.getTranscriptionStatus(recordingId!, organizationId);

    // Disable caching for status endpoint - status can change frequently
    res.set('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
    res.set('Pragma', 'no-cache');
    res.set('Expires', '0');

    res.json({
      success: true,
      data: status,
    });
  })
);

/**
 * GET /api/transcription/:recordingId
 * Get transcription for a recording
 */
router.get(
  '/:recordingId',
  enhancedAuthenticate,
  asyncHandler(async (req: EnhancedAuthRequest, res: Response) => {
    const { recordingId } = req.params;

    // Get org context from authenticated user (set by enhancedAuthenticate)
    const organizationId = req.user?.org_id;

    if (!organizationId) {
      throw new UnauthorizedError('Organization context required');
    }

    const transcription = await transcriptionService.getTranscription(recordingId!, organizationId);

    if (!transcription) {
      throw new NotFoundError('Transcription not found');
    }

    res.json({
      success: true,
      data: transcription,
    });
  })
);

/**
 * GET /api/transcription/:recordingId/segments
 * Get transcription segments for a recording
 */
router.get(
  '/:recordingId/segments',
  enhancedAuthenticate,
  asyncHandler(async (req: EnhancedAuthRequest, res: Response) => {
    const { recordingId } = req.params;
    const { startTime, endTime, limit, offset } = req.query;

    // Get org context from authenticated user (set by enhancedAuthenticate)
    const organizationId = req.user?.org_id;

    if (!organizationId) {
      throw new UnauthorizedError('Organization context required');
    }

    const segments = await transcriptionService.getTranscriptionSegments(
      recordingId!,
      organizationId,
      {
        startTime: startTime ? parseFloat(startTime as string) : undefined,
        endTime: endTime ? parseFloat(endTime as string) : undefined,
        limit: limit ? parseInt(limit as string, 10) : undefined,
        offset: offset ? parseInt(offset as string, 10) : undefined,
      }
    );

    res.json({
      success: true,
      data: segments,
    });
  })
);

/**
 * GET /api/transcription/:recordingId/segment-at-time
 * Get the segment at a specific time
 */
router.get(
  '/:recordingId/segment-at-time',
  enhancedAuthenticate,
  asyncHandler(async (req: EnhancedAuthRequest, res: Response) => {
    const { recordingId } = req.params;
    const { time } = req.query;

    if (!time) {
      throw new BadRequestError('Time parameter is required');
    }

    // Get org context from authenticated user (set by enhancedAuthenticate)
    const organizationId = req.user?.org_id;

    if (!organizationId) {
      throw new UnauthorizedError('Organization context required');
    }

    const segment = await transcriptionService.getSegmentAtTime(
      recordingId!,
      organizationId,
      parseFloat(time as string)
    );

    res.json({
      success: true,
      data: segment,
    });
  })
);

/**
 * DELETE /api/transcription/:recordingId
 * Cancel a pending transcription
 */
router.delete(
  '/:recordingId',
  enhancedAuthenticate,
  asyncHandler(async (req: EnhancedAuthRequest, res: Response) => {
    const { recordingId } = req.params;

    // Get org context from authenticated user (set by enhancedAuthenticate)
    const organizationId = req.user?.org_id;

    if (!organizationId) {
      throw new UnauthorizedError('Organization context required');
    }

    const cancelled = await transcriptionService.cancelTranscription(recordingId!, organizationId);

    if (!cancelled) {
      throw new NotFoundError('No active transcription job found');
    }

    res.json({
      success: true,
      message: 'Transcription cancelled',
    });
  })
);

/**
 * POST /api/transcription/:recordingId/retry
 * Retry a failed transcription
 */
router.post(
  '/:recordingId/retry',
  enhancedAuthenticate,
  asyncHandler(async (req: EnhancedAuthRequest, res: Response) => {
    const { recordingId } = req.params;

    // Get org context from authenticated user (set by enhancedAuthenticate)
    const organizationId = req.user?.org_id;
    const userId = req.user?.id;

    if (!organizationId) {
      throw new UnauthorizedError('Organization context required');
    }

    const job = await transcriptionService.retryTranscription(recordingId!, organizationId, userId);

    res.status(202).json({
      success: true,
      message: 'Transcription retry started',
      data: {
        jobId: job.id,
        status: job.status,
      },
    });
  })
);

/**
 * GET /api/transcription/:recordingId/history
 * Get transcription job history for a recording
 */
router.get(
  '/:recordingId/history',
  enhancedAuthenticate,
  asyncHandler(async (req: EnhancedAuthRequest, res: Response) => {
    const { recordingId } = req.params;

    // Get org context from authenticated user (set by enhancedAuthenticate)
    const organizationId = req.user?.org_id;

    if (!organizationId) {
      throw new UnauthorizedError('Organization context required');
    }

    const history = await transcriptionService.getTranscriptionHistory(recordingId!, organizationId);

    res.json({
      success: true,
      data: history,
    });
  })
);

export default router;
