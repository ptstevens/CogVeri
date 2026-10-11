/**
 * Main Analysis Service
 *
 * Orchestrates the full AI analysis pipeline:
 * 1. Frame extraction
 * 2. Speech analysis
 * 3. Visual analysis
 * 4. Score combination and verdict
 */

import { db } from '../../config/database';
import { logger } from '../../utils/logger';
import {
  getAnalysisConfig,
  isGeminiConfigured,
  TokenUsage,
  estimateCost,
} from '../../config/gemini';
import { getS3Client, getS3Bucket, isS3Available } from '../../config/s3';
import { GetObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { speechAnalysisService, SpeechAnalysisResult } from './speech-analysis.service';
import { visualAnalysisService, VisualAnalysisResult } from './visual-analysis.service';
import { frameExtractionService } from './frame-extraction.service';
import { getNativeVideoAnalysisService } from './native-video-analysis.service';
import {
  similarityScoringService,
  SimilarityResult,
  SimilarityAnalysisResponse,
} from './similarity-scoring.service';
import { templateCalibrationService } from '../template-calibration.service';
import { analysisObservabilityService, StepDebugDetail } from './analysis-observability.service';
import {
  RubricStep,
  StepScoreResult,
  AnalysisVerdict,
  ExtractedFrame,
  StepScoreValue,
} from '../../queues/types/job-types';

export interface AnalysisOptions {
  skipVisualAnalysis?: boolean;
  skipSpeechAnalysis?: boolean;
  frameIntervalSeconds?: number;
  maxFrames?: number;
  /** Use native video analysis instead of frame extraction (better accuracy, slightly higher cost) */
  useNativeVideo?: boolean;
}

export interface FullAnalysisResult {
  overallScore: number;
  verdict: AnalysisVerdict;
  confidence: number;
  stepResults: StepScoreResult[];
  summary: {
    text: string;
    strengths: string[];
    improvements: string[];
  };
  tokensUsed: TokenUsage;
  estimatedCost: number;
  processingTimeMs: number;
}

class AnalysisService {
  /**
   * Run full analysis on a recording
   */
  async analyzeRecording(
    recordingId: string,
    _taskId: string,
    organizationId: string,
    rubricSteps: RubricStep[],
    passingScore: number,
    scoringMethod: 'weighted' | 'equal',
    analysisJobId: string,
    options?: AnalysisOptions
  ): Promise<FullAnalysisResult> {
    const startTime = Date.now();
    const config = getAnalysisConfig();

    if (!config.enabled) {
      throw new Error('AI Analysis is not enabled');
    }

    const totalTokens: TokenUsage = { inputTokens: 0, outputTokens: 0, totalTokens: 0 };

    // Get recording data
    const recording = await db('recordings').where('id', recordingId).first();

    if (!recording) {
      throw new Error(`Recording not found: ${recordingId}`);
    }

    // Get transcript and segments
    const transcriptText = recording.transcript_text || '';
    const transcriptSegments = await db('transcription_segments')
      .where('recording_id', recordingId)
      .orderBy('start_time', 'asc');

    logger.info(`Starting analysis for recording ${recordingId} with ${rubricSteps.length} steps`);

    // Initialize observability tracking
    analysisObservabilityService.startAnalysis({
      analysisJobId,
      recordingId,
      organizationId,
      templateId: undefined, // Will be set after we determine it
      isCalibrationRun: false,
    });

    // ============================================================
    // STAGE 0: Similarity Analysis (Direct Template Comparison)
    // ============================================================
    // Get template ID from task for similarity comparison
    let similarityResponse: SimilarityAnalysisResponse | null = null;
    let templateId: string | null = null;

    if (_taskId) {
      const task = await db('tasks').where('id', _taskId).first();
      templateId = task?.template_id;
    }

    if (templateId) {
      analysisObservabilityService.startStage('similarity_analysis');
      try {
        similarityResponse = await similarityScoringService.analyzeSimilarity({
          templateId,
          submissionTranscript: transcriptText,
          submissionSegments: transcriptSegments.map(
            (s: { text: string; start_time: number | string; end_time: number | string }) => ({
              text: s.text,
              start_time:
                typeof s.start_time === 'string' ? parseFloat(s.start_time) : s.start_time,
              end_time: typeof s.end_time === 'string' ? parseFloat(s.end_time) : s.end_time,
            })
          ),
          rubricSteps,
        });

        if (similarityResponse.hasEvidence) {
          logger.info(`Similarity analysis complete for ${recordingId}`, {
            templateId,
            evidenceUsed: true,
            avgSimilarity:
              similarityResponse.results.reduce((sum, r) => sum + r.overallSimilarity, 0) /
              similarityResponse.results.length,
          });
        }
        analysisObservabilityService.recordSimilarityAnalysis(similarityResponse);
      } catch (error) {
        logger.warn('Similarity analysis failed, will use AI-only scoring', { error, templateId });
        analysisObservabilityService.recordError(
          'similarity_analysis',
          error instanceof Error ? error : String(error),
          true
        );
      }
      analysisObservabilityService.endStage('similarity_analysis');
    }

    // ============================================================
    // STAGE 1: Speech Analysis
    // ============================================================
    let speechResults: SpeechAnalysisResult[] = [];

    if (!options?.skipSpeechAnalysis) {
      analysisObservabilityService.startStage('speech_analysis');
      await this.updateProgress(analysisJobId, 'analyzing_speech', 10, 'Analyzing transcript...');

      const speechResponse = await speechAnalysisService.analyzeTranscript(
        transcriptText,
        transcriptSegments,
        rubricSteps
      );

      speechResults = speechResponse.results;
      totalTokens.inputTokens += speechResponse.tokensUsed.inputTokens;
      totalTokens.outputTokens += speechResponse.tokensUsed.outputTokens;
      totalTokens.totalTokens += speechResponse.tokensUsed.totalTokens;

      // Record speech analysis debug info
      analysisObservabilityService.recordSpeechAnalysis({
        inputTokens: speechResponse.tokensUsed.inputTokens,
        outputTokens: speechResponse.tokensUsed.outputTokens,
      });
      analysisObservabilityService.endStage('speech_analysis');

      await db('analysis_jobs')
        .where('id', analysisJobId)
        .update({ speech_analysis_complete: true, updated_at: new Date() });
    }

    // ============================================================
    // STAGE 2: Visual Analysis (Native Video or Frame-based)
    // ============================================================
    let visualResults: VisualAnalysisResult[] = [];
    let frames: ExtractedFrame[] = [];

    const hasVisualSteps = rubricSteps.some(
      (s) => s.evidenceType === 'visual' || s.evidenceType === 'both'
    );

    // Default to native video analysis for better accuracy (can be disabled via options)
    const useNativeVideo = options?.useNativeVideo !== false;

    if (!options?.skipVisualAnalysis && hasVisualSteps && isGeminiConfigured()) {
      analysisObservabilityService.startStage('visual_analysis');
      // Get video URL - generate fresh signed URL if using S3
      let videoUrl = recording.file_url;

      if (recording.storage_provider === 's3' && recording.storage_key && isS3Available()) {
        const s3Client = getS3Client();
        if (s3Client) {
          const bucket = recording.storage_bucket || getS3Bucket();
          const command = new GetObjectCommand({
            Bucket: bucket,
            Key: recording.storage_key,
          });
          // Generate fresh signed URL valid for 1 hour
          videoUrl = await getSignedUrl(s3Client, command, { expiresIn: 3600 });
          logger.info(`Generated fresh signed URL for visual analysis of recording ${recordingId}`);
        }
      }

      if (videoUrl) {
        let nativeAnalysisFailed = false;

        // ============================================================
        // Option A: Native Video Analysis (default - better accuracy)
        // ============================================================
        if (useNativeVideo) {
          await this.updateProgress(
            analysisJobId,
            'analyzing_visual',
            40,
            'Analyzing video with AI...'
          );

          try {
            logger.info(`Using native video analysis for recording ${recordingId}`);
            const nativeVideoService = getNativeVideoAnalysisService();
            const nativeResponse = await nativeVideoService.analyzeVideoFromUrl(
              videoUrl,
              rubricSteps,
              recording.file_type || 'video/mp4'
            );

            // Convert native results to visual results format
            visualResults = nativeResponse.results.map((result) => ({
              stepId: result.stepId,
              score: result.score,
              confidence: result.confidence,
              evidence: result.evidence,
              reasoning: result.observation || 'Native video analysis',
            }));

            totalTokens.inputTokens += nativeResponse.tokensUsed.inputTokens;
            totalTokens.outputTokens += nativeResponse.tokensUsed.outputTokens;
            totalTokens.totalTokens += nativeResponse.tokensUsed.totalTokens;

            logger.info(
              `Native video analysis complete for ${recordingId}: ${nativeResponse.processingTimeMs}ms`
            );

            // Record visual analysis debug info
            analysisObservabilityService.recordVisualAnalysis({
              inputTokens: nativeResponse.tokensUsed.inputTokens,
              outputTokens: nativeResponse.tokensUsed.outputTokens,
              durationMs: nativeResponse.processingTimeMs,
            });
          } catch (error) {
            logger.error('Native video analysis failed, falling back to frame-based:', error);
            analysisObservabilityService.recordError(
              'native_video_analysis',
              error instanceof Error ? error : String(error),
              true
            );
            nativeAnalysisFailed = true;
          }
        }

        // ============================================================
        // Option B: Frame-based Analysis (fallback or when native disabled)
        // ============================================================
        if (!useNativeVideo || nativeAnalysisFailed) {
          await this.updateProgress(
            analysisJobId,
            'extracting_frames',
            40,
            'Extracting keyframes...'
          );

          try {
            // Extract frames
            const extractionResult = await frameExtractionService.extractFrames(
              videoUrl,
              analysisJobId,
              organizationId,
              {
                frameIntervalSeconds: options?.frameIntervalSeconds ?? config.frameIntervalSeconds,
                maxFrames: options?.maxFrames ?? config.maxFrames,
              }
            );

            frames = extractionResult.frames;

            await this.updateProgress(analysisJobId, 'analyzing_visual', 60, 'Analyzing frames...');

            // Analyze frames
            const visualResponse = await visualAnalysisService.analyzeFrames(frames, rubricSteps);

            visualResults = visualResponse.results;
            totalTokens.inputTokens += visualResponse.tokensUsed.inputTokens;
            totalTokens.outputTokens += visualResponse.tokensUsed.outputTokens;
            totalTokens.totalTokens += visualResponse.tokensUsed.totalTokens;

            // Record visual analysis debug info (frame-based)
            analysisObservabilityService.recordVisualAnalysis({
              inputTokens: visualResponse.tokensUsed.inputTokens,
              outputTokens: visualResponse.tokensUsed.outputTokens,
              batchCount: frames.length,
            });
          } catch (error) {
            logger.error('Frame-based visual analysis failed:', error);
            analysisObservabilityService.recordError(
              'frame_based_visual_analysis',
              error instanceof Error ? error : String(error),
              false
            );
          }
        }
      }
      analysisObservabilityService.endStage('visual_analysis');

      await db('analysis_jobs')
        .where('id', analysisJobId)
        .update({
          visual_analysis_complete: true,
          frames_analyzed: useNativeVideo ? 0 : frames.length, // Native video doesn't extract frames
          updated_at: new Date(),
        });
    } else {
      await db('analysis_jobs')
        .where('id', analysisJobId)
        .update({ visual_analysis_complete: true, updated_at: new Date() });
    }

    // ============================================================
    // STAGE 3: Combine Results (with Similarity Blending)
    // ============================================================
    analysisObservabilityService.startStage('score_calculation');
    await this.updateProgress(analysisJobId, 'combining_results', 80, 'Calculating scores...');

    let stepResults = this.combineResults(
      speechResults,
      visualResults,
      rubricSteps,
      similarityResponse?.results
    );

    // ============================================================
    // STAGE 3.5: Score Normalization (Calibration)
    // ============================================================
    // If template has calibration data, normalize scores relative to baseline
    let normalizationApplied = false;
    if (templateId) {
      try {
        const calibrationStatus = await templateCalibrationService.getCalibrationStatus(templateId);

        if (
          calibrationStatus.status === 'completed' ||
          calibrationStatus.status === 'needs_review'
        ) {
          const baselineStepScores =
            await templateCalibrationService.getBaselineStepScores(templateId);

          if (
            baselineStepScores.length > 0 &&
            calibrationStatus.baselineScore !== null &&
            calibrationStatus.baselineScore < 100
          ) {
            // Normalize step scores relative to baseline
            stepResults = stepResults.map((result) => {
              const normalized = templateCalibrationService.normalizeStepScore({
                stepId: result.rubricStepId,
                rawNumericScore:
                  (result.weightedScore /
                    (rubricSteps.find((s) => s.id === result.rubricStepId)?.weight || 5)) *
                  10,
                baselineStepScores,
              });

              return {
                ...result,
                aiReasoning: `${result.aiReasoning} | Normalized: baseline=${(normalized.baselineScore * 100).toFixed(0)}%`,
              };
            });

            normalizationApplied = true;
            logger.info('Applied calibration normalization', {
              templateId,
              baselineScore: calibrationStatus.baselineScore,
            });

            // Record normalization info
            analysisObservabilityService.recordNormalization({
              applied: true,
              factor: 100 / calibrationStatus.baselineScore,
            });
          }
        }
      } catch (calibrationError) {
        logger.warn('Failed to apply calibration normalization', {
          templateId,
          error: calibrationError,
        });
      }
    }

    // ============================================================
    // STAGE 4: Calculate Verdict
    // ============================================================
    const { overallScore, verdict, confidence } = this.calculateVerdict(
      stepResults,
      rubricSteps,
      passingScore,
      scoringMethod
    );

    // Apply overall score normalization if calibration data exists
    let finalOverallScore = overallScore;
    if (normalizationApplied && templateId) {
      try {
        const calibrationStatus = await templateCalibrationService.getCalibrationStatus(templateId);
        if (calibrationStatus.baselineScore !== null && calibrationStatus.baselineScore < 100) {
          const normalized = templateCalibrationService.normalizeScore({
            rawScore: overallScore,
            baselineScore: calibrationStatus.baselineScore,
          });
          finalOverallScore = normalized.normalizedScore;
          logger.info('Normalized overall score', {
            raw: overallScore,
            normalized: finalOverallScore,
            baselineScore: calibrationStatus.baselineScore,
          });
        }
      } catch (error) {
        logger.warn('Failed to normalize overall score', { error });
      }
    }

    // Generate summary
    const summary = this.generateSummary(stepResults, verdict);

    // Calculate cost
    const estimatedCost = estimateCost(totalTokens);

    // Update job with token usage
    await db('analysis_jobs').where('id', analysisJobId).update({
      ai_tokens_used: totalTokens.totalTokens,
      ai_api_calls: 2, // speech + visual
      estimated_cost_usd: estimatedCost,
      updated_at: new Date(),
    });

    logger.info(
      `Analysis complete: ${verdict} (${finalOverallScore.toFixed(1)}%${normalizationApplied ? ' normalized' : ''}), ` +
        `tokens: ${totalTokens.totalTokens}, cost: $${estimatedCost.toFixed(4)}`
    );

    // End score calculation timing
    analysisObservabilityService.endStage('score_calculation');

    // Record step debug details
    const stepDebugDetails: StepDebugDetail[] = stepResults.map((result) => {
      const similarityResult = similarityResponse?.results.find(
        (r) => r.stepId === result.rubricStepId
      );
      return {
        stepId: result.rubricStepId,
        stepTitle: result.stepTitle,
        rawScore: result.score,
        numericScore:
          (result.weightedScore /
            (rubricSteps.find((s) => s.id === result.rubricStepId)?.weight || 5)) *
          10,
        confidence: result.confidence,
        aiReasoning: result.aiReasoning,
        similarityScore: similarityResult?.overallSimilarity,
        similarityRecommendation: similarityResult?.recommendation,
      };
    });
    analysisObservabilityService.recordStepDetails(stepDebugDetails);

    // Finish observability tracking (saves to database)
    const stepsPassed = stepResults.filter((r) => r.score === 'YES').length;
    await analysisObservabilityService.finishAnalysis({
      overallScore: finalOverallScore,
      verdict,
      totalSteps: rubricSteps.length,
      stepsPassed,
    });

    return {
      overallScore: finalOverallScore,
      verdict,
      confidence,
      stepResults,
      summary,
      tokensUsed: totalTokens,
      estimatedCost,
      processingTimeMs: Date.now() - startTime,
    };
  }

  /**
   * Update job progress
   */
  private async updateProgress(
    analysisJobId: string,
    status: string,
    progress: number,
    message: string
  ): Promise<void> {
    await db('analysis_jobs').where('id', analysisJobId).update({
      status,
      progress,
      stage: status,
      progress_message: message,
      updated_at: new Date(),
    });
  }

  /**
   * Combine speech and visual results with similarity blending
   */
  private combineResults(
    speechResults: SpeechAnalysisResult[],
    visualResults: VisualAnalysisResult[],
    rubricSteps: RubricStep[],
    similarityResults?: SimilarityResult[]
  ): StepScoreResult[] {
    return rubricSteps
      .map((step) => {
        const speech = speechResults.find((r) => r.stepId === step.id);
        const visual = visualResults.find((r) => r.stepId === step.id);
        const similarity = similarityResults?.find((r) => r.stepId === step.id);

        // Helper to blend AI score with similarity
        const blendWithSimilarity = (
          aiScore: StepScoreValue,
          aiReasoning: string
        ): { score: StepScoreValue; reasoning: string; blendedNumeric: number } => {
          if (!similarity || similarity.recommendation === 'USE_AI') {
            return {
              score: aiScore,
              reasoning: aiReasoning,
              blendedNumeric: this.scoreToNumeric(aiScore),
            };
          }

          const blended = similarityScoringService.blendScores(aiScore, similarity);
          return {
            score: blended.finalScore,
            reasoning: `${aiReasoning} | Similarity: ${blended.reasoning}`,
            blendedNumeric: blended.blendedNumeric,
          };
        };

        if (step.evidenceType === 'speech' && speech) {
          const { score, reasoning, blendedNumeric } = blendWithSimilarity(
            speech.score as StepScoreValue,
            speech.reasoning
          );
          return {
            rubricStepId: step.id,
            stepOrder: step.order,
            stepTitle: step.title,
            score,
            confidence: speech.confidence,
            weightedScore: (blendedNumeric * step.weight) / 10,
            speechEvidence: speech.evidence,
            aiReasoning: reasoning,
          };
        }

        if (step.evidenceType === 'visual' && visual) {
          // Visual similarity not implemented yet, use AI score directly
          return {
            rubricStepId: step.id,
            stepOrder: step.order,
            stepTitle: step.title,
            score: visual.score as StepScoreValue,
            confidence: visual.confidence,
            weightedScore: (this.scoreToNumeric(visual.score) * step.weight) / 10,
            visualEvidence: visual.evidence,
            aiReasoning: visual.reasoning,
          };
        }

        if (step.evidenceType === 'both') {
          const speechScore = speech?.score || 'UNABLE_TO_ASSESS';
          const visualScore = visual?.score || 'UNABLE_TO_ASSESS';

          const speechNum = this.scoreToNumeric(speechScore);
          const visualNum = this.scoreToNumeric(visualScore);

          // Use MAX instead of AVG — if either channel confirms the step,
          // it's verified. This prevents a weaker visual match from dragging
          // down a strong speech match (or vice versa). The two channels are
          // complementary evidence sources, not independent requirements.
          const combinedNum = Math.max(speechNum, visualNum);

          // If both channels have data, boost confidence slightly when they agree
          const bothPresent =
            speech &&
            visual &&
            speechScore !== 'UNABLE_TO_ASSESS' &&
            visualScore !== 'UNABLE_TO_ASSESS';
          const bothAgree = bothPresent && Math.abs(speechNum - visualNum) < 0.3;
          const adjustedNum = bothAgree ? Math.min(combinedNum * 1.1, 1.0) : combinedNum;

          const combinedAiScore = this.numericToScore(adjustedNum);

          // Blend combined AI score with similarity
          const { score, reasoning, blendedNumeric } = blendWithSimilarity(
            combinedAiScore as StepScoreValue,
            `Speech: ${speechScore}, Visual: ${visualScore} (best-of used)`
          );

          const speechConf = speech?.confidence || 0;
          const visualConf = visual?.confidence || 0;
          // Confidence is the max of the two, not the average
          const combinedConfidence = Math.max(speechConf, visualConf);

          return {
            rubricStepId: step.id,
            stepOrder: step.order,
            stepTitle: step.title,
            score,
            confidence: combinedConfidence,
            weightedScore: (blendedNumeric * step.weight) / 10,
            speechEvidence: speech?.evidence,
            visualEvidence: visual?.evidence,
            aiReasoning: reasoning,
          };
        }

        return {
          rubricStepId: step.id,
          stepOrder: step.order,
          stepTitle: step.title,
          score: 'UNABLE_TO_ASSESS' as StepScoreValue,
          confidence: 0,
          weightedScore: 0,
          aiReasoning: 'No analysis performed',
        };
      })
      .sort((a, b) => a.stepOrder - b.stepOrder);
  }

  /**
   * Calculate overall verdict
   */
  private calculateVerdict(
    results: StepScoreResult[],
    rubricSteps: RubricStep[],
    passingScore: number,
    scoringMethod: 'weighted' | 'equal'
  ): { overallScore: number; verdict: AnalysisVerdict; confidence: number } {
    let overallScore: number;

    if (scoringMethod === 'weighted') {
      const totalWeight = rubricSteps.reduce((sum, s) => sum + s.weight, 0);
      const achievedWeight = results.reduce((sum, r) => sum + r.weightedScore * 10, 0);
      overallScore = totalWeight > 0 ? (achievedWeight / totalWeight) * 100 : 0;
    } else {
      const totalSteps = results.length;
      const passedSteps = results.filter((r) => r.score === 'YES').length;
      const partialSteps = results.filter((r) => r.score === 'PARTIAL').length;
      overallScore =
        totalSteps > 0
          ? ((passedSteps + partialSteps * 0.75) / totalSteps) * 100 // Increased from 0.5 to be less punitive
          : 0;
    }

    // Check required steps
    const requiredSteps = rubricSteps.filter((s) => s.isRequired);
    const failedRequired = requiredSteps.some((rs) => {
      const result = results.find((r) => r.rubricStepId === rs.id);
      return result?.score === 'NO';
    });

    let verdict: AnalysisVerdict;
    if (failedRequired) {
      verdict = 'FAIL';
    } else if (overallScore >= passingScore) {
      verdict = results.some((r) => r.score === 'PARTIAL') ? 'PARTIAL_PASS' : 'PASS';
    } else if (overallScore >= passingScore * 0.6) {
      verdict = 'NEEDS_REVIEW';
    } else {
      verdict = 'FAIL';
    }

    const avgConfidence =
      results.length > 0 ? results.reduce((sum, r) => sum + r.confidence, 0) / results.length : 0;

    return { overallScore, verdict, confidence: avgConfidence };
  }

  /**
   * Generate summary
   */
  private generateSummary(
    results: StepScoreResult[],
    verdict: AnalysisVerdict
  ): { text: string; strengths: string[]; improvements: string[] } {
    const passed = results.filter((r) => r.score === 'YES');
    const partial = results.filter((r) => r.score === 'PARTIAL');
    const failed = results.filter((r) => r.score === 'NO');

    const strengths = passed.map((r) => `Completed: ${r.stepTitle}`);
    const improvements = [
      ...failed.map((r) => `Missing: ${r.stepTitle}`),
      ...partial.map((r) => `Improve: ${r.stepTitle}`),
    ];

    let text: string;
    switch (verdict) {
      case 'PASS':
        text = `Excellent! All ${results.length} steps were completed successfully.`;
        break;
      case 'PARTIAL_PASS':
        text = `Good effort! ${passed.length} steps completed, ${partial.length} partially completed.`;
        break;
      case 'NEEDS_REVIEW':
        text = `This recording needs review. ${passed.length}/${results.length} steps completed.`;
        break;
      case 'FAIL':
        text = `Did not meet requirements. ${failed.length} steps missing or incomplete.`;
        break;
    }

    return { text, strengths, improvements };
  }

  private scoreToNumeric(score: string): number {
    switch (score) {
      case 'YES':
        return 1;
      case 'PARTIAL':
        return 0.75; // Increased from 0.5 to be less punitive
      default:
        return 0;
    }
  }

  private numericToScore(value: number): 'YES' | 'PARTIAL' | 'NO' {
    if (value >= 0.75) return 'YES';
    if (value >= 0.4) return 'PARTIAL';
    return 'NO';
  }

  /**
   * Get analysis results for a recording
   */
  async getAnalysisResults(recordingId: string): Promise<any | null> {
    const result = await db('analysis_results')
      .where('recording_id', recordingId)
      .orderBy('created_at', 'desc')
      .first();

    if (!result) return null;

    const stepScores = await db('analysis_step_scores')
      .where('analysis_job_id', result.analysis_job_id)
      .orderBy('step_order', 'asc');

    return {
      id: result.id,
      recordingId: result.recording_id,
      taskId: result.task_id,
      overallScore: result.overall_score,
      overallVerdict: result.overall_verdict,
      overallConfidence: result.overall_confidence,
      stepsPassed: result.steps_passed,
      stepsPartial: result.steps_partial,
      stepsFailed: result.steps_failed,
      stepsTotal: result.steps_total,
      summaryText: result.summary_text,
      strengths: result.strengths,
      improvements: result.improvements,
      stepResults: stepScores.map((s: any) => ({
        stepId: s.rubric_step_id,
        stepOrder: s.step_order,
        stepTitle: s.step_title,
        score: s.score,
        confidence: s.confidence,
        speechEvidence: s.speech_evidence,
        visualEvidence: s.visual_evidence,
        reasoning: s.ai_reasoning,
        detectedAt: s.detected_at_seconds,
      })),
      createdAt: result.created_at,
    };
  }
}

export const analysisService = new AnalysisService();
