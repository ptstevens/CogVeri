import { Response, NextFunction } from 'express';
import { z } from 'zod';
import { AuthenticatedRequest } from '../middleware/auth';
import { BadRequestError, NotFoundError } from '../utils/AppError';
import { logger } from '../utils/logger';
import { db } from '../config/database';
import { analysisQueue } from '../queues/definitions/analysis.queue';
import { evaluationCriteriaSchema } from '../schemas/rubric.schema';
import { generateAnalysisPDF } from '../services/analysis/pdf-export.service';

/**
 * Get analysis results for a recording
 * GET /recordings/:id/analysis
 */
export const getAnalysisResults = async (
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const organizationId = (req as any).user?.org_id;
    const { id: recordingId } = req.params;

    if (!organizationId) {
      throw new BadRequestError('Organization ID is required');
    }

    // Verify recording exists and user has access
    const recording = await db('recordings')
      .where('id', recordingId)
      .where('organization_id', organizationId)
      .first();

    if (!recording) {
      throw new NotFoundError('Recording not found');
    }

    // Get the analysis job
    const analysisJob = await db('analysis_jobs')
      .where('recording_id', recordingId)
      .orderBy('created_at', 'desc')
      .first();

    if (!analysisJob) {
      throw new NotFoundError('No analysis found for this recording');
    }

    // If analysis is not complete, return the job status
    if (analysisJob.status !== 'completed') {
      res.json({
        success: true,
        data: {
          status: analysisJob.status,
          progress: analysisJob.progress,
          stage: analysisJob.stage,
          message: `Analysis is ${analysisJob.status}`,
        },
      });
      return;
    }

    // Get the analysis results
    const analysisResults = await db('analysis_results')
      .where('analysis_job_id', analysisJob.id)
      .first();

    if (!analysisResults) {
      throw new NotFoundError('Analysis results not found');
    }

    // Get step scores
    const stepScores = await db('analysis_step_scores')
      .where('analysis_job_id', analysisJob.id)
      .orderBy('created_at', 'asc');

    // Get the task to access rubric steps
    const task = await db('tasks').where('id', recording.task_id).first();
    const template = task?.template_id
      ? await db('task_templates').where('id', task.template_id).first()
      : null;

    const evaluationCriteria = template?.evaluation_criteria;
    const rubricSteps = evaluationCriteria?.rubricSteps || [];

    // Build step results with details
    const stepResults = stepScores.map((score: any) => {
      const rubricStep = rubricSteps.find((s: any) => s.id === score.rubric_step_id);

      // Transform speech evidence to frontend format
      let transcriptEvidence = null;
      if (score.speech_evidence) {
        const speechEv =
          typeof score.speech_evidence === 'string'
            ? JSON.parse(score.speech_evidence)
            : score.speech_evidence;
        transcriptEvidence = {
          keywordsFound: speechEv.keywordsFound || [],
          excerpts: (speechEv.relevantExcerpts || []).map((e: any) => e.text),
          timestamps: (speechEv.relevantExcerpts || []).map((e: any) => ({
            start: e.startTime,
            end: e.endTime,
          })),
        };
      }

      // Transform visual evidence to frontend format
      // Backend stores: elementsDetected, actionsDetected (from VisualEvidence type)
      // Frontend expects: detectedElements, detectedActions
      let visualEvidence = null;
      if (score.visual_evidence) {
        const visualEv =
          typeof score.visual_evidence === 'string'
            ? JSON.parse(score.visual_evidence)
            : score.visual_evidence;

        // Map elementsDetected array to just element names for display
        const detectedElements = (visualEv.elementsDetected || []).map((e: any) =>
          typeof e === 'string' ? e : e.element
        );
        const detectedActions = (visualEv.actionsDetected || []).map((a: any) =>
          typeof a === 'string' ? a : a.action
        );
        // Extract timestamps from detected elements/actions
        const timestamps = [
          ...(visualEv.elementsDetected || []).map((e: any) => e.frameTimestamp).filter(Boolean),
          ...(visualEv.actionsDetected || []).map((a: any) => a.frameTimestamp).filter(Boolean),
        ];

        visualEvidence = {
          detectedElements,
          detectedActions,
          frameUrls:
            visualEv.frameUrls || visualEv.representativeFrameUrl
              ? [visualEv.representativeFrameUrl]
              : [],
          timestamps: [...new Set(timestamps)].sort((a, b) => a - b), // Unique, sorted timestamps
          observation: visualEv.observation, // Include observation if present
        };
      }

      return {
        stepId: score.rubric_step_id,
        stepOrder: rubricStep?.order || 0,
        stepTitle: rubricStep?.title || 'Unknown Step',
        stepDescription: rubricStep?.description,
        status:
          score.score === 'YES' ? 'completed' : score.score === 'PARTIAL' ? 'partial' : 'missing',
        score: score.score === 'YES' ? 100 : score.score === 'PARTIAL' ? 50 : 0,
        confidence: score.confidence || 0,
        transcriptEvidence,
        visualEvidence,
        aiReasoning: score.ai_reasoning,
        detectedAt: score.detected_at_seconds,
      };
    });

    // Build missed steps with suggestions
    const missedSteps = stepResults
      .filter((s: any) => s.status === 'missing')
      .map((s: any) => ({
        stepId: s.stepId,
        stepOrder: s.stepOrder,
        stepTitle: s.stepTitle,
        stepDescription: s.stepDescription,
        suggestion: `Make sure to clearly demonstrate ${s.stepTitle} in your recording.`,
      }));

    // Build response
    const response = {
      id: analysisResults.id,
      recordingId: analysisResults.recording_id,
      taskId: recording.task_id,
      analyzedAt: analysisJob.completed_at,
      analysisVersion: '1.0',
      overallScore: analysisResults.overall_score,
      overallVerdict: analysisResults.overall_verdict,
      passed:
        analysisResults.overall_verdict === 'PASS' ||
        analysisResults.overall_verdict === 'PARTIAL_PASS',
      overallConfidence: 0.85, // TODO: Calculate from step confidences
      scoreBreakdown: {
        weightedScore: analysisResults.overall_score,
        rawScore: analysisResults.overall_score,
        stepsCompleted: analysisResults.steps_passed,
        stepsTotal:
          (analysisResults.steps_passed || 0) +
          (analysisResults.steps_partial || 0) +
          (analysisResults.steps_failed || 0),
        requiredStepsCompleted: analysisResults.steps_passed, // TODO: Track required separately
        requiredStepsTotal: rubricSteps.filter((s: any) => s.isRequired).length,
      },
      stepResults,
      completedSteps: stepResults
        .filter((s: any) => s.status === 'completed')
        .map((s: any) => s.stepId),
      partialSteps: stepResults
        .filter((s: any) => s.status === 'partial')
        .map((s: any) => s.stepId),
      missedSteps,
      coachingSuggestions: [], // TODO: Generate from AI
      summaryText: analysisResults.summary_text,
      strengths: analysisResults.strengths || [],
      improvements: analysisResults.improvements || [],
      processingTimeMs: analysisJob.completed_at
        ? new Date(analysisJob.completed_at).getTime() - new Date(analysisJob.started_at).getTime()
        : 0,
      recordingDuration: recording.duration_seconds || 0,
    };

    res.json({
      success: true,
      data: response,
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Trigger analysis for a recording
 * POST /recordings/:id/analyze
 */
export const triggerAnalysis = async (
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const organizationId = (req as any).user?.org_id;
    const userId = req.user!.id;
    const { id: recordingId } = req.params;

    if (!organizationId) {
      throw new BadRequestError('Organization ID is required');
    }

    // Verify recording exists and user has access
    const recording = await db('recordings')
      .where('id', recordingId)
      .where('organization_id', organizationId)
      .first();

    if (!recording) {
      throw new NotFoundError('Recording not found');
    }

    // Check if recording has completed transcription
    if (recording.transcription_status !== 'completed') {
      throw new BadRequestError('Recording must have completed transcription before analysis');
    }

    // Get the task and template to access rubric
    const task = await db('tasks').where('id', recording.task_id).first();
    if (!task) {
      throw new NotFoundError('Task not found');
    }

    const template = task.template_id
      ? await db('task_templates').where('id', task.template_id).first()
      : null;

    const evaluationCriteria = template?.evaluation_criteria;

    // Validate evaluation criteria
    if (!evaluationCriteria) {
      throw new BadRequestError('Task template does not have evaluation criteria configured');
    }

    const validationResult = evaluationCriteriaSchema.safeParse(evaluationCriteria);
    if (!validationResult.success) {
      throw new BadRequestError(`Invalid evaluation criteria: ${validationResult.error.message}`);
    }

    if (!validationResult.data.rubricSteps.length) {
      throw new BadRequestError('Task template has no rubric steps configured');
    }

    // Check if there's already a pending/processing analysis
    const existingJob = await db('analysis_jobs')
      .where('recording_id', recordingId)
      .whereIn('status', [
        'pending',
        'extracting_frames',
        'analyzing_speech',
        'analyzing_visual',
        'combining_results',
      ])
      .first();

    if (existingJob) {
      throw new BadRequestError('Analysis is already in progress for this recording');
    }

    // Create the analysis job
    const [analysisJob] = await db('analysis_jobs')
      .insert({
        recording_id: recordingId,
        task_id: task.id,
        organization_id: organizationId,
        status: 'pending',
        progress: 0,
        stage: 'queued',
        config_snapshot: evaluationCriteria,
        created_at: new Date(),
      })
      .returning('*');

    // Fetch org slug for storage path construction
    const org = await db('organizations').where('id', organizationId).select('slug').first();
    const orgSlug = org?.slug || 'unknown';

    // Queue the analysis job
    await analysisQueue.add({
      recordingId: recordingId!,
      taskId: task.id,
      rubricSteps: validationResult.data.rubricSteps,
      analysisJobId: analysisJob.id,
      organizationId: organizationId!,
      orgSlug,
      triggeredByUserId: userId,
      passingScore: validationResult.data.passingScore,
      scoringMethod: validationResult.data.scoringMethod,
    });

    logger.info('Analysis queued', {
      analysisJobId: analysisJob.id,
      recordingId,
      taskId: task.id,
    });

    // Update recording's analysis_status
    await db('recordings').where('id', recordingId).update({
      analysis_status: 'pending',
      updated_at: new Date(),
    });

    res.status(202).json({
      success: true,
      message: 'Analysis queued successfully',
      data: {
        analysisJobId: analysisJob.id,
        status: 'pending',
        recordingId,
      },
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Get analysis status/progress
 * GET /recordings/:id/analysis/status
 */
export const getAnalysisStatus = async (
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const organizationId = (req as any).user?.org_id;
    const { id: recordingId } = req.params;

    if (!organizationId) {
      throw new BadRequestError('Organization ID is required');
    }

    // Verify recording exists and user has access
    const recording = await db('recordings')
      .where('id', recordingId)
      .where('organization_id', organizationId)
      .first();

    if (!recording) {
      throw new NotFoundError('Recording not found');
    }

    // Get the latest analysis job
    const analysisJob = await db('analysis_jobs')
      .where('recording_id', recordingId)
      .orderBy('created_at', 'desc')
      .first();

    if (!analysisJob) {
      res.json({
        success: true,
        data: {
          status: 'none',
          message: 'No analysis has been run for this recording',
        },
      });
      return;
    }

    res.json({
      success: true,
      data: {
        analysisJobId: analysisJob.id,
        status: analysisJob.status,
        progress: analysisJob.progress,
        stage: analysisJob.stage,
        startedAt: analysisJob.started_at,
        completedAt: analysisJob.completed_at,
        errorMessage: analysisJob.error_message,
        tokensUsed: analysisJob.ai_tokens_used,
        estimatedCost: analysisJob.estimated_cost_usd,
      },
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Export analysis results
 * GET /recordings/:id/analysis/export
 */
export const exportAnalysis = async (
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const organizationId = (req as any).user?.org_id;
    const { id: recordingId } = req.params;
    const format = (req.query.format as string) || 'pdf';

    if (!organizationId) {
      throw new BadRequestError('Organization ID is required');
    }

    // Verify recording exists and user has access
    const recording = await db('recordings')
      .where('id', recordingId)
      .where('organization_id', organizationId)
      .first();

    if (!recording) {
      throw new NotFoundError('Recording not found');
    }

    // Get analysis results
    const analysisJob = await db('analysis_jobs')
      .where('recording_id', recordingId)
      .where('status', 'completed')
      .orderBy('created_at', 'desc')
      .first();

    if (!analysisJob) {
      throw new NotFoundError('No completed analysis found for this recording');
    }

    const analysisResults = await db('analysis_results')
      .where('analysis_job_id', analysisJob.id)
      .first();

    const stepScores = await db('analysis_step_scores')
      .where('analysis_job_id', analysisJob.id)
      .orderBy('step_order', 'asc');

    // Get task info for the PDF title
    const task = recording.task_id
      ? await db('tasks').where('id', recording.task_id).first()
      : null;

    // Parse JSON fields safely
    const strengths =
      typeof analysisResults.strengths === 'string'
        ? JSON.parse(analysisResults.strengths || '[]')
        : analysisResults.strengths || [];
    const improvements =
      typeof analysisResults.improvements === 'string'
        ? JSON.parse(analysisResults.improvements || '[]')
        : analysisResults.improvements || [];

    if (format === 'json') {
      const exportData = {
        recordingId,
        analyzedAt: analysisJob.completed_at,
        overallScore: analysisResults.overall_score,
        overallVerdict: analysisResults.overall_verdict,
        stepScores: stepScores.map((s: any) => ({
          stepId: s.rubric_step_id,
          score: s.score,
          confidence: s.confidence,
          reasoning: s.ai_reasoning,
        })),
        summary: analysisResults.summary_text,
      };

      res.json({
        success: true,
        data: exportData,
      });
      return;
    }

    if (format === 'csv') {
      const headers = ['Step ID', 'Score', 'Confidence', 'Reasoning'];
      const rows = stepScores.map((s: any) =>
        [s.rubric_step_id, s.score, s.confidence, `"${s.ai_reasoning || ''}"`].join(',')
      );
      const csv = [headers.join(','), ...rows].join('\n');

      res.setHeader('Content-Type', 'text/csv');
      res.setHeader('Content-Disposition', `attachment; filename=analysis-${recordingId}.csv`);
      res.send(csv);
      return;
    }

    // Default: PDF export
    const pdfBuffer = await generateAnalysisPDF({
      recording: {
        id: recording.id,
        title: recording.title,
        duration: recording.duration,
      },
      task: task ? { title: task.title } : undefined,
      analysisJob: {
        completed_at: analysisJob.completed_at,
        processing_duration_seconds: analysisJob.processing_duration_seconds,
      },
      analysisResults: {
        overall_score: analysisResults.overall_score,
        overall_verdict: analysisResults.overall_verdict,
        overall_confidence: analysisResults.overall_confidence,
        steps_passed: analysisResults.steps_passed,
        steps_partial: analysisResults.steps_partial,
        steps_failed: analysisResults.steps_failed,
        steps_total: analysisResults.steps_total,
        summary_text: analysisResults.summary_text,
        strengths,
        improvements,
      },
      stepScores,
    });

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename=analysis-${recordingId}.pdf`);
    res.send(pdfBuffer);
  } catch (error) {
    next(error);
  }
};

// ─── Human Override of AI Step Scores ─────────────────────────────────────────

const overrideSchema = z.object({
  stepScoreId: z.string().uuid(),
  overrideScore: z.enum(['YES', 'PARTIAL', 'NO']),
  reason: z.string().min(10, 'Override reason must be at least 10 characters'),
});

/**
 * POST /recordings/:id/analysis/override
 * Override an AI-generated step score with a human decision.
 * Creates a full audit trail. Recalculates overall score/verdict.
 */
export const overrideStepScore = async (
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const userId = req.user!.id;
    const organizationId = (req as any).user?.org_id;
    const { id: recordingId } = req.params;

    if (!organizationId) {
      throw new BadRequestError('Organization context required');
    }

    const { stepScoreId, overrideScore, reason } = overrideSchema.parse(req.body);

    // Verify recording belongs to org
    const recording = await db('recordings')
      .where('id', recordingId)
      .where('organization_id', organizationId)
      .first();

    if (!recording) {
      throw new NotFoundError('Recording not found');
    }

    // Verify step score exists and belongs to this recording
    const stepScore = await db('analysis_step_scores as ass')
      .join('analysis_results as ar', 'ass.analysis_result_id', 'ar.id')
      .join('analysis_jobs as aj', 'ar.analysis_job_id', 'aj.id')
      .where('ass.id', stepScoreId)
      .where('aj.recording_id', recordingId)
      .select('ass.*', 'ar.id as result_id', 'ar.analysis_job_id')
      .first();

    if (!stepScore) {
      throw new NotFoundError('Step score not found for this recording');
    }

    // Apply the override
    await db('analysis_step_scores').where('id', stepScoreId).update({
      human_override_score: overrideScore,
      override_reason: reason,
      overridden_by: userId,
      overridden_at: new Date(),
    });

    // Recalculate overall score using effective scores (human override where present, AI otherwise)
    const allStepScores = await db('analysis_step_scores').where(
      'analysis_result_id',
      stepScore.result_id
    );

    let totalWeight = 0;
    let achievedWeight = 0;

    for (const s of allStepScores) {
      const effectiveScore = s.human_override_score || s.score;
      const numeric = effectiveScore === 'YES' ? 1 : effectiveScore === 'PARTIAL' ? 0.75 : 0;
      const weight = s.weighted_score ? s.weighted_score / (s.numeric_score || 1) : 1;
      totalWeight += weight;
      achievedWeight += numeric * weight;
    }

    const overallScore = totalWeight > 0 ? Math.round((achievedWeight / totalWeight) * 100) : 0;
    const verdict =
      overallScore >= 80
        ? 'PASS'
        : overallScore >= 60
          ? 'PARTIAL_PASS'
          : overallScore >= 40
            ? 'NEEDS_REVIEW'
            : 'FAIL';

    await db('analysis_results').where('id', stepScore.result_id).update({
      has_human_overrides: true,
      human_override_score: overallScore,
      human_override_verdict: verdict,
    });

    // Audit log
    await db('organization_audit_logs').insert({
      organization_id: organizationId,
      user_id: userId,
      action: 'analysis.step_score.override',
      resource_type: 'analysis_step_score',
      resource_id: stepScoreId,
      details: JSON.stringify({
        recording_id: recordingId,
        step_title: stepScore.step_title,
        ai_score: stepScore.score,
        human_score: overrideScore,
        reason,
        new_overall_score: overallScore,
        new_verdict: verdict,
      }),
      created_at: new Date(),
    });

    logger.info(
      `Step score override: ${stepScoreId} ${stepScore.score} → ${overrideScore} by ${userId}`
    );

    res.json({
      success: true,
      data: {
        stepScoreId,
        originalScore: stepScore.score,
        overrideScore,
        reason,
        newOverallScore: overallScore,
        newVerdict: verdict,
      },
    });
  } catch (error) {
    next(error);
  }
};

export default {
  getAnalysisResults,
  triggerAnalysis,
  getAnalysisStatus,
  exportAnalysis,
  overrideStepScore,
};
