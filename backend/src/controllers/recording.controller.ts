import { Request, Response, NextFunction } from 'express';
import { AuthenticatedRequest } from '../middleware/auth';
import recordingService from '../services/recording.service';
import { BadRequestError } from '../utils/AppError';
import { logger } from '../utils/logger';
import multer from 'multer';
import { z } from 'zod';

// Configure multer for file uploads
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
    const validatedData = createRecordingSchema.parse(req.body);

    // The validated data from Zod is guaranteed to match CreateRecordingDto
    const recording = await recordingService.createRecording(userId, validatedData as any);

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

// Upload video file for a recording
export const uploadRecording = async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
  try {
    const userId = req.user!.id;
    const { id: recordingId } = req.params;
    const file = req.file;

    if (!file) {
      throw new BadRequestError('No video file provided');
    }

    const recording = await recordingService.uploadRecording(userId, recordingId, file);

    res.json({
      success: true,
      data: recording,
    });
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    const errorStack = error instanceof Error ? error.stack : undefined;
    logger.error('Error in uploadRecording controller:', { message: errorMessage, stack: errorStack });
    next(error);
  }
};

// Get all recordings with optional filters
export const getRecordings = async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
  try {
    const filters = recordingFiltersSchema.parse(req.query);

    // Non-admin users can only see their own recordings unless viewing by task_id
    if (!filters.task_id && req.user!.role !== 'admin') {
      filters.user_id = req.user!.id;
    }

    const recordings = await recordingService.getRecordings(filters);

    res.json({
      success: true,
      data: recordings,
      total: recordings.length,
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
    const { id } = req.params;
    const recording = await recordingService.getRecordingById(id);

    if (!recording) {
      throw new BadRequestError('Recording not found');
    }

    // Check permission
    if (recording.user_id !== req.user!.id && req.user!.role !== 'admin') {
      // Allow if user has access to the task
      // TODO: Check if user is assigned to the task or is a reviewer
      throw new BadRequestError('Unauthorized to view this recording');
    }

    res.json({
      success: true,
      data: recording,
    });
  } catch (error) {
    next(error);
  }
};

// Delete a recording
export const deleteRecording = async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
  try {
    const { id } = req.params;
    const userId = req.user!.id;

    await recordingService.deleteRecording(userId, id);

    res.json({
      success: true,
      message: 'Recording deleted successfully',
    });
  } catch (error) {
    next(error);
  }
};

// Get download URL for a recording
export const getRecordingDownloadUrl = async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
  try {
    const { id } = req.params;

    // Verify user has access to the recording
    const recording = await recordingService.getRecordingById(id);
    if (!recording) {
      throw new BadRequestError('Recording not found');
    }

    if (recording.user_id !== req.user!.id && req.user!.role !== 'admin') {
      // TODO: Check if user is assigned to the task or is a reviewer
      throw new BadRequestError('Unauthorized to download this recording');
    }

    const url = await recordingService.getRecordingDownloadUrl(id);

    res.json({
      success: true,
      url,
    });
  } catch (error) {
    next(error);
  }
};

// Get playback URL for a recording (for video player)
export const getRecordingPlaybackUrl = async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
  try {
    const { id } = req.params;

    // Verify user has access to the recording
    const recording = await recordingService.getRecordingById(id);
    if (!recording) {
      throw new BadRequestError('Recording not found');
    }

    // Allow access if:
    // 1. User owns the recording
    // 2. User is admin
    // 3. User is assigned to the task
    // 4. User is reviewer for the task
    if (recording.user_id !== req.user!.id && req.user!.role !== 'admin') {
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

// Get all recordings for a specific task
export const getTaskRecordings = async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
  try {
    const { taskId } = req.params;

    // TODO: Verify user has access to the task

    const recordings = await recordingService.getTaskRecordings(taskId);

    res.json({
      success: true,
      data: recordings,
      total: recordings.length,
    });
  } catch (error) {
    next(error);
  }
};

// Update recording status (for admin/system use)
export const updateRecordingStatus = async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
  try {
    const { id } = req.params;
    const { status, error } = req.body;

    // Only admin can update recording status
    if (req.user!.role !== 'admin') {
      throw new BadRequestError('Unauthorized to update recording status');
    }

    await recordingService.updateRecordingStatus(id, status, error);

    res.json({
      success: true,
      message: 'Recording status updated successfully',
    });
  } catch (error) {
    next(error);
  }
};