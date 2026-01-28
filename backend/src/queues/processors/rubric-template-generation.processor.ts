import { Job } from 'bullmq';
import { BaseProcessor } from '../base.processor';
import {
  RubricTemplateGenerationJobData,
  RubricTemplateGenerationJobResult,
} from '../types/job-types';
import { QUEUE_CONFIGS, WORKER_CONCURRENCY } from '../../config/bullmq';
import { logger } from '../../utils/logger';
import { rubricGenerationService } from '../../services/rubric-generation.service';
import taskTemplateService from '../../services/task-template.service';
import notificationDispatcherService from '../../services/notification-dispatcher.service';
import { templateCalibrationService } from '../../services/template-calibration.service';

// Constants for retry logic
const TRANSCRIPTION_POLL_INTERVAL_MS = 5000; // 5 seconds
const TRANSCRIPTION_MAX_WAIT_MS = 10 * 60 * 1000; // 10 minutes

/**
 * Rubric Template Generation Processor
 * Handles background processing for:
 * 1. Waiting for transcription to complete
 * 2. AI-powered rubric generation from video
 * 3. Template creation as draft
 * 4. User notification on completion
 */
export class RubricTemplateGenerationProcessor extends BaseProcessor<
  RubricTemplateGenerationJobData,
  RubricTemplateGenerationJobResult
