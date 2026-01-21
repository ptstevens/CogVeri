/**
 * Job Type Definitions for BullMQ Queues
 * Centralized TypeScript interfaces for all job payloads
 */

// =============================================================================
// Job Names Enum - Used as queue identifiers
// =============================================================================

export enum JobName {
  SEND_EMAIL = 'send-email',
  TRANSCRIPTION = 'transcription',
  THUMBNAIL = 'thumbnail',
  TRANSCODE = 'transcode',
  ANALYSIS = 'analysis',
  FRAME_EXTRACTION = 'frame-extraction',
  RUBRIC_TEMPLATE_GENERATION = 'rubric-template-generation',
}

// =============================================================================
// Email Job Types
// =============================================================================

/**
 * Email template types supported by the email queue
 */
export enum EmailTemplate {
  TASK_ASSIGNMENT = 'task-assignment',
  TASK_COMPLETION = 'task-completion',
  REVIEW_NOTIFICATION = 'review-notification',
  TASK_REJECTION = 'task-rejection',
  TASK_REMINDER = 'task-reminder',
  EXTERNAL_TASK_APPROVED = 'external-task-approved',
  EXTERNAL_TASK_REJECTED = 'external-task-rejected',
  MAGIC_LINK = 'magic-link',
  WELCOME = 'welcome',
  PASSWORD_RESET = 'password-reset',
  INVITATION = 'invitation',
  GENERIC = 'generic',
}

/**
 * Base email job data structure
 */
export interface BaseEmailJobData {
  template: EmailTemplate;
  to: string;
  subject: string;
  metadata?: Record<string, unknown>;
}

/**
 * Task assignment email data
 */
export interface TaskAssignmentEmailData extends BaseEmailJobData {
  template: EmailTemplate.TASK_ASSIGNMENT;
  taskId: string;
  taskTitle: string;
  taskDescription?: string;
  taskPriority?: string;
  taskType?: string;
  dueDate?: string;
  estimatedDuration?: number;
  creatorName: string;
  creatorEmail: string;
  assigneeName: string;
}

/**
 * Task completion email data
 */
export interface TaskCompletionEmailData extends BaseEmailJobData {
  template: EmailTemplate.TASK_COMPLETION;
  taskId: string;
  taskTitle: string;
  reviewerName: string;
  assigneeName: string;
  assigneeEmail: string;
  actualDuration?: number;
}

/**
 * Review notification email data
 */
export interface ReviewNotificationEmailData extends BaseEmailJobData {
  template: EmailTemplate.REVIEW_NOTIFICATION;
  taskId: string;
  taskTitle: string;
  taskDescription?: string;
  taskPriority?: string;
  reviewerName: string;
  assigneeName: string;
  assigneeEmail: string;
}

/**
 * Task rejection email data
 */
export interface TaskRejectionEmailData extends BaseEmailJobData {
  template: EmailTemplate.TASK_REJECTION;
  taskId: string;
  taskTitle: string;
  taskDescription?: string;
  reviewerName: string;
  reviewerEmail: string;
  assigneeName: string;
  feedback: string;
}

/**
 * Task reminder email data
 */
export interface TaskReminderEmailData extends BaseEmailJobData {
  template: EmailTemplate.TASK_REMINDER;
  taskId: string;
  taskTitle: string;
  dueDate?: string;
  assigneeName: string;
}

/**
 * External task approved email data
 */
export interface ExternalTaskApprovedEmailData extends BaseEmailJobData {
  template: EmailTemplate.EXTERNAL_TASK_APPROVED;
  taskId: string;
  taskTitle: string;
  taskDescription?: string;
  contributorFirstName: string;
  contributorLastName: string;
  reviewerName: string;
  reviewerEmail: string;
  feedback?: string;
}

/**
 * External task rejected email data
 */
export interface ExternalTaskRejectedEmailData extends BaseEmailJobData {
  template: EmailTemplate.EXTERNAL_TASK_REJECTED;
  taskId: string;
  taskTitle: string;
  taskDescription?: string;
  contributorFirstName: string;
  contributorLastName: string;
  reviewerName: string;
  reviewerEmail: string;
  feedback: string;
  newMagicLink: string;
}

/**
 * Magic link email data
 */
export interface MagicLinkEmailData extends BaseEmailJobData {
  template: EmailTemplate.MAGIC_LINK;
  recipientName: string;
  magicLinkUrl: string;
  expiresAt: string;
  taskTitle?: string;
}

/**
 * Generic email data (for custom HTML emails)
 */
export interface GenericEmailData extends BaseEmailJobData {
  template: EmailTemplate.GENERIC;
  html: string;
  text?: string;
}

