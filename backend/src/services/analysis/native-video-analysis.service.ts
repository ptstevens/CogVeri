/**
 * Native Video Analysis Service
 *
 * Uses Gemini's native video understanding instead of frame extraction.
 * This provides better accuracy for temporal actions, motion, and context.
 */

import { GoogleAIFileManager, FileMetadataResponse, FileState } from '@google/generative-ai/server';
import { getVisionAnalysisModel, estimateCost, TokenUsage, type GenerativeModel } from '../../config/gemini';
import { RubricStep, VisualEvidence, StepScoreValue } from '../../queues/types/job-types';
import { getVisualAnalysisPrompt } from './prompts/prompt-resolver';
import { logger } from '../../utils/logger';
import { retryGeminiCall } from '../../utils/gemini-retry';
import fs from 'fs/promises';
import path from 'path';
import os from 'os';
import { v4 as uuidv4 } from 'uuid';

export interface NativeVideoAnalysisResponse {
  results: Array<{
    stepId: string;
    score: StepScoreValue;
    confidence: number;
    evidence: VisualEvidence;
    observation?: string;
  }>;
  tokensUsed: TokenUsage;
  processingTimeMs: number;
}

/**
 * Service for analyzing videos using Gemini's native video understanding.
 *
 * Key advantages over frame extraction:
 * - Sees full temporal context (motion, transitions, user actions)
 * - Deterministic analysis (no random frame sampling)
 * - Better detection of sequential actions and UI interactions
 */
export class NativeVideoAnalysisService {
  private model: GenerativeModel;
  private fileManager: GoogleAIFileManager;
  private tempDir: string;

  // Maximum wait time for Google to process uploaded video (5 minutes)
  private readonly MAX_PROCESSING_WAIT_MS = 5 * 60 * 1000;
  // Poll interval while waiting for video processing
  private readonly PROCESSING_POLL_INTERVAL_MS = 2000;

  constructor() {
    this.model = getVisionAnalysisModel();

    const apiKey = process.env.GOOGLE_AI_API_KEY;
    if (!apiKey) {
      throw new Error('GOOGLE_AI_API_KEY is required for native video analysis');
    }

    this.fileManager = new GoogleAIFileManager(apiKey);
    this.tempDir = path.join(os.tmpdir(), 'cogveri-video-analysis');
    this.ensureTempDir();
  }

  private async ensureTempDir(): Promise<void> {
    try {
      await fs.mkdir(this.tempDir, { recursive: true });
    } catch (error) {
      logger.error('Failed to create video analysis temp directory:', error);
    }
  }

  /**
   * Analyze a video against rubric visual criteria using native video understanding.
   *
   * @param videoPath - Local path to the video file
   * @param rubricSteps - Rubric steps to evaluate against
   * @returns Analysis results with scores for each step
   */
  async analyzeVideo(
    videoPath: string,
    rubricSteps: RubricStep[]
  ): Promise<NativeVideoAnalysisResponse> {
    const startTime = Date.now();

    const stepsWithVisual = rubricSteps.filter(
      s => s.evidenceType === 'visual' || s.evidenceType === 'both'
    );

    if (stepsWithVisual.length === 0) {
      return {
        results: [],
        tokensUsed: { inputTokens: 0, outputTokens: 0, totalTokens: 0 },
        processingTimeMs: Date.now() - startTime,
      };
    }

    let uploadedFile: FileMetadataResponse | null = null;

    try {
      // Step 1: Upload video to Google's File API
      logger.info('Uploading video to Google File API for native analysis...');
      uploadedFile = await this.uploadVideoToGoogle(videoPath);

      // Step 2: Wait for video to be processed (state = ACTIVE)
      logger.info(`Waiting for video processing: ${uploadedFile.name}`);
      await this.waitForVideoProcessing(uploadedFile.name);

      // Step 3: Call Gemini with the video file
      logger.info('Starting native video analysis with Gemini...');
      const { results, tokens } = await this.performAnalysis(uploadedFile, stepsWithVisual);

      logger.info(
        `Native video analysis complete: ${stepsWithVisual.length} steps, ` +
        `cost: $${estimateCost(tokens).toFixed(4)}`
      );

      return {
        results,
        tokensUsed: tokens,
        processingTimeMs: Date.now() - startTime,
      };

    } catch (error) {
      logger.error('Native video analysis failed:', error);
      return this.fallbackResponse(stepsWithVisual, startTime);
    } finally {
      // Cleanup: Delete the uploaded file from Google
      if (uploadedFile?.name) {
        try {
          await this.fileManager.deleteFile(uploadedFile.name);
          logger.debug(`Deleted uploaded video from Google: ${uploadedFile.name}`);
        } catch (cleanupError) {
          logger.warn('Failed to cleanup uploaded video from Google:', cleanupError);
        }
      }
    }
  }

