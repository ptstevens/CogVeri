import { Response, NextFunction } from 'express';
import { AuthenticatedRequest } from '../middleware/auth';
import recordingService from '../services/recording.service';
import { BadRequestError } from '../utils/AppError';
import multer from 'multer';
import { z } from 'zod';

// Configure multer for file uploads
const storage = multer.memoryStorage();
const upload = multer({
  storage,
  limits: {
    fileSize: 500 * 1024 * 1024, // 500MB max file size
  },
  fileFilter: (_req, file, cb) => {
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

// Validation schemas
const createRecordingSchema = z.object({
  task_id: z.string().uuid(),
  duration_seconds: z.number().int().positive(),
  has_audio: z.boolean(),
  mime_type: z.string(),
  resolution: z.string().optional(),
  frame_rate: z.number().optional(),
  browser_info: z.string().optional(),
});

const recordingFiltersSchema = z.object({
  task_id: z.string().uuid().optional(),
  user_id: z.string().uuid().optional(),
  status: z.enum(['initializing', 'recording', 'processing', 'completed', 'failed', 'deleted']).optional(),
  type: z.enum(['screen', 'camera', 'screen_camera', 'live_session']).optional(),
});

// Create a new recording entry
export const createRecording = async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
  try {
    const userId = req.user!.id;
    const organizationId = (req as any).user?.org_id;

    if (!organizationId) {
      throw new BadRequestError('Organization ID is required');
    }

    const validatedData = createRecordingSchema.parse(req.body);

    // The validated data from Zod is guaranteed to match CreateRecordingDto
    const recording = await recordingService.createRecording(userId, validatedData as any, organizationId);

    res.status(201).json({
      success: true,
      data: recording,
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return next(new BadRequestError(`Invalid request data: ${error.errors.map(e => e.message).join(', ')}`));
    }
    next(error);
  }
};

// Get all recordings with optional filters and pagination
export const getRecordings = async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
  try {
    const organizationId = (req as any).user?.org_id;

    if (!organizationId) {
      throw new BadRequestError('Organization ID is required');
    }

    const filters = recordingFiltersSchema.parse(req.query);

    // Pagination support: cursor-based for consistent results
    const pagination = {
      limit: req.query.limit ? parseInt(req.query.limit as string, 10) : undefined,
      cursor: req.query.cursor as string | undefined,
    };

    // Non-admin users can only see their own recordings unless viewing by task_id
    if (!filters.task_id && req.user!.org_role !== 'OWNER' && req.user!.org_role !== 'ADMIN') {
      filters.user_id = req.user!.id;
    }

    const { recordings, nextCursor } = await recordingService.getRecordings(filters, pagination, organizationId);

    res.json({
      success: true,
      data: recordings,
      total: recordings.length,
      nextCursor, // For fetching next page
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return next(new BadRequestError(`Invalid filter parameters: ${error.errors.map(e => e.message).join(', ')}`));
    }
    next(error);
  }
};

// Get a single recording by ID
export const getRecording = async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
  try {
    const organizationId = (req as any).user?.org_id;

    if (!organizationId) {
      throw new BadRequestError('Organization ID is required');
    }

    const { id } = req.params;

    if (!id) {
      throw new BadRequestError('Recording ID is required');
    }

    const recording = await recordingService.getRecordingById(id, organizationId as string);

    if (!recording) {
      throw new BadRequestError('Recording not found');
    }

    // Allow access if:
    // 1. User owns the recording
    // 2. User is admin/owner
    // 3. User is assigned to the task
    // 4. User is reviewer for the task
    if (recording.user_id !== req.user!.id && req.user!.org_role !== 'OWNER' && req.user!.org_role !== 'ADMIN') {
      // Check if user has access to the task (reviewer or assignee)
      const { db } = await import('../config/database');
      const task = await db('tasks').where('id', recording.task_id).first();

      const hasTaskAccess = task && (
        task.assigned_to === req.user!.id ||
        task.reviewed_by === req.user!.id
      );

      if (!hasTaskAccess) {
        throw new BadRequestError('Unauthorized to view this recording');
      }
    }

    res.json({
      success: true,
      data: recording,
    });
  } catch (error) {
    next(error);
  }
};

// Get playback URL for a recording (for video player)
export const getRecordingPlaybackUrl = async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
  try {
    const organizationId = (req as any).user?.org_id;

    if (!organizationId) {
      throw new BadRequestError('Organization ID is required');
    }

    const { id } = req.params;

    if (!id) {
      throw new BadRequestError('Recording ID is required');
    }

    // Verify user has access to the recording
    const recording = await recordingService.getRecordingById(id, organizationId);
    if (!recording) {
      throw new BadRequestError('Recording not found');
    }

    // Allow access if:
    // 1. User owns the recording
    // 2. User is admin
    // 3. User is assigned to the task
    // 4. User is reviewer for the task
    if (recording.user_id !== req.user!.id && req.user!.org_role !== 'OWNER' && req.user!.org_role !== 'ADMIN') {
      // Check if user has access to the task (reviewer or assignee)
      const { db } = await import('../config/database');
      const task = await db('tasks').where('id', recording.task_id).first();

      const hasTaskAccess = task && (
        task.assigned_to === req.user!.id ||
        task.reviewed_by === req.user!.id
      );

      if (!hasTaskAccess) {
        throw new BadRequestError('Unauthorized to view this recording');
      }
    }

    const url = await recordingService.getRecordingPlaybackUrl(id);

    res.json({
      success: true,
      url,
    });
  } catch (error) {
    next(error);
  }
};

// Get processing status for a recording
export const getProcessingStatus = async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
  try {
    const organizationId = (req as any).user?.org_id;

    if (!organizationId) {
      throw new BadRequestError('Organization ID is required');
    }

    const { id } = req.params;

    if (!id) {
      throw new BadRequestError('Recording ID is required');
    }

    // Verify user has access to the recording
    const recording = await recordingService.getRecordingById(id, organizationId);
    if (!recording) {
      throw new BadRequestError('Recording not found');
    }

    // Get processing jobs for this recording
    const { db } = await import('../config/database');

    const jobs = await db('processing_jobs')
      .where('recording_id', id)
      .orderBy('created_at', 'desc');

    const variants = await db('recording_variants')
      .where('recording_id', id)
      .orderBy('height', 'desc');

    // Determine overall status
    let overallStatus: 'pending' | 'processing' | 'completed' | 'failed' | 'partial' = 'completed';

    // Check if we have ready variants (video is playable)
    const hasReadyVariants = variants.some((v: any) => v.is_ready);

    if (jobs.length === 0) {
      // No jobs: if we have ready variants or recording is marked completed, consider it complete
      // Otherwise it's pending
      const recordingCompleted = (recording as any).status === 'completed';
      overallStatus = hasReadyVariants || recordingCompleted ? 'completed' : 'pending';
    } else {
      const hasProcessing = jobs.some((j: any) => j.status === 'processing' || j.status === 'pending');
      const hasFailed = jobs.some((j: any) => j.status === 'failed');
      const allCompleted = jobs.every((j: any) => j.status === 'completed');

      if (hasProcessing) {
        overallStatus = 'processing';
      } else if (allCompleted) {
        overallStatus = 'completed';
      } else if (hasFailed && jobs.some((j: any) => j.status === 'completed')) {
        overallStatus = 'partial';
      } else if (hasFailed) {
        overallStatus = 'failed';
      }
    }

    res.json({
      success: true,
      data: {
        recordingId: id,
        overallStatus,
        jobs: jobs.map((j: any) => ({
          id: j.id,
          jobType: j.job_type,
          quality: j.quality,
          status: j.status,
          progress: j.progress || 0,
          stage: j.stage,
          message: j.message,
          startedAt: j.started_at,
          completedAt: j.completed_at,
          errorMessage: j.error_message,
        })),
        variants: variants.map((v: any) => ({
          quality: v.quality,
          format: v.format,
          width: v.width,
          height: v.height,
          fileSize: v.file_size,
          isReady: v.is_ready,
        })),
        thumbnailUrl: (recording as any).thumbnail_url,
        transcriptionStatus: (recording as any).transcription_status || 'none',
      },
    });
  } catch (error) {
    next(error);
  }
};


