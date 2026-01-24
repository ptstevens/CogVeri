import { Job } from 'bullmq';
import { BaseProcessor } from '../base.processor';
import {
  AnalysisJobData,
  AnalysisJobResult,
} from '../types/job-types';
import { QUEUE_CONFIGS, WORKER_CONCURRENCY } from '../../config/bullmq';
import { db } from '../../config/database';
import { logger } from '../../utils/logger';
import { analysisService } from '../../services/analysis/analysis.service';
import { frameExtractionService } from '../../services/analysis/frame-extraction.service';
import notificationDispatcherService from '../../services/notification-dispatcher.service';

/**
 * Analysis Processor
 * Orchestrates AI-powered video analysis using Gemini:
 * 1. Extract keyframes from video
 * 2. Analyze transcript against speech criteria
 * 3. Analyze frames against visual criteria
 * 4. Combine scores and generate verdict
 */
export class AnalysisProcessor extends BaseProcessor<AnalysisJobData, AnalysisJobResult> {
  constructor() {
    super(
      QUEUE_CONFIGS.analysis.name,
      WORKER_CONCURRENCY.analysis,
      true // Enable Dead Letter Queue
    );
  }

  /**
   * Main processing method - delegates to analysisService
   */
  protected async process(job: Job<AnalysisJobData>): Promise<AnalysisJobResult> {
    const {
      analysisJobId,
      recordingId,
      taskId,
      rubricSteps,
      passingScore,
      scoringMethod,
      organizationId,
      options,
    } = job.data;

    logger.info(`Starting analysis job ${analysisJobId} for recording ${recordingId}`);

    try {
      // Update recording status
      await db('recordings')
        .where('id', recordingId)
        .update({ analysis_status: 'processing', updated_at: new Date() });

      // Call the analysis service which handles all the AI work
      const result = await analysisService.analyzeRecording(
        recordingId,
        taskId,
        organizationId,
        rubricSteps,
        passingScore,
        scoringMethod,
        analysisJobId,
        options
      );

      // Store final results
      await db('analysis_results').insert({
        analysis_job_id: analysisJobId,
        recording_id: recordingId,
        task_id: taskId,
        overall_score: result.overallScore,
        overall_verdict: result.verdict,
        overall_confidence: result.confidence,
        steps_passed: result.stepResults.filter(r => r.score === 'YES').length,
        steps_partial: result.stepResults.filter(r => r.score === 'PARTIAL').length,
        steps_failed: result.stepResults.filter(r => r.score === 'NO').length,
        steps_total: result.stepResults.length,
        summary_text: result.summary.text,
        strengths: JSON.stringify(result.summary.strengths),
        improvements: JSON.stringify(result.summary.improvements),
        processing_time_seconds: Math.round(result.processingTimeMs / 1000),
      });

      // Store step scores - PERFORMANCE FIX: batch insert instead of loop
      if (result.stepResults.length > 0) {
        const stepScoreRecords = result.stepResults.map((stepResult) => ({
          analysis_job_id: analysisJobId,
          rubric_step_id: stepResult.rubricStepId,
          step_order: stepResult.stepOrder,
          step_title: stepResult.stepTitle,
          score: stepResult.score,
          confidence: stepResult.confidence,
          weighted_score: stepResult.weightedScore,
          speech_evidence: stepResult.speechEvidence ? JSON.stringify(stepResult.speechEvidence) : null,
          visual_evidence: stepResult.visualEvidence ? JSON.stringify(stepResult.visualEvidence) : null,
          ai_reasoning: stepResult.aiReasoning,
          detected_at_seconds: stepResult.detectedAtSeconds,
          completed_at_seconds: stepResult.completedAtSeconds,
        }));

        await db('analysis_step_scores').insert(stepScoreRecords);
      }

      // Update job as completed
      await db('analysis_jobs')
        .where('id', analysisJobId)
        .update({
          status: 'completed',
          progress: 100,
          stage: 'completed',
          progress_message: 'Analysis complete',
          completed_at: new Date(),
          processing_duration_seconds: result.processingTimeMs / 1000,
          ai_tokens_used: result.tokensUsed.totalTokens,
          estimated_cost_usd: result.estimatedCost,
          updated_at: new Date(),
        });

      // Update recording status
      await db('recordings')
        .where('id', recordingId)
        .update({ analysis_status: 'completed', updated_at: new Date() });

      logger.info(`Analysis complete for ${analysisJobId}: ${result.verdict} (${result.overallScore.toFixed(1)}%)`);

      return {
        analysisJobId,
        recordingId,
        overallScore: result.overallScore,
        overallVerdict: result.verdict,
        overallConfidence: result.confidence,
        stepsPassed: result.stepResults.filter(r => r.score === 'YES').length,
        stepsPartial: result.stepResults.filter(r => r.score === 'PARTIAL').length,
        stepsFailed: result.stepResults.filter(r => r.score === 'NO').length,
        stepsTotal: result.stepResults.length,
        stepResults: result.stepResults,
        summaryText: result.summary.text,
        strengths: result.summary.strengths,
        improvements: result.summary.improvements,
        tokensUsed: result.tokensUsed.totalTokens,
        apiCallsMade: 2, // speech + visual
        processingTimeSeconds: result.processingTimeMs / 1000,
      };

    } catch (error) {
      logger.error(`Analysis failed for ${analysisJobId}:`, error);

      // Update as failed
      await db('analysis_jobs')
        .where('id', analysisJobId)
        .update({
          status: 'failed',
          error_message: error instanceof Error ? error.message : 'Unknown error',
          completed_at: new Date(),
          updated_at: new Date(),
        });

      await db('recordings')
        .where('id', recordingId)
        .update({ analysis_status: 'failed', updated_at: new Date() });

      throw error;
    }
  }

