import { BaseQueue } from '../base.queue';
import {
  AnalysisJobData,
  AnalysisJobResult,
  FrameExtractionJobData,
  FrameExtractionJobResult,
  RubricStep,
  JobName,
} from '../types/job-types';
import { QUEUE_CONFIGS } from '../../config/bullmq';
import { db } from '../../config/database';
import { logger } from '../../utils/logger';

/**
 * Analysis Queue
 * Handles AI-powered video analysis against rubrics
 *
 * Features:
 * - Speech analysis using transcript
 * - Visual analysis using keyframes
 * - Step-by-step scoring with evidence
 * - Cost tracking for AI API calls
 */
export class AnalysisQueue extends BaseQueue<AnalysisJobData, AnalysisJobResult> {
  constructor() {
    super(QUEUE_CONFIGS.analysis.name, {
      defaultJobOptions: QUEUE_CONFIGS.analysis.defaultJobOptions,
    });
  }

  /**
   * Get job name based on analysis job ID
   */
  protected getJobName(data: AnalysisJobData): string {
    return `${JobName.ANALYSIS}:${data.recordingId}`;
  }

  /**
   * Add a high-priority analysis job (user-initiated)
   */
  async addHighPriority(data: AnalysisJobData) {
    return this.add(data, { priority: 1 });
  }

  /**
   * Add a low-priority analysis job (auto-triggered)
   */
  async addLowPriority(data: AnalysisJobData) {
    return this.add(data, { priority: 10 });
  }

  /**
   * Get jobs by recording ID
   */
  async getJobsByRecordingId(recordingId: string) {
    const allJobs = await Promise.all([
      this.getWaitingJobs(0, 1000),
      this.getActiveJobs(0, 100),
      this.getCompletedJobs(0, 1000),
      this.getFailedJobs(0, 1000),
    ]);

    return allJobs.flat().filter(job => job.data.recordingId === recordingId);
  }

  /**
   * Get jobs by analysis job ID
   */
  async getJobsByAnalysisJobId(analysisJobId: string) {
    const allJobs = await Promise.all([
      this.getWaitingJobs(0, 1000),
      this.getActiveJobs(0, 100),
      this.getCompletedJobs(0, 1000),
      this.getFailedJobs(0, 1000),
    ]);

    return allJobs.flat().filter(job => job.data.analysisJobId === analysisJobId);
  }
}

/**
 * Frame Extraction Queue
 * Handles FFmpeg frame extraction for visual analysis
 */
export class FrameExtractionQueue extends BaseQueue<FrameExtractionJobData, FrameExtractionJobResult> {
  constructor() {
    super(QUEUE_CONFIGS.frameExtraction.name, {
      defaultJobOptions: QUEUE_CONFIGS.frameExtraction.defaultJobOptions,
    });
  }

  /**
   * Get job name based on analysis job ID
   */
  protected getJobName(data: FrameExtractionJobData): string {
    return `${JobName.FRAME_EXTRACTION}:${data.analysisJobId}`;
  }

  /**
   * Get jobs by analysis job ID
   */
  async getJobsByAnalysisJobId(analysisJobId: string) {
    const allJobs = await Promise.all([
      this.getWaitingJobs(0, 1000),
      this.getActiveJobs(0, 100),
      this.getCompletedJobs(0, 1000),
      this.getFailedJobs(0, 1000),
    ]);

    return allJobs.flat().filter(job => job.data.analysisJobId === analysisJobId);
  }
}

// Singleton instances
let analysisQueueInstance: AnalysisQueue | null = null;
let frameExtractionQueueInstance: FrameExtractionQueue | null = null;

/**
 * Get or create the AnalysisQueue singleton instance
 */
export function getAnalysisQueue(): AnalysisQueue {
  if (!analysisQueueInstance) {
    analysisQueueInstance = new AnalysisQueue();
  }
  return analysisQueueInstance;
}

/**
 * Get or create the FrameExtractionQueue singleton instance
 */
export function getFrameExtractionQueue(): FrameExtractionQueue {
  if (!frameExtractionQueueInstance) {
    frameExtractionQueueInstance = new FrameExtractionQueue();
  }
  return frameExtractionQueueInstance;
}

