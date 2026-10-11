import { Request, Response, NextFunction } from 'express';
import { AuthenticatedRequest } from '../middleware/auth';
import magicLinkService from '../services/magic-link.service';
import recordingService from '../services/recording.service';
import multipartUploadService from '../services/multipart-upload.service';
import { BadRequestError } from '../utils/AppError';
import { logger } from '../utils/logger';
import { z } from 'zod';
import multer from 'multer';

// Validation schemas
const createMagicLinkSchema = z.object({
  taskId: z.string().uuid(),
  email: z.string().email(),
  expiresInDays: z.number().int().min(1).max(365),
  maxUses: z.number().int().positive().optional(),
});

const claimTaskSchema = z.object({
  firstName: z.string().trim().min(1, 'First name is required').max(100),
  lastName: z.string().trim().min(1, 'Last name is required').max(100),
  email: z.string().email(),
});

const submitRecordingSchema = z.object({
  duration_seconds: z.number().int().positive(),
  has_audio: z.boolean(),
  mime_type: z.string(),
  resolution: z.string().optional(),
  frame_rate: z.number().optional(),
  browser_info: z.string().optional(),
});

// Multipart upload validation schemas for magic links
const initiateMultipartSchema = z.object({
  mimeType: z.string(),
  hasAudio: z.boolean().optional(),
  resolution: z.string().optional(),
  frameRate: z.number().optional(),
  browserInfo: z.string().optional(),
});

