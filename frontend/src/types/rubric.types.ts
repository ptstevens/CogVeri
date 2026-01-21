/**
 * Rubric and AI Analysis Type Definitions
 * Shared types for the rubric builder and analysis results display
 */

// =============================================================================
// Evidence Types
// =============================================================================

/** Evidence types that can be evaluated */
export type EvidenceType = 'speech' | 'visual' | 'both';

/** Status of step completion in analysis */
export type StepCompletionStatus = 'completed' | 'partial' | 'missing';

/** Analysis verdict */
export type AnalysisVerdict = 'PASS' | 'PARTIAL_PASS' | 'FAIL' | 'NEEDS_REVIEW';

// =============================================================================
// Rubric Criteria Types
// =============================================================================

/** Speech-based evaluation criteria */
export interface SpeechCriteria {
  /** Keywords that must be spoken (case-insensitive) */
  requiredKeywords: string[];
  /** Exact phrases that should appear in transcript */
  requiredPhrases: string[];
  /** Keywords that indicate partial completion */
  optionalKeywords?: string[];
  /** Minimum keyword match threshold (0-1) */
  matchThreshold?: number;
}

/** Visual/UI-based evaluation criteria */
export interface VisualCriteria {
  /** UI elements that should be visible/interacted with */
  expectedElements: string[];
  /** Actions that should be performed */
  expectedActions: string[];
}

// =============================================================================
// Rubric Step Types
// =============================================================================

/** Single step/requirement in a rubric */
export interface RubricStep {
  id: string;
  /** Order in the rubric (1-indexed for display) */
  order: number;
  /** Step title */
  title: string;
  /** Detailed description of what this step evaluates */
  description: string;
  /** Type of evidence to evaluate */
  evidenceType: EvidenceType;
  /** Speech-based criteria (when evidenceType is 'speech' or 'both') */
  speechCriteria?: SpeechCriteria;
  /** Visual-based criteria (when evidenceType is 'visual' or 'both') */
  visualCriteria?: VisualCriteria;
  /** Weight for scoring (1-10, default 5) */
  weight: number;
  /** Whether this step is required for pass/fail */
  isRequired: boolean;
  /** UI state for collapsed/expanded in builder */
  isCollapsed?: boolean;
}

// =============================================================================
// Evaluation Criteria Types (stored in task_templates.evaluation_criteria)
// =============================================================================

/** Complete evaluation criteria attached to a task template */
export interface EvaluationCriteria {
  /** Schema version for migrations */
  version: string;
  /** Ordered list of evaluation steps */
  rubricSteps: RubricStep[];
  /** Passing score threshold (0-100) */
  passingScore: number;
  /** Scoring method */
  scoringMethod: 'weighted' | 'equal';
  /** Whether to auto-analyze after transcription completes */
  autoAnalyze: boolean;
}

// =============================================================================
// Task Requirements (generated alongside rubric)
// =============================================================================

/** Task requirements/instructions generated from video analysis */
export interface TaskRequirements {
  /** Clear, actionable task title */
  title: string;
  /** Brief 1-2 sentence summary */
  description: string;
  /** Must-do items shown to contributors */
  requirements: string[];
  /** Helpful tips for better results */
  tips: string[];
  /** Expected time to complete (e.g., "2-3 minutes") */
  estimatedDuration: string;
}

// =============================================================================
// Analysis Evidence Types
// =============================================================================

/** Time range for evidence */
export interface EvidenceTimestamp {
  start: number;
  end?: number;
}

/** Evidence from transcript analysis (UI-friendly format) */
export interface TranscriptEvidence {
  /** Keywords that were found in the transcript */
  keywordsFound: string[];
  /** Relevant transcript excerpts */
  excerpts: string[];
  /** Timestamps where evidence was found */
  timestamps: EvidenceTimestamp[];
}

/** Evidence from visual analysis (UI-friendly format) */
export interface VisualEvidence {
  /** UI elements that were detected */
  detectedElements: string[];
  /** Actions that were detected */
  detectedActions: string[];
  /** URLs to key frame images */
  frameUrls: string[];
  /** Timestamps where evidence was found (in seconds) */
  timestamps: number[];
}

// =============================================================================
// Analysis Result Types
// =============================================================================

/** Result for a single rubric step */
export interface StepAnalysisResult {
  /** The rubric step ID this result is for */
  stepId: string;
  /** Step order (1-indexed) */
  stepOrder: number;
  /** Step title */
  stepTitle: string;
  /** Step description */
  stepDescription?: string;
  /** Completion status */
  status: StepCompletionStatus;
  /** Score for this step (0-100) */
  score: number;
  /** Overall confidence in the analysis (0-1) */
  confidence: number;
  /** Transcript evidence found */
  transcriptEvidence?: TranscriptEvidence;
  /** Visual evidence found */
  visualEvidence?: VisualEvidence;
  /** AI reasoning for this assessment */
  aiReasoning?: string;
  /** First timestamp where step was detected (if any) */
  detectedAt?: number;
  /** End timestamp of step completion (if applicable) */
  completedAt?: number;
}

