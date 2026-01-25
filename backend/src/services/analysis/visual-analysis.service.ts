/**
 * Visual Analysis Service
 *
 * Analyzes video frames against rubric visual criteria using Gemini Vision.
 */

import { getVisionAnalysisModel, estimateCost, TokenUsage } from '../../config/gemini';
import { RubricStep, VisualEvidence, StepScoreValue, ExtractedFrame } from '../../queues/types/job-types';
import { buildVisualAnalysisPrompt } from './prompts/analysis.prompts';
import { getVisualAnalysisPrompt } from './prompts/prompt-resolver';
import { logger } from '../../utils/logger';
import { getS3Client, isS3Available, getS3Bucket } from '../../config/s3';
import { GetObjectCommand } from '@aws-sdk/client-s3';
import { geminiRateLimiter } from './gemini-rate-limiter';

// Alias for backwards compatibility
const isS3Configured = isS3Available;

export interface VisualAnalysisResult {
  stepId: string;
  score: StepScoreValue;
  confidence: number;
  evidence: VisualEvidence;
  reasoning: string;
}

export interface VisualAnalysisResponse {
  results: VisualAnalysisResult[];
  tokensUsed: TokenUsage;
  processingTimeMs: number;
}

class VisualAnalysisService {
  private model = getVisionAnalysisModel();
  private readonly BATCH_SIZE = 4;

  /**
   * Analyze frames against visual criteria
   */
  async analyzeFrames(
    frames: ExtractedFrame[],
    rubricSteps: RubricStep[]
  ): Promise<VisualAnalysisResponse> {
    const startTime = Date.now();

    const stepsWithVisual = rubricSteps.filter(
      s => s.evidenceType === 'visual' || s.evidenceType === 'both'
    );

    if (stepsWithVisual.length === 0 || frames.length === 0) {
      return {
        results: [],
        tokensUsed: { inputTokens: 0, outputTokens: 0, totalTokens: 0 },
        processingTimeMs: Date.now() - startTime,
      };
    }

    try {
      // Batch frames for efficient API calls
      const batches = this.createBatches(frames, this.BATCH_SIZE);
      const allFrameAnalysis: any[] = [];
      const totalTokens: TokenUsage = { inputTokens: 0, outputTokens: 0, totalTokens: 0 };

      for (let i = 0; i < batches.length; i++) {
        const batch = batches[i];
        logger.debug(`Analyzing frame batch ${i + 1}/${batches.length}`);

        try {
          const { analysis, tokens } = await this.analyzeBatch(batch ?? [], stepsWithVisual);
          allFrameAnalysis.push(...analysis);
          totalTokens.inputTokens += tokens.inputTokens;
          totalTokens.outputTokens += tokens.outputTokens;
          totalTokens.totalTokens += tokens.totalTokens;

          // Rate limiting delay between batches
          if (i < batches.length - 1) {
            await this.delay(1000);
          }
        } catch (error) {
          logger.error(`Failed to analyze batch ${i + 1}:`, error);
        }
      }

      // Aggregate results per step
      const results = this.aggregateResults(allFrameAnalysis, stepsWithVisual);

      logger.info(
        `Visual analysis complete: ${frames.length} frames, ${stepsWithVisual.length} steps, ` +
        `cost: $${estimateCost(totalTokens).toFixed(4)}`
      );

      return {
        results,
        tokensUsed: totalTokens,
        processingTimeMs: Date.now() - startTime,
      };

    } catch (error) {
      logger.error('Visual analysis failed:', error);
      return this.fallbackAnalysis(stepsWithVisual, startTime);
    }
  }

  /**
   * Create batches of frames
   */
  private createBatches(frames: ExtractedFrame[], batchSize: number): ExtractedFrame[][] {
    const batches: ExtractedFrame[][] = [];
    for (let i = 0; i < frames.length; i += batchSize) {
      batches.push(frames.slice(i, i + batchSize));
    }
    return batches;
  }

  /**
   * Analyze a batch of frames
   */
  private async analyzeBatch(
    frames: ExtractedFrame[],
    steps: RubricStep[]
  ): Promise<{ analysis: any[]; tokens: TokenUsage }> {
    const prompt = buildVisualAnalysisPrompt(
      frames.map(f => ({ index: f.index, timestampSeconds: f.timestampSeconds })),
      steps
    );

    // Load frame images
    const imageParts = await Promise.all(
      frames.map(async (frame) => {
        try {
          const imageData = await this.loadFrameImage(frame);
          return {
            inlineData: {
              mimeType: 'image/jpeg',
              data: imageData,
            },
          };
        } catch (error) {
          logger.warn(`Failed to load frame ${frame.index}:`, error);
          return null;
        }
      })
    );

    const validImageParts = imageParts.filter(p => p !== null);

    if (validImageParts.length === 0) {
      return {
        analysis: [],
        tokens: { inputTokens: 0, outputTokens: 0, totalTokens: 0 },
      };
    }

    // Wait for rate limit capacity (estimate ~15K tokens per batch with images)
    await geminiRateLimiter.waitForCapacity(15000);

    // Fetch system prompt (from DB with fallback to hardcoded)
    const systemPrompt = await getVisualAnalysisPrompt();

    const result = await this.model.generateContent([
      { text: systemPrompt },
      ...validImageParts,
      { text: prompt },
    ]);

    const response = result.response;
    const responseText = response.text();
    const usageMetadata = response.usageMetadata;

    const tokens = {
      inputTokens: usageMetadata?.promptTokenCount || 0,
      outputTokens: usageMetadata?.candidatesTokenCount || 0,
      totalTokens: usageMetadata?.totalTokenCount || 0,
    };

    // Record actual usage for rate limiting
    geminiRateLimiter.recordUsage(tokens.totalTokens);

    const parsed = this.parseVisualResponse(responseText);

    return {
      analysis: parsed.frameAnalysis || [],
      tokens,
    };
  }