// Refresh recording duration by probing the video file
export const refreshDuration = async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
  try {
    const organizationId = (req as any).user?.org_id;

    if (!organizationId) {
      throw new BadRequestError('Organization ID is required');
    }

    const { id } = req.params;

    if (!id) {
      throw new BadRequestError('Recording ID is required');
    }

    // Verify user has access to the recording
    const recording = await recordingService.getRecordingById(id, organizationId);
    if (!recording) {
      throw new BadRequestError('Recording not found');
    }

    // Allow access if user is part of the organization
    // (same access rules as getRecording - owner, admin, assignee, or reviewer)
    if (recording.user_id !== req.user!.id && req.user!.org_role !== 'OWNER' && req.user!.org_role !== 'ADMIN') {
      const { db } = await import('../config/database');
      const task = await db('tasks').where('id', recording.task_id).first();

      const hasTaskAccess = task && (
        task.assigned_to === req.user!.id ||
        task.reviewed_by === req.user!.id
      );

      if (!hasTaskAccess) {
        throw new BadRequestError('Unauthorized to access this recording');
      }
    }

    const duration = await recordingService.refreshDuration(id, organizationId);

    res.json({
      success: true,
      data: {
        recordingId: id,
        duration_seconds: duration,
      },
    });
  } catch (error) {
    next(error);
  }
};