> {
  constructor() {
    super(
      QUEUE_CONFIGS.rubricTemplateGeneration.name,
      WORKER_CONCURRENCY.rubricTemplateGeneration,
      true // Enable Dead Letter Queue
    );
  }

  /**
   * Main processing method
   */
  protected async process(job: Job<RubricTemplateGenerationJobData>): Promise<RubricTemplateGenerationJobResult> {
    const {
      tempVideoId,
      tempRecordingId, // The recording ID - needed for calibration before cleanup
      organizationId,
      userId,
      storageKey: _storageKey, // Already stored in status
      storageBucket: _storageBucket, // Already stored in status
      templateTitle,
      taskType,
      templateDescription,
      templateCategory,
      templatePriority,
      customContext,
    } = job.data;

    logger.info('Starting rubric template generation job', {
      jobId: job.id,
      tempVideoId,
      templateTitle,
      taskType,
    });

    try {
      // Step 1: Wait for transcription to complete
      await this.reportProgress(job, { percentage: 10, stage: 'waiting_for_transcription', message: 'Waiting for transcription to complete...' });
      await this.waitForTranscription(tempVideoId, organizationId);

      // Step 2: Generate rubric from video
      await this.reportProgress(job, { percentage: 30, stage: 'generating_rubric', message: 'Generating rubric from video...' });

      const result = await rubricGenerationService.generateRubricFromVideo(
        tempVideoId,
        organizationId,
        {
          taskType,
          customContext,
          skipCleanup: true, // We'll cleanup after calibration
        }
      );

      logger.info('Rubric generated successfully', {
        jobId: job.id,
        tempVideoId,
        rubricStepsCount: result.rubricSteps.length,
        tokensUsed: result.tokensUsed,
      });

      // Step 3: Create template as draft
      await this.reportProgress(job, { percentage: 80, stage: 'creating_template', message: 'Creating task template...' });

      const template = await taskTemplateService.createTemplate({
        title: templateTitle,
        description: templateDescription || result.taskRequirements?.description || '',
        category: templateCategory || 'Generated',
        type: 'recording',
        instructions: result.taskRequirements?.tips?.join('\n') || '',
        evaluationCriteria: {
          version: '1.0',
          rubricSteps: result.rubricSteps,
          passingScore: 70,
          scoringMethod: 'weighted',
          autoAnalyze: true,
        },
        priority: templatePriority || 'medium',
        tags: ['ai-generated', taskType.toLowerCase().replace(/\s+/g, '-')],
        metadata: {
          generatedFrom: 'video',
          tempVideoId,
          confidence: result.confidence,
          suggestedTitle: result.suggestedTitle,
          taskRequirements: result.taskRequirements,
          tokensUsed: result.tokensUsed,
          estimatedCost: result.estimatedCost,
        },
        organizationId,
        createdBy: userId,
        isActive: false, // Draft - needs review before going live
        tempVideoId, // Pass at top level to trigger evidence linking
      });

      logger.info('Template created as draft', {
        jobId: job.id,
        templateId: template.id,
        templateTitle: template.title,
      });

      // Step 4: Run calibration (analyze template video against its own rubric)
      await this.reportProgress(job, { percentage: 85, stage: 'calibrating', message: 'Calibrating rubric accuracy...' });

      let calibrationResult;
      try {
        calibrationResult = await templateCalibrationService.calibrateTemplate({
          templateId: template.id,
          sourceRecordingId: tempRecordingId,
          organizationId,
          persistSourceRecording: false, // Recording will be deleted after calibration
        });

        logger.info('Template calibration completed', {
          jobId: job.id,
          templateId: template.id,
          baselineScore: calibrationResult.baselineScore,
          status: calibrationResult.status,
          stepsNeedingReview: calibrationResult.stepsNeedingReview.length,
        });
      } catch (calibrationError) {
        // Don't fail the whole job if calibration fails - template is still usable
        logger.error('Template calibration failed', {
          jobId: job.id,
          templateId: template.id,
          error: calibrationError instanceof Error ? calibrationError.message : String(calibrationError),
        });
      }

      // Step 5: Cleanup temp video now that calibration is done
      await this.reportProgress(job, { percentage: 92, stage: 'cleanup', message: 'Cleaning up temporary files...' });

      try {
        await rubricGenerationService.cleanupTempVideo(tempVideoId);
        logger.info('Temp video cleaned up after calibration', { tempVideoId });
      } catch (cleanupError) {
        // Don't fail if cleanup fails
        logger.warn('Failed to cleanup temp video after calibration', {
          tempVideoId,
          error: cleanupError instanceof Error ? cleanupError.message : String(cleanupError),
        });
      }

      // Step 6: Send notification to user
      await this.reportProgress(job, { percentage: 95, stage: 'sending_notification', message: 'Sending notification...' });

      // Build notification message based on calibration result
      const calibrationInfo = calibrationResult
        ? ` Calibration: ${calibrationResult.baselineScore.toFixed(0)}%${calibrationResult.status === 'needs_review' ? ' (needs review)' : ''}.`
        : '';

      await notificationDispatcherService.dispatch({
        userId,
        organizationId,
        type: 'rubric_template_ready',
        title: 'Task Template Ready for Review',
        message: `Your task template "${templateTitle}" has been generated and is ready for review.${calibrationInfo}`,
        entityType: 'task_template',
        entityId: template.id,
        actionUrl: `/templates/${template.id}/rubric`,
        priority: calibrationResult?.status === 'needs_review' ? 'high' : 'medium',
        metadata: {
          templateTitle,
          rubricStepsCount: result.rubricSteps.length,
          confidence: result.confidence,
          calibrationStatus: calibrationResult?.status,
          baselineScore: calibrationResult?.baselineScore,
        },
      });

      logger.info('Notification sent to user', {
        jobId: job.id,
        userId,
        templateId: template.id,
      });

      await this.reportProgress(job, { percentage: 100, stage: 'completed', message: 'Template generation complete!' });

      return {
        tempVideoId,
        templateId: template.id,
        templateTitle: template.title,
        rubricStepsCount: result.rubricSteps.length,
        tokensUsed: result.tokensUsed,
        estimatedCost: result.estimatedCost,
      };

    } catch (error) {
      logger.error('Rubric template generation failed', {
        jobId: job.id,
        tempVideoId,
        error: error instanceof Error ? error.message : String(error),
      });

      // Send failure notification to user
      try {
        await notificationDispatcherService.dispatch({
          userId,
          organizationId,
          type: 'rubric_template_failed',
          title: 'Task Template Generation Failed',
          message: `Failed to generate task template "${templateTitle}". Please try uploading the video again.`,
          priority: 'high',
          metadata: {
            templateTitle,
            error: error instanceof Error ? error.message : 'Unknown error',
          },
        });
      } catch (notifError) {
        logger.error('Failed to send failure notification', {
          jobId: job.id,
          error: notifError instanceof Error ? notifError.message : String(notifError),
        });
      }

      throw error;
    }
  }

  /**
   * Wait for transcription to complete
   * Polls the status until transcription is done or timeout
   */
  private async waitForTranscription(tempVideoId: string, organizationId: string): Promise<void> {
    const startTime = Date.now();

    // Initial retry logic for Redis status fetch
    // There may be slight delay between job queue and Redis write visibility
    let status = await rubricGenerationService.getGenerationStatusWithTranscription(tempVideoId);
    let retries = 0;
    const MAX_INITIAL_RETRIES = 3;
    const INITIAL_RETRY_DELAY_MS = 2000;

    while (!status && retries < MAX_INITIAL_RETRIES) {
      retries++;
      logger.warn(`Status not found in Redis, retrying (${retries}/${MAX_INITIAL_RETRIES})`, {
        tempVideoId,
      });
      await this.sleep(INITIAL_RETRY_DELAY_MS);
      status = await rubricGenerationService.getGenerationStatusWithTranscription(tempVideoId);
    }

    if (!status) {
      throw new Error(`Temp video not found after ${MAX_INITIAL_RETRIES} retries: ${tempVideoId}`);
    }

    // Verify organization ownership
    if (status.organizationId !== organizationId) {
      throw new Error(`Organization mismatch for temp video: ${tempVideoId}`);
    }

    while (Date.now() - startTime < TRANSCRIPTION_MAX_WAIT_MS) {
      logger.debug('Checking transcription status', {
        tempVideoId,
        stage: status.stage,
        progress: status.progress,
      });

      // Check for completion or failure
      if (status.stage === 'transcription_complete') {
        logger.info('Transcription complete, proceeding with rubric generation', { tempVideoId });
        return;
      }

      if (status.stage === 'failed') {
        throw new Error(`Transcription failed: ${status.error || 'Unknown error'}`);
      }

      // If already completed (rubric generated in another process), that's fine
      if (status.stage === 'completed') {
        logger.warn('Rubric already generated for this video', { tempVideoId });
        throw new Error('Rubric has already been generated for this video');
      }

      // Wait before next poll
      await this.sleep(TRANSCRIPTION_POLL_INTERVAL_MS);

      // Refresh status for next iteration
      status = await rubricGenerationService.getGenerationStatusWithTranscription(tempVideoId);
      if (!status) {
        throw new Error(`Temp video status disappeared during processing: ${tempVideoId}`);
      }
    }

    throw new Error(`Transcription timeout after ${TRANSCRIPTION_MAX_WAIT_MS / 1000} seconds`);
  }

  /**
   * Sleep helper
   */
  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /**
   * Handle job failure
   */
  protected async onFailed(job: Job<RubricTemplateGenerationJobData>, error: Error): Promise<void> {
    await super.onFailed(job, error);

    const { tempVideoId, templateTitle, userId: _userId, organizationId: _organizationId } = job.data;

    logger.error('Rubric template generation job failed', {
      jobId: job.id,
      tempVideoId,
      templateTitle,
      error: error.message,
      attemptsMade: job.attemptsMade,
    });

    // Note: Failure notification is already sent in the main process method
  }

  /**
   * Handle job completion
   */
  protected async onCompleted(
    job: Job<RubricTemplateGenerationJobData>,
    result: RubricTemplateGenerationJobResult
  ): Promise<void> {
    await super.onCompleted(job, result);

    logger.info('Rubric template generation job completed', {
      jobId: job.id,
      tempVideoId: result.tempVideoId,
      templateId: result.templateId,
      rubricStepsCount: result.rubricStepsCount,
      tokensUsed: result.tokensUsed,
    });
  }
}

// Singleton instance
let rubricTemplateGenerationProcessorInstance: RubricTemplateGenerationProcessor | null = null;

/**
 * Get or create the RubricTemplateGenerationProcessor singleton instance
 */
export function getRubricTemplateGenerationProcessor(): RubricTemplateGenerationProcessor {
  if (!rubricTemplateGenerationProcessorInstance) {
    rubricTemplateGenerationProcessorInstance = new RubricTemplateGenerationProcessor();
  }
  return rubricTemplateGenerationProcessorInstance;
}

/**
 * Start the rubric template generation processor
 */
export function startRubricTemplateGenerationProcessor(): RubricTemplateGenerationProcessor {
  const processor = getRubricTemplateGenerationProcessor();
  processor.start();
  return processor;
}
