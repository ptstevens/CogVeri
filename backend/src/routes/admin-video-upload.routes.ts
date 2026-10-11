/**
 * Admin Video Upload Routes
 *
 * Sysadmin-only endpoints for uploading videos directly to tasks.
 * Used for faster testing/iteration during development.
 *
 * All routes require:
 * - Enhanced authentication (JWT)
 * - System admin role
 */

import { Router, Response, NextFunction, RequestHandler } from 'express';
import multer, { MulterError } from 'multer';
import { z } from 'zod';
import path from 'path';
import os from 'os';
import fs from 'fs/promises';
import { v4 as uuidv4 } from 'uuid';
import { enhancedAuthenticate, EnhancedAuthRequest } from '../middleware/enhanced-auth.middleware';
import { requireSystemAdmin } from '../middleware/system-admin.middleware';
import { adminVideoUploadService } from '../services/admin-video-upload.service';
import { BadRequestError } from '../utils/AppError';
import { logger } from '../utils/logger';

const router = Router();

// Configuration
const MAX_FILE_SIZE_MB = 500;
const MAX_FILE_SIZE_BYTES = MAX_FILE_SIZE_MB * 1024 * 1024;

// Temp directory for large file uploads
const UPLOAD_TEMP_DIR = path.join(os.tmpdir(), 'cogveri-admin-uploads');

// Ensure temp directory exists
fs.mkdir(UPLOAD_TEMP_DIR, { recursive: true }).catch((err) => {
  logger.error('Failed to create admin upload temp directory:', err);
});

// Allowed video MIME types
const ALLOWED_MIME_TYPES = [
  'video/webm',
  'video/mp4',
  'video/quicktime',
  'video/x-msvideo',
  'video/x-matroska',
  'video/ogg',
];

// Configure multer for file upload using disk storage for large files
// This prevents memory exhaustion from 500MB uploads
const upload = multer({
  storage: multer.diskStorage({
    destination: (_req, _file, cb) => {
      cb(null, UPLOAD_TEMP_DIR);
    },
    filename: (_req, file, cb) => {
      // Generate unique filename to prevent collisions
      const uniqueSuffix = `${Date.now()}-${uuidv4()}`;
      const ext = path.extname(file.originalname) || '.video';
      cb(null, `admin-upload-${uniqueSuffix}${ext}`);
    },
  }),
  limits: {
    fileSize: MAX_FILE_SIZE_BYTES,
  },
  fileFilter: (_req, file, cb) => {
    // Check MIME type
    if (!file.mimetype.startsWith('video/')) {
      cb(new BadRequestError('Only video files are allowed'));
      return;
    }

    if (!ALLOWED_MIME_TYPES.includes(file.mimetype)) {
      cb(
        new BadRequestError(
          `Unsupported video format: ${file.mimetype}. Allowed formats: webm, mp4, mov, avi, mkv, ogg`
        )
      );
      return;
    }

    cb(null, true);
  },
});

// Validation schemas
const getTasksSchema = z.object({
  organizationId: z.string().uuid('Invalid organization ID'),
  search: z.string().max(200).optional(),
  page: z.coerce.number().int().min(0).default(0),
  limit: z.coerce.number().int().min(1).max(100).default(25),
});

const taskIdParamSchema = z.object({
  taskId: z.string().uuid('Invalid task ID'),
});

// All routes require enhanced authentication + system admin check
// Cast to RequestHandler to satisfy TypeScript - Express handles async middleware correctly at runtime
router.use(enhancedAuthenticate as RequestHandler);
router.use(requireSystemAdmin as RequestHandler);

/**
 * Helper to wrap async route handlers
 */
const asyncHandler = (
  fn: (req: EnhancedAuthRequest, res: Response, next: NextFunction) => Promise<void>
): RequestHandler => {
  return (req, res, next) => {
    Promise.resolve(fn(req as EnhancedAuthRequest, res, next)).catch(next);
  };
};

/**
 * GET /api/admin/video-upload/tasks
 *
 * List eligible tasks for video upload (filtered by organization)
 * Only returns tasks with status: assigned, in_progress, or rejected
 *
 * Query params:
 *   - organizationId: UUID of the organization (required)
 *   - search: Search term for task title or assignee (optional)
 *   - page: Page number (default: 0)
 *   - limit: Results per page (default: 25, max: 100)
 *
 * Response:
 *   - 200 OK: { tasks: [...], total: number, hasMore: boolean }
 *   - 400 Bad Request: Invalid parameters
 *   - 403 Forbidden: Not a system admin
 */
