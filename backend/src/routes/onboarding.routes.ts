import { Router } from 'express';
import {
  signupWithOrganization,
  joinOrganizationViaInvitation,
  completeOnboarding,
  getOnboardingStatus,
} from '../controllers/onboarding.controller';
import { enhancedAuthenticate } from '../middleware/enhanced-auth.middleware';
import { authRateLimiter } from '../middleware/rateLimiter';

const router = Router();

/**
 * Public endpoints
 */

/**
 * POST /onboarding/signup-with-org
 * Creates new user and organization in single transaction
 * Rate limited to prevent abuse
 */
router.post('/signup-with-org', authRateLimiter, signupWithOrganization);

/**
 * Authenticated endpoints
 */

/**
 * POST /onboarding/join-via-invitation
 * Join existing organization using invitation token
 */
router.post('/join-via-invitation', enhancedAuthenticate, joinOrganizationViaInvitation);

/**
 * POST /onboarding/complete
 * Mark onboarding as complete with user preferences
 */
router.post('/complete', enhancedAuthenticate, completeOnboarding);

/**
 * GET /onboarding/status
 * Get current onboarding status and organization list
 */
router.get('/status', enhancedAuthenticate, getOnboardingStatus);

export default router;
