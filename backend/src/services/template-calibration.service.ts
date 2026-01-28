/**
 * Template Calibration Service
 *
 * Ensures template videos score 100% against their own rubrics by:
 * 1. Running the template video through analysis
 * 2. Storing baseline scores per step
 * 3. Flagging steps that don't achieve 100% for review
 * 4. Normalizing submission scores relative to baseline
 *
 * This addresses the fundamental issue: if a template video doesn't
 * score 100% against its own rubric, submissions can never achieve
 * a perfect score either.
 */

import { db } from '../config/database';
import { logger } from '../utils/logger';
import { analysisService, FullAnalysisResult } from './analysis/analysis.service';
import { v4 as uuidv4 } from 'uuid';
import { RubricStep, StepScoreResult } from '../queues/types/job-types';

/**
 * Calibration status values
 */
export type CalibrationStatus = 'pending' | 'in_progress' | 'completed' | 'failed' | 'needs_review';

/**
 * Baseline step score stored in JSONB
 */
export interface BaselineStepScore {
  stepId: string;
  stepTitle: string;
  score: string; // YES, PARTIAL, NO
  numericScore: number; // 0.0-1.0
  confidence: number;
  reasoning?: string;
}

/**
 * Result of calibration analysis
 */
export interface CalibrationResult {
  templateId: string;
  status: CalibrationStatus;
  baselineScore: number;
  stepScores: BaselineStepScore[];
  stepsNeedingReview: string[]; // Step IDs that scored < 100%
  fullAnalysisResult?: FullAnalysisResult;
  error?: string;
}

/**
 * Normalization result for a submission
 */
export interface NormalizedScore {
  rawScore: number;
  normalizedScore: number;
  normalizationFactor: number;
  reasoning: string;
}

class TemplateCalibrationService {
  /**
   * Run calibration on a template using its source recording
   */
  async calibrateTemplate(params: {
    templateId: string;
    sourceRecordingId: string;
    organizationId: string;
    persistSourceRecording?: boolean; // If false, don't store source_recording_id (recording will be deleted)
  }): Promise<CalibrationResult> {
    const { templateId, sourceRecordingId, organizationId, persistSourceRecording = true } = params;

    logger.info('Starting template calibration', { templateId, sourceRecordingId });

    // Update status to in_progress
    await this.updateCalibrationStatus(templateId, 'in_progress');

    try {
      // Get template with rubric
      const template = await db('task_templates').where('id', templateId).first();

      if (!template) {
        throw new Error(`Template not found: ${templateId}`);
      }

      const evaluationCriteria = template.evaluation_criteria;
      if (!evaluationCriteria?.rubricSteps?.length) {
        throw new Error('Template has no rubric steps');
      }

      const rubricSteps: RubricStep[] = evaluationCriteria.rubricSteps;
      const passingScore = evaluationCriteria.passingScore || 70;
      const scoringMethod = evaluationCriteria.scoringMethod || 'weighted';

      // Create a temporary analysis job for calibration
      const analysisJobId = uuidv4();
      await db('analysis_jobs').insert({
        id: analysisJobId,
        recording_id: sourceRecordingId,
        organization_id: organizationId,
        status: 'pending',
        progress: 0,
        is_calibration: true, // Mark as calibration run
        created_at: new Date(),
        updated_at: new Date(),
      });

      // Run analysis on the source recording
      const analysisResult = await analysisService.analyzeRecording(
        sourceRecordingId,
        '', // No task ID for calibration
        organizationId,
        rubricSteps,
        passingScore,
        scoringMethod,
        analysisJobId,
        { useNativeVideo: true } // Use native video for better accuracy
      );

      // Extract step scores
      const stepScores: BaselineStepScore[] = analysisResult.stepResults.map((result) => ({
        stepId: result.rubricStepId,
        stepTitle: result.stepTitle,
        score: result.score,
        numericScore: this.scoreToNumeric(result.score),
        confidence: result.confidence,
        reasoning: result.aiReasoning,
      }));

      // Identify steps that need review (scored < 100%)
      const stepsNeedingReview = stepScores
        .filter((s) => s.numericScore < 1.0)
        .map((s) => s.stepId);

      // Determine calibration status
      let status: CalibrationStatus = 'completed';
      if (stepsNeedingReview.length > 0) {
        status = 'needs_review';
        logger.warn('Template calibration found steps below 100%', {
          templateId,
          stepsNeedingReview,
          baselineScore: analysisResult.overallScore,
        });
      }

      // Store calibration results
      const updateData: Record<string, unknown> = {
        baseline_analysis_results: JSON.stringify(analysisResult),
        baseline_score: analysisResult.overallScore,
        baseline_step_scores: JSON.stringify(stepScores),
        calibration_status: status,
        calibration_error: null,
        calibrated_at: new Date(),
        updated_at: new Date(),
      };

      // Only persist source_recording_id if the recording will be kept
      if (persistSourceRecording) {
        updateData.source_recording_id = sourceRecordingId;
      }

      await db('task_templates').where('id', templateId).update(updateData);

      // Update analysis job status
      await db('analysis_jobs').where('id', analysisJobId).update({
        status: 'completed',
        overall_score: analysisResult.overallScore,
        verdict: analysisResult.verdict,
        updated_at: new Date(),
      });

      logger.info('Template calibration completed', {
        templateId,
        baselineScore: analysisResult.overallScore,
        status,
        stepsNeedingReview: stepsNeedingReview.length,
      });

      return {
        templateId,
        status,
        baselineScore: analysisResult.overallScore,
        stepScores,
        stepsNeedingReview,
        fullAnalysisResult: analysisResult,
      };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';

      logger.error('Template calibration failed', { templateId, error });

      await this.updateCalibrationStatus(templateId, 'failed', errorMessage);

      return {
        templateId,
        status: 'failed',
        baselineScore: 0,
        stepScores: [],
        stepsNeedingReview: [],
        error: errorMessage,
      };
    }
  }