  /**
   * Handle job failure
   */
  protected async onFailed(job: Job<AnalysisJobData>, error: Error): Promise<void> {
    await super.onFailed(job, error);

    const { analysisJobId, recordingId } = job.data;

    // Update database status
    await db('analysis_jobs')
      .where('id', analysisJobId)
      .update({
        status: 'failed',
        error_message: error.message,
        retry_count: job.attemptsMade,
        completed_at: new Date(),
        updated_at: new Date(),
      });

    await db('recordings')
      .where('id', recordingId)
      .update({ analysis_status: 'failed', updated_at: new Date() });

    logger.error(`Analysis job ${analysisJobId} failed after ${job.attemptsMade} attempts: ${error.message}`);

    // Clean up any extracted frames from S3 to avoid orphaned storage
    try {
      const cleanupResult = await frameExtractionService.deleteFrames(analysisJobId);
      if (cleanupResult.deleted > 0) {
        logger.info(`Cleaned up ${cleanupResult.deleted} frames after failed analysis`, { analysisJobId });
      }
    } catch (cleanupError) {
      logger.warn('Failed to cleanup frames after analysis failure', {
        analysisJobId,
        error: cleanupError instanceof Error ? cleanupError.message : 'Unknown error',
      });
    }
  }

  /**
   * Handle job completion
   */
  protected async onCompleted(
    job: Job<AnalysisJobData>,
    result: AnalysisJobResult
  ): Promise<void> {
    await super.onCompleted(job, result);

    logger.info(
      `Analysis job ${result.analysisJobId} completed: ${result.overallVerdict} ` +
      `(${result.overallScore.toFixed(1)}%) in ${result.processingTimeSeconds.toFixed(1)}s`
    );

    // Clean up extracted frames from S3 - no longer needed after analysis
    try {
      const cleanupResult = await frameExtractionService.deleteFrames(result.analysisJobId);
      logger.info(`Frame cleanup after analysis: ${cleanupResult.deleted} deleted, ${cleanupResult.errors} errors`, {
        analysisJobId: result.analysisJobId,
      });
    } catch (cleanupError) {
      // Log but don't fail - analysis completed successfully
      logger.error('Failed to cleanup frames after analysis', {
        analysisJobId: result.analysisJobId,
        error: cleanupError instanceof Error ? cleanupError.message : 'Unknown error',
      });
    }

    // Send notification to task creator
    try {
      const { taskId, organizationId, recordingId } = job.data;

      // Get task and recording info
      const task = await db('tasks').where('id', taskId).first();
      const recording = await db('recordings').where('id', recordingId).first();

      if (task && task.created_by) {
        const verdictText = result.overallVerdict === 'PASS' ? 'passed' :
                           result.overallVerdict === 'PARTIAL_PASS' ? 'partially passed' :
                           result.overallVerdict === 'NEEDS_REVIEW' ? 'needs review' : 'did not pass';

        await notificationDispatcherService.dispatch({
          userId: task.created_by,
          organizationId,
          type: 'analysis_complete',
          title: 'Recording Analysis Complete',
          message: `A recording for "${task.title}" has been analyzed and ${verdictText} with a score of ${result.overallScore.toFixed(0)}%.`,
          actionUrl: `/reviews/${recordingId}`,
          metadata: {
            recordingId,
            taskId,
            score: result.overallScore,
            verdict: result.overallVerdict,
            submittedBy: recording?.user_id,
          },
        });

        logger.info('Analysis completion notification sent', {
          analysisJobId: result.analysisJobId,
          taskCreator: task.created_by,
          verdict: result.overallVerdict,
        });
      }
    } catch (notificationError) {
      // Log but don't fail - analysis completed successfully
      logger.error('Failed to send analysis completion notification', {
        analysisJobId: result.analysisJobId,
        error: notificationError instanceof Error ? notificationError.message : 'Unknown error',
      });
    }
  }
}

// Singleton instance
let analysisProcessorInstance: AnalysisProcessor | null = null;

/**
 * Get or create the AnalysisProcessor singleton instance
 */
export function getAnalysisProcessor(): AnalysisProcessor {
  if (!analysisProcessorInstance) {
    analysisProcessorInstance = new AnalysisProcessor();
  }
  return analysisProcessorInstance;
}

/**
 * Start the analysis processor
 */
export function startAnalysisProcessor(): AnalysisProcessor {
  const processor = getAnalysisProcessor();
  processor.start();
  return processor;
}
