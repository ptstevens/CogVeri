import { z } from 'zod';

/**
 * Rubric validation schemas using Zod.
 * These schemas validate evaluation criteria and rubric structures
 * for AI-powered video analysis.
 */

// =============================================================================
// Evidence Type Schema
// =============================================================================

export const evidenceTypeSchema = z.enum(['speech', 'visual', 'both']);

// =============================================================================
// Speech Criteria Schema
// =============================================================================

export const speechCriteriaSchema = z.object({
  requiredKeywords: z
    .array(z.string().min(1).max(100).trim())
    .min(0)
    .max(50)
    .default([]),
  requiredPhrases: z
    .array(z.string().min(1).max(500).trim())
    .min(0)
    .max(20)
    .default([]),
  optionalKeywords: z
    .array(z.string().min(1).max(100).trim())
    .max(50)
    .optional(),
  matchThreshold: z.number().min(0).max(1).optional(),
});

// =============================================================================
// Visual Criteria Schema
// =============================================================================

export const visualCriteriaSchema = z.object({
  expectedElements: z
    .array(z.string().min(1).max(200).trim())
    .min(0)
    .max(30)
    .default([]),
  expectedActions: z
    .array(z.string().min(1).max(200).trim())
    .min(0)
    .max(30)
    .default([]),
});

// =============================================================================
// Rubric Step Schema
// =============================================================================

export const rubricStepSchema = z.object({
  id: z.string().min(1).max(50),
  order: z.number().int().min(1).max(100),
  title: z.string().min(1).max(200).trim(),
  description: z.string().max(2000).trim().default(''),
  evidenceType: evidenceTypeSchema,
  speechCriteria: speechCriteriaSchema.optional(),
  visualCriteria: visualCriteriaSchema.optional(),
  weight: z.number().int().min(1).max(10).default(5),
  isRequired: z.boolean().default(true),
}).refine(
  (data) => {
    // If evidenceType includes speech, speechCriteria should have content
    if (data.evidenceType === 'speech' || data.evidenceType === 'both') {
      const speech = data.speechCriteria;
      if (!speech) return true; // Will be validated by optional
      return speech.requiredKeywords.length > 0 || speech.requiredPhrases.length > 0;
    }
    return true;
  },
  {
    message: 'Speech criteria must have at least one keyword or phrase when speech evidence is selected',
    path: ['speechCriteria'],
  }
).refine(
  (data) => {
    // If evidenceType includes visual, visualCriteria should have content
    if (data.evidenceType === 'visual' || data.evidenceType === 'both') {
      const visual = data.visualCriteria;
      if (!visual) return true; // Will be validated by optional
      return visual.expectedElements.length > 0 || visual.expectedActions.length > 0;
    }
    return true;
  },
  {
    message: 'Visual criteria must have at least one element or action when visual evidence is selected',
    path: ['visualCriteria'],
  }
);

// =============================================================================
// Evaluation Criteria Schema (Full Rubric)
// =============================================================================

export const evaluationCriteriaSchema = z.object({
  version: z.string().default('1.0'),
  rubricSteps: z
    .array(rubricStepSchema)
    .min(1, 'At least one rubric step is required')
    .max(50, 'Maximum 50 rubric steps allowed'),
  passingScore: z.number().min(0).max(100).default(70),
  scoringMethod: z.enum(['weighted', 'equal']).default('weighted'),
  autoAnalyze: z.boolean().default(true),
}).refine(
  (data) => {
    // Verify step orders are unique and sequential
    const orders = data.rubricSteps.map(s => s.order);
    const uniqueOrders = new Set(orders);
    return uniqueOrders.size === orders.length;
  },
  {
    message: 'Rubric step orders must be unique',
    path: ['rubricSteps'],
  }
).refine(
  (data) => {
    // Verify step IDs are unique
    const ids = data.rubricSteps.map(s => s.id);
    const uniqueIds = new Set(ids);
    return uniqueIds.size === ids.length;
  },
  {
    message: 'Rubric step IDs must be unique',
    path: ['rubricSteps'],
  }
);

// =============================================================================
// API Request Schemas
// =============================================================================

// Create/Update rubric schema (for templates)
export const createRubricSchema = z.object({
  evaluationCriteria: evaluationCriteriaSchema,
});

// Base schema without refinements for partial updates
const evaluationCriteriaBaseSchema = z.object({
  version: z.string().optional(),
  rubricSteps: z.array(rubricStepSchema).optional(),
  passingScore: z.number().min(0).max(100).optional(),
  scoringMethod: z.enum(['weighted', 'equal']).optional(),
  autoAnalyze: z.boolean().optional(),
});

// Partial update (for auto-save)
export const updateRubricSchema = z.object({
  evaluationCriteria: evaluationCriteriaBaseSchema,
});

// Trigger analysis manually
export const triggerAnalysisSchema = z.object({
  rubricId: z.string().uuid().optional(),
  force: z.boolean().optional().default(false),
});

// UUID param
const uuidSchema = z.string().uuid('Invalid UUID format');

export const templateIdParamSchema = z.object({
  templateId: uuidSchema,
});

export const recordingIdParamSchema = z.object({
  recordingId: uuidSchema,
});

// =============================================================================
// Analysis Job Schemas
// =============================================================================

export const analysisJobStatusSchema = z.enum([
  'pending',
  'extracting_frames',
  'analyzing_speech',
  'analyzing_visual',
  'combining_results',
  'completed',
  'failed',
  'cancelled',
]);

export const analysisVerdictSchema = z.enum([
  'PASS',
  'PARTIAL_PASS',
  'FAIL',
  'NEEDS_REVIEW',
]);

export const stepScoreSchema = z.enum([
  'YES',
  'PARTIAL',
  'NO',
  'UNABLE_TO_ASSESS',
]);

// =============================================================================
// Type Exports
// =============================================================================

export type EvidenceType = z.infer<typeof evidenceTypeSchema>;
export type SpeechCriteria = z.infer<typeof speechCriteriaSchema>;
export type VisualCriteria = z.infer<typeof visualCriteriaSchema>;
export type RubricStep = z.infer<typeof rubricStepSchema>;
export type EvaluationCriteria = z.infer<typeof evaluationCriteriaSchema>;
export type CreateRubricInput = z.infer<typeof createRubricSchema>;
export type UpdateRubricInput = z.infer<typeof updateRubricSchema>;
export type TriggerAnalysisInput = z.infer<typeof triggerAnalysisSchema>;
export type AnalysisJobStatus = z.infer<typeof analysisJobStatusSchema>;
export type AnalysisVerdict = z.infer<typeof analysisVerdictSchema>;
export type StepScore = z.infer<typeof stepScoreSchema>;
