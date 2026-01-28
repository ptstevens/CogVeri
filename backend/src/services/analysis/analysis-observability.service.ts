/**
 * Analysis Observability Service
 *
 * Provides comprehensive tracking and debugging for the video analysis pipeline:
 *
 * 1. **Debug Logging**: Stores AI prompts, responses, and scoring details for replay
 * 2. **Score Variance Monitoring**: Detects inconsistencies when same video analyzed multiple times
 * 3. **Performance Tracking**: Per-stage timing breakdown
 * 4. **Token Usage**: Tracks AI API costs
 *
 * This service enables:
 * - Debugging why a specific analysis scored the way it did
 * - Detecting non-deterministic behavior (variance alerts)
 * - Monitoring template self-score (should always be 100%)
 * - Performance optimization via timing breakdown
 */

import { db } from '../../config/database';
import { logger, getCorrelationId } from '../../utils/logger';
import { SimilarityAnalysisResponse } from './similarity-scoring.service';

/**
 * Debug information for AI analysis stages
 */
export interface AIDebugInfo {
  prompt?: string;
  response?: string;
  inputTokens?: number;
  outputTokens?: number;
  modelId?: string;
  durationMs?: number;
  batchCount?: number; // For visual analysis
  error?: string;
}

/**
 * Per-step debug details
 */
export interface StepDebugDetail {
  stepId: string;
  stepTitle: string;
  rawScore: string; // YES/PARTIAL/NO
  numericScore: number;
  confidence: number;
  aiReasoning?: string;
  similarityScore?: number;
  similarityRecommendation?: string;
  blendedScore?: number;
  normalizedScore?: number;
  baselineScore?: number;
}

/**
 * Error tracking
 */
export interface AnalysisError {
  stage: string;
  error: string;
  timestamp: Date;
  recoverable: boolean;
}

/**
 * Full debug log entry
 */
export interface AnalysisDebugLog {
  analysisJobId: string;
  recordingId: string;
  organizationId?: string;
  templateId?: string;
  isCalibrationRun?: boolean;

  // Results
  overallScore?: number;
  verdict?: string;
  totalSteps?: number;
  stepsPassed?: number;

  // Timing (ms)
  totalDurationMs?: number;
  frameExtractionMs?: number;
  speechAnalysisMs?: number;
  visualAnalysisMs?: number;
  similarityAnalysisMs?: number;
  scoreCalculationMs?: number;

  // Tokens
  totalInputTokens?: number;
  totalOutputTokens?: number;

  // Similarity
  similarityUsed?: boolean;
  avgSimilarityScore?: number;
  similarityResults?: SimilarityAnalysisResponse;

  // Normalization
  normalizationApplied?: boolean;
  normalizationFactor?: number;
  rawScoreBeforeNormalization?: number;

  // AI Debug
  speechAnalysisDebug?: AIDebugInfo;
  visualAnalysisDebug?: AIDebugInfo;

  // Per-step
  stepDebugDetails?: StepDebugDetail[];

  // Errors
  hadErrors?: boolean;
  errors?: AnalysisError[];
}

/**
 * Score variance record
 */
export interface ScoreVarianceRecord {
  recordingId: string;
  templateId?: string;
  analysisCount: number;
  minScore: number;
  maxScore: number;
  avgScore: number;
  stdDeviation: number;
  variance: number;
  varianceAlert: boolean;
  lastAnalysisId?: string;
  lastAnalyzedAt?: Date;
}

/**
 * Variance threshold configuration
 */
const VARIANCE_THRESHOLD = 0.05; // 5% standard deviation triggers alert

class AnalysisObservabilityService {
  private currentLog: Partial<AnalysisDebugLog> | null = null;
  private stageTimings: Map<string, number> = new Map();
  private startTime: number = 0;

  /**
   * Start tracking a new analysis
   */
  startAnalysis(params: {
    analysisJobId: string;
    recordingId: string;
    organizationId?: string;
    templateId?: string;
    isCalibrationRun?: boolean;
  }): void {
    this.currentLog = {
      analysisJobId: params.analysisJobId,
      recordingId: params.recordingId,
      organizationId: params.organizationId,
      templateId: params.templateId,
      isCalibrationRun: params.isCalibrationRun || false,
      errors: [],
      hadErrors: false,
    };
    this.stageTimings.clear();
    this.startTime = Date.now();

    logger.debug('Analysis observability started', {
      analysisJobId: params.analysisJobId,
      recordingId: params.recordingId,
    });
  }

