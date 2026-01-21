/**
 * Queue Infrastructure Module
 *
 * This module provides a BullMQ-based job queue system for handling
 * background tasks like email sending, video transcription, thumbnail
 * generation, and video transcoding.
 *
 * Usage:
 *   import { queueService, emailQueueHelpers, getSendEmailQueue } from './queues';
 *
 *   // Queue an email using helpers
 *   await emailQueueHelpers.queueTaskAssignment({...});
 *
 *   // Or use the queue directly
 *   const emailQueue = getSendEmailQueue();
 *   await emailQueue.add({...});
 */

// Re-export types
export * from './types/job-types';

// Re-export base classes
export { BaseQueue } from './base.queue';
export { BaseProcessor } from './base.processor';

// Re-export email queue
export {
  SendEmailQueue,
  getSendEmailQueue,
  emailQueueHelpers,
} from './definitions/send-email.queue';

// Re-export email processor
export {
  SendEmailProcessor,
  getSendEmailProcessor,
} from './processors/send-email.processor';

// Re-export transcription queue
export {
  TranscriptionQueue,
  getTranscriptionQueue,
  transcriptionQueueHelpers,
} from './definitions/transcription.queue';

// Re-export transcription processor
export {
  TranscriptionProcessor,
  getTranscriptionProcessor,
} from './processors/transcription.processor';

// Re-export transcode queue
export {
  TranscodeQueue,
  getTranscodeQueue,
  transcodeQueueHelpers,
} from './definitions/transcode.queue';

// Re-export transcode processor
export {
  TranscodeProcessor,
  getTranscodeProcessor,
} from './processors/transcode.processor';

// Re-export thumbnail queue
export {
  ThumbnailQueue,
  getThumbnailQueue,
  thumbnailQueueHelpers,
} from './definitions/thumbnail.queue';

// Re-export thumbnail processor
export {
  ThumbnailProcessor,
  getThumbnailProcessor,
} from './processors/thumbnail.processor';

// Re-export analysis queue
export {
  AnalysisQueue,
  getAnalysisQueue,
  analysisQueue,
  analysisQueueHelpers,
} from './definitions/analysis.queue';

// Re-export analysis processor
export {
  AnalysisProcessor,
  getAnalysisProcessor,
} from './processors/analysis.processor';

// Re-export rubric template generation queue
export {
  RubricTemplateGenerationQueue,
  getRubricTemplateGenerationQueue,
  rubricTemplateGenerationQueue,
  rubricTemplateGenerationQueueHelpers,
} from './definitions/rubric-template-generation.queue';

// Re-export rubric template generation processor
export {
  RubricTemplateGenerationProcessor,
  getRubricTemplateGenerationProcessor,
  startRubricTemplateGenerationProcessor,
} from './processors/rubric-template-generation.processor';