// Lazy singleton exports for convenient access
export const analysisQueue = {
  add: (data: AnalysisJobData) => getAnalysisQueue().add(data),
  addHighPriority: (data: AnalysisJobData) => getAnalysisQueue().addHighPriority(data),
  addLowPriority: (data: AnalysisJobData) => getAnalysisQueue().addLowPriority(data),
  getJobsByRecordingId: (recordingId: string) => getAnalysisQueue().getJobsByRecordingId(recordingId),
  getJobsByAnalysisJobId: (analysisJobId: string) => getAnalysisQueue().getJobsByAnalysisJobId(analysisJobId),
};

export const frameExtractionQueue = {
  add: (data: FrameExtractionJobData) => getFrameExtractionQueue().add(data),
  getJobsByAnalysisJobId: (analysisJobId: string) => getFrameExtractionQueue().getJobsByAnalysisJobId(analysisJobId),
};

// Type-safe helper for analysis operations
export const analysisQueueHelpers = {
  /**
   * Queue an analysis job for a recording
   * Creates the analysis_jobs DB record and queues the job
   */
  queueAnalysis: async (params: {
    recordingId: string;
    taskId: string;
    organizationId: string;
    orgSlug: string;
    triggeredByUserId?: string;
    rubricSteps: RubricStep[];
    passingScore?: number;
    scoringMethod?: 'weighted' | 'equal';
    options?: {
      frameIntervalSeconds?: number;
      maxFramesToAnalyze?: number;
      skipVisualAnalysis?: boolean;
      skipSpeechAnalysis?: boolean;
    };
  }) => {
    // Create the analysis job record in the database
    const [analysisJob] = await db('analysis_jobs')
      .insert({
        recording_id: params.recordingId,
        task_id: params.taskId,
        organization_id: params.organizationId,
        triggered_by_user_id: params.triggeredByUserId,
        status: 'pending',
        progress: 0,
        stage: 'queued',
        config_snapshot: {
          rubricSteps: params.rubricSteps,
          passingScore: params.passingScore ?? 70,
          scoringMethod: params.scoringMethod ?? 'weighted',
          options: params.options,
        },
      })
      .returning('*');

    logger.info(`Analysis job created: ${analysisJob.id} for recording ${params.recordingId}`);

    // Update recording analysis status
    await db('recordings')
      .where('id', params.recordingId)
      .update({
        analysis_status: 'pending',
        updated_at: new Date(),
      });

    // Queue the job
    const queue = getAnalysisQueue();
    const job = await queue.add({
      analysisJobId: analysisJob.id,
      recordingId: params.recordingId,
      taskId: params.taskId,
      organizationId: params.organizationId,
      orgSlug: params.orgSlug,
      triggeredByUserId: params.triggeredByUserId,
      rubricSteps: params.rubricSteps,
      passingScore: params.passingScore ?? 70,
      scoringMethod: params.scoringMethod ?? 'weighted',
      options: params.options,
    });

    // Update with queue job ID
    await db('analysis_jobs')
      .where('id', analysisJob.id)
      .update({
        queue_job_id: job.id,
        updated_at: new Date(),
      });

    return {
      analysisJobId: analysisJob.id,
      queueJobId: job.id,
    };
  },

  /**
   * Queue a high-priority analysis (user-initiated)
   */
  queueHighPriorityAnalysis: async (params: {
    recordingId: string;
    taskId: string;
    organizationId: string;
    orgSlug: string;
    triggeredByUserId: string;
    rubricSteps: RubricStep[];
    passingScore?: number;
    scoringMethod?: 'weighted' | 'equal';
  }) => {
    // Create the analysis job record in the database
    const [analysisJob] = await db('analysis_jobs')
      .insert({
        recording_id: params.recordingId,
        task_id: params.taskId,
        organization_id: params.organizationId,
        triggered_by_user_id: params.triggeredByUserId,
        status: 'pending',
        progress: 0,
        stage: 'queued',
        config_snapshot: {
          rubricSteps: params.rubricSteps,
          passingScore: params.passingScore ?? 70,
          scoringMethod: params.scoringMethod ?? 'weighted',
        },
      })
      .returning('*');

    // Update recording analysis status
    await db('recordings')
      .where('id', params.recordingId)
      .update({
        analysis_status: 'pending',
        updated_at: new Date(),
      });

    // Queue with high priority
    const queue = getAnalysisQueue();
    const job = await queue.addHighPriority({
      analysisJobId: analysisJob.id,
      recordingId: params.recordingId,
      taskId: params.taskId,
      organizationId: params.organizationId,
      orgSlug: params.orgSlug,
      triggeredByUserId: params.triggeredByUserId,
      rubricSteps: params.rubricSteps,
      passingScore: params.passingScore ?? 70,
      scoringMethod: params.scoringMethod ?? 'weighted',
    });

    // Update with queue job ID
    await db('analysis_jobs')
      .where('id', analysisJob.id)
      .update({
        queue_job_id: job.id,
        updated_at: new Date(),
      });

    return {
      analysisJobId: analysisJob.id,
      queueJobId: job.id,
    };
  },

  /**
   * Get analysis job status
   */
  getAnalysisStatus: async (analysisJobId: string) => {
    const analysisJob = await db('analysis_jobs')
      .where('id', analysisJobId)
      .first();

    if (!analysisJob) {
      return null;
    }

    return {
      id: analysisJob.id,
      recordingId: analysisJob.recording_id,
      taskId: analysisJob.task_id,
      status: analysisJob.status,
      progress: analysisJob.progress,
      stage: analysisJob.stage,
      progressMessage: analysisJob.progress_message,
      framesExtracted: analysisJob.total_frames_extracted,
      framesAnalyzed: analysisJob.frames_analyzed,
      speechAnalysisComplete: analysisJob.speech_analysis_complete,
      visualAnalysisComplete: analysisJob.visual_analysis_complete,
      startedAt: analysisJob.started_at,
      completedAt: analysisJob.completed_at,
      errorMessage: analysisJob.error_message,
      tokensUsed: analysisJob.ai_tokens_used,
      estimatedCost: analysisJob.estimated_cost_usd,
    };
  },

  /**
   * Get analysis status by recording ID
   */
  getAnalysisStatusByRecording: async (recordingId: string) => {
    const analysisJob = await db('analysis_jobs')
      .where('recording_id', recordingId)
      .orderBy('created_at', 'desc')
      .first();

    if (!analysisJob) {
      return null;
    }

    return analysisQueueHelpers.getAnalysisStatus(analysisJob.id);
  },

  /**
   * Cancel a pending analysis job
   */
  cancelAnalysis: async (analysisJobId: string): Promise<boolean> => {
    const analysisJob = await db('analysis_jobs')
      .where('id', analysisJobId)
      .whereIn('status', ['pending', 'extracting_frames'])
      .first();

    if (!analysisJob) {
      return false;
    }

    // Update database
    await db('analysis_jobs')
      .where('id', analysisJobId)
      .update({
        status: 'cancelled',
        completed_at: new Date(),
        updated_at: new Date(),
      });

    // Update recording status
    await db('recordings')
      .where('id', analysisJob.recording_id)
      .update({
        analysis_status: 'none',
        updated_at: new Date(),
      });

    // Remove from queue if still there
    const queue = getAnalysisQueue();
    const jobs = await queue.getJobsByAnalysisJobId(analysisJobId);
    for (const job of jobs) {
      const state = await job.getState();
      if (state === 'waiting' || state === 'delayed') {
        await job.remove();
      }
    }

    logger.info(`Analysis job cancelled: ${analysisJobId}`);
    return true;
  },

  /**
   * Queue frame extraction for an analysis job
   */
  queueFrameExtraction: async (params: {
    analysisJobId: string;
    recordingId: string;
    videoUrl: string;
    organizationId: string;
    orgSlug: string;
    frameIntervalSeconds?: number;
    maxFrames?: number;
  }) => {
    const queue = getFrameExtractionQueue();
    return queue.add({
      analysisJobId: params.analysisJobId,
      recordingId: params.recordingId,
      videoUrl: params.videoUrl,
      organizationId: params.organizationId,
      orgSlug: params.orgSlug,
      frameIntervalSeconds: params.frameIntervalSeconds ?? 1.0,
      maxFrames: params.maxFrames ?? 30,
    });
  },
};