  /**
   * Start timing a stage
   */
  startStage(stage: string): void {
    this.stageTimings.set(stage, Date.now());
  }

  /**
   * End timing a stage and return duration
   */
  endStage(stage: string): number {
    const startTime = this.stageTimings.get(stage);
    if (!startTime) return 0;

    const duration = Date.now() - startTime;
    this.stageTimings.delete(stage);

    // Update the appropriate timing field
    if (this.currentLog) {
      switch (stage) {
        case 'frame_extraction':
          this.currentLog.frameExtractionMs = duration;
          break;
        case 'speech_analysis':
          this.currentLog.speechAnalysisMs = duration;
          break;
        case 'visual_analysis':
          this.currentLog.visualAnalysisMs = duration;
          break;
        case 'similarity_analysis':
          this.currentLog.similarityAnalysisMs = duration;
          break;
        case 'score_calculation':
          this.currentLog.scoreCalculationMs = duration;
          break;
      }
    }

    return duration;
  }

  /**
   * Record speech analysis debug info
   */
  recordSpeechAnalysis(debug: AIDebugInfo): void {
    if (this.currentLog) {
      this.currentLog.speechAnalysisDebug = debug;
      this.addTokens(debug.inputTokens, debug.outputTokens);
    }
  }

  /**
   * Record visual analysis debug info
   */
  recordVisualAnalysis(debug: AIDebugInfo): void {
    if (this.currentLog) {
      this.currentLog.visualAnalysisDebug = debug;
      this.addTokens(debug.inputTokens, debug.outputTokens);
    }
  }

  /**
   * Record similarity analysis results
   */
  recordSimilarityAnalysis(results: SimilarityAnalysisResponse): void {
    if (this.currentLog) {
      this.currentLog.similarityUsed = results.hasEvidence;
      this.currentLog.similarityResults = results;

      if (results.hasEvidence && results.results.length > 0) {
        const totalSimilarity = results.results.reduce((sum, r) => sum + r.overallSimilarity, 0);
        this.currentLog.avgSimilarityScore = totalSimilarity / results.results.length;
      }
    }
  }

  /**
   * Record normalization details
   */
  recordNormalization(params: {
    applied: boolean;
    factor?: number;
    rawScore?: number;
  }): void {
    if (this.currentLog) {
      this.currentLog.normalizationApplied = params.applied;
      this.currentLog.normalizationFactor = params.factor;
      this.currentLog.rawScoreBeforeNormalization = params.rawScore;
    }
  }

  /**
   * Record per-step debug details
   */
  recordStepDetails(details: StepDebugDetail[]): void {
    if (this.currentLog) {
      this.currentLog.stepDebugDetails = details;
    }
  }

  /**
   * Record an error that occurred during analysis
   */
  recordError(stage: string, error: Error | string, recoverable: boolean = false): void {
    if (this.currentLog) {
      this.currentLog.hadErrors = true;
      this.currentLog.errors = this.currentLog.errors || [];
      this.currentLog.errors.push({
        stage,
        error: error instanceof Error ? error.message : error,
        timestamp: new Date(),
        recoverable,
      });
    }
  }

