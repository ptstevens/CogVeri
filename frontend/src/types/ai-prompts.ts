/**
 * Types for AI Prompts management (Frontend)
 */

export type PromptKey = 'speech_analysis' | 'visual_analysis' | 'rubric_generation';

export interface AIPrompt {
  id: string;
  promptKey: PromptKey;
  displayName: string;
  description: string | null;
  systemPrompt: string;
  defaultPrompt: string;
  version: number;
  isActive: boolean;
  updatedBy: string | null;
  updatedAt: string; // ISO date string
  createdAt: string;
}

export interface AIPromptHistory {
  id: string;
  promptId: string;
  version: number;
  systemPrompt: string;
  changedBy: string | null;
  changeReason: string | null;
  createdAt: string;
}

export interface AIPromptWithHistory extends AIPrompt {
  history: AIPromptHistory[];
}

export interface AIPromptListItem {
  id: string;
  promptKey: PromptKey;
  displayName: string;
  description: string | null;
  version: number;
  isActive: boolean;
  updatedAt: string;
  characterCount: number;
}

export interface UpdatePromptData {
  systemPrompt: string;
  reason?: string;
}

export interface PromptTestRequest {
  systemPrompt: string;
  testData?: {
    // For speech_analysis
    transcript?: string;
    rubricSteps?: Array<{
      id: string;
      title: string;
      requiredKeywords?: string[];
      requiredPhrases?: string[];
    }>;
    // For visual_analysis
    frameDescriptions?: string[];
    expectedElements?: string[];
    // For rubric_generation
    sampleTranscript?: string;
    frameCount?: number;
    taskType?: string;
  };
}

export interface PromptTestResult {
  success: boolean;
  response?: string;
  tokenCount?: {
    input: number;
    output: number;
    total: number;
  };
  processingTimeMs: number;
  error?: string;
}

export interface PromptTestResponse {
  success: boolean;
  result: PromptTestResult;
}

// API Response types
export interface GetAllPromptsResponse {
  success: boolean;
  prompts: AIPromptListItem[];
}

export interface GetPromptResponse {
  success: boolean;
  prompt: AIPromptWithHistory;
}

export interface GetPromptHistoryResponse {
  success: boolean;
  history: AIPromptHistory[];
}

export interface UpdatePromptResponse {
  success: boolean;
  message: string;
  prompt: AIPrompt;
}

export interface RevertPromptResponse {
  success: boolean;
  message: string;
  prompt: AIPrompt;
}

export interface ResetPromptResponse {
  success: boolean;
  message: string;
  prompt: AIPrompt;
}

// Helper to get prompt display name
export const PROMPT_DISPLAY_NAMES: Record<PromptKey, string> = {
  speech_analysis: 'Speech Analysis',
  visual_analysis: 'Visual Analysis',
  rubric_generation: 'Rubric Generation',
};

// Helper to get prompt descriptions
export const PROMPT_DESCRIPTIONS: Record<PromptKey, string> = {
  speech_analysis: 'Evaluates transcripts against rubric criteria',
  visual_analysis: 'Analyzes video frames for UI elements and actions',
  rubric_generation: 'Generates evaluation rubrics from sample videos',
};