  /**
   * Analyze video from a URL (downloads first, then uploads to Google).
   */
  async analyzeVideoFromUrl(
    videoUrl: string,
    rubricSteps: RubricStep[],
    _mimeType: string = 'video/mp4'
  ): Promise<NativeVideoAnalysisResponse> {
    const tempPath = path.join(this.tempDir, `video-${uuidv4()}.mp4`);

    try {
      // Download video to temp file
      logger.info('Downloading video for native analysis...');
      const response = await fetch(videoUrl);
      if (!response.ok) {
        throw new Error(`Failed to download video: HTTP ${response.status}`);
      }

      const buffer = await response.arrayBuffer();
      await fs.writeFile(tempPath, Buffer.from(buffer));
      logger.info(`Downloaded video to ${tempPath} (${buffer.byteLength} bytes)`);

      // Analyze using the temp file
      return await this.analyzeVideo(tempPath, rubricSteps);

    } finally {
      // Cleanup temp file
      try {
        await fs.unlink(tempPath);
      } catch {
        // Ignore cleanup errors
      }
    }
  }

  /**
   * Upload a video file to Google's File API.
   */
  private async uploadVideoToGoogle(filePath: string): Promise<FileMetadataResponse> {
    const fileBuffer = await fs.readFile(filePath);
    const fileName = path.basename(filePath);

    // Determine MIME type from extension
    const ext = path.extname(filePath).toLowerCase();
    const mimeTypes: Record<string, string> = {
      '.mp4': 'video/mp4',
      '.webm': 'video/webm',
      '.mov': 'video/quicktime',
      '.avi': 'video/x-msvideo',
      '.mkv': 'video/x-matroska',
    };
    const mimeType = mimeTypes[ext] || 'video/mp4';

    const uploadResponse = await this.fileManager.uploadFile(fileBuffer, {
      mimeType,
      displayName: `analysis-${Date.now()}-${fileName}`,
    });

    logger.info(`Uploaded video to Google: ${uploadResponse.file.name} (${uploadResponse.file.uri})`);
    return uploadResponse.file;
  }

  /**
   * Wait for Google to finish processing the uploaded video.
   * Videos need to be in ACTIVE state before they can be used with generateContent.
   */
  private async waitForVideoProcessing(fileName: string): Promise<void> {
    const startTime = Date.now();

    while (Date.now() - startTime < this.MAX_PROCESSING_WAIT_MS) {
      const file = await this.fileManager.getFile(fileName);

      if (file.state === FileState.ACTIVE) {
        logger.info(`Video ready for analysis: ${fileName}`);
        return;
      }

      if (file.state === FileState.FAILED) {
        const errorObj = file as unknown as { error?: { message?: string } };
        throw new Error(`Video processing failed: ${errorObj.error?.message || 'Unknown error'}`);
      }

      logger.debug(`Video still processing: ${fileName} (state: ${file.state})`);
      await this.delay(this.PROCESSING_POLL_INTERVAL_MS);
    }

    throw new Error(`Video processing timed out after ${this.MAX_PROCESSING_WAIT_MS / 1000}s`);
  }