  /**
   * Record final results and save to database
   */
  async finishAnalysis(params: {
    overallScore: number;
    verdict: string;
    totalSteps: number;
    stepsPassed: number;
  }): Promise<string | null> {
    if (!this.currentLog) {
      logger.warn('finishAnalysis called without startAnalysis');
      return null;
    }

    this.currentLog.overallScore = params.overallScore;
    this.currentLog.verdict = params.verdict;
    this.currentLog.totalSteps = params.totalSteps;
    this.currentLog.stepsPassed = params.stepsPassed;
    this.currentLog.totalDurationMs = Date.now() - this.startTime;

    try {
      // Save debug log
      const [result] = await db('analysis_debug_logs')
        .insert({
          analysis_job_id: this.currentLog.analysisJobId,
          recording_id: this.currentLog.recordingId,
          organization_id: this.currentLog.organizationId,
          template_id: this.currentLog.templateId,
          is_calibration_run: this.currentLog.isCalibrationRun,
          overall_score: this.currentLog.overallScore,
          verdict: this.currentLog.verdict,
          total_steps: this.currentLog.totalSteps,
          steps_passed: this.currentLog.stepsPassed,
          total_duration_ms: this.currentLog.totalDurationMs,
          frame_extraction_ms: this.currentLog.frameExtractionMs,
          speech_analysis_ms: this.currentLog.speechAnalysisMs,
          visual_analysis_ms: this.currentLog.visualAnalysisMs,
          similarity_analysis_ms: this.currentLog.similarityAnalysisMs,
          score_calculation_ms: this.currentLog.scoreCalculationMs,
          total_input_tokens: this.currentLog.totalInputTokens,
          total_output_tokens: this.currentLog.totalOutputTokens,
          similarity_used: this.currentLog.similarityUsed,
          avg_similarity_score: this.currentLog.avgSimilarityScore,
          similarity_results: JSON.stringify(this.currentLog.similarityResults),
          normalization_applied: this.currentLog.normalizationApplied,
          normalization_factor: this.currentLog.normalizationFactor,
          raw_score_before_normalization: this.currentLog.rawScoreBeforeNormalization,
          speech_analysis_debug: JSON.stringify(this.currentLog.speechAnalysisDebug),
          visual_analysis_debug: JSON.stringify(this.currentLog.visualAnalysisDebug),
          step_debug_details: JSON.stringify(this.currentLog.stepDebugDetails),
          had_errors: this.currentLog.hadErrors,
          errors: JSON.stringify(this.currentLog.errors),
          correlation_id: getCorrelationId(),
        })
        .returning('id');

      const debugLogId = result?.id || result;

      // Update score variance tracking
      await this.updateScoreVariance(
        this.currentLog.recordingId!,
        this.currentLog.templateId,
        this.currentLog.overallScore!,
        this.currentLog.analysisJobId!
      );

      logger.info('Analysis debug log saved', {
        debugLogId,
        analysisJobId: this.currentLog.analysisJobId,
        overallScore: this.currentLog.overallScore,
        totalDurationMs: this.currentLog.totalDurationMs,
        hadErrors: this.currentLog.hadErrors,
      });

      // Reset for next analysis
      this.currentLog = null;

      return debugLogId;
    } catch (error) {
      logger.error('Failed to save analysis debug log', { error });
      this.currentLog = null;
      return null;
    }
  }

  /**
   * Update score variance tracking for a recording
   */
  private async updateScoreVariance(
    recordingId: string,
    templateId: string | undefined,
    score: number,
    analysisJobId: string
  ): Promise<void> {
    try {
      // Get existing variance record
      const existing = await db('analysis_score_variance')
        .where('recording_id', recordingId)
        .andWhere(function () {
          if (templateId) {
            this.where('template_id', templateId);
          } else {
            this.whereNull('template_id');
          }
        })
        .first();

      if (existing) {
        // Calculate new variance metrics
        const scores = await this.getScoresForRecording(recordingId, templateId);
        scores.push(score);

        const metrics = this.calculateVarianceMetrics(scores);

        await db('analysis_score_variance')
          .where('id', existing.id)
          .update({
            analysis_count: scores.length,
            min_score: metrics.min,
            max_score: metrics.max,
            avg_score: metrics.avg,
            std_deviation: metrics.stdDev,
            variance: metrics.variance,
            variance_alert: metrics.stdDev > VARIANCE_THRESHOLD,
            last_analysis_id: analysisJobId,
            last_analyzed_at: new Date(),
            updated_at: new Date(),
          });

        if (metrics.stdDev > VARIANCE_THRESHOLD) {
          logger.warn('Score variance alert triggered', {
            recordingId,
            templateId,
            stdDeviation: metrics.stdDev,
            analysisCount: scores.length,
            minScore: metrics.min,
            maxScore: metrics.max,
          });
        }
      } else {
        // First analysis for this recording/template combo
        await db('analysis_score_variance').insert({
          recording_id: recordingId,
          template_id: templateId || null,
          analysis_count: 1,
          min_score: score,
          max_score: score,
          avg_score: score,
          std_deviation: 0,
          variance: 0,
          variance_alert: false,
          last_analysis_id: analysisJobId,
          last_analyzed_at: new Date(),
        });
      }
    } catch (error) {
      // Non-fatal - log and continue
      logger.error('Failed to update score variance', { error, recordingId });
    }
  }

