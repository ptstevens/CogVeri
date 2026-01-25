/**
 * Types for AI Prompts management
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
  updatedAt: Date;
  createdAt: Date;
}

export interface AIPromptHistory {
  id: string;
  promptId: string;
  version: number;
  systemPrompt: string;
  changedBy: string | null;
  changeReason: string | null;
  createdAt: Date;
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
  updatedAt: Date;
  characterCount: number;
}

export interface UpdatePromptData {
  systemPrompt: string;
  reason?: string;
}

export interface PromptTestRequest {
  systemPrompt: string;
  testData: {
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

// Database row types (snake_case from DB)
export interface AIPromptRow {
  id: string;
  prompt_key: PromptKey;
  display_name: string;
  description: string | null;
  system_prompt: string;
  default_prompt: string;
  version: number;
  is_active: boolean;
  updated_by: string | null;
  updated_at: Date;
  created_at: Date;
}

export interface AIPromptHistoryRow {
  id: string;
  prompt_id: string;
  version: number;
  system_prompt: string;
  changed_by: string | null;
  change_reason: string | null;
  created_at: Date;
}
