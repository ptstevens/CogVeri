import { Response, NextFunction } from 'express';
import { AuthenticatedRequest } from '../middleware/auth';
import multipartUploadService from '../services/multipart-upload.service';
import { BadRequestError } from '../utils/AppError';
import { logger } from '../utils/logger';
import { z } from 'zod';

// Validation schemas
const initiateUploadSchema = z.object({
  taskId: z.string().uuid(),
  mimeType: z.string(),
  hasAudio: z.boolean().optional(),
  resolution: z.string().optional(),
  frameRate: z.number().optional(),
  browserInfo: z.string().optional(),
});

const presignPartSchema = z.object({
  sessionId: z.string().uuid(),
  partNumber: z.coerce.number().int().positive(),
});

const registerPartSchema = z.object({
  sessionId: z.string().uuid(),
  partNumber: z.number().int().positive(),
  etag: z.string(),
  size: z.number().int().positive(),
});

const completeUploadSchema = z.object({
  sessionId: z.string().uuid(),
  parts: z.array(
    z.object({
      partNumber: z.number().int().positive(),
      etag: z.string(),
    })
  ),
  durationSeconds: z.number().int().nonnegative(),
  hasAudio: z.boolean().optional(),
});

const abortUploadSchema = z.object({
  sessionId: z.string().uuid(),
});

/**
 * Check if multipart upload is available
 */
export const checkAvailability = async (
  _req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const available = multipartUploadService.isAvailable();

    res.json({
      success: true,
      available,
      message: available
        ? 'Multipart upload is available'
        : 'Multipart upload not available - S3/R2 not configured',
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Initiate a new multipart upload session
 */
export const initiateUpload = async (
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const userId = req.user!.id;
    const organizationId = (req as any).user?.org_id;

    if (!organizationId) {
      throw new BadRequestError('Organization ID is required');
    }

    const validatedData = initiateUploadSchema.parse(req.body);

    const result = await multipartUploadService.initiateUpload(
      userId,
      {
        taskId: validatedData.taskId,
        mimeType: validatedData.mimeType,
        hasAudio: validatedData.hasAudio,
        resolution: validatedData.resolution,
        frameRate: validatedData.frameRate,
        browserInfo: validatedData.browserInfo,
      },
      organizationId
    );

    logger.info(`Multipart upload initiated by user ${userId} for task ${validatedData.taskId}`);

    res.status(201).json({
      success: true,
      data: result,
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return next(
        new BadRequestError(
          `Invalid request data: ${error.errors.map((e) => e.message).join(', ')}`
        )
      );
    }
    next(error);
  }
};

/**
 * Get a presigned URL for uploading a specific part
 */
export const getPresignedUrl = async (
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const organizationId = (req as any).user?.org_id;

    if (!organizationId) {
      throw new BadRequestError('Organization ID is required');
    }

    const validatedData = presignPartSchema.parse(req.query);

    const result = await multipartUploadService.getPresignedUrl(
      validatedData.sessionId,
      validatedData.partNumber,
      organizationId
    );

    res.json({
      success: true,
      data: result,
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return next(
        new BadRequestError(
          `Invalid query parameters: ${error.errors.map((e) => e.message).join(', ')}`
        )
      );
    }
    next(error);
  }
};

/**
 * Register a successfully uploaded part
 */
export const registerPart = async (
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const organizationId = (req as any).user?.org_id;

    if (!organizationId) {
      throw new BadRequestError('Organization ID is required');
    }

    const validatedData = registerPartSchema.parse(req.body);

    await multipartUploadService.registerPart(
      validatedData.sessionId,
      validatedData.partNumber,
      validatedData.etag,
      validatedData.size,
      organizationId
    );

    res.json({
      success: true,
      message: `Part ${validatedData.partNumber} registered successfully`,
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return next(
        new BadRequestError(
          `Invalid request data: ${error.errors.map((e) => e.message).join(', ')}`
        )
      );
    }
    next(error);
  }
};

/**
 * Complete a multipart upload
 */
export const completeUpload = async (
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const organizationId = (req as any).user?.org_id;

    if (!organizationId) {
      throw new BadRequestError('Organization ID is required');
    }

    const validatedData = completeUploadSchema.parse(req.body);

    const result = await multipartUploadService.completeUpload(
      {
        sessionId: validatedData.sessionId,
        parts: validatedData.parts.map((p) => ({
          partNumber: p.partNumber,
          etag: p.etag,
        })),
        durationSeconds: validatedData.durationSeconds,
        hasAudio: validatedData.hasAudio,
      },
      organizationId
    );

    logger.info(`Multipart upload completed: session ${validatedData.sessionId}`);

    res.json({
      success: true,
      data: {
        recording: result.recording,
        fileUrl: result.fileUrl,
      },
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return next(
        new BadRequestError(
          `Invalid request data: ${error.errors.map((e) => e.message).join(', ')}`
        )
      );
    }
    next(error);
  }
};

/**
 * Abort a multipart upload
 */
export const abortUpload = async (
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const organizationId = (req as any).user?.org_id;

    if (!organizationId) {
      throw new BadRequestError('Organization ID is required');
    }

    const validatedData = abortUploadSchema.parse(req.query);

    await multipartUploadService.abortUpload(validatedData.sessionId, organizationId);

    logger.info(`Multipart upload aborted: session ${validatedData.sessionId}`);

    res.json({
      success: true,
      message: 'Upload aborted successfully',
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return next(
        new BadRequestError(
          `Invalid query parameters: ${error.errors.map((e) => e.message).join(', ')}`
        )
      );
    }
    next(error);
  }
};

/**
 * Get session status
 */
export const getSessionStatus = async (
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const organizationId = (req as any).user?.org_id;

    if (!organizationId) {
      throw new BadRequestError('Organization ID is required');
    }

    const sessionId = req.params.sessionId;
    if (!sessionId) {
      throw new BadRequestError('Session ID is required');
    }

    const session = await multipartUploadService.getSessionStatus(sessionId, organizationId);

    res.json({
      success: true,
      data: session,
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Get active sessions (for resume functionality)
 */
export const getActiveSessions = async (
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const userId = req.user!.id;
    const organizationId = (req as any).user?.org_id;

    if (!organizationId) {
      throw new BadRequestError('Organization ID is required');
    }

    const sessions = await multipartUploadService.getActiveSessions(userId, organizationId);

    res.json({
      success: true,
      data: sessions,
      total: sessions.length,
    });
  } catch (error) {
    next(error);
  }
};
