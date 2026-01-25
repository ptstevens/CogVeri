/**
 * AI Prompts Service (Frontend)
 *
 * API client for managing AI system prompts used by Gemini for analysis.
 */

import api from './api';
import {
  PromptKey,
  AIPromptListItem,
  AIPromptWithHistory,
  AIPromptHistory,
  AIPrompt,
  UpdatePromptData,
  PromptTestResult,
  GetAllPromptsResponse,
  GetPromptResponse,
  GetPromptHistoryResponse,
  UpdatePromptResponse,
  RevertPromptResponse,
  ResetPromptResponse,
  PromptTestResponse,
} from '../types/ai-prompts';

const BASE_PATH = '/admin/ai-prompts';

export const AIPromptsService = {
  /**
   * Get all prompts (list view)
   */
  async getAllPrompts(): Promise<AIPromptListItem[]> {
    const response = await api.get<GetAllPromptsResponse>(BASE_PATH);
    return response.data.prompts;
  },

  /**
   * Get prompt details with history
   */
  async getPrompt(key: PromptKey): Promise<AIPromptWithHistory> {
    const response = await api.get<GetPromptResponse>(`${BASE_PATH}/${key}`);
    return response.data.prompt;
  },

  /**
   * Get prompt history
   */
  async getPromptHistory(key: PromptKey): Promise<AIPromptHistory[]> {
    const response = await api.get<GetPromptHistoryResponse>(`${BASE_PATH}/${key}/history`);
    return response.data.history;
  },

  /**
   * Update prompt
   */
  async updatePrompt(key: PromptKey, data: UpdatePromptData): Promise<AIPrompt> {
    const response = await api.put<UpdatePromptResponse>(`${BASE_PATH}/${key}`, data);
    return response.data.prompt;
  },

  /**
   * Revert prompt to a specific version
   */
  async revertToVersion(key: PromptKey, version: number): Promise<AIPrompt> {
    const response = await api.post<RevertPromptResponse>(`${BASE_PATH}/${key}/revert`, { version });
    return response.data.prompt;
  },

  /**
   * Reset prompt to default
   */
  async resetToDefault(key: PromptKey): Promise<AIPrompt> {
    const response = await api.post<ResetPromptResponse>(`${BASE_PATH}/${key}/reset`);
    return response.data.prompt;
  },

  /**
   * Test prompt with sample data
   * Note: Rate limited to 1 request per 10 seconds
   */
  async testPrompt(
    key: PromptKey,
    systemPrompt: string,
    testData?: Record<string, unknown>
  ): Promise<PromptTestResult> {
    const response = await api.post<PromptTestResponse>(`${BASE_PATH}/${key}/test`, {
      systemPrompt,
      testData: testData || {},
    });
    return response.data.result;
  },
};

export default AIPromptsService;