  /**
   * Perform the actual analysis using Gemini with the uploaded video.
   */
  private async performAnalysis(
    file: FileMetadataResponse,
    stepsWithVisual: RubricStep[]
  ): Promise<{
    results: NativeVideoAnalysisResponse['results'];
    tokens: TokenUsage;
  }> {
    // Build prompt for video analysis
    const prompt = this.buildVideoAnalysisPrompt(stepsWithVisual);

    // Fetch system prompt
    const systemPrompt = await getVisualAnalysisPrompt();

    // Call Gemini with the video file (with retry for rate limits)
    const result = await retryGeminiCall(
      () => this.model.generateContent([
        { text: systemPrompt },
        {
          fileData: {
            fileUri: file.uri,
            mimeType: file.mimeType,
          },
        },
        { text: prompt },
      ]),
      'native video analysis'
    );

    const response = result.response;
    const responseText = response.text();

    // Extract token usage
    const tokens: TokenUsage = {
      inputTokens: response.usageMetadata?.promptTokenCount || 0,
      outputTokens: response.usageMetadata?.candidatesTokenCount || 0,
      totalTokens: response.usageMetadata?.totalTokenCount || 0,
    };

    // Parse response
    const parsed = this.parseAnalysisResponse(responseText, stepsWithVisual);

    return { results: parsed, tokens };
  }

  /**
   * Build the prompt for video analysis.
   */
  private buildVideoAnalysisPrompt(steps: RubricStep[]): string {
    const stepsDescription = steps.map((step, index) => {
      let desc = `Step ${index + 1}: ${step.title}`;
      desc += `\n  ID: ${step.id}`;
      desc += `\n  Description: ${step.description || 'N/A'}`;

      if (step.visualCriteria?.expectedElements && step.visualCriteria.expectedElements.length > 0) {
        desc += `\n  Expected visual elements: ${step.visualCriteria.expectedElements.join(', ')}`;
      }

      if (step.visualCriteria?.expectedActions && step.visualCriteria.expectedActions.length > 0) {
        desc += `\n  Expected actions/interactions: ${step.visualCriteria.expectedActions.join(', ')}`;
      }

      desc += `\n  Required: ${step.isRequired ? 'Yes' : 'No'}`;
      desc += `\n  Weight: ${step.weight || 1}`;

      return desc;
    }).join('\n\n');

    return `
ANALYZE THE VIDEO RECORDING

Watch the entire video and evaluate whether each rubric step was completed.
Pay attention to:
- User interface elements that appear (buttons, forms, menus, etc.)
- User actions (clicks, typing, navigation, scrolling)
- The sequence and timing of actions
- Any visual indicators of success or completion

RUBRIC STEPS TO EVALUATE:
${stepsDescription}

RESPONSE FORMAT:
Return a JSON object with the following structure:
{
  "videoSummary": "Brief description of what happens in the video",
  "stepResults": [
    {
      "stepId": "step-uuid",
      "score": "YES" | "PARTIAL" | "NO",
      "confidence": 0.0-1.0,
      "elementsDetected": [
        {"element": "description", "timestamp": "mm:ss", "confidence": 0.0-1.0}
      ],
      "elementsMissing": ["element1", "element2"],
      "actionsDetected": [
        {"action": "description", "timestamp": "mm:ss", "confidence": 0.0-1.0}
      ],
      "actionsMissing": ["action1", "action2"],
      "observation": "Brief explanation of what was observed"
    }
  ]
}

SCORING GUIDELINES:
- YES: The step was clearly completed with all key elements/actions visible
- PARTIAL: Some elements/actions were present but not all required ones
- NO: The step was not completed or key elements were missing
- Be generous: Accept similar UI elements (e.g., "Save" = "Submit" = "OK")
- Consider the INTENT, not just exact specifications
- Mark as found if the element/action appears ANYWHERE in the recording

Return ONLY the JSON object, no additional text.
`;
  }

