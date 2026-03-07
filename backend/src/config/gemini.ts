/**
 * Gemini AI Client Configuration
 *
 * Supports two modes:
 * - **AI Studio** (dev): Uses GEMINI_API_KEY via @google/generative-ai
 * - **Vertex AI** (production): Uses GEMINI_PROJECT_ID + GEMINI_LOCATION via @google-cloud/vertexai
 *   Provides: enterprise DPA, data residency, SOC 2/ISO 27001 coverage
 *
 * Vertex AI is auto-selected when GEMINI_PROJECT_ID is set.
 */

import { GoogleGenerativeAI, GenerativeModel as AIStudioModel, HarmCategory, HarmBlockThreshold } from '@google/generative-ai';
import { VertexAI, HarmCategory as VHarmCategory, HarmBlockThreshold as VHarmBlockThreshold } from '@google-cloud/vertexai';
import { logger } from '../utils/logger';

// Both SDKs expose the same generateContent() runtime interface.
// We export the AI Studio type as the canonical type since it's the superset,
// and cast Vertex models to it at the factory boundary.
export type GenerativeModel = AIStudioModel;

// ─── Client Instances ─────────────────────────────────────────────────────────

let aiStudioClient: GoogleGenerativeAI | null = null;
let vertexClient: VertexAI | null = null;
let geminiConfigured = false;
let usingVertexAI = false;

const modelCache: Map<string, GenerativeModel> = new Map();

// ─── Model Constants ──────────────────────────────────────────────────────────

export const GEMINI_MODELS = {
  FLASH: 'gemini-2.0-flash',
  FLASH_LEGACY: 'gemini-1.5-flash',
  PRO: 'gemini-1.5-pro',
} as const;

export const DEFAULT_GENERATION_CONFIG = {
  temperature: 0.0,
  topP: 0.8,
  topK: 40,
  maxOutputTokens: 4096,
};

export const ANALYSIS_SAFETY_SETTINGS = [
  { category: HarmCategory.HARM_CATEGORY_HARASSMENT, threshold: HarmBlockThreshold.BLOCK_ONLY_HIGH },
  { category: HarmCategory.HARM_CATEGORY_HATE_SPEECH, threshold: HarmBlockThreshold.BLOCK_ONLY_HIGH },
  { category: HarmCategory.HARM_CATEGORY_SEXUALLY_EXPLICIT, threshold: HarmBlockThreshold.BLOCK_ONLY_HIGH },
  { category: HarmCategory.HARM_CATEGORY_DANGEROUS_CONTENT, threshold: HarmBlockThreshold.BLOCK_ONLY_HIGH },
];

const VERTEX_SAFETY_SETTINGS = [
  { category: VHarmCategory.HARM_CATEGORY_HARASSMENT, threshold: VHarmBlockThreshold.BLOCK_ONLY_HIGH },
  { category: VHarmCategory.HARM_CATEGORY_HATE_SPEECH, threshold: VHarmBlockThreshold.BLOCK_ONLY_HIGH },
  { category: VHarmCategory.HARM_CATEGORY_SEXUALLY_EXPLICIT, threshold: VHarmBlockThreshold.BLOCK_ONLY_HIGH },
  { category: VHarmCategory.HARM_CATEGORY_DANGEROUS_CONTENT, threshold: VHarmBlockThreshold.BLOCK_ONLY_HIGH },
];

// ─── Initialization ───────────────────────────────────────────────────────────