  /**
   * Load frame image from storage
   */
  private async loadFrameImage(frame: ExtractedFrame): Promise<string> {
    if (!isS3Configured() || !frame.storageKey) {
      // For local development, try to read from URL
      const response = await fetch(frame.url);
      const buffer = await response.arrayBuffer();
      return Buffer.from(buffer).toString('base64');
    }

    const s3 = getS3Client();
    if (!s3) {
      throw new Error('S3 client not configured');
    }
    const command = new GetObjectCommand({
      Bucket: getS3Bucket(),
      Key: frame.storageKey,
    });

    const s3Response = await s3.send(command);
    const bodyContents = await s3Response.Body?.transformToByteArray();

    if (!bodyContents) {
      throw new Error('Empty response from S3');
    }

    return Buffer.from(bodyContents).toString('base64');
  }

  /**
   * Parse visual analysis response
   */
  private parseVisualResponse(responseText: string): any {
    try {
      let jsonStr = responseText.trim();

      // Try to match complete code blocks first
      const jsonMatch = responseText.match(/```(?:json)?\s*([\s\S]*?)```/);
      if (jsonMatch && jsonMatch[1]) {
        jsonStr = jsonMatch[1].trim();
      } else {
        // Fallback: strip opening/closing code fences separately
        // Handles cases where AI returns partial code blocks
        jsonStr = jsonStr.replace(/^```(?:json)?\s*\n?/, '');
        jsonStr = jsonStr.replace(/\n?```\s*$/, '');
      }

      return JSON.parse(jsonStr);
    } catch (error) {
      logger.error('Failed to parse visual response:', error);
      return { frameAnalysis: [], stepMatches: [] };
    }
  }

  /**
   * Aggregate frame analysis into step results
   */
  private aggregateResults(
    frameAnalysis: any[],
    steps: RubricStep[]
  ): VisualAnalysisResult[] {
    return steps.map(step => {
      const visual = step.visualCriteria;
      if (!visual) {
        return {
          stepId: step.id,
          score: 'UNABLE_TO_ASSESS' as StepScoreValue,
          confidence: 0,
          evidence: {
            elementsDetected: [],
            elementsMissing: [],
            actionsDetected: [],
            actionsMissing: [],
            visualScore: 'NO',
            visualConfidence: 0,
          },
          reasoning: 'No visual criteria defined',
        };
      }

      // Collect all detections across frames
      const allElements: any[] = [];
      const allActions: any[] = [];

      for (const frame of frameAnalysis) {
        if (frame.elementsDetected) {
          allElements.push(...frame.elementsDetected.map((e: any) => ({
            ...e,
            frameTimestamp: frame.timestamp,
          })));
        }
        if (frame.actionsDetected) {
          allActions.push(...frame.actionsDetected.map((a: any) => ({
            ...a,
            frameTimestamp: frame.timestamp,
          })));
        }
      }

      // Match against expected
      const elementsFound = visual.expectedElements.filter(expected =>
        allElements.some(detected =>
          detected.element?.toLowerCase().includes(expected.toLowerCase())
        )
      );
      const elementsMissing = visual.expectedElements.filter(
        e => !elementsFound.includes(e)
      );

      const actionsFound = visual.expectedActions.filter(expected =>
        allActions.some(detected =>
          detected.action?.toLowerCase().includes(expected.toLowerCase())
        )
      );
      const actionsMissing = visual.expectedActions.filter(
        a => !actionsFound.includes(a)
      );

      // Calculate score
      const totalRequired = visual.expectedElements.length + visual.expectedActions.length;
      const found = elementsFound.length + actionsFound.length;
      const ratio = totalRequired > 0 ? found / totalRequired : 0;

      let score: StepScoreValue;
      if (ratio >= 0.8) score = 'YES';
      else if (ratio >= 0.4) score = 'PARTIAL';
      else score = 'NO';

      return {
        stepId: step.id,
        score,
        confidence: ratio,
        evidence: {
          elementsDetected: allElements.slice(0, 10),
          elementsMissing,
          actionsDetected: allActions.slice(0, 10),
          actionsMissing,
          visualScore: score as 'YES' | 'PARTIAL' | 'NO',
          visualConfidence: ratio,
        },
        reasoning: `Found ${found}/${totalRequired} expected elements/actions`,
      };
    });
  }

  /**
   * Fallback when visual analysis fails
   */
  private fallbackAnalysis(
    steps: RubricStep[],
    startTime: number
  ): VisualAnalysisResponse {
    return {
      results: steps.map(step => ({
        stepId: step.id,
        score: 'UNABLE_TO_ASSESS' as StepScoreValue,
        confidence: 0,
        evidence: {
          elementsDetected: [],
          elementsMissing: step.visualCriteria?.expectedElements || [],
          actionsDetected: [],
          actionsMissing: step.visualCriteria?.expectedActions || [],
          visualScore: 'NO',
          visualConfidence: 0,
        },
        reasoning: 'Visual analysis unavailable',
      })),
      tokensUsed: { inputTokens: 0, outputTokens: 0, totalTokens: 0 },
      processingTimeMs: Date.now() - startTime,
    };
  }

  private delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

export const visualAnalysisService = new VisualAnalysisService();