router.get(
  '/tasks',
  asyncHandler(
    async (req: EnhancedAuthRequest, res: Response, next: NextFunction): Promise<void> => {
      try {
        const validated = getTasksSchema.parse(req.query);

        logger.info('Admin fetching eligible tasks for video upload', {
          adminUserId: req.user?.id,
          organizationId: validated.organizationId,
          search: validated.search,
          page: validated.page,
        });

        const sysadminUserId = req.user!.id;
        const { tasks, total } = await adminVideoUploadService.getEligibleTasks(
          validated.organizationId,
          sysadminUserId,
          validated.search,
          validated.page,
          validated.limit
        );

        const hasMore = (validated.page + 1) * validated.limit < total;

        res.json({
          success: true,
          data: {
            tasks,
            total,
            hasMore,
            page: validated.page,
            limit: validated.limit,
          },
        });
      } catch (error) {
        if (error instanceof z.ZodError) {
          return next(
            new BadRequestError(
              `Invalid parameters: ${error.errors.map((e) => e.message).join(', ')}`
            )
          );
        }
        next(error);
      }
    }
  )
);

/**
 * GET /api/admin/video-upload/tasks/:taskId
 *
 * Get task details for upload panel, including existing recording info
 *
 * Response:
 *   - 200 OK: Task details with existing_recording info
 *   - 400 Bad Request: Task status not eligible
 *   - 404 Not Found: Task not found
 */
router.get(
  '/tasks/:taskId',
  asyncHandler(
    async (req: EnhancedAuthRequest, res: Response, next: NextFunction): Promise<void> => {
      try {
        const { taskId } = taskIdParamSchema.parse(req.params);

        logger.info('Admin fetching task for video upload', {
          adminUserId: req.user?.id,
          taskId,
        });

        const task = await adminVideoUploadService.getTaskForUpload(taskId);

        if (!task) {
          res.status(404).json({
            success: false,
            error: 'Task not found',
          });
          return;
        }

        res.json({
          success: true,
          data: task,
        });
      } catch (error) {
        if (error instanceof z.ZodError) {
          return next(
            new BadRequestError(
              `Invalid parameters: ${error.errors.map((e) => e.message).join(', ')}`
            )
          );
        }
        next(error);
      }
    }
  )
);

/**
 * POST /api/admin/video-upload/tasks/:taskId/upload
 *
 * Upload a video directly to a task.
 * - Deletes any existing recordings for the task
 * - Creates new recording with sysadmin metadata
 * - Queues transcription, thumbnail, and transcode jobs
 * - Updates task status to 'submitted'
 *
 * Request:
 *   - Multipart form data with 'video' field
 *   - Max file size: 500MB
 *
 * Response:
 *   - 201 Created: { recordingId, taskId, taskStatus, message }
 *   - 400 Bad Request: Invalid file or task not eligible
 *   - 404 Not Found: Task not found
 *   - 413 Payload Too Large: File exceeds limit
 */
router.post(
  '/tasks/:taskId/upload',
  upload.single('video'),
  asyncHandler(
    async (req: EnhancedAuthRequest, res: Response, next: NextFunction): Promise<void> => {
      // Store temp file path for cleanup
      const tempFilePath = req.file?.path;

      try {
        const { taskId } = taskIdParamSchema.parse(req.params);

        if (!req.file) {
          throw new BadRequestError('No video file provided');
        }

        if (req.file.size === 0) {
          throw new BadRequestError('Empty file provided');
        }

        const sysadminUserId = req.user!.id;

        // Parse replaceExisting from body (default true for backwards compatibility)
        // Note: multipart form data sends strings, so we need to handle "false" string
        const replaceExisting =
          req.body.replaceExisting !== 'false' && req.body.replaceExisting !== false;

        logger.info('Admin starting video upload to task', {
          adminUserId: sysadminUserId,
          taskId,
          fileSize: req.file.size,
          mimeType: req.file.mimetype,
          originalName: req.file.originalname,
          tempPath: tempFilePath,
          replaceExisting,
        });

        const result = await adminVideoUploadService.uploadVideoToTask(
          taskId,
          req.file,
          sysadminUserId,
          replaceExisting
        );

        res.status(201).json({
          success: true,
          data: result,
        });
      } catch (error) {
        // Handle multer errors
        if (error instanceof MulterError && error.code === 'LIMIT_FILE_SIZE') {
          return next(new BadRequestError(`File size exceeds maximum of ${MAX_FILE_SIZE_MB}MB`));
        }
        if (error instanceof z.ZodError) {
          return next(
            new BadRequestError(
              `Invalid parameters: ${error.errors.map((e) => e.message).join(', ')}`
            )
          );
        }
        next(error);
      } finally {
        // Clean up temp file after upload (success or failure)
        if (tempFilePath) {
          fs.unlink(tempFilePath).catch((err) => {
            logger.warn('Failed to clean up temp upload file', { tempFilePath, error: err });
          });
        }
      }
    }
  )
);

export default router;
