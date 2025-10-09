import { Request, Response, NextFunction } from 'express';
import { AuthenticatedRequest } from '../middleware/auth';
import magicLinkService from '../services/magicLink.service';
import recordingService from '../services/recording.service';
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
  firstName: z.string().min(1).max(100),
  lastName: z.string().min(1).max(100),
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

// Configure multer for file uploads (same as recording controller)
const storage = multer.memoryStorage();
const upload = multer({
  storage,
  limits: {
    fileSize: 500 * 1024 * 1024, // 500MB max file size
  },
  fileFilter: (req, file, cb) => {
    // Accept video files (including webm) and octet-stream (for blob uploads)
    const acceptedTypes = ['video/', 'application/octet-stream'];
    const isAccepted = acceptedTypes.some(type => file.mimetype.startsWith(type));

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
      const result = await magicLinkService.createMagicLink(validatedData);

      res.status(201).json({
        success: true,
        data: result,
      });
    } catch (error) {
      if (error instanceof z.ZodError) {
        return next(
          new BadRequestError(`Invalid request data: ${error.errors.map((e) => e.message).join(', ')}`)
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
      const ipAddress = (req.headers['x-forwarded-for'] as string) || req.socket.remoteAddress;
      const userAgent = req.headers['user-agent'];

      const result = await magicLinkService.validateToken(token, ipAddress, userAgent);

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
      const result = await magicLinkService.getTaskByToken(token);

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
      const validatedData = claimTaskSchema.parse(req.body) as {
        firstName: string;
        lastName: string;
        email: string;
      };

      const ipAddress = (req.headers['x-forwarded-for'] as string) || req.socket.remoteAddress;
      const userAgent = req.headers['user-agent'];

      const result = await magicLinkService.claimTask(
        {
          token,
          ...validatedData,
        },
        ipAddress,
        userAgent
      );

      res.json({
        success: true,
        data: result,
      });
    } catch (error) {
      if (error instanceof z.ZodError) {
        return next(
          new BadRequestError(`Invalid request data: ${error.errors.map((e) => e.message).join(', ')}`)
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

      await magicLinkService.revokeToken(taskId, userId);

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
      const contributors = await magicLinkService.getExternalContributors(
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
      const analytics = await magicLinkService.getContributorAnalytics(contributorId);

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
      const file = req.file;

      if (!file) {
        throw new BadRequestError('No video file provided');
      }

      // Validate token
      const tokenData = await magicLinkService.validateToken(
        token,
        (req.headers['x-forwarded-for'] as string) || req.socket.remoteAddress,
        req.headers['user-agent']
      );

      if (!tokenData.valid || !tokenData.taskId || !tokenData.contributorId) {
        throw new BadRequestError('Invalid or expired token');
      }

      const taskId = tokenData.taskId;
      const contributorId = tokenData.contributorId;

      // Get contributor to verify they exist
      const { db } = await import('../config/database');
      const contributor = await db('external_contributors')
        .where('id', contributorId)
        .first();

      if (!contributor) {
        throw new BadRequestError('Contributor not found');
      }

      // Parse metadata from request body
      const metadata = req.body;
      const validatedData = submitRecordingSchema.parse({
        duration_seconds: metadata.duration_seconds ? parseInt(metadata.duration_seconds) : 1, // Default to 1 if 0
        has_audio: metadata.has_audio === 'true' || metadata.has_audio === true,
        mime_type: metadata.mime_type || file.mimetype,
        resolution: metadata.resolution,
        frame_rate: metadata.frame_rate ? parseFloat(metadata.frame_rate) : undefined,
        browser_info: metadata.browser_info,
      });

      // Create recording entry with null user_id and external_contributor_id
      const recording = await recordingService.createRecording(null, {
        task_id: taskId,
        duration_seconds: validatedData.duration_seconds,
        has_audio: validatedData.has_audio,
        mime_type: validatedData.mime_type,
        resolution: validatedData.resolution,
        frame_rate: validatedData.frame_rate,
        browser_info: validatedData.browser_info,
      });

      // Set the external_contributor_id after creation
      const { db } = await import('../config/database');
      await db('recordings')
        .where('id', recording.id)
        .update({ external_contributor_id: contributorId });

      // Upload the video file (using contributorId for permission check)
      const uploadedRecording = await recordingService.uploadRecording(contributorId, recording.id, file);

      logger.info(`External contributor recording submitted via token: ${recording.id} for task ${taskId}`);

      res.json({
        success: true,
        data: uploadedRecording,
        message: 'Recording submitted successfully',
      });
    } catch (error) {
      if (error instanceof z.ZodError) {
        return next(
          new BadRequestError(`Invalid request data: ${error.errors.map((e) => e.message).join(', ')}`)
        );
      }
      next(error);
    }
  }
}

export default new MagicLinkController();
