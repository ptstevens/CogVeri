# Rubric and AI Video Analysis System

This document provides comprehensive technical documentation for the rubric creation and AI-powered video analysis/scoring system in CogVeri.

## Table of Contents

1. [Overview](#overview)
2. [Data Model](#data-model)
3. [Rubric System](#rubric-system)
4. [AI Analysis Pipeline](#ai-analysis-pipeline)
5. [Scoring Algorithm](#scoring-algorithm)
6. [API Endpoints](#api-endpoints)
7. [Frontend Components](#frontend-components)
8. [Job Queue System](#job-queue-system)
9. [Configuration](#configuration)
10. [Flow Diagrams](#flow-diagrams)

---

## Overview

The CogVeri platform uses AI-powered video analysis to evaluate screen recordings against configurable rubrics. The system:

1. **Rubrics** are attached to task templates and define evaluation criteria
2. **Analysis** runs after transcription completes (automatically or manually triggered)
3. **Speech Analysis** uses Google Gemini to evaluate transcript against speech criteria
4. **Visual Analysis** extracts keyframes and uses Gemini Vision to evaluate UI elements/actions
5. **Scoring** combines results to produce an overall verdict (PASS, PARTIAL_PASS, FAIL, NEEDS_REVIEW)

### Key Technologies

- **Backend**: Express.js, PostgreSQL, BullMQ (Redis)
- **AI Provider**: Google Gemini (gemini-2.0-flash-exp)
- **Frame Extraction**: FFmpeg
- **Storage**: S3-compatible (AWS S3 / Cloudflare R2)

---

## Data Model

### Database Schema

#### `task_templates` Table

Stores task templates including evaluation criteria (rubrics).

```sql
CREATE TABLE task_templates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title VARCHAR(255) NOT NULL,
  description TEXT,
  category VARCHAR(100),
  icon_emoji TEXT DEFAULT '...',
  organization_id UUID REFERENCES organizations(id) ON DELETE CASCADE,
  type ENUM ('recording', 'live_demo', 'hybrid') NOT NULL DEFAULT 'recording',
  instructions TEXT,
  min_duration_seconds INTEGER,
  max_duration_seconds INTEGER,
  required_features JSONB,
  evaluation_criteria JSONB,  -- Contains the rubric
  priority ENUM ('low', 'medium', 'high', 'urgent') NOT NULL DEFAULT 'medium',
  tags TEXT[],
  metadata JSONB,
  created_by UUID NOT NULL REFERENCES users(id),
  is_active BOOLEAN DEFAULT true,
  is_system_default BOOLEAN DEFAULT false,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);
```

#### `analysis_jobs` Table

Tracks analysis job lifecycle and progress.

```sql
CREATE TYPE analysis_job_status AS ENUM (
  'pending',
  'extracting_frames',
  'analyzing_speech',
  'analyzing_visual',
  'combining_results',
  'completed',
  'failed',
  'cancelled'
);

CREATE TABLE analysis_jobs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  recording_id UUID NOT NULL REFERENCES recordings(id) ON DELETE CASCADE,
  task_id UUID NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  triggered_by_user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  status analysis_job_status NOT NULL DEFAULT 'pending',
  total_frames_extracted INTEGER DEFAULT 0,
  frames_analyzed INTEGER DEFAULT 0,
  speech_analysis_complete BOOLEAN DEFAULT false,
  visual_analysis_complete BOOLEAN DEFAULT false,
  progress INTEGER NOT NULL DEFAULT 0,  -- 0-100
  stage VARCHAR(50),
  progress_message TEXT,
  started_at TIMESTAMP,
  completed_at TIMESTAMP,
  processing_duration_seconds FLOAT,
  error_message TEXT,
  retry_count INTEGER NOT NULL DEFAULT 0,
  max_retries INTEGER NOT NULL DEFAULT 2,
  ai_tokens_used INTEGER DEFAULT 0,
  ai_api_calls INTEGER DEFAULT 0,
  estimated_cost_usd DECIMAL(10, 6) DEFAULT 0,
  queue_job_id VARCHAR(100),
  config_snapshot JSONB,  -- Rubric snapshot at analysis time
  model_used VARCHAR(100),
  analysis_version VARCHAR(20),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);
```

#### `analysis_step_scores` Table

Per-rubric-step evaluation results with evidence.

```sql
CREATE TYPE analysis_step_score AS ENUM (
  'YES',
  'PARTIAL',
  'NO',
  'UNABLE_TO_ASSESS'
);

CREATE TABLE analysis_step_scores (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  analysis_job_id UUID NOT NULL REFERENCES analysis_jobs(id) ON DELETE CASCADE,
  rubric_step_id VARCHAR(50) NOT NULL,
  step_order INTEGER NOT NULL,
  step_title VARCHAR(255) NOT NULL,
  score analysis_step_score NOT NULL,
  confidence FLOAT,  -- 0.0 - 1.0
  weighted_score FLOAT,  -- Score * weight / max_possible
  speech_evidence JSONB,
  visual_evidence JSONB,
  ai_reasoning TEXT,
  detected_at_seconds FLOAT,
  completed_at_seconds FLOAT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  UNIQUE(analysis_job_id, rubric_step_id)
);
```

**Speech Evidence Structure:**
```typescript
interface SpeechEvidence {
  keywordsFound: string[];
  keywordsMissing: string[];
  relevantExcerpts: Array<{
    text: string;
    startTime: number;
    endTime: number;
  }>;
  speechScore: 'YES' | 'PARTIAL' | 'NO';
  speechConfidence: number;
}
```

**Visual Evidence Structure:**
```typescript
interface VisualEvidence {
  elementsDetected: Array<{
    element: string;
    frameTimestamp: number;
    confidence: number;
  }>;
  elementsMissing: string[];
  actionsDetected: Array<{
    action: string;
    frameTimestamp: number;
    confidence: number;
  }>;
  actionsMissing: string[];
  representativeFrameUrl?: string;
  visualScore: 'YES' | 'PARTIAL' | 'NO';
  visualConfidence: number;
}
```

#### `analysis_results` Table

Overall analysis summary and verdict.

```sql
CREATE TYPE analysis_verdict AS ENUM (
  'PASS',
  'PARTIAL_PASS',
  'FAIL',
  'NEEDS_REVIEW'
);

CREATE TABLE analysis_results (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  analysis_job_id UUID NOT NULL UNIQUE REFERENCES analysis_jobs(id) ON DELETE CASCADE,
  recording_id UUID NOT NULL REFERENCES recordings(id) ON DELETE CASCADE,
  task_id UUID NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
  overall_score FLOAT,  -- 0-100
  overall_verdict analysis_verdict,
  overall_confidence FLOAT,  -- 0.0 - 1.0
  steps_passed INTEGER DEFAULT 0,
  steps_partial INTEGER DEFAULT 0,
  steps_failed INTEGER DEFAULT 0,
  steps_total INTEGER DEFAULT 0,
  summary_text TEXT,
  strengths JSONB,  -- string[]
  improvements JSONB,  -- string[]
  processing_time_seconds FLOAT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);
```

#### `analysis_frames` Table

Extracted keyframes for visual analysis.

```sql
CREATE TABLE analysis_frames (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  analysis_job_id UUID NOT NULL REFERENCES analysis_jobs(id) ON DELETE CASCADE,
  frame_index INTEGER NOT NULL,
  timestamp_seconds FLOAT NOT NULL,
  frame_url VARCHAR(500) NOT NULL,
  storage_key VARCHAR(500),
  file_size_bytes INTEGER,
  width INTEGER,
  height INTEGER,
  analysis_result JSONB,
  is_keyframe BOOLEAN DEFAULT false,
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  UNIQUE(analysis_job_id, frame_index)
);
```

#### `recordings` Table Addition

The recordings table has an `analysis_status` column:

```sql
CREATE TYPE recording_analysis_status AS ENUM (
  'none',
  'pending',
  'processing',
  'completed',
  'failed'
);

ALTER TABLE recordings ADD COLUMN analysis_status recording_analysis_status NOT NULL DEFAULT 'none';
```

---

## Rubric System

### Evaluation Criteria Schema

Rubrics are stored in `task_templates.evaluation_criteria` as JSONB. The schema is defined in:
- Backend: `/backend/src/schemas/rubric.schema.ts`
- Frontend: `/frontend/src/types/rubric.types.ts`

```typescript
interface EvaluationCriteria {
  version: string;              // Schema version (e.g., "1.0")
  rubricSteps: RubricStep[];    // Ordered list of evaluation steps
  passingScore: number;         // Passing threshold (0-100), default: 70
  scoringMethod: 'weighted' | 'equal';  // How to calculate overall score
  autoAnalyze: boolean;         // Auto-analyze after transcription
}

interface RubricStep {
  id: string;                   // Unique identifier (UUID)
  order: number;                // Display order (1-indexed)
  title: string;                // Step title (1-200 chars)
  description: string;          // Detailed description (max 2000 chars)
  evidenceType: 'speech' | 'visual' | 'both';
  speechCriteria?: SpeechCriteria;
  visualCriteria?: VisualCriteria;
  weight: number;               // 1-10, default: 5
  isRequired: boolean;          // If true, failure = overall FAIL
}

interface SpeechCriteria {
  requiredKeywords: string[];   // Keywords that must be spoken
  requiredPhrases: string[];    // Exact phrases to find in transcript
  optionalKeywords?: string[];  // Partial completion indicators
  matchThreshold?: number;      // 0-1, minimum match ratio
}

interface VisualCriteria {
  expectedElements: string[];   // UI elements to detect
  expectedActions: string[];    // Actions to detect (clicks, navigation)
}
```

### Validation Rules

The backend validates rubrics using Zod schemas:

```typescript
// From /backend/src/schemas/rubric.schema.ts

const rubricStepSchema = z.object({
  id: z.string().min(1).max(50),
  order: z.number().int().min(1).max(100),
  title: z.string().min(1).max(200).trim(),
  description: z.string().max(2000).trim().default(''),
  evidenceType: z.enum(['speech', 'visual', 'both']),
  speechCriteria: speechCriteriaSchema.optional(),
  visualCriteria: visualCriteriaSchema.optional(),
  weight: z.number().int().min(1).max(10).default(5),
  isRequired: z.boolean().default(true),
}).refine(
  // Speech criteria must have content when evidenceType includes speech
  // Visual criteria must have content when evidenceType includes visual
);

const evaluationCriteriaSchema = z.object({
  version: z.string().default('1.0'),
  rubricSteps: z.array(rubricStepSchema).min(1).max(50),
  passingScore: z.number().min(0).max(100).default(70),
  scoringMethod: z.enum(['weighted', 'equal']).default('weighted'),
  autoAnalyze: z.boolean().default(true),
}).refine(
  // Step orders must be unique
  // Step IDs must be unique
);
```

---

## AI Analysis Pipeline

### Pipeline Architecture

```
Recording Completed
        |
        v
Transcription Complete
        |
        v (if autoAnalyze=true OR manual trigger)
+-------+-------+
|               |
v               v
Analysis Queue  (BullMQ)
        |
        v
+---------------+
| Analysis Job  |
+---------------+
        |
        +---> 1. Speech Analysis (Gemini Text)
        |           |
        |           v
        |     Transcript + Rubric Speech Criteria
        |           |
        |           v
        |     SpeechAnalysisResult[]
        |
        +---> 2. Frame Extraction (FFmpeg)
        |           |
        |           v
        |     Hybrid: Interval + Scene Detection
        |           |
        |           v
        |     ExtractedFrame[] -> S3 Upload
        |
        +---> 3. Visual Analysis (Gemini Vision)
        |           |
        |           v
        |     Frames + Rubric Visual Criteria
        |           |
        |           v
        |     VisualAnalysisResult[]
        |
        v
4. Combine Results
        |
        v
5. Calculate Verdict
        |
        v
Store Results (analysis_results, analysis_step_scores)
```

### Stage 1: Speech Analysis

**Service:** `/backend/src/services/analysis/speech-analysis.service.ts`

```typescript
class SpeechAnalysisService {
  async analyzeTranscript(
    transcriptText: string,
    segments: TranscriptSegment[],
    rubricSteps: RubricStep[]
  ): Promise<SpeechAnalysisResponse>
}
```

**Process:**
1. Filter rubric steps with `evidenceType === 'speech' || evidenceType === 'both'`
2. Build prompt with transcript text, segments (with timestamps), and speech criteria
3. Send to Gemini (`gemini-2.0-flash-exp`) with system prompt
4. Parse JSON response into `SpeechAnalysisResult[]`
5. Fallback to simple keyword matching if AI fails

**Prompt Template:**
```typescript
// System prompt instructs Gemini to:
// - Search for required keywords and phrases in transcript
// - Find relevant excerpts with timestamps
// - Assign score: YES (fully met), PARTIAL (partially met), NO (not met)
// - Provide confidence (0.0-1.0) and reasoning
// - Consider synonyms and paraphrases, not just exact matches
```

### Stage 2: Frame Extraction

**Service:** `/backend/src/services/analysis/frame-extraction.service.ts`

```typescript
class FrameExtractionService {
  async extractFrames(
    videoUrl: string,
    analysisJobId: string,
    organizationId: string,
    options?: FrameExtractionOptions
  ): Promise<FrameExtractionResult>
}
```

**Hybrid Extraction Process (for videos > 2 minutes):**

1. **Scene Detection** (FFmpeg): Captures frames at scene changes (page loads, clicks)
   ```bash
   ffmpeg -i video.webm -vf "select='gt(scene,0.3)',showinfo" -vsync vfr keyframe_%04d.jpeg
   ```

2. **Interval Extraction**: Regular frames at configured interval (default 1 second)
   ```bash
   ffmpeg -i video.webm -vf fps=1/1.0 frame_%04d.jpeg
   ```

3. **Deduplication**: Remove interval frames within 2 seconds of keyframes

4. **Upload**: Parallel upload to S3 with concurrency limit of 5

**Configuration:**
```typescript
interface FrameExtractionOptions {
  frameIntervalSeconds?: number;  // Default: 1.0
  maxFrames?: number;             // Default: 45
  outputFormat?: 'jpeg' | 'png';  // Default: 'jpeg'
  quality?: number;               // Default: 85
  enableSceneDetection?: boolean; // Default: true
  sceneChangeThreshold?: number;  // Default: 0.3
}
```

### Stage 3: Visual Analysis

**Service:** `/backend/src/services/analysis/visual-analysis.service.ts`

```typescript
class VisualAnalysisService {
  async analyzeFrames(
    frames: ExtractedFrame[],
    rubricSteps: RubricStep[]
  ): Promise<VisualAnalysisResponse>
}
```

**Process:**
1. Filter rubric steps with `evidenceType === 'visual' || evidenceType === 'both'`
2. Batch frames (4 per batch) for efficient API calls
3. Load frame images from S3 as base64
4. Send to Gemini Vision with system prompt and visual criteria
5. Parse JSON response and aggregate per-step results
6. Rate limiting: 1 second delay between batches

**Prompt Template:**
```typescript
// System prompt instructs Gemini Vision to:
// - Identify what screen/page is shown
// - Detect UI elements (buttons, forms, menus, etc.)
// - Detect actions (clicks, typing, navigation)
// - Match against expected elements and actions from rubric
```

### Stage 4: Combine Results

**Method:** `AnalysisService.combineResults()`

```typescript
private combineResults(
  speechResults: SpeechAnalysisResult[],
  visualResults: VisualAnalysisResult[],
  rubricSteps: RubricStep[]
): StepScoreResult[]
```

**Logic:**
- For `evidenceType === 'speech'`: Use speech result only
- For `evidenceType === 'visual'`: Use visual result only
- For `evidenceType === 'both'`: Average speech and visual scores
  - Convert scores to numeric: YES=1, PARTIAL=0.5, NO=0
  - Average the values
  - Convert back: >= 0.75 = YES, >= 0.4 = PARTIAL, else NO

---

## Scoring Algorithm

### Step Scoring

Each rubric step is scored as:
- **YES**: Full credit (1.0)
- **PARTIAL**: Half credit (0.5)
- **NO**: No credit (0.0)
- **UNABLE_TO_ASSESS**: No credit, flagged for review

### Overall Score Calculation

**Method:** `AnalysisService.calculateVerdict()`

```typescript
private calculateVerdict(
  results: StepScoreResult[],
  rubricSteps: RubricStep[],
  passingScore: number,
  scoringMethod: 'weighted' | 'equal'
): { overallScore: number; verdict: AnalysisVerdict; confidence: number }
```

**Weighted Scoring (default):**
```typescript
const totalWeight = rubricSteps.reduce((sum, s) => sum + s.weight, 0);
const achievedWeight = results.reduce((sum, r) => sum + r.weightedScore * 10, 0);
overallScore = (achievedWeight / totalWeight) * 100;

// weightedScore = scoreToNumeric(score) * step.weight / 10
```

**Equal Scoring:**
```typescript
const totalSteps = results.length;
const passedSteps = results.filter(r => r.score === 'YES').length;
const partialSteps = results.filter(r => r.score === 'PARTIAL').length;
overallScore = ((passedSteps + partialSteps * 0.5) / totalSteps) * 100;
```

### Verdict Determination

```typescript
// Check required steps first
const failedRequired = requiredSteps.some(rs => {
  const result = results.find(r => r.rubricStepId === rs.id);
  return result?.score === 'NO';
});

if (failedRequired) {
  verdict = 'FAIL';  // Any required step failed
} else if (overallScore >= passingScore) {
  verdict = results.some(r => r.score === 'PARTIAL') ? 'PARTIAL_PASS' : 'PASS';
} else if (overallScore >= passingScore * 0.6) {
  verdict = 'NEEDS_REVIEW';  // Close to passing, manual review recommended
} else {
  verdict = 'FAIL';
}
```

**Verdict Meanings:**
| Verdict | Condition |
|---------|-----------|
| `PASS` | Score >= passingScore AND all steps YES |
| `PARTIAL_PASS` | Score >= passingScore AND some steps PARTIAL |
| `NEEDS_REVIEW` | Score >= 60% of passingScore but below passingScore |
| `FAIL` | Score < 60% of passingScore OR any required step NO |

---

## API Endpoints

### Template Management

All template endpoints require authentication.

**Base Path:** `/api/templates`

| Method | Path | Description |
|--------|------|-------------|
| GET | `/` | Get organization templates |
| POST | `/` | Create new template |
| GET | `/:id` | Get single template |
| PUT | `/:id` | Update template (including rubric) |
| DELETE | `/:id` | Delete template (soft delete) |
| GET | `/defaults` | Get system default templates |
| GET | `/restorable` | Get restorable system defaults |
| POST | `/restore` | Restore a system default |

**Update Template with Rubric:**
```typescript
PUT /api/templates/:templateId
Body: {
  evaluationCriteria: EvaluationCriteria
}
```

### Analysis Endpoints

**Base Path:** `/api/recordings/:id/analysis`

| Method | Path | Feature Required | Description |
|--------|------|------------------|-------------|
| GET | `/` | `basicAiAnalysis` | Get analysis results |
| POST | `/../analyze` | `fullAiRubricScoring` | Trigger analysis |
| GET | `/status` | `basicAiAnalysis` | Get analysis progress |
| GET | `/export` | `fullAiRubricScoring` | Export results (PDF/JSON/CSV) |

**Trigger Analysis:**
```typescript
POST /api/recordings/:id/analyze
Response: {
  success: true,
  message: "Analysis queued successfully",
  data: {
    analysisJobId: string,
    status: "pending",
    recordingId: string
  }
}
```

**Get Analysis Results:**
```typescript
GET /api/recordings/:id/analysis
Response: {
  success: true,
  data: {
    id: string,
    recordingId: string,
    taskId: string,
    analyzedAt: string,
    analysisVersion: string,
    overallScore: number,
    overallVerdict: "PASS" | "PARTIAL_PASS" | "FAIL" | "NEEDS_REVIEW",
    passed: boolean,
    overallConfidence: number,
    scoreBreakdown: {
      weightedScore: number,
      rawScore: number,
      stepsCompleted: number,
      stepsTotal: number,
      requiredStepsCompleted: number,
      requiredStepsTotal: number
    },
    stepResults: StepAnalysisResult[],
    completedSteps: string[],
    partialSteps: string[],
    missedSteps: MissedStep[],
    coachingSuggestions: CoachingSuggestion[],
    summaryText: string,
    strengths: string[],
    improvements: string[],
    processingTimeMs: number,
    recordingDuration: number
  }
}
```

**Get Analysis Status:**
```typescript
GET /api/recordings/:id/analysis/status
Response: {
  success: true,
  data: {
    analysisJobId: string,
    status: AnalysisJobStatus,
    progress: number,  // 0-100
    stage: string,
    startedAt: string,
    completedAt: string,
    errorMessage?: string,
    tokensUsed: number,
    estimatedCost: number
  }
}
```

---

## Frontend Components

### Rubric Builder

**Location:** `/frontend/src/components/rubric/`

#### RubricBuilderProvider

State management for rubric builder using React Context and useReducer.

```typescript
// /frontend/src/components/rubric/RubricBuilderProvider.tsx

interface RubricBuilderState {
  evaluationCriteria: EvaluationCriteria;
  isDirty: boolean;
  validationErrors: Record<string, string[]>;
  activeStepId: string | null;
  previewMode: boolean;
}

type RubricBuilderAction =
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
```

**Hook Usage:**
```typescript
const {
  state,
  addStep,
  updateStep,
  deleteStep,
  duplicateStep,
  reorderSteps,
  setActiveStep,
  updateMetadata,
  validateRubric,
  setCriteria
} = useRubricBuilder();
```

#### RubricStepList

Drag-and-drop sortable list of rubric steps using `@dnd-kit/core`.

```typescript
// /frontend/src/components/rubric/RubricStepList.tsx

export function RubricStepList() {
  // Uses DndContext, SortableContext from @dnd-kit
  // Renders RubricStepCard for each step
  // "Add Step" button at bottom
}
```

#### RubricStepCard

Individual rubric step editor with collapsible content.

```typescript
// /frontend/src/components/rubric/RubricStepCard.tsx

interface RubricStepCardProps {
  step: RubricStep;
}

// Features:
// - Drag handle for reordering
// - Title input (inline edit)
// - Evidence type selector (Speech / Visual / Both)
// - Speech criteria editor (keywords, phrases)
// - Visual criteria editor (elements, actions)
// - Weight slider (1-10)
// - Required checkbox
// - Duplicate/Delete buttons
// - Validation error display
```

### Rubric Builder Page

**Location:** `/frontend/src/pages/rubric/RubricBuilderPage.tsx`

Full-page rubric editor accessible at `/templates/:templateId/rubric`.

**Features:**
- Loads existing rubric from template
- Auto-save indicator (isDirty state)
- Settings sidebar (passing score, scoring method, auto-analyze toggle)
- Summary panel (step counts, weights)
- Validation error panel

### Template Management Component

**Location:** `/frontend/src/components/settings/TemplateManagement.tsx`

Template list with detail slide-over panel.

**Features:**
- Grid view of templates
- Detail modal with tabs (Details / Rubric)
- Rubric preview (read-only step cards)
- Edit/Delete actions
- "Create Rubric" / "Edit Rubric" navigation

### Analysis Results Components

**Location:** `/frontend/src/components/analysis/`

```typescript
// Exported components:
export { ResultsHeader } from './ResultsHeader';
export { ResultsTimeline } from './ResultsTimeline';
export { StepResultCard } from './StepResultCard';
export { StepBreakdown } from './StepBreakdown';
export { MissedItemsPanel } from './MissedItemsPanel';
```

---

## Job Queue System

### Queue Configuration

**Location:** `/backend/src/config/bullmq.ts`

```typescript
export const QUEUE_CONFIGS = {
  analysis: {
    name: 'analysis',
    defaultJobOptions: {
      attempts: 2,  // Expensive AI calls, limit retries
      backoff: {
        type: 'exponential',
        delay: 30000,  // 30 second initial delay for rate limits
      },
      removeOnComplete: {
        age: 7 * 24 * 60 * 60,  // Keep for 7 days (audit trail)
        count: 500,
      },
    },
  },
  frameExtraction: {
    name: 'frame-extraction',
    defaultJobOptions: {
      attempts: 3,
      backoff: {
        type: 'fixed',
        delay: 5000,
      },
    },
  },
};

export const WORKER_CONCURRENCY = {
  analysis: parseInt(process.env.QUEUE_ANALYSIS_CONCURRENCY || '1', 10),
  frameExtraction: parseInt(process.env.QUEUE_FRAME_EXTRACTION_CONCURRENCY || '2', 10),
};
```

### Analysis Queue

**Location:** `/backend/src/queues/definitions/analysis.queue.ts`

```typescript
export interface AnalysisJobData {
  analysisJobId: string;
  recordingId: string;
  taskId: string;
  organizationId: string;
  triggeredByUserId?: string;
  rubricSteps: RubricStep[];
  passingScore: number;
  scoringMethod: 'weighted' | 'equal';
  options?: AnalysisJobOptions;
}

// Queue helpers
export const analysisQueueHelpers = {
  queueAnalysis: async (params) => { /* ... */ },
  queueHighPriorityAnalysis: async (params) => { /* ... */ },
  getAnalysisStatus: async (analysisJobId) => { /* ... */ },
  getAnalysisStatusByRecording: async (recordingId) => { /* ... */ },
  cancelAnalysis: async (analysisJobId) => { /* ... */ },
};
```

### Analysis Processor

**Location:** `/backend/src/queues/processors/analysis.processor.ts`

```typescript
export class AnalysisProcessor extends BaseProcessor<AnalysisJobData, AnalysisJobResult> {
  protected async process(job: Job<AnalysisJobData>): Promise<AnalysisJobResult> {
    // 1. Update recording status to 'processing'
    // 2. Call analysisService.analyzeRecording()
    // 3. Store results in analysis_results table
    // 4. Store step scores in analysis_step_scores table
    // 5. Update analysis_jobs status to 'completed'
    // 6. Update recording status to 'completed'
  }

  protected async onFailed(job, error): Promise<void> {
    // Update status to 'failed', store error message
  }

  protected async onCompleted(job, result): Promise<void> {
    // Log completion, could send notifications
  }
}
```

### Job Flow

```
1. triggerAnalysis() API endpoint
   |
   v
2. Create analysis_jobs record (status: 'pending')
   |
   v
3. analysisQueue.add(jobData)
   |
   v
4. AnalysisProcessor.process(job)
   |
   +---> Update progress: 'analyzing_speech' (10%)
   |     Call speechAnalysisService.analyzeTranscript()
   |
   +---> Update progress: 'extracting_frames' (40%)
   |     Call frameExtractionService.extractFrames()
   |
   +---> Update progress: 'analyzing_visual' (60%)
   |     Call visualAnalysisService.analyzeFrames()
   |
   +---> Update progress: 'combining_results' (80%)
   |     Combine speech + visual results
   |
   +---> Calculate verdict, generate summary
   |
   v
5. Store results in database
   |
   v
6. Update status to 'completed' (100%)
```

---

## Configuration

### Environment Variables

```bash
# Gemini AI Configuration
GEMINI_API_KEY=                      # Required for AI analysis
ANALYSIS_ENABLED=true                # Enable/disable analysis feature
ANALYSIS_MAX_FRAMES=45               # Max frames to extract
ANALYSIS_FRAME_INTERVAL=1.0          # Seconds between frames
ANALYSIS_TEXT_MODEL=gemini-2.0-flash-exp
ANALYSIS_VISION_MODEL=gemini-2.0-flash-exp
ANALYSIS_MAX_RETRIES=3               # API call retry count
ANALYSIS_RETRY_DELAY_MS=1000         # Delay between retries
ANALYSIS_SCENE_DETECTION=true        # Enable scene change detection
ANALYSIS_SCENE_THRESHOLD=0.3         # Scene sensitivity (0-1)

# Queue Configuration
REDIS_HOST=localhost
REDIS_PORT=6379
QUEUE_ANALYSIS_CONCURRENCY=1         # Analysis workers
QUEUE_FRAME_EXTRACTION_CONCURRENCY=2 # Frame extraction workers
```

### Gemini Model Configuration

**Location:** `/backend/src/config/gemini.ts`

```typescript
export const GEMINI_MODELS = {
  FLASH: 'gemini-2.0-flash-exp',      // Primary model
  FLASH_LEGACY: 'gemini-1.5-flash',   // Fallback
  PRO: 'gemini-1.5-pro',              // For complex reasoning
};

export const DEFAULT_GENERATION_CONFIG = {
  temperature: 0.2,   // Low for consistent analysis
  topP: 0.8,
  topK: 40,
  maxOutputTokens: 4096,
};

// Cost estimation (January 2025 pricing)
export const GEMINI_PRICING = {
  [GEMINI_MODELS.FLASH]: {
    inputPer1M: 0.10,   // $0.10 per 1M input tokens
    outputPer1M: 0.40,  // $0.40 per 1M output tokens
  },
};
```

### Feature Gating

Analysis features are gated by pricing tier:
- `basicAiAnalysis`: Team tier and above (view results)
- `fullAiRubricScoring`: Pro tier and above (trigger analysis, export)

---

## Flow Diagrams

### Rubric Creation Flow

```
User navigates to Settings > Templates
            |
            v
TemplateManagement component loads templates
            |
            v
User clicks "Edit Rubric" on a template
            |
            v
Navigate to /templates/:templateId/rubric
            |
            v
RubricBuilderPage loads template data
            |
            v
RubricBuilderProvider initializes state
            |
            v
User adds/edits rubric steps
            |
            v
User configures passing score, method
            |
            v
User clicks "Save"
            |
            v
validateRubric() checks for errors
            |
            v
PUT /api/templates/:id { evaluationCriteria }
            |
            v
taskTemplateService.updateTemplate()
            |
            v
Rubric saved to task_templates.evaluation_criteria
```

### Analysis Execution Flow

```
Recording completed, transcription done
            |
            v
User clicks "Analyze" OR autoAnalyze triggers
            |
            v
POST /api/recordings/:id/analyze
            |
            v
Controller validates:
  - Recording exists & user has access
  - Transcription is complete
  - Template has evaluation_criteria
  - No pending analysis
            |
            v
Create analysis_jobs record
            |
            v
analysisQueue.add(jobData)
            |
            v
[Background: AnalysisProcessor]
            |
    +-------+-------+
    |               |
    v               v
Speech Analysis    Frame Extraction
    |               |
    v               v
Parse Transcript   FFmpeg + Scene Detection
    |               |
    v               v
Gemini Text API    Upload to S3
    |               |
    +-------+-------+
            |
            v
      Visual Analysis
            |
            v
      Gemini Vision API
            |
            v
      Combine Results
            |
            v
      Calculate Verdict
            |
            v
      Store Results
            |
            v
      Job Complete
            |
            v
[Frontend polls /analysis/status]
            |
            v
GET /api/recordings/:id/analysis
            |
            v
Display results in UI
```

### Database Relationships

```
organizations
      |
      +----< task_templates (organization_id)
      |            |
      |            +---- evaluation_criteria (JSONB)
      |
      +----< tasks (organization_id)
      |        |
      |        +---- template_id -> task_templates
      |
      +----< recordings (organization_id)
      |        |
      |        +---- task_id -> tasks
      |        +---- analysis_status
      |
      +----< analysis_jobs (organization_id)
               |
               +---- recording_id -> recordings
               +---- task_id -> tasks
               |
               +----< analysis_step_scores (analysis_job_id)
               +----< analysis_frames (analysis_job_id)
               +----< analysis_results (analysis_job_id, 1:1)
```

---

## Error Handling

### Analysis Failures

When analysis fails, the system:
1. Catches error in `AnalysisProcessor.process()`
2. Updates `analysis_jobs.status` to 'failed'
3. Stores error message in `analysis_jobs.error_message`
4. Updates `recordings.analysis_status` to 'failed'
5. Logs error details

**Fallback Mechanisms:**
- Speech analysis: Falls back to simple keyword matching if Gemini fails
- Visual analysis: Returns `UNABLE_TO_ASSESS` for all steps if extraction/analysis fails

### Retry Configuration

```typescript
// Analysis queue retries twice with 30-second exponential backoff
attempts: 2,
backoff: {
  type: 'exponential',
  delay: 30000,
}
```

---

## Cost Tracking

Each analysis job tracks:
- `ai_tokens_used`: Total Gemini tokens consumed
- `ai_api_calls`: Number of API calls made (typically 2: speech + visual)
- `estimated_cost_usd`: Calculated from token usage and pricing

Cost is estimated using:
```typescript
function estimateCost(usage: TokenUsage, model: string): number {
  const pricing = GEMINI_PRICING[model];
  const inputCost = (usage.inputTokens / 1_000_000) * pricing.inputPer1M;
  const outputCost = (usage.outputTokens / 1_000_000) * pricing.outputPer1M;
  return inputCost + outputCost;
}
```

---

## Summary

The CogVeri rubric and analysis system provides:

1. **Flexible Rubric Builder**: Create multi-step evaluation criteria with speech and visual requirements
2. **AI-Powered Analysis**: Uses Google Gemini for intelligent transcript and frame analysis
3. **Hybrid Frame Extraction**: Combines interval sampling with scene detection for comprehensive coverage
4. **Weighted Scoring**: Configurable passing thresholds and scoring methods
5. **Required Steps**: Critical steps that cause automatic failure if not met
6. **Detailed Evidence**: Per-step evidence including keywords found, excerpts, and frame references
7. **Cost Tracking**: Monitors AI token usage and estimates costs per analysis
8. **Export Capabilities**: PDF, JSON, and CSV export of results

The system is designed to be:
- **Scalable**: BullMQ background processing with configurable concurrency
- **Reliable**: Retry mechanisms and fallback analysis
- **Auditable**: Full history of analysis jobs with configuration snapshots
- **Feature-gated**: Different capabilities for different pricing tiers
