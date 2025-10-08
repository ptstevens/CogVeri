import { Router } from 'express';
import magicLinkController from '../controllers/magicLink.controller';
import { authenticate } from '../middleware/auth';

const router = Router();

// Public routes (no authentication required)
router.get('/validate/:token', magicLinkController.validateToken);
router.get('/task/:token', magicLinkController.getTaskByToken);
router.post('/claim/:token', magicLinkController.claimTask);

// Protected routes (authentication required)
router.post('/', authenticate, magicLinkController.createMagicLink);
router.delete('/revoke/:taskId', authenticate, magicLinkController.revokeToken);
router.get('/contributors', authenticate, magicLinkController.getExternalContributors);
router.get('/contributors/:contributorId/analytics', authenticate, magicLinkController.getContributorAnalytics);

export default router;
