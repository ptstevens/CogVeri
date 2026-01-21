import {
  Router
} from 'express';
import {
  enhancedAuthenticate
} from '../middleware/enhanced-auth.middleware';
import { requireFeature, requireTrialWriteAccess } from '../middleware/quota-enforcer';
// uploadRateLimiter and uploadMiddleware imported for future use (see commented routes below)
// import { uploadRateLimiter } from '../middleware/rateLimiter';
import {
  createRecording,
  getRecording,
  getRecordings,
  getRecordingPlaybackUrl,
  getProcessingStatus,
  // uploadMiddleware,
} from '../controllers/recording.controller';
import {
  getAnalysisResults,
  triggerAnalysis,
  getAnalysisStatus,
  exportAnalysis,
} from '../controllers/analysis.controller';
import {
  checkAvailability,
  initiateUpload,
  getPresignedUrl,
  registerPart,
  completeUpload,
  abortUpload,
  getSessionStatus,
  getActiveSessions,
} from '../controllers/multipartUpload.controller';

const router = Router();

// All routes require authentication with RLS context
router.use(enhancedAuthenticate);

// Recording operations
router.post('/', requireTrialWriteAccess(), createRecording); // Create recording metadata
router.get('/', getRecordings); // Get all recordings with optional filters (task_id, user_id, status)
router.get('/:id', getRecording); // Get single recording
// router.post('/:id/upload', uploadRateLimiter, uploadMiddleware, uploadRecording); // Upload video file - NOT YET IMPLEMENTED
// router.delete('/:id', deleteRecording); // Delete recording - NOT YET IMPLEMENTED
// router.get('/:id/download-url', getRecordingDownloadUrl); // Get download URL - NOT YET IMPLEMENTED
router.get('/:id/playback-url', getRecordingPlaybackUrl); // Get playback URL for video player
router.get('/:id/processing-status', getProcessingStatus); // Get processing status (transcoding, transcription)
// router.put('/:id/status', updateRecordingStatus); // Update recording status (admin only) - NOT YET IMPLEMENTED

// Multipart upload routes (for chunked recording upload during recording)
router.get('/multipart/available', checkAvailability); // Check if multipart upload is available
router.post('/multipart/initiate', requireTrialWriteAccess(), initiateUpload); // Start a new multipart upload session
router.get('/multipart/presign', getPresignedUrl); // Get presigned URL for a part
router.post('/multipart/register-part', registerPart); // Register an uploaded part
router.post('/multipart/complete', completeUpload); // Complete the multipart upload
router.delete('/multipart/abort', abortUpload); // Abort the multipart upload
router.get('/multipart/sessions', getActiveSessions); // Get user's active upload sessions
router.get('/multipart/sessions/:sessionId', getSessionStatus); // Get specific session status

// Task-specific recordings
// router.get('/task/:taskId', getTaskRecordings); // NOT YET IMPLEMENTED

// Analysis routes - AI-powered video analysis
// Basic analysis results require basicAiAnalysis (Starter+)
// Full rubric-based scoring and export require fullAiRubricScoring (Pro+)
router.get('/:id/analysis', requireFeature('basicAiAnalysis'), getAnalysisResults); // Get analysis results
router.post('/:id/analyze', requireFeature('fullAiRubricScoring'), triggerAnalysis); // Trigger analysis (requires Pro+)
router.get('/:id/analysis/status', requireFeature('basicAiAnalysis'), getAnalysisStatus); // Get analysis progress
router.get('/:id/analysis/export', requireFeature('fullAiRubricScoring'), exportAnalysis); // Export analysis results (requires Pro+)

export default router;