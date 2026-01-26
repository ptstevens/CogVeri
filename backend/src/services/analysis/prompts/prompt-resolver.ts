/**
 * Prompt Resolver
 *
 * Fetches AI prompts from database with fallback to hardcoded prompts.
 * This allows prompt editing without code deployments while ensuring
 * the system never fails if the database is unavailable.
 */

import { aiPromptsService } from '../../ai-prompts.service';
import { PromptKey } from '../../../types/ai-prompts.types';
import { logger } from '../../../utils/logger';

// Fallback prompts imported from original files
import {
  SPEECH_ANALYSIS_SYSTEM_PROMPT,
  VISUAL_ANALYSIS_SYSTEM_PROMPT,
} from './analysis.prompts';
import { RUBRIC_GENERATION_SYSTEM_PROMPT } from './rubric-generation.prompts';

/**
 * Fallback prompts - used when DB is unavailable
 * These are the original hardcoded prompts
 */
const FALLBACK_PROMPTS: Record<PromptKey, string> = {
  speech_analysis: SPEECH_ANALYSIS_SYSTEM_PROMPT,
  visual_analysis: VISUAL_ANALYSIS_SYSTEM_PROMPT,
  rubric_generation: RUBRIC_GENERATION_SYSTEM_PROMPT,
};

/**
 * Get a system prompt by key
 *
 * Attempts to fetch from database first, falls back to hardcoded
 * prompt on any error to ensure analysis never fails.
 *
 * @param key - The prompt key to fetch
 * @returns The system prompt text
 */
export async function getSystemPrompt(key: PromptKey): Promise<string> {
  try {
    const prompt = await aiPromptsService.getPrompt(key);
    return prompt;
  } catch (error) {
    logger.warn(`Failed to fetch prompt "${key}" from database, using fallback`, { error });
    return FALLBACK_PROMPTS[key];
  }
}

/**
 * Get the speech analysis system prompt
 */
export async function getSpeechAnalysisPrompt(): Promise<string> {
  return getSystemPrompt('speech_analysis');
}

/**
 * Get the visual analysis system prompt
 */
export async function getVisualAnalysisPrompt(): Promise<string> {
  return getSystemPrompt('visual_analysis');
}

/**
 * Get the rubric generation system prompt
 */
export async function getRubricGenerationPrompt(): Promise<string> {
  return getSystemPrompt('rubric_generation');
}

// Re-export fallback prompts for services that need synchronous access
// (e.g., for initial module load or testing)
export {
  SPEECH_ANALYSIS_SYSTEM_PROMPT,
  VISUAL_ANALYSIS_SYSTEM_PROMPT,
  RUBRIC_GENERATION_SYSTEM_PROMPT,
  FALLBACK_PROMPTS,
};