  /**
   * Get historical scores for a recording
   */
  private async getScoresForRecording(
    recordingId: string,
    templateId?: string
  ): Promise<number[]> {
    const logs = await db('analysis_debug_logs')
      .where('recording_id', recordingId)
      .andWhere(function () {
        if (templateId) {
          this.where('template_id', templateId);
        } else {
          this.whereNull('template_id');
        }
      })
      .whereNotNull('overall_score')
      .orderBy('created_at', 'asc')
      .select('overall_score');

    return logs.map((l) => parseFloat(l.overall_score));
  }

  /**
   * Calculate variance metrics for a set of scores
   */
  private calculateVarianceMetrics(scores: number[]): {
    min: number;
    max: number;
    avg: number;
    stdDev: number;
    variance: number;
  } {
    if (scores.length === 0) {
      return { min: 0, max: 0, avg: 0, stdDev: 0, variance: 0 };
    }

    const min = Math.min(...scores);
    const max = Math.max(...scores);
    const avg = scores.reduce((a, b) => a + b, 0) / scores.length;

    if (scores.length === 1) {
      return { min, max, avg, stdDev: 0, variance: 0 };
    }

    const squaredDiffs = scores.map((s) => Math.pow(s - avg, 2));
    const variance = squaredDiffs.reduce((a, b) => a + b, 0) / (scores.length - 1);
    const stdDev = Math.sqrt(variance);

    return { min, max, avg, stdDev, variance };
  }

  /**
   * Add token usage
   */
  private addTokens(input?: number, output?: number): void {
    if (this.currentLog) {
      this.currentLog.totalInputTokens = (this.currentLog.totalInputTokens || 0) + (input || 0);
      this.currentLog.totalOutputTokens = (this.currentLog.totalOutputTokens || 0) + (output || 0);
    }
  }

  // ==================== QUERY METHODS ====================

  /**
   * Get debug log for a specific analysis
   */
  async getDebugLog(analysisJobId: string): Promise<AnalysisDebugLog | null> {
    const log = await db('analysis_debug_logs').where('analysis_job_id', analysisJobId).first();

    if (!log) return null;

    return this.mapDbRowToDebugLog(log);
  }

  /**
   * Get debug logs for a recording
   */
  async getDebugLogsForRecording(recordingId: string): Promise<AnalysisDebugLog[]> {
    const logs = await db('analysis_debug_logs')
      .where('recording_id', recordingId)
      .orderBy('created_at', 'desc');

    return logs.map((l) => this.mapDbRowToDebugLog(l));
  }

  /**
   * Get variance alerts (recordings with inconsistent scores)
   */
  async getVarianceAlerts(): Promise<ScoreVarianceRecord[]> {
    const alerts = await db('analysis_score_variance')
      .where('variance_alert', true)
      .orderBy('std_deviation', 'desc');

    return alerts.map((a) => ({
      recordingId: a.recording_id,
      templateId: a.template_id,
      analysisCount: a.analysis_count,
      minScore: parseFloat(a.min_score),
      maxScore: parseFloat(a.max_score),
      avgScore: parseFloat(a.avg_score),
      stdDeviation: parseFloat(a.std_deviation),
      variance: parseFloat(a.variance),
      varianceAlert: a.variance_alert,
      lastAnalysisId: a.last_analysis_id,
      lastAnalyzedAt: a.last_analyzed_at,
    }));
  }

  /**
   * Get template calibration status (self-score monitoring)
   */
  async getTemplateCalibrationStats(templateId: string): Promise<{
    calibrationRuns: number;
    avgSelfScore: number;
    perfectScoreRate: number;
    lastCalibrationAt?: Date;
  }> {
    const logs = await db('analysis_debug_logs')
      .where('template_id', templateId)
      .andWhere('is_calibration_run', true)
      .whereNotNull('overall_score')
      .orderBy('created_at', 'desc');

    if (logs.length === 0) {
      return { calibrationRuns: 0, avgSelfScore: 0, perfectScoreRate: 0 };
    }

    const scores = logs.map((l) => parseFloat(l.overall_score));
    const perfectCount = scores.filter((s) => s >= 99.5).length; // Allow tiny rounding

    return {
      calibrationRuns: logs.length,
      avgSelfScore: scores.reduce((a, b) => a + b, 0) / scores.length,
      perfectScoreRate: perfectCount / logs.length,
      lastCalibrationAt: logs[0]?.created_at,
    };
  }

