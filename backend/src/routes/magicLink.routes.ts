import { Router } from 'express';
import magicLinkController, { uploadMiddleware } from '../controllers/magicLink.controller';
import { enhancedAuthenticate } from '../middleware/enhanced-auth.middleware';
import {
  magicLinkRateLimiter,
  tokenValidationRateLimiter,
  uploadRateLimiter,
} from '../middleware/rateLimiter';

const router = Router();

// Public routes (no authentication required)
// ★ Security: These endpoints are protected by strict rate limiting to prevent
// token enumeration and brute-force attacks
router.get('/validate/:token', tokenValidationRateLimiter, magicLinkController.validateToken);
router.get('/task/:token', magicLinkRateLimiter, magicLinkController.getTaskByToken);
router.post('/claim/:token', tokenValidationRateLimiter, magicLinkController.claimTask);
router.post(
  '/submit-recording/:token',
  uploadRateLimiter,
  uploadMiddleware,
  magicLinkController.submitRecording
);

// Public multipart upload routes (for chunked recording upload during recording)
// Rate limited to prevent abuse of storage resources
router.get(
  '/multipart/available',
  magicLinkRateLimiter,
  magicLinkController.checkMultipartAvailable
);
router.post(
  '/multipart/initiate/:token',
  magicLinkRateLimiter,
  magicLinkController.initiateMultipartUpload
);
router.get(
  '/multipart/presign/:token',
  magicLinkRateLimiter,
  magicLinkController.getMultipartPresignedUrl
);
router.post(
  '/multipart/register-part/:token',
  magicLinkRateLimiter,
  magicLinkController.registerMultipartPart
);
router.post(
  '/multipart/complete/:token',
  magicLinkRateLimiter,
  magicLinkController.completeMultipartUpload
);
router.delete(
  '/multipart/abort/:token',
  magicLinkRateLimiter,
  magicLinkController.abortMultipartUpload
);

// Protected routes (authentication required + RLS context)
router.post('/', enhancedAuthenticate, magicLinkController.createMagicLink);
router.delete('/revoke/:taskId', enhancedAuthenticate, magicLinkController.revokeToken);
router.get('/contributors', enhancedAuthenticate, magicLinkController.getExternalContributors);
router.get(
  '/contributors/:contributorId/analytics',
  enhancedAuthenticate,
  magicLinkController.getContributorAnalytics
);

export default router;
