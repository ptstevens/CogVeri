/**
 * Database Row Type Definitions
 *
 * Typed interfaces for common DB query results.
 * Used to replace `any` in service and controller files.
 */

// ─── Analysis ─────────────────────────────────────────────────────────────────

export interface AnalysisStepScoreRow {
  id: string;
  analysis_result_id: string;
  rubric_step_id: string;
  step_title: string;
  score: 'YES' | 'PARTIAL' | 'NO';
  numeric_score: number;
  weighted_score: number;
  confidence: number;
  speech_evidence: SpeechEvidenceData | null;
  visual_evidence: VisualEvidenceData | null;
  ai_reasoning: string | null;
  created_at: Date;
}

export interface SpeechEvidenceData {
  found: boolean;
  matchedKeywords?: string[];
  relevantExcerpts?: Array<{
    text: string;
    timestamp?: number;
    endTimestamp?: number;
  }>;
}

export interface VisualEvidenceData {
  found: boolean;
  elementsDetected?: Array<{
    element: string;
    frameTimestamp?: number;
  }>;
  actionsDetected?: Array<{
    action: string;
    frameTimestamp?: number;
  }>;
}

export interface AnalysisResultRow {
  id: string;
  analysis_job_id: string;
  recording_id: string;
  task_id: string | null;
  overall_score: number;
  overall_verdict: string;
  confidence: number;
  steps_passed: number;
  steps_total: number;
  summary_text: string | null;
  strengths: string[] | null;
  improvements: string[] | null;
  created_at: Date;
}

export interface RubricStepRow {
  id: string;
  title: string;
  description: string | null;
  weight: number;
  isRequired: boolean;
  evidenceType: 'speech' | 'visual' | 'both';
}

// ─── Dashboard / Cohort ───────────────────────────────────────────────────────

export interface CohortTaskRow {
  task_id: string;
  task_title: string;
  analysis_count: string;
  avg_score: string;
  pass_rate: string;
  score_80_plus: string;
  score_60_79: string;
  score_40_59: string;
  score_below_40: string;
}

export interface CohortTopPerformerRow {
  task_id: string;
  name: string;
  overall_score: string;
}

export interface CohortLeaderboardRow {
  user_id: string;
  name: string;
  analyses_count: string;
  avg_score: string;
  pass_rate: string;
}

export interface CohortOrgSummaryRow {
  total_analyses: string;
  avg_score: string;
  pass_rate: string;
  partial_rate: string;
  fail_rate: string;
}

export interface ExportDataRow {
  task_title: string;
  task_status: string;
  task_created_at: string;
  submitted_at: string | null;
  completed_at: string | null;
  assignee_name: string;
  assignee_email: string;
  recording_duration_seconds: number | null;
  analysis_score: string | null;
  analysis_verdict: string | null;
  steps_passed: number | null;
  steps_total: number | null;
}

// ─── Dashboard Stats ──────────────────────────────────────────────────────────

export interface DashboardStatsRow {
  total_tasks: string;
  completed_tasks: string;
  pending_tasks: string;
  in_progress_tasks: string;
}

export interface ActivityRow {
  id: string;
  type: string;
  description: string;
  user_name: string;
  created_at: Date;
  metadata: Record<string, unknown> | null;
}
