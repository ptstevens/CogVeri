/**
 * Rubric Generation Routes
 *
 * API endpoints for AI-powered rubric generation from sample videos.
 * This is a premium feature available to Professional and Enterprise tiers.
 */

import { Router, Response, NextFunction, RequestHandler } from 'express';
import multer, { MulterError } from 'multer';
import { z } from 'zod';
import { enhancedAuthenticate, EnhancedAuthRequest } from '../middleware/enhanced-auth.middleware';
import { requireFeature, requireTrialWriteAccess } from '../middleware/quota-enforcer';
import { rubricGenerationService } from '../services/rubric-generation.service';
import { rubricTemplateGenerationQueueHelpers } from '../queues/definitions/rubric-template-generation.queue';
import { BadRequestError, NotFoundError } from '../utils/AppError';
import { logger } from '../utils/logger';

// Max file size for direct upload (no Cloudflare limit)
const MAX_DIRECT_UPLOAD_SIZE_MB = 500;
const MAX_DIRECT_UPLOAD_SIZE_BYTES = MAX_DIRECT_UPLOAD_SIZE_MB * 1024 * 1024;

const router = Router();

// Configuration
const MAX_FILE_SIZE_MB = 200;
const MAX_FILE_SIZE_BYTES = MAX_FILE_SIZE_MB * 1024 * 1024;

// Allowed video MIME types
const ALLOWED_MIME_TYPES = [
  'video/webm',
  'video/mp4',
  'video/quicktime',
  'video/x-msvideo',
  'video/x-matroska',
  'video/ogg',
];

