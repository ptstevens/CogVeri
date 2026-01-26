/**
 * AI Prompts Service
 *
 * Manages AI system prompts used by Gemini for video/audio analysis.
 * Provides CRUD operations, version history, and testing capabilities.
 */

import { db } from '../config/database';
import { logger } from '../utils/logger';
import { getTextAnalysisModel, isGeminiConfigured } from '../config/gemini';
import {
  PromptKey,
  AIPrompt,
  AIPromptHistory,
  AIPromptWithHistory,
  AIPromptListItem,
  AIPromptRow,
  AIPromptHistoryRow,
  PromptTestRequest,
  PromptTestResult,
} from '../types/ai-prompts.types';

// Fallback prompts - used when DB is unavailable
// These should match what's seeded in the migration
import {
  SPEECH_ANALYSIS_SYSTEM_PROMPT,
  VISUAL_ANALYSIS_SYSTEM_PROMPT,
} from './analysis/prompts/analysis.prompts';
import { RUBRIC_GENERATION_SYSTEM_PROMPT } from './analysis/prompts/rubric-generation.prompts';

const FALLBACK_PROMPTS: Record<PromptKey, string> = {
  speech_analysis: SPEECH_ANALYSIS_SYSTEM_PROMPT,
  visual_analysis: VISUAL_ANALYSIS_SYSTEM_PROMPT,
  rubric_generation: RUBRIC_GENERATION_SYSTEM_PROMPT,
};

interface CacheEntry {
  prompt: string;
  cachedAt: number;
}

/**
 * AI Prompts Service
 */
class AIPromptsService {
  private cache: Map<PromptKey, CacheEntry> = new Map();
  private readonly CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes

  /**
   * Convert database row to AIPrompt
   */
  private rowToPrompt(row: AIPromptRow): AIPrompt {
    return {
      id: row.id,
      promptKey: row.prompt_key,
      displayName: row.display_name,
      description: row.description,
      systemPrompt: row.system_prompt,
      defaultPrompt: row.default_prompt,
      version: row.version,
      isActive: row.is_active,
      updatedBy: row.updated_by,
      updatedAt: row.updated_at,
      createdAt: row.created_at,
    };
  }

  /**
   * Convert database row to AIPromptHistory
   */
  private rowToHistory(row: AIPromptHistoryRow): AIPromptHistory {
    return {
      id: row.id,
      promptId: row.prompt_id,
      version: row.version,
      systemPrompt: row.system_prompt,
      changedBy: row.changed_by,
      changeReason: row.change_reason,
      createdAt: row.created_at,
    };
  }

  /**
   * Get a prompt by key with caching
   * Falls back to hardcoded prompt if DB unavailable
   */
  async getPrompt(key: PromptKey): Promise<string> {
    // Check cache first
    const cached = this.cache.get(key);
    if (cached && Date.now() - cached.cachedAt < this.CACHE_TTL_MS) {
      return cached.prompt;
    }

    try {
      const row = await db('ai_prompts')
        .where('prompt_key', key)
        .where('is_active', true)
        .select('system_prompt')
        .first();

      if (row) {
        // Update cache
        this.cache.set(key, {
          prompt: row.system_prompt,
          cachedAt: Date.now(),
        });
        return row.system_prompt;
      }

      // Not found in DB, use fallback
      logger.warn(`Prompt "${key}" not found in database, using fallback`);
      return FALLBACK_PROMPTS[key];

    } catch (error) {
      logger.error(`Error fetching prompt "${key}":`, error);
      // Fall back to hardcoded prompts on DB error
      return FALLBACK_PROMPTS[key];
    }
  }

  /**
   * Get full prompt details by key
   */
  async getPromptDetails(key: PromptKey): Promise<AIPrompt | null> {
    try {
      const row = await db('ai_prompts')
        .where('prompt_key', key)
        .first() as AIPromptRow | undefined;

      if (!row) {
        return null;
      }

      return this.rowToPrompt(row);
    } catch (error) {
      logger.error(`Error fetching prompt details for "${key}":`, error);
      throw error;
    }
  }

  /**
   * Get prompt with its version history
   */
  async getPromptWithHistory(key: PromptKey): Promise<AIPromptWithHistory | null> {
    try {
      const prompt = await this.getPromptDetails(key);
      if (!prompt) {
        return null;
      }

      const historyRows = await db('ai_prompt_history')
        .where('prompt_id', prompt.id)
        .orderBy('version', 'desc')
        .limit(50) as AIPromptHistoryRow[];

      return {
        ...prompt,
        history: historyRows.map(r => this.rowToHistory(r)),
      };
    } catch (error) {
      logger.error(`Error fetching prompt with history for "${key}":`, error);
      throw error;
    }
  }