  /**
   * Parse the Gemini response into structured results.
   */
  private parseAnalysisResponse(
    responseText: string,
    steps: RubricStep[]
  ): NativeVideoAnalysisResponse['results'] {
    try {
      // Clean up response - remove markdown code blocks if present
      let cleanJson = responseText.trim();
      if (cleanJson.startsWith('```')) {
        cleanJson = cleanJson.replace(/^```(?:json)?\n?/, '').replace(/\n?```$/, '');
      }

      const parsed = JSON.parse(cleanJson);

      if (!parsed.stepResults || !Array.isArray(parsed.stepResults)) {
        throw new Error('Invalid response format: missing stepResults array');
      }

      // Map response to our format
      return steps.map(step => {
        const result = parsed.stepResults.find(
          (r: { stepId: string }) => r.stepId === step.id
        );

        if (!result) {
          // Step not found in response - mark as unable to assess
          return this.createUnableToAssessResult(step, 'Step not found in analysis response');
        }

        const score = this.normalizeScore(result.score);

        // Build evidence in the correct format
        const evidence: VisualEvidence = {
          elementsDetected: (result.elementsDetected || []).map((e: { element?: string; timestamp?: string; confidence?: number }) => ({
            element: e.element || '',
            frameTimestamp: this.parseTimestamp(e.timestamp || '0:00'),
            confidence: e.confidence || 0.5,
          })),
          elementsMissing: result.elementsMissing || [],
          actionsDetected: (result.actionsDetected || []).map((a: { action?: string; timestamp?: string; confidence?: number }) => ({
            action: a.action || '',
            frameTimestamp: this.parseTimestamp(a.timestamp || '0:00'),
            confidence: a.confidence || 0.5,
          })),
          actionsMissing: result.actionsMissing || [],
          visualScore: score === 'UNABLE_TO_ASSESS' ? 'NO' : score,
          visualConfidence: result.confidence || 0.5,
          observation: result.observation,
        };

        return {
          stepId: step.id,
          score,
          confidence: result.confidence || 0.5,
          evidence,
          observation: result.observation,
        };
      });

    } catch (error) {
      logger.error('Failed to parse video analysis response:', error);
      logger.debug('Raw response:', responseText);

      // Return fallback for all steps
      return steps.map(step => this.createUnableToAssessResult(step, 'Failed to parse analysis response'));
    }
  }

  /**
   * Create an UNABLE_TO_ASSESS result for a step.
   */
  private createUnableToAssessResult(
    step: RubricStep,
    reason: string
  ): NativeVideoAnalysisResponse['results'][0] {
    const evidence: VisualEvidence = {
      elementsDetected: [],
      elementsMissing: step.visualCriteria?.expectedElements || [],
      actionsDetected: [],
      actionsMissing: step.visualCriteria?.expectedActions || [],
      visualScore: 'NO',
      visualConfidence: 0,
      observation: reason,
    };

    return {
      stepId: step.id,
      score: 'UNABLE_TO_ASSESS',
      confidence: 0,
      evidence,
      observation: reason,
    };
  }

  /**
   * Normalize score value from various formats.
   */
  private normalizeScore(score: string): StepScoreValue {
    const normalized = (score || '').toUpperCase().trim();

    switch (normalized) {
      case 'YES':
      case 'PASS':
      case 'COMPLETE':
      case 'COMPLETED':
        return 'YES';
      case 'PARTIAL':
      case 'PARTIALLY':
      case 'SOME':
        return 'PARTIAL';
      case 'NO':
      case 'FAIL':
      case 'FAILED':
      case 'MISSING':
        return 'NO';
      default:
        return 'UNABLE_TO_ASSESS';
    }
  }

  /**
   * Parse a timestamp string (e.g., "1:23" or "01:23:45") to seconds.
   */
  private parseTimestamp(timestamp: string): number {
    if (!timestamp) return 0;

    const parts = String(timestamp).split(':').map(p => parseInt(p, 10) || 0);

    if (parts.length === 3) {
      // HH:MM:SS
      const [hours, minutes, seconds] = parts;
      return (hours ?? 0) * 3600 + (minutes ?? 0) * 60 + (seconds ?? 0);
    } else if (parts.length === 2) {
      // MM:SS
      const [minutes, seconds] = parts;
      return (minutes ?? 0) * 60 + (seconds ?? 0);
    }

    return 0;
  }

  /**
   * Return a fallback response when analysis fails.
   */
  private fallbackResponse(
    steps: RubricStep[],
    startTime: number
  ): NativeVideoAnalysisResponse {
    return {
      results: steps.map(step => this.createUnableToAssessResult(step, 'Analysis unavailable - native video analysis failed')),
      tokensUsed: { inputTokens: 0, outputTokens: 0, totalTokens: 0 },
      processingTimeMs: Date.now() - startTime,
    };
  }

  private delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

// Singleton instance
let nativeVideoAnalysisInstance: NativeVideoAnalysisService | null = null;

/**
 * Get the native video analysis service instance.
 */
export function getNativeVideoAnalysisService(): NativeVideoAnalysisService {
  if (!nativeVideoAnalysisInstance) {
    nativeVideoAnalysisInstance = new NativeVideoAnalysisService();
  }
  return nativeVideoAnalysisInstance;
}

export default NativeVideoAnalysisService;