export function initializeGeminiClient(): void {
  if (geminiConfigured) return;

  const projectId = process.env.GEMINI_PROJECT_ID;
  const location = process.env.GEMINI_LOCATION || 'europe-west2';
  const apiKey = process.env.GEMINI_API_KEY;
  const hasServiceAccountKey = !!process.env.GOOGLE_APPLICATION_CREDENTIALS;

  // Vertex AI requires Application Default Credentials (ADC):
  // - Service account key JSON (via GOOGLE_APPLICATION_CREDENTIALS env var)
  // - GCP metadata server (when running on GCE/GKE/Cloud Run)
  // - gcloud auth application-default login (local dev only)
  //
  // On non-GCP infrastructure (EC2, etc.), ADC only works with a service account key.
  // API keys do NOT work with the @google-cloud/vertexai SDK.

  if (projectId && hasServiceAccountKey) {
    try {
      vertexClient = new VertexAI({
        project: projectId,
        location,
        apiEndpoint: `${location}-aiplatform.googleapis.com`,
      });
      usingVertexAI = true;
      geminiConfigured = true;
      logger.info(`Gemini AI initialized via Vertex AI (project: ${projectId}, location: ${location})`);
      logger.info('Enterprise DPA and data residency controls active');
      return;
    } catch (error) {
      logger.error('Failed to initialize Vertex AI client:', error);
      logger.warn('Falling back to AI Studio...');
    }
  } else if (projectId && !hasServiceAccountKey) {
    logger.warn(
      'GEMINI_PROJECT_ID is set but GOOGLE_APPLICATION_CREDENTIALS is not. ' +
      'Vertex AI requires a service account key JSON on non-GCP infrastructure. ' +
      'Falling back to AI Studio with API key. ' +
      'To enable Vertex AI: create a service account key and set GOOGLE_APPLICATION_CREDENTIALS=/path/to/key.json'
    );
  }

  // AI Studio — works with API key on any infrastructure
  if (apiKey) {
    try {
      aiStudioClient = new GoogleGenerativeAI(apiKey);
      usingVertexAI = false;
      geminiConfigured = true;
      logger.info('Gemini AI initialized via AI Studio');
      if (projectId) {
        logger.info('Note: To use Vertex AI (enterprise DPA + data residency), set GOOGLE_APPLICATION_CREDENTIALS');
      }
      return;
    } catch (error) {
      logger.error('Failed to initialize AI Studio client:', error);
    }
  }

  logger.info('Gemini AI not configured — set GEMINI_API_KEY (AI Studio) or GEMINI_PROJECT_ID + GOOGLE_APPLICATION_CREDENTIALS (Vertex AI)');
  geminiConfigured = false;
}

// ─── Client Access ────────────────────────────────────────────────────────────

export function getGeminiClient(): GoogleGenerativeAI {
  if (!geminiConfigured) initializeGeminiClient();
  if (!aiStudioClient && !vertexClient) {
    throw new Error('Gemini AI is not configured. Set GEMINI_PROJECT_ID or GEMINI_API_KEY.');
  }
  // For backward compat — callers that need the raw AI Studio client
  if (aiStudioClient) return aiStudioClient;
  throw new Error('Vertex AI mode active — use getGeminiModel() instead of getGeminiClient()');
}

export function isGeminiConfigured(): boolean {
  if (!geminiConfigured) initializeGeminiClient();
  return geminiConfigured;
}

export function isUsingVertexAI(): boolean {
  return usingVertexAI;
}

// ─── Model Factory ────────────────────────────────────────────────────────────

export function getGeminiModel(
  modelName: string = GEMINI_MODELS.FLASH,
  options?: {
    generationConfig?: typeof DEFAULT_GENERATION_CONFIG;
    safetySettings?: typeof ANALYSIS_SAFETY_SETTINGS;
  }
): GenerativeModel {
  const cacheKey = `${modelName}-${JSON.stringify(options || {})}`;
  if (modelCache.has(cacheKey)) return modelCache.get(cacheKey)!;

  if (!geminiConfigured) initializeGeminiClient();

  let model: GenerativeModel;

  if (usingVertexAI && vertexClient) {
    // Vertex AI model cast to AIStudioModel type — runtime interfaces are identical
    model = vertexClient.getGenerativeModel({
      model: modelName,
      generationConfig: options?.generationConfig || DEFAULT_GENERATION_CONFIG,
      safetySettings: options?.safetySettings
        ? (options.safetySettings as any)
        : VERTEX_SAFETY_SETTINGS,
    }) as unknown as GenerativeModel;
  } else if (aiStudioClient) {
    model = aiStudioClient.getGenerativeModel({
      model: modelName,
      generationConfig: options?.generationConfig || DEFAULT_GENERATION_CONFIG,
      safetySettings: options?.safetySettings || ANALYSIS_SAFETY_SETTINGS,
    });
  } else {
    throw new Error('Gemini AI is not configured');
  }

  modelCache.set(cacheKey, model);
  return model;
}