const completeMultipartSchema = z.object({
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

// Configure multer for file uploads (same as recording controller)
const storage = multer.memoryStorage();
const upload = multer({
  storage,
  limits: {
    fileSize: 500 * 1024 * 1024, // 500MB max file size
  },
  fileFilter: (_req, file, cb) => {
    // Accept video files (including webm) and octet-stream (for blob uploads)
    const acceptedTypes = ['video/', 'application/octet-stream'];
    const isAccepted = acceptedTypes.some((type) => file.mimetype.startsWith(type));

    // Also check file extension for .webm files
    const hasWebmExtension = file.originalname?.toLowerCase().endsWith('.webm');

    if (isAccepted || hasWebmExtension) {
      cb(null, true);
    } else {
      cb(new BadRequestError(`Only video files are allowed. Received: ${file.mimetype}`));
    }
  },
});

export const uploadMiddleware = upload.single('video');

class MagicLinkController {
  /**
   * Create a magic link for a task
   */
  async createMagicLink(req: AuthenticatedRequest, res: Response, next: NextFunction) {
    try {
      const validatedData = createMagicLinkSchema.parse(req.body) as {
        taskId: string;
        email: string;
        expiresInDays: number;
        maxUses?: number;
      };

      // Get organization from query or from enhanced auth
      const organizationId = (req.query.organization_id as string) || (req as any).user?.org_id;

      logger.info(
        `Creating magic link - organizationId: ${organizationId}, taskId: ${validatedData.taskId}, user.org_id: ${(req as any).user?.org_id}`
      );

      const result = await magicLinkService.createMagicLink(validatedData, organizationId);

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
  }

  /**
   * Validate a token (public endpoint)
   */
  async validateToken(req: Request, res: Response, next: NextFunction) {
    try {
      const { token } = req.params;
      const organizationId = (req.query.organization_id as string) || (req as any).user?.org_id;
      const ipAddress = (req.headers['x-forwarded-for'] as string) || req.socket.remoteAddress;
      const userAgent = req.headers['user-agent'];

      const result = await magicLinkService.validateToken(
        token ?? '',
        ipAddress ?? '',
        userAgent,
        organizationId
      );

      res.json({
        success: true,
        data: result,
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * Get task details by token (public endpoint)
   */
  async getTaskByToken(req: Request, res: Response, next: NextFunction) {
    try {
      const { token } = req.params;
      const organizationId = (req.query.organization_id as string) || (req as any).user?.org_id;

      const result = await magicLinkService.getTaskByToken(token ?? '', organizationId ?? '');

      res.json({
        success: true,
        data: result,
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * Claim a task (public endpoint - sets name and email)
   */
  async claimTask(req: Request, res: Response, next: NextFunction) {
    try {
      const { token } = req.params;
      const organizationId = (req.query.organization_id as string) || (req as any).user?.org_id;

      const validatedData = claimTaskSchema.parse(req.body) as {
        firstName: string;
        lastName: string;
        email: string;
      };

      const ipAddress = (req.headers['x-forwarded-for'] as string) || req.socket.remoteAddress;
      const userAgent = req.headers['user-agent'];

      const result = await magicLinkService.claimTask(
        {
          token: token ?? '',
          ...validatedData,
        },
        ipAddress ?? '',
        userAgent,
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
            `Invalid request data: ${error.errors.map((e) => e.message).join(', ')}`
          )
        );
      }
      next(error);
    }
  }

  /**
   * Revoke a magic link
   */
  async revokeToken(req: AuthenticatedRequest, res: Response, next: NextFunction) {
    try {
      const { taskId } = req.params;
      const userId = req.user!.id;
      const organizationId = (req.query.organization_id as string) || (req as any).user?.org_id;

      await magicLinkService.revokeToken(taskId ?? '', userId, organizationId ?? '');

      res.json({
        success: true,
        message: 'Magic link revoked successfully',
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * Get all external contributors
   */
  async getExternalContributors(req: AuthenticatedRequest, res: Response, next: NextFunction) {
    try {
      const { search, limit } = req.query;
      const organizationId = (req.query.organization_id as string) || (req as any).user?.org_id;

      if (!organizationId) {
        throw new BadRequestError('Organization ID is required');
      }

      const contributors = await magicLinkService.getExternalContributors(
        organizationId,
        search as string,
        limit ? parseInt(limit as string) : 50
      );

      res.json({
        success: true,
        data: contributors,
        total: contributors.length,
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * Get contributor analytics
   */
  async getContributorAnalytics(req: AuthenticatedRequest, res: Response, next: NextFunction) {
    try {
      const { contributorId } = req.params;
      const orgIdRaw = ((req.query.organization_id as string) || (req as any).user?.org_id) as
        string | undefined;

      if (!orgIdRaw) {
        throw new BadRequestError('Organization ID is required');
      }
      const organizationId: string = orgIdRaw;

      const analytics = await magicLinkService.getContributorAnalytics(
        organizationId,
        contributorId ?? ''
      );

      res.json({
        success: true,
        data: analytics,
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * Submit recording via magic link token (public endpoint)
   * This creates a recording entry and uploads the video file in one request
   */
  async submitRecording(req: Request, res: Response, next: NextFunction) {
    try {
      const { token } = req.params;
      const organizationId = (req.query.organization_id as string) || (req as any).user?.org_id;
      const file = req.file;

      if (!file) {
        throw new BadRequestError('No video file provided');
      }

      // Validate token with organization context
      logger.info(
        `[submitRecording] Validating token: ${token?.substring(0, 16)}... with organizationId: ${organizationId}`
      );
      const tokenData = await magicLinkService.validateToken(
        token ?? '',
        (req.headers['x-forwarded-for'] as string) ?? req.socket.remoteAddress ?? '',
        req.headers['user-agent'],
        organizationId
      );
      logger.info(
        `[submitRecording] Token validation result - valid: ${tokenData.valid}, taskId: ${tokenData.taskId}, contributorId: ${tokenData.contributorId}, organizationId: ${tokenData.organizationId}`
      );

      if (!tokenData.valid || !tokenData.taskId || !tokenData.contributorId) {
        throw new BadRequestError('Invalid or expired token');
      }

      const taskId = tokenData.taskId;
      const contributorId = tokenData.contributorId;

      logger.info(
        `[submitRecording] Token validated - taskId: ${taskId}, contributorId: ${contributorId}, organizationId from token: ${tokenData.organizationId}, organizationId from request: ${organizationId}`
      );

      // Get database connection
      const { db } = await import('../config/database');

      // Get contributor to verify they exist and belong to org
      const contributor = await db('external_contributors')
        .where('id', contributorId)
        .andWhere('organization_id', tokenData.organizationId || organizationId)
        .first();

      if (!contributor) {
        throw new BadRequestError('Contributor not found in this organization');
      }

      // Parse metadata from request body
      const metadata = req.body;
      const validatedData = submitRecordingSchema.parse({
        duration_seconds: metadata.duration_seconds ? parseInt(metadata.duration_seconds) : 1,
        has_audio: metadata.has_audio === 'true' || metadata.has_audio === true,
        mime_type: metadata.mime_type || file.mimetype,
        resolution: metadata.resolution,
        frame_rate: metadata.frame_rate ? parseFloat(metadata.frame_rate) : undefined,
        browser_info: metadata.browser_info,
      });

      // Create recording entry with null user_id and external_contributor_id
      const recording = await recordingService.createRecording(
        null,
        {
          task_id: taskId,
          duration_seconds: validatedData.duration_seconds,
          has_audio: validatedData.has_audio,
          mime_type: validatedData.mime_type,
          resolution: validatedData.resolution,
          frame_rate: validatedData.frame_rate,
          browser_info: validatedData.browser_info,
        },
        tokenData.organizationId || organizationId
      );

      // Set the external_contributor_id after creation
      await db('recordings')
        .where('id', recording.id)
        .update({ external_contributor_id: contributorId });

      // Upload the video file (using contributorId for permission check)
      logger.info(
        `[submitRecording] About to upload recording - recordingId: ${recording.id}, contributorId: ${contributorId}, organizationId: ${tokenData.organizationId || organizationId}`
      );
      const uploadedRecording = await recordingService.uploadRecording(
        contributorId,
        recording.id,
        file,
        tokenData.organizationId || organizationId
      );

      logger.info(
        `[submitRecording] SUCCESS - Recording uploaded: ${recording.id}, file stored at: ${uploadedRecording.file_url}`
      );
      logger.info(
        `External contributor recording submitted via token: ${recording.id} for task ${taskId} in org ${tokenData.organizationId || organizationId}`
      );

      res.json({
        success: true,
        data: uploadedRecording,
        message: 'Recording submitted successfully',
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
  }

  /**
   * Check if multipart upload is available (public endpoint)
   */
  async checkMultipartAvailable(_req: Request, res: Response, next: NextFunction) {
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
  }

  /**
   * Initiate multipart upload via magic link token (public endpoint)
   */
  async initiateMultipartUpload(req: Request, res: Response, next: NextFunction) {
    try {
      const { token } = req.params;
      const organizationId = req.query.organization_id as string;

      // Validate token
      const tokenData = await magicLinkService.validateToken(
        token ?? '',
        (req.headers['x-forwarded-for'] as string) ?? req.socket.remoteAddress ?? '',
        req.headers['user-agent'],
        organizationId
      );

      if (!tokenData.valid || !tokenData.taskId || !tokenData.contributorId) {
        throw new BadRequestError('Invalid or expired token');
      }

      const validatedData = initiateMultipartSchema.parse(req.body);

      const result = await multipartUploadService.initiateUpload(
        null, // No user_id for external contributors
        {
          taskId: tokenData.taskId,
          mimeType: validatedData.mimeType,
          hasAudio: validatedData.hasAudio,
          resolution: validatedData.resolution,
          frameRate: validatedData.frameRate,
          browserInfo: validatedData.browserInfo,
        },
        tokenData.organizationId || organizationId,
        tokenData.contributorId
      );

      logger.info(`Multipart upload initiated via token for task ${tokenData.taskId}`);

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
  }

  /**
   * Get presigned URL for part upload via magic link token (public endpoint)
   */
  async getMultipartPresignedUrl(req: Request, res: Response, next: NextFunction) {
    try {
      const { token } = req.params;
      const { sessionId, partNumber } = req.query;
      const organizationId = req.query.organization_id as string;

      if (!sessionId || !partNumber) {
        throw new BadRequestError('sessionId and partNumber are required');
      }

      // Validate token
      const tokenData = await magicLinkService.validateToken(
        token ?? '',
        (req.headers['x-forwarded-for'] as string) ?? req.socket.remoteAddress ?? '',
        req.headers['user-agent'],
        organizationId
      );

      if (!tokenData.valid) {
        throw new BadRequestError('Invalid or expired token');
      }

      const result = await multipartUploadService.getPresignedUrl(
        sessionId as string,
        parseInt(partNumber as string),
        tokenData.organizationId || organizationId
      );

      res.json({
        success: true,
        data: result,
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * Register uploaded part via magic link token (public endpoint)
   */
  async registerMultipartPart(req: Request, res: Response, next: NextFunction) {
    try {
      const { token } = req.params;
      const organizationId = req.query.organization_id as string;

      // Validate token
      const tokenData = await magicLinkService.validateToken(
        token ?? '',
        (req.headers['x-forwarded-for'] as string) ?? req.socket.remoteAddress ?? '',
        req.headers['user-agent'],
        organizationId
      );

      if (!tokenData.valid) {
        throw new BadRequestError('Invalid or expired token');
      }

      const { sessionId, partNumber, etag, size } = req.body;

      await multipartUploadService.registerPart(
        sessionId,
        partNumber,
        etag,
        size,
        tokenData.organizationId || organizationId
      );

      res.json({
        success: true,
        message: `Part ${partNumber} registered successfully`,
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * Complete multipart upload via magic link token (public endpoint)
   */
  async completeMultipartUpload(req: Request, res: Response, next: NextFunction) {
    try {
      const { token } = req.params;
      const organizationId = req.query.organization_id as string;

      // Validate token
      const tokenData = await magicLinkService.validateToken(
        token ?? '',
        (req.headers['x-forwarded-for'] as string) ?? req.socket.remoteAddress ?? '',
        req.headers['user-agent'],
        organizationId
      );

      if (!tokenData.valid) {
        throw new BadRequestError('Invalid or expired token');
      }

      // Verify contributor has provided their name before allowing recording submission
      if (tokenData.contributorId) {
        const { db } = await import('../config/database');
        const contributor = await db('external_contributors')
          .where('id', tokenData.contributorId)
          .first();

        if (!contributor?.first_name?.trim() || !contributor?.last_name?.trim()) {
          throw new BadRequestError(
            'Please provide your first and last name before submitting the recording'
          );
        }
      }

      const validatedData = completeMultipartSchema.parse(req.body);

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
        tokenData.organizationId || organizationId
      );

      logger.info(`Multipart upload completed via token: session ${validatedData.sessionId}`);

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
  }

  /**
   * Abort multipart upload via magic link token (public endpoint)
   */
  async abortMultipartUpload(req: Request, res: Response, next: NextFunction) {
    try {
      const { token } = req.params;
      const { sessionId } = req.query;
      const organizationId = req.query.organization_id as string;

      if (!sessionId) {
        throw new BadRequestError('sessionId is required');
      }

      // Validate token
      const tokenData = await magicLinkService.validateToken(
        token ?? '',
        (req.headers['x-forwarded-for'] as string) ?? req.socket.remoteAddress ?? '',
        req.headers['user-agent'],
        organizationId
      );

      if (!tokenData.valid) {
        throw new BadRequestError('Invalid or expired token');
      }

      await multipartUploadService.abortUpload(
        sessionId as string,
        tokenData.organizationId || organizationId
      );

      logger.info(`Multipart upload aborted via token: session ${sessionId}`);

      res.json({
        success: true,
        message: 'Upload aborted successfully',
      });
    } catch (error) {
      next(error);
    }
  }
}

export default new MagicLinkController();