  /**
   * Normalize a submission score relative to template baseline
   */
  normalizeScore(params: {
    rawScore: number;
    baselineScore: number;
    stepScores?: StepScoreResult[];
    baselineStepScores?: BaselineStepScore[];
  }): NormalizedScore {
    // stepScores and baselineStepScores reserved for future per-step normalization
    const { rawScore, baselineScore, stepScores: _stepScores, baselineStepScores: _baselineStepScores } = params;

    // If baseline is 100%, no normalization needed
    if (baselineScore >= 100) {
      return {
        rawScore,
        normalizedScore: rawScore,
        normalizationFactor: 1.0,
        reasoning: 'Template achieved 100%, no normalization needed',
      };
    }

    // If baseline is 0, can't normalize (avoid division by zero)
    if (baselineScore <= 0) {
      return {
        rawScore,
        normalizedScore: rawScore,
        normalizationFactor: 1.0,
        reasoning: 'Template baseline is 0%, cannot normalize',
      };
    }

    // Calculate normalization factor
    // If template scored 80%, factor = 100/80 = 1.25
    const normalizationFactor = 100 / baselineScore;

    // Apply normalization, capped at 100%
    const normalizedScore = Math.min(100, rawScore * normalizationFactor);

    return {
      rawScore,
      normalizedScore,
      normalizationFactor,
      reasoning: `Template baseline: ${baselineScore.toFixed(1)}%, Factor: ${normalizationFactor.toFixed(3)}, Raw: ${rawScore.toFixed(1)}% → Normalized: ${normalizedScore.toFixed(1)}%`,
    };
  }

  /**
   * Normalize individual step scores relative to baseline
   */
  normalizeStepScore(params: {
    stepId: string;
    rawNumericScore: number;
    baselineStepScores: BaselineStepScore[];
  }): { normalizedScore: number; baselineScore: number } {
    const { stepId, rawNumericScore, baselineStepScores } = params;

    const baseline = baselineStepScores.find((s) => s.stepId === stepId);

    if (!baseline || baseline.numericScore <= 0) {
      return { normalizedScore: rawNumericScore, baselineScore: baseline?.numericScore ?? 1.0 };
    }

    // Normalize relative to baseline
    const normalizationFactor = 1.0 / baseline.numericScore;
    const normalizedScore = Math.min(1.0, rawNumericScore * normalizationFactor);

    return { normalizedScore, baselineScore: baseline.numericScore };
  }

  /**
   * Get calibration status for a template
   */
  async getCalibrationStatus(templateId: string): Promise<{
    status: CalibrationStatus | null;
    baselineScore: number | null;
    calibratedAt: Date | null;
    stepsNeedingReview: string[];
  }> {
    const template = await db('task_templates')
      .where('id', templateId)
      .select('calibration_status', 'baseline_score', 'calibrated_at', 'baseline_step_scores')
      .first();

    if (!template) {
      return { status: null, baselineScore: null, calibratedAt: null, stepsNeedingReview: [] };
    }

    // baseline_step_scores is JSONB - may be already parsed by Knex
    const stepScores: BaselineStepScore[] = template.baseline_step_scores
      ? (typeof template.baseline_step_scores === 'string'
          ? JSON.parse(template.baseline_step_scores)
          : template.baseline_step_scores)
      : [];

    const stepsNeedingReview = stepScores.filter((s) => s.numericScore < 1.0).map((s) => s.stepId);

    return {
      status: template.calibration_status as CalibrationStatus | null,
      baselineScore: template.baseline_score ? parseFloat(template.baseline_score) : null,
      calibratedAt: template.calibrated_at,
      stepsNeedingReview,
    };
  }

  /**
   * Check if a template needs calibration
   */
  async needsCalibration(templateId: string): Promise<boolean> {
    const template = await db('task_templates')
      .where('id', templateId)
      .select('calibration_status', 'source_recording_id', 'evaluation_criteria')
      .first();

    if (!template) return false;

    // Needs calibration if:
    // 1. Has a source recording
    // 2. Has rubric steps
    // 3. Not yet calibrated or calibration failed
    const hasSourceRecording = !!template.source_recording_id;
    const hasRubric = !!template.evaluation_criteria?.rubricSteps?.length;
    const notCalibrated = !template.calibration_status || template.calibration_status === 'failed';

    return hasSourceRecording && hasRubric && notCalibrated;
  }

  /**
   * Get baseline step scores for a template
   */
  async getBaselineStepScores(templateId: string): Promise<BaselineStepScore[]> {
    const template = await db('task_templates')
      .where('id', templateId)
      .select('baseline_step_scores')
      .first();

    if (!template?.baseline_step_scores) {
      return [];
    }

    // baseline_step_scores is JSONB - may be already parsed by Knex
    return typeof template.baseline_step_scores === 'string'
      ? JSON.parse(template.baseline_step_scores)
      : template.baseline_step_scores;
  }

  /**
   * Update calibration status
   */
  private async updateCalibrationStatus(
    templateId: string,
    status: CalibrationStatus,
    error?: string
  ): Promise<void> {
    await db('task_templates').where('id', templateId).update({
      calibration_status: status,
      calibration_error: error || null,
      updated_at: new Date(),
    });
  }

  /**
   * Convert score enum to numeric
   */
  private scoreToNumeric(score: string): number {
    switch (score) {
      case 'YES':
        return 1.0;
      case 'PARTIAL':
        return 0.5;
      case 'NO':
        return 0.0;
      default:
        return 0.0;
    }
  }
}

export const templateCalibrationService = new TemplateCalibrationService();
export default templateCalibrationService;