/** A step that was missed in the analysis */
export interface MissedStep {
  /** The rubric step ID */
  stepId: string;
  /** Step order (1-indexed) */
  stepOrder: number;
  /** Step title */
  stepTitle: string;
  /** Step description */
  stepDescription?: string;
  /** AI-generated suggestion for how to complete this step */
  suggestion?: string;
}

/** Coaching suggestion for improvement */
export interface CoachingSuggestion {
  /** Which step this suggestion relates to */
  stepId: string;
  /** Severity of the issue */
  priority: 'high' | 'medium' | 'low';
  /** The suggestion title */
  title: string;
  /** Detailed suggestion text */
  description: string;
  /** Example of what to do */
  example?: string;
}

/** Complete analysis results for a recording */
export interface AnalysisResults {
  /** Unique identifier */
  id: string;
  /** Recording that was analyzed */
  recordingId: string;
  /** Task that was analyzed */
  taskId: string;
  /** When analysis was performed */
  analyzedAt: string;
  /** Analysis model/version used */
  analysisVersion: string;

  // Scores
  /** Overall score (0-100) */
  overallScore: number;
  /** Overall verdict */
  overallVerdict: AnalysisVerdict;
  /** Whether the passing threshold was met */
  passed: boolean;
  /** Confidence in the overall result */
  overallConfidence: number;
  /** Weighted vs raw score breakdown */
  scoreBreakdown: {
    weightedScore: number;
    rawScore: number;
    stepsCompleted: number;
    stepsTotal: number;
    requiredStepsCompleted: number;
    requiredStepsTotal: number;
  };

  // Per-step results
  /** Results for each rubric step */
  stepResults: StepAnalysisResult[];

  // Summary
  /** Steps that were fully completed (step IDs) */
  completedSteps: string[];
  /** Steps with partial completion (step IDs) */
  partialSteps: string[];
  /** Steps that were missed with details */
  missedSteps: MissedStep[];

  // Coaching
  /** AI-generated improvement suggestions */
  coachingSuggestions: CoachingSuggestion[];

  // Summary text
  /** AI-generated summary */
  summaryText: string;
  /** Strengths identified */
  strengths: string[];
  /** Areas for improvement */
  improvements: string[];

  // Metadata
  /** Processing time in milliseconds */
  processingTimeMs: number;
  /** Total duration of recording analyzed */
  recordingDuration: number;
}

/** Analysis job status */
export type AnalysisJobStatus =
  | 'pending'
  | 'extracting_frames'
  | 'analyzing_speech'
  | 'analyzing_visual'
  | 'combining_results'
  | 'completed'
  | 'failed'
  | 'cancelled';

/** Analysis job progress info */
export interface AnalysisJobProgress {
  status: AnalysisJobStatus;
  progress: number;
  stage: string;
  message?: string;
  framesExtracted?: number;
  framesAnalyzed?: number;
  speechAnalysisComplete?: boolean;
  visualAnalysisComplete?: boolean;
}

// =============================================================================
// Timeline Types (for results visualization)
// =============================================================================

/** Timeline marker for visualization */
export interface TimelineMarker {
  stepId: string;
  stepTitle: string;
  status: StepCompletionStatus;
  startTime: number;
  endTime?: number;
  /** Position on timeline as percentage (0-100) */
  position: number;
}

// =============================================================================
// Rubric Builder State Types
// =============================================================================

/** State for rubric builder context */
export interface RubricBuilderState {
  evaluationCriteria: EvaluationCriteria;
  isDirty: boolean;
  validationErrors: Record<string, string[]>;
  activeStepId: string | null;
  previewMode: boolean;
}

/** Actions for rubric builder reducer */
export type RubricBuilderAction =
  | { type: 'SET_CRITERIA'; payload: EvaluationCriteria }
  | { type: 'UPDATE_METADATA'; payload: Partial<EvaluationCriteria> }
  | { type: 'ADD_STEP'; payload?: Partial<RubricStep> }
  | { type: 'UPDATE_STEP'; payload: { id: string; updates: Partial<RubricStep> } }
  | { type: 'DELETE_STEP'; payload: string }
  | { type: 'DUPLICATE_STEP'; payload: string }
  | { type: 'REORDER_STEPS'; payload: { activeId: string; overId: string } }
  | { type: 'SET_ACTIVE_STEP'; payload: string | null }
  | { type: 'TOGGLE_PREVIEW'; payload?: boolean }
  | { type: 'RESET_DIRTY' }
  | { type: 'SET_VALIDATION_ERRORS'; payload: Record<string, string[]> };
