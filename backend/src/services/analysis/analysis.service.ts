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
import { getAnalysisConfig, isGeminiConfigured, TokenUsage, estimateCost } from '../../config/gemini';
import { getS3Client, getS3Bucket, isS3Available } from '../../config/s3';
import { GetObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { speechAnalysisService, SpeechAnalysisResult } from './speech-analysis.service';
import { visualAnalysisService, VisualAnalysisResult } from './visual-analysis.service';
import { frameExtractionService } from './frame-extraction.service';
import { getNativeVideoAnalysisService } from './native-video-analysis.service';
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
    const recording = await db('recordings')
      .where('id', recordingId)
      .first();

    if (!recording) {
      throw new Error(`Recording not found: ${recordingId}`);
    }

    // Get transcript and segments
    const transcriptText = recording.transcript_text || '';
    const transcriptSegments = await db('transcription_segments')
      .where('recording_id', recordingId)
      .orderBy('start_time', 'asc');

    logger.info(`Starting analysis for recording ${recordingId} with ${rubricSteps.length} steps`);

    // ============================================================
    // STAGE 1: Speech Analysis
    // ============================================================
    let speechResults: SpeechAnalysisResult[] = [];

    if (!options?.skipSpeechAnalysis) {
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
      s => s.evidenceType === 'visual' || s.evidenceType === 'both'
    );

    // Default to native video analysis for better accuracy (can be disabled via options)
    const useNativeVideo = options?.useNativeVideo !== false;

    if (!options?.skipVisualAnalysis && hasVisualSteps && isGeminiConfigured()) {
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
          await this.updateProgress(analysisJobId, 'analyzing_visual', 40, 'Analyzing video with AI...');

          try {
            logger.info(`Using native video analysis for recording ${recordingId}`);
            const nativeVideoService = getNativeVideoAnalysisService();
            const nativeResponse = await nativeVideoService.analyzeVideoFromUrl(
              videoUrl,
              rubricSteps,
              recording.file_type || 'video/mp4'
            );

            // Convert native results to visual results format
            visualResults = nativeResponse.results.map(result => ({
              stepId: result.stepId,
              score: result.score,
              confidence: result.confidence,
              evidence: result.evidence,
              reasoning: result.observation || 'Native video analysis',
            }));

            totalTokens.inputTokens += nativeResponse.tokensUsed.inputTokens;
            totalTokens.outputTokens += nativeResponse.tokensUsed.outputTokens;
            totalTokens.totalTokens += nativeResponse.tokensUsed.totalTokens;

            logger.info(`Native video analysis complete for ${recordingId}: ${nativeResponse.processingTimeMs}ms`);

          } catch (error) {
            logger.error('Native video analysis failed, falling back to frame-based:', error);
            nativeAnalysisFailed = true;
          }
        }

        // ============================================================
        // Option B: Frame-based Analysis (fallback or when native disabled)
        // ============================================================
        if (!useNativeVideo || nativeAnalysisFailed) {
          await this.updateProgress(analysisJobId, 'extracting_frames', 40, 'Extracting keyframes...');

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
            const visualResponse = await visualAnalysisService.analyzeFrames(
              frames,
              rubricSteps
            );

            visualResults = visualResponse.results;
            totalTokens.inputTokens += visualResponse.tokensUsed.inputTokens;
            totalTokens.outputTokens += visualResponse.tokensUsed.outputTokens;
            totalTokens.totalTokens += visualResponse.tokensUsed.totalTokens;

          } catch (error) {
            logger.error('Frame-based visual analysis failed:', error);
          }
        }
      }

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
    // STAGE 3: Combine Results
    // ============================================================
    await this.updateProgress(analysisJobId, 'combining_results', 80, 'Calculating scores...');

    const stepResults = this.combineResults(speechResults, visualResults, rubricSteps);

    // ============================================================
    // STAGE 4: Calculate Verdict
    // ============================================================
    const { overallScore, verdict, confidence } = this.calculateVerdict(
      stepResults,
      rubricSteps,
      passingScore,
      scoringMethod
    );

    // Generate summary
    const summary = this.generateSummary(stepResults, verdict);

    // Calculate cost
    const estimatedCost = estimateCost(totalTokens);

    // Update job with token usage
    await db('analysis_jobs')
      .where('id', analysisJobId)
      .update({
        ai_tokens_used: totalTokens.totalTokens,
        ai_api_calls: 2, // speech + visual
        estimated_cost_usd: estimatedCost,
        updated_at: new Date(),
      });

    logger.info(
      `Analysis complete: ${verdict} (${overallScore.toFixed(1)}%), ` +
      `tokens: ${totalTokens.totalTokens}, cost: $${estimatedCost.toFixed(4)}`
    );

    return {
      overallScore,
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
    await db('analysis_jobs')
      .where('id', analysisJobId)
      .update({
        status,
        progress,
        stage: status,
        progress_message: message,
        updated_at: new Date(),
      });
  }

  /**
   * Combine speech and visual results
   */
  private combineResults(
    speechResults: SpeechAnalysisResult[],
    visualResults: VisualAnalysisResult[],
    rubricSteps: RubricStep[]
  ): StepScoreResult[] {
    return rubricSteps.map(step => {
      const speech = speechResults.find(r => r.stepId === step.id);
      const visual = visualResults.find(r => r.stepId === step.id);

      if (step.evidenceType === 'speech' && speech) {
        return {
          rubricStepId: step.id,
          stepOrder: step.order,
          stepTitle: step.title,
          score: speech.score as StepScoreValue,
          confidence: speech.confidence,
          weightedScore: this.scoreToNumeric(speech.score) * step.weight / 10,
          speechEvidence: speech.evidence,
          aiReasoning: speech.reasoning,
        };
      }

      if (step.evidenceType === 'visual' && visual) {
        return {
          rubricStepId: step.id,
          stepOrder: step.order,
          stepTitle: step.title,
          score: visual.score as StepScoreValue,
          confidence: visual.confidence,
          weightedScore: this.scoreToNumeric(visual.score) * step.weight / 10,
          visualEvidence: visual.evidence,
          aiReasoning: visual.reasoning,
        };
      }

      if (step.evidenceType === 'both') {
        const speechScore = speech?.score || 'UNABLE_TO_ASSESS';
        const visualScore = visual?.score || 'UNABLE_TO_ASSESS';

        const speechNum = this.scoreToNumeric(speechScore);
        const visualNum = this.scoreToNumeric(visualScore);
        const avgNum = (speechNum + visualNum) / 2;
        const combinedScore = this.numericToScore(avgNum);

        return {
          rubricStepId: step.id,
          stepOrder: step.order,
          stepTitle: step.title,
          score: combinedScore as StepScoreValue,
          confidence: ((speech?.confidence || 0) + (visual?.confidence || 0)) / 2,
          weightedScore: avgNum * step.weight / 10,
          speechEvidence: speech?.evidence,
          visualEvidence: visual?.evidence,
          aiReasoning: `Speech: ${speechScore}, Visual: ${visualScore}`,
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
    }).sort((a, b) => a.stepOrder - b.stepOrder);
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
      const passedSteps = results.filter(r => r.score === 'YES').length;
      const partialSteps = results.filter(r => r.score === 'PARTIAL').length;
      overallScore = totalSteps > 0
        ? ((passedSteps + partialSteps * 0.75) / totalSteps) * 100 // Increased from 0.5 to be less punitive
        : 0;
    }

    // Check required steps
    const requiredSteps = rubricSteps.filter(s => s.isRequired);
    const failedRequired = requiredSteps.some(rs => {
      const result = results.find(r => r.rubricStepId === rs.id);
      return result?.score === 'NO';
    });

    let verdict: AnalysisVerdict;
    if (failedRequired) {
      verdict = 'FAIL';
    } else if (overallScore >= passingScore) {
      verdict = results.some(r => r.score === 'PARTIAL') ? 'PARTIAL_PASS' : 'PASS';
    } else if (overallScore >= passingScore * 0.6) {
      verdict = 'NEEDS_REVIEW';
    } else {
      verdict = 'FAIL';
    }

    const avgConfidence = results.length > 0
      ? results.reduce((sum, r) => sum + r.confidence, 0) / results.length
      : 0;

    return { overallScore, verdict, confidence: avgConfidence };
  }

  /**
   * Generate summary
   */
  private generateSummary(
    results: StepScoreResult[],
    verdict: AnalysisVerdict
  ): { text: string; strengths: string[]; improvements: string[] } {
    const passed = results.filter(r => r.score === 'YES');
    const partial = results.filter(r => r.score === 'PARTIAL');
    const failed = results.filter(r => r.score === 'NO');

    const strengths = passed.map(r => `Completed: ${r.stepTitle}`);
    const improvements = [
      ...failed.map(r => `Missing: ${r.stepTitle}`),
      ...partial.map(r => `Improve: ${r.stepTitle}`),
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
      case 'YES': return 1;
      case 'PARTIAL': return 0.75; // Increased from 0.5 to be less punitive
      default: return 0;
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