/**
 * Union type for all email job payloads
 */
export type SendEmailJobData =
  | TaskAssignmentEmailData
  | TaskCompletionEmailData
  | ReviewNotificationEmailData
  | TaskRejectionEmailData
  | TaskReminderEmailData
  | ExternalTaskApprovedEmailData
  | ExternalTaskRejectedEmailData
  | MagicLinkEmailData
  | GenericEmailData;

// =============================================================================
// Transcription Job Types
// =============================================================================

/**
 * Transcription job data
 */
export interface TranscriptionJobData {
  recordingId: string;
  fileUrl: string;
  organizationId: string;
  orgSlug: string; // Organization slug for storage path construction
  userId?: string;
  language?: string;
  options?: {
    includeSpeakerDiarization?: boolean;
    includeTimestamps?: boolean;
    vocabularyFilter?: string[];
  };
  metadata?: Record<string, unknown>;
}

/**
 * Transcription job result
 */
export interface TranscriptionJobResult {
  recordingId: string;
  transcriptText: string;
  segments?: Array<{
    start: number;
    end: number;
    text: string;
    speaker?: string;
  }>;
  language: string;
  duration: number;
}

// =============================================================================
// Thumbnail Job Types
// =============================================================================

/**
 * Thumbnail generation job data
 */
export interface ThumbnailJobData {
  recordingId: string;
  fileUrl: string;
  organizationId: string;
  orgSlug: string; // Organization slug for storage path construction
  options?: {
    timestamp?: number; // Timestamp in seconds to capture thumbnail
    width?: number;
    height?: number;
    format?: 'jpeg' | 'png' | 'webp';
  };
  metadata?: Record<string, unknown>;
}

/**
 * Thumbnail job result
 */
export interface ThumbnailJobResult {
  recordingId: string;
  thumbnailUrl: string;
  width: number;
  height: number;
  format: string;
  size: number;
}

// =============================================================================
// Transcode Job Types
// =============================================================================

/**
 * Video quality presets
 */
export enum TranscodeQuality {
  LOW = 'low', // 480p
  MEDIUM = 'medium', // 720p
  HIGH = 'high', // 1080p
  ORIGINAL = 'original', // Keep original quality
}

/**
 * Transcode job data
 */
export interface TranscodeJobData {
  recordingId: string;
  inputFileUrl: string;
  organizationId: string;
  orgSlug: string; // Organization slug for storage path construction
  outputFormat?: 'mp4' | 'webm';
  quality?: TranscodeQuality;
  options?: {
    maxBitrate?: number;
    audioBitrate?: number;
    frameRate?: number;
    stripAudio?: boolean;
  };
  metadata?: Record<string, unknown>;
}

/**
 * Transcode job result
 */
export interface TranscodeJobResult {
  recordingId: string;
  outputFileUrl: string;
  format: string;
  quality: TranscodeQuality;
  duration: number;
  fileSize: number;
  resolution: {
    width: number;
    height: number;
  };
}

// =============================================================================
// Job Progress Types
// =============================================================================

/**
 * Standard job progress structure
 */
export interface JobProgress {
  percentage: number;
  stage: string;
  message?: string;
  details?: Record<string, unknown>;
}

// =============================================================================
// Analysis Job Types
// =============================================================================

/**
 * Evidence type that can be evaluated
 */
export type EvidenceType = 'speech' | 'visual' | 'both';

/**
 * Speech-based evaluation criteria
 */
export interface SpeechCriteria {
  requiredKeywords: string[];
  requiredPhrases: string[];
  optionalKeywords?: string[];
  matchThreshold?: number;
}

/**
 * Visual/UI-based evaluation criteria
 */
export interface VisualCriteria {
  expectedElements: string[];
  expectedActions: string[];
}

/**
 * Single step/requirement in a rubric
 */
export interface RubricStep {
  id: string;
  order: number;
  title: string;
  description: string;
  evidenceType: EvidenceType;
  speechCriteria?: SpeechCriteria;
  visualCriteria?: VisualCriteria;
  weight: number;
  isRequired: boolean;
}

/**
 * Complete evaluation criteria attached to a task/template
 */
export interface EvaluationCriteria {
  version: string;
  rubricSteps: RubricStep[];
  passingScore: number;
  scoringMethod: 'weighted' | 'equal';
  autoAnalyze: boolean;
}

/**
 * Analysis job options
 */
export interface AnalysisJobOptions {
  frameIntervalSeconds?: number;
  maxFramesToAnalyze?: number;
  skipVisualAnalysis?: boolean;
  skipSpeechAnalysis?: boolean;
}