  /**
   * Get aggregate performance metrics
   */
  async getPerformanceMetrics(params: {
    startDate?: Date;
    endDate?: Date;
    organizationId?: string;
  }): Promise<{
    totalAnalyses: number;
    avgDurationMs: number;
    avgTokensUsed: number;
    errorRate: number;
    similarityUsageRate: number;
    normalizationRate: number;
  }> {
    let query = db('analysis_debug_logs').select(
      db.raw('COUNT(*) as total'),
      db.raw('AVG(total_duration_ms) as avg_duration'),
      db.raw('AVG(total_input_tokens + total_output_tokens) as avg_tokens'),
      db.raw('SUM(CASE WHEN had_errors THEN 1 ELSE 0 END)::float / COUNT(*) as error_rate'),
      db.raw('SUM(CASE WHEN similarity_used THEN 1 ELSE 0 END)::float / COUNT(*) as similarity_rate'),
      db.raw('SUM(CASE WHEN normalization_applied THEN 1 ELSE 0 END)::float / COUNT(*) as normalization_rate')
    );

    if (params.startDate) {
      query = query.where('created_at', '>=', params.startDate);
    }
    if (params.endDate) {
      query = query.where('created_at', '<=', params.endDate);
    }
    if (params.organizationId) {
      query = query.where('organization_id', params.organizationId);
    }

    const result = await query.first();

    return {
      totalAnalyses: parseInt(result?.total || '0'),
      avgDurationMs: parseFloat(result?.avg_duration || '0'),
      avgTokensUsed: parseFloat(result?.avg_tokens || '0'),
      errorRate: parseFloat(result?.error_rate || '0'),
      similarityUsageRate: parseFloat(result?.similarity_rate || '0'),
      normalizationRate: parseFloat(result?.normalization_rate || '0'),
    };
  }

  /**
   * Map database row to debug log interface
   */
  private mapDbRowToDebugLog(row: Record<string, unknown>): AnalysisDebugLog {
    return {
      analysisJobId: row.analysis_job_id as string,
      recordingId: row.recording_id as string,
      organizationId: row.organization_id as string | undefined,
      templateId: row.template_id as string | undefined,
      isCalibrationRun: row.is_calibration_run as boolean,
      overallScore: row.overall_score ? parseFloat(row.overall_score as string) : undefined,
      verdict: row.verdict as string | undefined,
      totalSteps: row.total_steps as number | undefined,
      stepsPassed: row.steps_passed as number | undefined,
      totalDurationMs: row.total_duration_ms as number | undefined,
      frameExtractionMs: row.frame_extraction_ms as number | undefined,
      speechAnalysisMs: row.speech_analysis_ms as number | undefined,
      visualAnalysisMs: row.visual_analysis_ms as number | undefined,
      similarityAnalysisMs: row.similarity_analysis_ms as number | undefined,
      scoreCalculationMs: row.score_calculation_ms as number | undefined,
      totalInputTokens: row.total_input_tokens as number | undefined,
      totalOutputTokens: row.total_output_tokens as number | undefined,
      similarityUsed: row.similarity_used as boolean | undefined,
      avgSimilarityScore: row.avg_similarity_score
        ? parseFloat(row.avg_similarity_score as string)
        : undefined,
      similarityResults: row.similarity_results
        ? JSON.parse(row.similarity_results as string)
        : undefined,
      normalizationApplied: row.normalization_applied as boolean | undefined,
      normalizationFactor: row.normalization_factor
        ? parseFloat(row.normalization_factor as string)
        : undefined,
      rawScoreBeforeNormalization: row.raw_score_before_normalization
        ? parseFloat(row.raw_score_before_normalization as string)
        : undefined,
      speechAnalysisDebug: row.speech_analysis_debug
        ? JSON.parse(row.speech_analysis_debug as string)
        : undefined,
      visualAnalysisDebug: row.visual_analysis_debug
        ? JSON.parse(row.visual_analysis_debug as string)
        : undefined,
      stepDebugDetails: row.step_debug_details
        ? JSON.parse(row.step_debug_details as string)
        : undefined,
      hadErrors: row.had_errors as boolean | undefined,
      errors: row.errors ? JSON.parse(row.errors as string) : undefined,
    };
  }
}

export const analysisObservabilityService = new AnalysisObservabilityService();
export default analysisObservabilityService;