  /**
   * Get all prompts (list view)
   */
  async getAllPrompts(): Promise<AIPromptListItem[]> {
    try {
      const rows = await db('ai_prompts')
        .select('id', 'prompt_key', 'display_name', 'description', 'version', 'is_active', 'updated_at', 'system_prompt')
        .orderBy('display_name') as (AIPromptRow & { system_prompt: string })[];

      return rows.map(row => ({
        id: row.id,
        promptKey: row.prompt_key,
        displayName: row.display_name,
        description: row.description,
        version: row.version,
        isActive: row.is_active,
        updatedAt: row.updated_at,
        characterCount: row.system_prompt?.length || 0,
      }));
    } catch (error) {
      logger.error('Error fetching all prompts:', error);
      throw error;
    }
  }

  /**
   * Update a prompt (creates history entry)
   */
  async updatePrompt(
    key: PromptKey,
    content: string,
    userId: string,
    reason?: string
  ): Promise<AIPrompt> {
    try {
      const existing = await this.getPromptDetails(key);
      if (!existing) {
        throw new Error(`Prompt "${key}" not found`);
      }

      const newVersion = existing.version + 1;

      await db.transaction(async (trx) => {
        // Create history entry for current version before updating
        await trx('ai_prompt_history').insert({
          prompt_id: existing.id,
          version: existing.version,
          system_prompt: existing.systemPrompt,
          changed_by: userId,
          change_reason: reason || null,
        });

        // Update the prompt
        await trx('ai_prompts')
          .where('prompt_key', key)
          .update({
            system_prompt: content,
            version: newVersion,
            updated_by: userId,
            updated_at: new Date(),
          });
      });

      // Invalidate cache
      this.invalidateCache(key);

      logger.info(`Prompt "${key}" updated to version ${newVersion}`, {
        promptKey: key,
        newVersion,
        updatedBy: userId,
        reason,
      });

      // Return updated prompt
      const updated = await this.getPromptDetails(key);
      return updated!;

    } catch (error) {
      logger.error(`Error updating prompt "${key}":`, error);
      throw error;
    }
  }

  /**
   * Get version history for a prompt
   */
  async getPromptHistory(key: PromptKey): Promise<AIPromptHistory[]> {
    try {
      const prompt = await this.getPromptDetails(key);
      if (!prompt) {
        throw new Error(`Prompt "${key}" not found`);
      }

      const historyRows = await db('ai_prompt_history')
        .where('prompt_id', prompt.id)
        .orderBy('version', 'desc') as AIPromptHistoryRow[];

      return historyRows.map(r => this.rowToHistory(r));
    } catch (error) {
      logger.error(`Error fetching history for prompt "${key}":`, error);
      throw error;
    }
  }

  /**
   * Revert a prompt to a specific version
   */
  async revertToVersion(
    key: PromptKey,
    version: number,
    userId: string
  ): Promise<AIPrompt> {
    try {
      const prompt = await this.getPromptDetails(key);
      if (!prompt) {
        throw new Error(`Prompt "${key}" not found`);
      }

      // Find the history entry for the target version
      const historyEntry = await db('ai_prompt_history')
        .where('prompt_id', prompt.id)
        .where('version', version)
        .first() as AIPromptHistoryRow | undefined;

      if (!historyEntry) {
        throw new Error(`Version ${version} not found for prompt "${key}"`);
      }

      // Update with the historical content
      return await this.updatePrompt(
        key,
        historyEntry.system_prompt,
        userId,
        `Reverted to version ${version}`
      );
    } catch (error) {
      logger.error(`Error reverting prompt "${key}" to version ${version}:`, error);
      throw error;
    }
  }

  /**
   * Reset a prompt to its default (original hardcoded) version
   */
  async resetToDefault(key: PromptKey, userId: string): Promise<AIPrompt> {
    try {
      const prompt = await this.getPromptDetails(key);
      if (!prompt) {
        throw new Error(`Prompt "${key}" not found`);
      }

      return await this.updatePrompt(
        key,
        prompt.defaultPrompt,
        userId,
        'Reset to default'
      );
    } catch (error) {
      logger.error(`Error resetting prompt "${key}" to default:`, error);
      throw error;
    }
  }

