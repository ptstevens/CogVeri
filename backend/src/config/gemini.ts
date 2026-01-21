/**
 * Gemini AI Client Configuration
 *
 * Centralized Gemini client factory for AI-powered video analysis.
 * Uses Google's Generative AI SDK (@google/generative-ai).
 */

import { GoogleGenerativeAI, GenerativeModel, HarmCategory, HarmBlockThreshold } from '@google/generative-ai';
import { logger } from '../utils/logger';

/**
 * Gemini client singleton instance
 */
let geminiClientInstance: GoogleGenerativeAI | null = null;

/**
 * Whether Gemini is configured and available
 */
let geminiConfigured = false;

/**
 * Cached model instances
 */
const modelCache: Map<string, GenerativeModel> = new Map();

/**
 * Supported Gemini models for different use cases
 */
export const GEMINI_MODELS = {
  // Primary model for analysis - best balance of quality and cost
  FLASH: 'gemini-2.0-flash-exp',
  // Fallback model
  FLASH_LEGACY: 'gemini-1.5-flash',
  // For complex reasoning (higher cost)
  PRO: 'gemini-1.5-pro',
} as const;

/**
 * Default generation config for analysis tasks
 */
export const DEFAULT_GENERATION_CONFIG = {
  temperature: 0.2, // Low temperature for consistent analysis
  topP: 0.8,
  topK: 40,
  maxOutputTokens: 4096,
};

/**
 * Safety settings - allow analysis of screen recordings
 */
export const ANALYSIS_SAFETY_SETTINGS = [
  {
    category: HarmCategory.HARM_CATEGORY_HARASSMENT,
    threshold: HarmBlockThreshold.BLOCK_ONLY_HIGH,
  },
  {
    category: HarmCategory.HARM_CATEGORY_HATE_SPEECH,
    threshold: HarmBlockThreshold.BLOCK_ONLY_HIGH,
  },
  {
    category: HarmCategory.HARM_CATEGORY_SEXUALLY_EXPLICIT,
    threshold: HarmBlockThreshold.BLOCK_ONLY_HIGH,
  },
  {
    category: HarmCategory.HARM_CATEGORY_DANGEROUS_CONTENT,
    threshold: HarmBlockThreshold.BLOCK_ONLY_HIGH,
  },
];

/**
 * Initialize the Gemini client (call once at startup)
 */
export function initializeGeminiClient(): void {
  if (geminiClientInstance) {
    logger.debug('Gemini client already initialized');
    return;
  }

  const apiKey = process.env.GEMINI_API_KEY;

  if (!apiKey) {
    logger.info('Gemini AI not configured - missing GEMINI_API_KEY');
    geminiConfigured = false;
    return;
  }

  try {
    geminiClientInstance = new GoogleGenerativeAI(apiKey);
    geminiConfigured = true;
    logger.info('Gemini AI client initialized successfully');
  } catch (error) {
    logger.error('Failed to initialize Gemini client:', error);
    geminiConfigured = false;
  }
}

/**
 * Get the Gemini client instance
 * @throws Error if Gemini is not configured
 */
export function getGeminiClient(): GoogleGenerativeAI {
  if (!geminiClientInstance) {
    initializeGeminiClient();
  }

  if (!geminiClientInstance) {
    throw new Error('Gemini AI is not configured. Set GEMINI_API_KEY environment variable.');
  }

  return geminiClientInstance;
}

/**
 * Check if Gemini is configured and available
 */
export function isGeminiConfigured(): boolean {
  if (!geminiConfigured && !geminiClientInstance) {
    initializeGeminiClient();
  }
  return geminiConfigured;
}

/**
 * Get a Gemini model instance (cached)
 */
export function getGeminiModel(
  modelName: string = GEMINI_MODELS.FLASH,
  options?: {
    generationConfig?: typeof DEFAULT_GENERATION_CONFIG;
    safetySettings?: typeof ANALYSIS_SAFETY_SETTINGS;
  }
): GenerativeModel {
  const cacheKey = `${modelName}-${JSON.stringify(options || {})}`;

  if (modelCache.has(cacheKey)) {
    return modelCache.get(cacheKey)!;
  }

  const client = getGeminiClient();
  const model = client.getGenerativeModel({
    model: modelName,
    generationConfig: options?.generationConfig || DEFAULT_GENERATION_CONFIG,
    safetySettings: options?.safetySettings || ANALYSIS_SAFETY_SETTINGS,
  });

  modelCache.set(cacheKey, model);
  return model;
}

/**
 * Get a model optimized for text analysis (speech/transcript)
 */
export function getTextAnalysisModel(): GenerativeModel {
  return getGeminiModel(GEMINI_MODELS.FLASH, {
    generationConfig: {
      ...DEFAULT_GENERATION_CONFIG,
      temperature: 0.1, // Very low for consistent scoring
      maxOutputTokens: 2048,
    },
  });
}

/**
 * Get a model optimized for vision/image analysis
 */