/**
 * Analysis job data
 */
export interface AnalysisJobData {
  analysisJobId: string;
  recordingId: string;
  taskId: string;
  organizationId: string;
  orgSlug: string; // Organization slug for storage path construction
  triggeredByUserId?: string;
  rubricSteps: RubricStep[];
  passingScore: number;
  scoringMethod: 'weighted' | 'equal';
  options?: AnalysisJobOptions;
  metadata?: Record<string, unknown>;
}

/**
 * Analysis step score result
 */
export type StepScoreValue = 'YES' | 'PARTIAL' | 'NO' | 'UNABLE_TO_ASSESS';

/**
 * Evidence from speech analysis
 */
export interface SpeechEvidence {
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

/**
 * Evidence from visual analysis
 */
export interface VisualEvidence {
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

/**
 * Per-step analysis result
 */
export interface StepScoreResult {
  rubricStepId: string;
  stepOrder: number;
  stepTitle: string;
  score: StepScoreValue;
  confidence: number;
  weightedScore: number;
  speechEvidence?: SpeechEvidence;
  visualEvidence?: VisualEvidence;
  aiReasoning: string;
  detectedAtSeconds?: number;
  completedAtSeconds?: number;
}

/**
 * Overall analysis verdict
 */
export type AnalysisVerdict = 'PASS' | 'PARTIAL_PASS' | 'FAIL' | 'NEEDS_REVIEW';

/**
 * Analysis job result
 */
export interface AnalysisJobResult {
  analysisJobId: string;
  recordingId: string;
  overallScore: number;
  overallVerdict: AnalysisVerdict;
  overallConfidence: number;
  stepsPassed: number;
  stepsPartial: number;
  stepsFailed: number;
  stepsTotal: number;
  stepResults: StepScoreResult[];
  summaryText: string;
  strengths: string[];
  improvements: string[];
  tokensUsed: number;
  apiCallsMade: number;
  processingTimeSeconds: number;
}

/**
 * Frame extraction job data
 */
export interface FrameExtractionJobData {
  analysisJobId: string;
  recordingId: string;
  videoUrl: string;
  frameIntervalSeconds: number;
  maxFrames: number;
  organizationId: string;
  orgSlug: string; // Organization slug for storage path construction
  metadata?: Record<string, unknown>;
}

/**
 * Extracted frame info
 */
export interface ExtractedFrame {
  index: number;
  timestampSeconds: number;
  url: string;
  storageKey: string;
  width?: number;
  height?: number;
  isKeyframe?: boolean;
}

/**
 * Frame extraction job result
 */
export interface FrameExtractionJobResult {
  analysisJobId: string;
  framesExtracted: number;
  frames: ExtractedFrame[];
}

// =============================================================================
// Rubric Template Generation Job Types
// =============================================================================

/**
 * Rubric template generation job data
 * Queued after video upload - handles transcription wait, rubric generation, and template creation
 */
export interface RubricTemplateGenerationJobData {
  tempVideoId: string;
  tempRecordingId: string;
  organizationId: string;
  orgSlug: string; // Organization slug for storage path construction
  userId: string;
  storageKey: string;
  storageBucket?: string;
  // Template creation data
  templateTitle: string;
  taskType: string; // Used as task type for rubric generation
  templateDescription?: string;
  templateCategory?: string;
  templatePriority?: 'low' | 'medium' | 'high' | 'urgent';
  customContext?: string;
  metadata?: Record<string, unknown>;
}

/**
 * Rubric template generation job result
 */
export interface RubricTemplateGenerationJobResult {
  tempVideoId: string;
  templateId: string;
  templateTitle: string;
  rubricStepsCount: number;
  tokensUsed: number;
  estimatedCost: number;
}

// =============================================================================
// Type Guards
// =============================================================================

export function isTaskAssignmentEmail(data: SendEmailJobData): data is TaskAssignmentEmailData {
  return data.template === EmailTemplate.TASK_ASSIGNMENT;
}

export function isTaskCompletionEmail(data: SendEmailJobData): data is TaskCompletionEmailData {
  return data.template === EmailTemplate.TASK_COMPLETION;
}

export function isReviewNotificationEmail(data: SendEmailJobData): data is ReviewNotificationEmailData {
  return data.template === EmailTemplate.REVIEW_NOTIFICATION;
}

export function isTaskRejectionEmail(data: SendEmailJobData): data is TaskRejectionEmailData {
  return data.template === EmailTemplate.TASK_REJECTION;
}

export function isGenericEmail(data: SendEmailJobData): data is GenericEmailData {
  return data.template === EmailTemplate.GENERIC;
}