  /**
   * Test a prompt with sample data
   * This sends a dry-run request to Gemini to validate the prompt works
   */
  async testPrompt(
    key: PromptKey,
    content: string,
    testData: PromptTestRequest['testData']
  ): Promise<PromptTestResult> {
    const startTime = Date.now();

    if (!isGeminiConfigured()) {
      return {
        success: false,
        error: 'Gemini AI is not configured. Set GEMINI_API_KEY environment variable.',
        processingTimeMs: Date.now() - startTime,
      };
    }

    try {
      const model = getTextAnalysisModel();

      // Build a test prompt based on the prompt type
      let testPrompt: string;

      switch (key) {
        case 'speech_analysis':
          testPrompt = this.buildSpeechTestPrompt(testData);
          break;
        case 'visual_analysis':
          testPrompt = this.buildVisualTestPrompt(testData);
          break;
        case 'rubric_generation':
          testPrompt = this.buildRubricTestPrompt(testData);
          break;
        default:
          throw new Error(`Unknown prompt key: ${key}`);
      }

      // Call Gemini with the test
      const result = await model.generateContent([
        { text: content }, // The system prompt being tested
        { text: testPrompt },
      ]);

      const response = result.response;
      const responseText = response.text();
      const usageMetadata = response.usageMetadata;

      return {
        success: true,
        response: responseText,
        tokenCount: {
          input: usageMetadata?.promptTokenCount || 0,
          output: usageMetadata?.candidatesTokenCount || 0,
          total: usageMetadata?.totalTokenCount || 0,
        },
        processingTimeMs: Date.now() - startTime,
      };

    } catch (error) {
      logger.error(`Error testing prompt "${key}":`, error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
        processingTimeMs: Date.now() - startTime,
      };
    }
  }

  /**
   * Build test prompt for speech analysis
   */
  private buildSpeechTestPrompt(testData: PromptTestRequest['testData']): string {
    const transcript = testData.transcript || 'Hello, today I will show you how to reset your password. First, click the forgot password link. Then enter your email address and click submit.';
    const steps = testData.rubricSteps || [
      { id: 'step-1', title: 'Greeting', requiredKeywords: ['hello', 'hi'], requiredPhrases: ['introduce the topic'] },
      { id: 'step-2', title: 'Password Reset Steps', requiredKeywords: ['password', 'reset', 'forgot'], requiredPhrases: ['explain the process'] },
    ];

    return `
TRANSCRIPT:
${transcript}

RUBRIC STEPS TO EVALUATE:
${JSON.stringify(steps, null, 2)}

Analyze the transcript and return a JSON response with your evaluation of each step.
`;
  }

  /**
   * Build test prompt for visual analysis
   */
  private buildVisualTestPrompt(testData: PromptTestRequest['testData']): string {
    const frames = testData.frameDescriptions || [
      'Login page with username and password fields, forgot password link visible',
      'Password reset form with email input field and submit button',
      'Success message showing password reset email has been sent',
    ];
    const expected = testData.expectedElements || ['login page', 'forgot password link', 'email input', 'submit button', 'success message'];

    return `
FRAME DESCRIPTIONS:
${frames.map((f, i) => `Frame ${i + 1}: ${f}`).join('\n')}

EXPECTED UI ELEMENTS/ACTIONS:
${expected.map(e => `- ${e}`).join('\n')}

Analyze the frames and return a JSON response indicating which expected elements were found.
`;
  }

  /**
   * Build test prompt for rubric generation
   */
  private buildRubricTestPrompt(testData: PromptTestRequest['testData']): string {
    const transcript = testData.sampleTranscript || 'Hello everyone. Today I will demonstrate how to create a new account. First, navigate to the sign up page by clicking the register button in the top right corner. Then fill in your name, email, and choose a secure password. Finally, click create account and verify your email.';
    const frameCount = testData.frameCount || 3;
    const taskType = testData.taskType || 'Tutorial Demonstration';

    return `
TASK TYPE: ${taskType}

TRANSCRIPT:
${transcript}

KEY FRAMES: ${frameCount} frames were captured showing the registration process.

Please analyze this sample recording and generate:
1. A structured evaluation rubric
2. Clear task requirements/instructions for contributors
`;
  }

  /**
   * Invalidate cache for a specific key or all keys
   */
  invalidateCache(key?: PromptKey): void {
    if (key) {
      this.cache.delete(key);
    } else {
      this.cache.clear();
    }
  }
}

export const aiPromptsService = new AIPromptsService();
export default aiPromptsService;