// ─── Pre-configured Model Getters ─────────────────────────────────────────────

export function getTextAnalysisModel(): GenerativeModel {
  return getGeminiModel(GEMINI_MODELS.FLASH, {
    generationConfig: { ...DEFAULT_GENERATION_CONFIG, temperature: 0.0, maxOutputTokens: 2048 },
  });
}

export function getVisionAnalysisModel(): GenerativeModel {
  return getGeminiModel(GEMINI_MODELS.FLASH, {
    generationConfig: { ...DEFAULT_GENERATION_CONFIG, temperature: 0.0, maxOutputTokens: 4096 },
  });
}

export function getRubricGenerationModel(): GenerativeModel {
  return getGeminiModel(GEMINI_MODELS.FLASH, {
    generationConfig: { ...DEFAULT_GENERATION_CONFIG, temperature: 0.0, maxOutputTokens: 8192 },
  });
}

// ─── Analysis Config ──────────────────────────────────────────────────────────

export interface AnalysisConfig {
  enabled: boolean;
  maxFrames: number;
  frameIntervalSeconds: number;
  textModel: string;
  visionModel: string;
  maxRetries: number;
  retryDelayMs: number;
  enableSceneDetection: boolean;
  sceneChangeThreshold: number;
}

export function getAnalysisConfig(): AnalysisConfig {
  return {
    enabled: process.env.ANALYSIS_ENABLED !== 'false' && isGeminiConfigured(),
    maxFrames: parseInt(process.env.ANALYSIS_MAX_FRAMES || '45', 10),
    frameIntervalSeconds: parseFloat(process.env.ANALYSIS_FRAME_INTERVAL || '1.0'),
    textModel: process.env.ANALYSIS_TEXT_MODEL || GEMINI_MODELS.FLASH,
    visionModel: process.env.ANALYSIS_VISION_MODEL || GEMINI_MODELS.FLASH,
    maxRetries: parseInt(process.env.ANALYSIS_MAX_RETRIES || '3', 10),
    retryDelayMs: parseInt(process.env.ANALYSIS_RETRY_DELAY_MS || '1000', 10),
    enableSceneDetection: process.env.ANALYSIS_SCENE_DETECTION !== 'false',
    sceneChangeThreshold: parseFloat(process.env.ANALYSIS_SCENE_THRESHOLD || '0.3'),
  };
}

export function validateGeminiConfig(): void {
  const config = getAnalysisConfig();
  if (!config.enabled) {
    logger.info('AI Analysis is disabled');
    return;
  }
  logger.info('AI Analysis configuration:', {
    enabled: config.enabled,
    provider: usingVertexAI ? 'Vertex AI' : 'AI Studio',
    location: usingVertexAI ? (process.env.GEMINI_LOCATION || 'europe-west2') : 'us (default)',
    maxFrames: config.maxFrames,
    textModel: config.textModel,
    visionModel: config.visionModel,
    sceneDetection: config.enableSceneDetection,
  });
  try {
    getGeminiModel(config.textModel);
    logger.info('Gemini AI connection validated successfully');
  } catch (error) {
    logger.error('Gemini AI validation failed:', error);
  }
}

// ─── Cost Estimation ──────────────────────────────────────────────────────────

export interface TokenUsage {
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
}

export const GEMINI_PRICING = {
  [GEMINI_MODELS.FLASH]: { inputPer1M: 0.10, outputPer1M: 0.40 },
  [GEMINI_MODELS.FLASH_LEGACY]: { inputPer1M: 0.075, outputPer1M: 0.30 },
  [GEMINI_MODELS.PRO]: { inputPer1M: 1.25, outputPer1M: 5.00 },
};

export function estimateCost(usage: TokenUsage, model: string = GEMINI_MODELS.FLASH): number {
  const pricing = GEMINI_PRICING[model as keyof typeof GEMINI_PRICING] || GEMINI_PRICING[GEMINI_MODELS.FLASH];
  return (usage.inputTokens / 1_000_000) * pricing.inputPer1M + (usage.outputTokens / 1_000_000) * pricing.outputPer1M;
}
