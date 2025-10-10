import { Router } from 'express';
import { authenticate } from '../middleware/auth';
import { uploadRateLimiter } from '../middleware/rateLimiter';
import {
  createRecording,
  uploadRecording,
  getRecording,
  getRecordings,
  deleteRecording,
  getRecordingDownloadUrl,
  getRecordingPlaybackUrl,
  getTaskRecordings,
  updateRecordingStatus,
  uploadMiddleware,
} from '../controllers/recording.controller';

const router = Router();

// All routes require authentication
router.use(authenticate);

// Recording operations
router.post('/', createRecording); // Create recording metadata
router.get('/', getRecordings); // Get all recordings
router.get('/:id', getRecording); // Get single recording
router.post('/:id/upload', uploadRateLimiter, uploadMiddleware, uploadRecording); // Upload video file
router.delete('/:id', deleteRecording); // Delete recording
router.get('/:id/download-url', getRecordingDownloadUrl); // Get download URL
router.get('/:id/playback-url', getRecordingPlaybackUrl); // Get playback URL for video player
router.put('/:id/status', updateRecordingStatus); // Update recording status (admin only)

// Task-specific recordings
router.get('/task/:taskId', getTaskRecordings);

export default router;