export function getVisionAnalysisModel(): GenerativeModel {
  return getGeminiModel(GEMINI_MODELS.FLASH, {
    generationConfig: {
      ...DEFAULT_GENERATION_CONFIG,
      temperature: 0.2,
      maxOutputTokens: 4096,
    },
  });
}


/**
 * Get a model optimized for rubric generation (needs higher output tokens)
 */
export function getRubricGenerationModel(): GenerativeModel {
  return getGeminiModel(GEMINI_MODELS.FLASH, {
    generationConfig: {
      ...DEFAULT_GENERATION_CONFIG,
      temperature: 0.2, // Slightly higher for creative rubric generation
      maxOutputTokens: 8192, // Higher limit for complex rubrics with multiple steps
    },
  });
}

/**
 * Configuration for analysis feature
 */
export interface AnalysisConfig {
  /** Whether AI analysis is enabled */
  enabled: boolean;
  /** Maximum frames to analyze per recording */
  maxFrames: number;
  /** Frame extraction interval in seconds */
  frameIntervalSeconds: number;
  /** Model to use for text analysis */
  textModel: string;
  /** Model to use for vision analysis */
  visionModel: string;
  /** Maximum retries for API calls */
  maxRetries: number;
  /** Delay between retries in ms */
  retryDelayMs: number;
  /** Enable scene change detection for capturing important moments */
  enableSceneDetection: boolean;
  /** Scene change sensitivity (0.0-1.0, lower = more sensitive) */
  sceneChangeThreshold: number;
}

/**
 * Get analysis configuration from environment
 */
export function getAnalysisConfig(): AnalysisConfig {
  return {
    enabled: process.env.ANALYSIS_ENABLED !== 'false' && isGeminiConfigured(),
    // Increased default to 45 frames to better handle longer videos with scene detection
    maxFrames: parseInt(process.env.ANALYSIS_MAX_FRAMES || '45', 10),
    frameIntervalSeconds: parseFloat(process.env.ANALYSIS_FRAME_INTERVAL || '1.0'),
    textModel: process.env.ANALYSIS_TEXT_MODEL || GEMINI_MODELS.FLASH,
    visionModel: process.env.ANALYSIS_VISION_MODEL || GEMINI_MODELS.FLASH,
    maxRetries: parseInt(process.env.ANALYSIS_MAX_RETRIES || '3', 10),
    retryDelayMs: parseInt(process.env.ANALYSIS_RETRY_DELAY_MS || '1000', 10),
    // Scene detection enabled by default - captures important visual changes
    enableSceneDetection: process.env.ANALYSIS_SCENE_DETECTION !== 'false',
    // 0.3 threshold balances sensitivity with noise (0.0 = very sensitive, 1.0 = only major changes)
    sceneChangeThreshold: parseFloat(process.env.ANALYSIS_SCENE_THRESHOLD || '0.3'),
  };
}

/**
 * Validate Gemini configuration at startup
 */
export function validateGeminiConfig(): void {
  const config = getAnalysisConfig();

  if (!config.enabled) {
    logger.info('AI Analysis is disabled');
    return;
  }

  logger.info('AI Analysis configuration:', {
    enabled: config.enabled,
    maxFrames: config.maxFrames,
    frameIntervalSeconds: config.frameIntervalSeconds,
    textModel: config.textModel,
    visionModel: config.visionModel,
    sceneDetection: config.enableSceneDetection,
    sceneThreshold: config.sceneChangeThreshold,
  });

  // Test the connection by getting the model
  try {
    getGeminiModel(config.textModel);
    logger.info('Gemini AI connection validated successfully');
  } catch (error) {
    logger.error('Gemini AI validation failed:', error);
  }
}

/**
 * Token usage tracking for cost estimation
 */
export interface TokenUsage {
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
}

/**
 * Cost estimation for Gemini API calls (January 2025 pricing)
 */
export const GEMINI_PRICING = {
  [GEMINI_MODELS.FLASH]: {
    inputPer1M: 0.10, // $0.10 per 1M input tokens
    outputPer1M: 0.40, // $0.40 per 1M output tokens
  },
  [GEMINI_MODELS.FLASH_LEGACY]: {
    inputPer1M: 0.075,
    outputPer1M: 0.30,
  },
  [GEMINI_MODELS.PRO]: {
    inputPer1M: 1.25,
    outputPer1M: 5.00,
  },
};

/**
 * Estimate cost for token usage
 */
export function estimateCost(
  usage: TokenUsage,
  model: string = GEMINI_MODELS.FLASH
): number {
  const pricing = GEMINI_PRICING[model as keyof typeof GEMINI_PRICING] || GEMINI_PRICING[GEMINI_MODELS.FLASH];

  const inputCost = (usage.inputTokens / 1_000_000) * pricing.inputPer1M;
  const outputCost = (usage.outputTokens / 1_000_000) * pricing.outputPer1M;

  return inputCost + outputCost;
}