// Configure multer for file upload
const upload = multer({
  storage: multer.memoryStorage(),
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
const generateRubricSchema = z.object({
  tempVideoId: z.string().uuid('Invalid temp video ID'),
  taskType: z.string().min(1, 'Task type is required').max(200, 'Task type too long'),
  customContext: z.string().max(2000, 'Custom context too long').optional(),
});

const tempVideoIdParamSchema = z.object({
  tempVideoId: z.string().uuid('Invalid temp video ID'),
});

const getUploadUrlSchema = z.object({
  filename: z.string().min(1, 'Filename is required').max(255, 'Filename too long'),
  contentType: z
    .string()
    .refine((type) => type.startsWith('video/'), 'Content type must be a video type'),
  fileSize: z
    .number()
    .int()
    .positive()
    .max(
      MAX_DIRECT_UPLOAD_SIZE_BYTES,
      `File size must be less than ${MAX_DIRECT_UPLOAD_SIZE_MB}MB`
    ),
});

const confirmUploadSchema = z.object({
  tempVideoId: z.string().uuid('Invalid temp video ID'),
  storageKey: z.string().min(1, 'Storage key is required'),
  filename: z.string().min(1, 'Filename is required'),
  fileSize: z.number().int().positive(),
  contentType: z.string(),
});

// Schema for confirm-upload with template data (background job mode)
const confirmUploadWithTemplateSchema = z.object({
  tempVideoId: z.string().uuid('Invalid temp video ID'),
  storageKey: z.string().min(1, 'Storage key is required'),
  filename: z.string().min(1, 'Filename is required'),
  fileSize: z.number().int().positive(),
  contentType: z.string(),
  // Template data for background job
  templateTitle: z
    .string()
    .min(1, 'Template title is required')
    .max(200, 'Template title too long'),
  taskType: z.string().min(1, 'Task type is required').max(200, 'Task type too long'),
  templateDescription: z.string().max(2000, 'Description too long').optional(),
  templateCategory: z.string().max(100, 'Category too long').optional(),
  templatePriority: z.enum(['low', 'medium', 'high', 'urgent']).optional(),
  customContext: z.string().max(2000, 'Custom context too long').optional(),
});

// All routes require authentication
router.use(enhancedAuthenticate);

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
 * POST /api/rubric-generation/upload
 *
 * Upload a sample video for rubric generation.
 * Feature gated to Professional+ tiers.
 *
 * Request:
 *   - Multipart form data with 'video' field
 *   - Max file size: 200MB
 *   - Allowed types: video/*
 *
 * Response:
 *   - 201 Created: { tempVideoId, status: 'uploaded' }
 *   - 400 Bad Request: Invalid file
 *   - 403 Forbidden: Feature not available on tier
 *   - 413 Payload Too Large: File exceeds limit
 */
router.post(
  '/upload',
  requireTrialWriteAccess(),
  requireFeature('fullAiRubricScoring'),
  upload.single('video'),
  asyncHandler(
    async (req: EnhancedAuthRequest, res: Response, next: NextFunction): Promise<void> => {
      try {
        const organizationId = req.user?.org_id;
        if (!organizationId) {
          throw new BadRequestError('Organization ID is required');
        }

        if (!req.file) {
          throw new BadRequestError('No video file provided');
        }

        // Additional validation
        if (req.file.size === 0) {
          throw new BadRequestError('Empty file provided');
        }

        logger.info('Rubric generation video upload started', {
          organizationId,
          userId: req.user?.id,
          fileSize: req.file.size,
          mimeType: req.file.mimetype,
          originalName: req.file.originalname,
        });

        const { tempVideoId, tempRecordingId, storageKey } =
          await rubricGenerationService.uploadTempVideo(req.file, organizationId, req.user?.id);

        res.status(201).json({
          success: true,
          data: {
            tempVideoId,
            tempRecordingId,
            status: 'transcribing', // Transcription starts immediately
            storageKey,
            fileSize: req.file.size,
            mimeType: req.file.mimetype,
          },
        });
      } catch (error) {
        // Handle multer errors
        if (error instanceof MulterError && error.code === 'LIMIT_FILE_SIZE') {
          return next(new BadRequestError(`File size exceeds maximum of ${MAX_FILE_SIZE_MB}MB`));
        }
        next(error);
      }
    }
  )
);

/**
 * POST /api/rubric-generation/get-upload-url
 *
 * Get a presigned URL for direct upload to R2.
 * This bypasses Cloudflare's 100MB limit by uploading directly to storage.
 *
 * Request body:
 *   - filename: Original filename
 *   - contentType: Video MIME type
 *   - fileSize: File size in bytes
 *
 * Response:
 *   - 200 OK: { uploadUrl, tempVideoId, storageKey, expiresIn }
 *   - 400 Bad Request: Invalid input
 *   - 403 Forbidden: Feature not available on tier
 */
router.post(
  '/get-upload-url',
  requireTrialWriteAccess(),
  requireFeature('fullAiRubricScoring'),
  asyncHandler(
    async (req: EnhancedAuthRequest, res: Response, next: NextFunction): Promise<void> => {
      try {
        const organizationId = req.user?.org_id;
        if (!organizationId) {
          throw new BadRequestError('Organization ID is required');
        }

        const validatedData = getUploadUrlSchema.parse(req.body);

        // Validate content type
        if (!ALLOWED_MIME_TYPES.includes(validatedData.contentType)) {
          throw new BadRequestError(
            `Unsupported video format: ${validatedData.contentType}. Allowed formats: webm, mp4, mov, avi, mkv, ogg`
          );
        }

        logger.info('Generating presigned upload URL for rubric generation', {
          organizationId,
          userId: req.user?.id,
          filename: validatedData.filename,
          fileSize: validatedData.fileSize,
          contentType: validatedData.contentType,
        });

        const result = await rubricGenerationService.getPresignedUploadUrl(
          organizationId,
          validatedData.filename,
          validatedData.contentType,
          validatedData.fileSize
        );

        res.json({
          success: true,
          data: result,
        });
      } catch (error) {
        if (error instanceof z.ZodError) {
          return next(
            new BadRequestError(`Invalid request: ${error.errors.map((e) => e.message).join(', ')}`)
          );
        }
        next(error);
      }
    }
  )
);

/**
 * POST /api/rubric-generation/confirm-upload
 *
 * Confirm that a direct upload to R2 has completed.
 * This creates the recording record and starts transcription.
 *
 * Request body:
 *   - tempVideoId: UUID from get-upload-url response
 *   - storageKey: Storage key from get-upload-url response
 *   - filename: Original filename
 *   - fileSize: File size in bytes
 *   - contentType: Video MIME type
 *
 * Response:
 *   - 201 Created: { tempVideoId, status: 'transcribing' }
 *   - 400 Bad Request: Invalid input or upload not found
 */
router.post(
  '/confirm-upload',
  requireTrialWriteAccess(),
  requireFeature('fullAiRubricScoring'),
  asyncHandler(
    async (req: EnhancedAuthRequest, res: Response, next: NextFunction): Promise<void> => {
      try {
        const organizationId = req.user?.org_id;
        if (!organizationId) {
          throw new BadRequestError('Organization ID is required');
        }

        const validatedData = confirmUploadSchema.parse(req.body);

        logger.info('Confirming direct upload for rubric generation', {
          organizationId,
          userId: req.user?.id,
          tempVideoId: validatedData.tempVideoId,
          storageKey: validatedData.storageKey,
          fileSize: validatedData.fileSize,
        });

        const result = await rubricGenerationService.confirmDirectUpload(
          validatedData.tempVideoId,
          organizationId,
          req.user?.id,
          validatedData.storageKey,
          validatedData.filename,
          validatedData.fileSize,
          validatedData.contentType
        );

        res.status(201).json({
          success: true,
          data: result,
        });
      } catch (error) {
        if (error instanceof z.ZodError) {
          return next(
            new BadRequestError(`Invalid request: ${error.errors.map((e) => e.message).join(', ')}`)
          );
        }
        next(error);
      }
    }
  )
);

/**
 * POST /api/rubric-generation/confirm-upload-background
 *
 * Confirm upload and queue background rubric generation.
 * This is the preferred method for generating rubrics - the entire process
 * runs in the background and the user is notified when complete.
 *
 * Request body:
 *   - tempVideoId: UUID from get-upload-url response
 *   - storageKey: Storage key from get-upload-url response
 *   - filename: Original filename
 *   - fileSize: File size in bytes
 *   - contentType: Video MIME type
 *   - templateTitle: Title for the task template
 *   - taskType: Type of task being demonstrated
 *   - templateDescription?: Optional description
 *   - templateCategory?: Optional category
 *   - templatePriority?: Optional priority (low/medium/high/urgent)
 *   - customContext?: Additional context for rubric generation
 *
 * Response:
 *   - 202 Accepted: { tempVideoId, jobId, status: 'queued', message }
 *   - 400 Bad Request: Invalid input
 */
router.post(
  '/confirm-upload-background',
  requireTrialWriteAccess(),
  requireFeature('fullAiRubricScoring'),
  asyncHandler(
    async (req: EnhancedAuthRequest, res: Response, next: NextFunction): Promise<void> => {
      try {
        const organizationId = req.user?.org_id;
        const userId = req.user?.id;
        if (!organizationId || !userId) {
          throw new BadRequestError('Organization ID and User ID are required');
        }

        const validatedData = confirmUploadWithTemplateSchema.parse(req.body);

        logger.info('Confirming direct upload for background rubric generation', {
          organizationId,
          userId,
          tempVideoId: validatedData.tempVideoId,
          storageKey: validatedData.storageKey,
          fileSize: validatedData.fileSize,
          templateTitle: validatedData.templateTitle,
          taskType: validatedData.taskType,
        });

        // Step 1: Confirm the upload (creates recording, starts transcription)
        const uploadResult = await rubricGenerationService.confirmDirectUpload(
          validatedData.tempVideoId,
          organizationId,
          userId,
          validatedData.storageKey,
          validatedData.filename,
          validatedData.fileSize,
          validatedData.contentType
        );

        // Step 2: Queue the background job
        const queueResult = await rubricTemplateGenerationQueueHelpers.queueGeneration({
          tempVideoId: validatedData.tempVideoId,
          tempRecordingId: uploadResult.tempRecordingId,
          organizationId,
          userId,
          storageKey: validatedData.storageKey,
          storageBucket: uploadResult.storageBucket,
          templateTitle: validatedData.templateTitle,
          taskType: validatedData.taskType,
          templateDescription: validatedData.templateDescription,
          templateCategory: validatedData.templateCategory,
          templatePriority: validatedData.templatePriority,
          customContext: validatedData.customContext,
        });

        logger.info('Background rubric generation job queued', {
          tempVideoId: validatedData.tempVideoId,
          jobId: queueResult.jobId,
          templateTitle: validatedData.templateTitle,
        });

        res.status(202).json({
          success: true,
          data: {
            tempVideoId: validatedData.tempVideoId,
            tempRecordingId: uploadResult.tempRecordingId,
            jobId: queueResult.jobId,
            status: 'queued',
          },
          message:
            'Video uploaded successfully. You will be notified when your task template is ready for review.',
        });
      } catch (error) {
        if (error instanceof z.ZodError) {
          return next(
            new BadRequestError(`Invalid request: ${error.errors.map((e) => e.message).join(', ')}`)
          );
        }
        next(error);
      }
    }
  )
);

/**
 * POST /api/rubric-generation/generate
 *
 * Start async rubric generation from uploaded video.
 *
 * Request body:
 *   - tempVideoId: UUID of uploaded video
 *   - taskType: Type of task being demonstrated
 *   - customContext?: Additional context for rubric generation
 *
 * Response:
 *   - 200 OK: { generationId, status: 'processing' } or completed result
 *   - 400 Bad Request: Invalid input or video not ready
 *   - 404 Not Found: Video not found
 */
router.post(
  '/generate',
  requireTrialWriteAccess(),
  requireFeature('fullAiRubricScoring'),
  asyncHandler(
    async (req: EnhancedAuthRequest, res: Response, next: NextFunction): Promise<void> => {
      try {
        const organizationId = req.user?.org_id;
        if (!organizationId) {
          throw new BadRequestError('Organization ID is required');
        }

        const validatedData = generateRubricSchema.parse(req.body);

        logger.info('Rubric generation started', {
          organizationId,
          userId: req.user?.id,
          tempVideoId: validatedData.tempVideoId,
          taskType: validatedData.taskType,
        });

        // This runs synchronously for now - could be async with queue for longer videos
        const result = await rubricGenerationService.generateRubricFromVideo(
          validatedData.tempVideoId,
          organizationId,
          {
            taskType: validatedData.taskType,
            customContext: validatedData.customContext,
          }
        );

        res.json({
          success: true,
          data: {
            tempVideoId: validatedData.tempVideoId,
            status: 'completed',
            result,
          },
        });
      } catch (error) {
        if (error instanceof z.ZodError) {
          return next(
            new BadRequestError(`Invalid request: ${error.errors.map((e) => e.message).join(', ')}`)
          );
        }
        next(error);
      }
    }
  )
);

/**
 * GET /api/rubric-generation/:tempVideoId/status
 *
 * Get current generation progress.
 *
 * Response:
 *   - 200 OK: { status, progress, stage, result? }
 *   - 404 Not Found: Video not found
 */
router.get(
  '/:tempVideoId/status',
  requireFeature('fullAiRubricScoring'),
  asyncHandler(
    async (req: EnhancedAuthRequest, res: Response, next: NextFunction): Promise<void> => {
      try {
        const organizationId = req.user?.org_id;
        if (!organizationId) {
          throw new BadRequestError('Organization ID is required');
        }

        const { tempVideoId } = tempVideoIdParamSchema.parse(req.params);

        // Use transcription-aware status to update progress from actual transcription job
        const status =
          await rubricGenerationService.getGenerationStatusWithTranscription(tempVideoId);

        if (!status) {
          throw new NotFoundError('Temp video not found', { resourceId: tempVideoId });
        }

        // Verify organization ownership
        if (status.organizationId !== organizationId) {
          throw new NotFoundError('Temp video not found', { resourceId: tempVideoId });
        }

        res.json({
          success: true,
          data: {
            tempVideoId: status.tempVideoId,
            tempRecordingId: status.tempRecordingId,
            status: status.stage,
            progress: status.progress,
            message: status.message,
            error: status.error,
            result: status.result,
            createdAt: status.createdAt,
            updatedAt: status.updatedAt,
          },
        });
      } catch (error) {
        if (error instanceof z.ZodError) {
          return next(
            new BadRequestError(`Invalid request: ${error.errors.map((e) => e.message).join(', ')}`)
          );
        }
        next(error);
      }
    }
  )
);

/**
 * DELETE /api/rubric-generation/:tempVideoId
 *
 * Cleanup temp video immediately.
 * Called on modal close or after rubric is saved.
 *
 * Response:
 *   - 200 OK: { success: true }
 *   - 404 Not Found: Video not found (still returns success)
 *   - 409 Conflict: Cannot delete during active transcription
 */
router.delete(
  '/:tempVideoId',
  asyncHandler(
    async (req: EnhancedAuthRequest, res: Response, next: NextFunction): Promise<void> => {
      try {
        const organizationId = req.user?.org_id;
        if (!organizationId) {
          throw new BadRequestError('Organization ID is required');
        }

        const { tempVideoId } = tempVideoIdParamSchema.parse(req.params);

        // Get status to verify ownership and check if safe to delete
        const status =
          await rubricGenerationService.getGenerationStatusWithTranscription(tempVideoId);

        // If status exists, verify ownership before cleanup
        if (status && status.organizationId !== organizationId) {
          throw new NotFoundError('Temp video not found', { resourceId: tempVideoId });
        }

        // Safety check: Don't delete if transcription is still in progress
        // The file is needed by the transcription worker
        const activeStages = ['uploaded', 'transcribing'];
        if (status && activeStages.includes(status.stage)) {
          logger.warn('Attempted to delete temp video during active transcription', {
            tempVideoId,
            stage: status.stage,
            organizationId,
          });
          // Return success but don't actually delete - background job will handle cleanup
          res.json({
            success: true,
            message: 'Cleanup deferred - video will be automatically cleaned up after processing',
            deferred: true,
          });
          return;
        }

        await rubricGenerationService.cleanupTempVideo(tempVideoId);

        logger.info('Temp video deleted', {
          organizationId,
          userId: req.user?.id,
          tempVideoId,
        });

        res.json({
          success: true,
          message: 'Temp video cleaned up successfully',
        });
      } catch (error) {
        if (error instanceof z.ZodError) {
          return next(
            new BadRequestError(`Invalid request: ${error.errors.map((e) => e.message).join(', ')}`)
          );
        }
        next(error);
      }
    }
  )
);

export default router;
