import { Router, Request, Response, NextFunction } from 'express';
import {
  login,
  logout,
  refresh,
  getMe,
  register,
  registerForInvitation,
  changePassword,
  googleAuth,
  googleCallback,
  microsoftAuth,
  microsoftCallback,
} from '../controllers/auth.controller';
import { enhancedAuthenticate } from '../middleware/enhanced-auth.middleware';
import { authRateLimiter, refreshRateLimiter } from '../middleware/rateLimiter';
import { validate } from '../middleware/validate';
import {
  loginSchema,
  registerSchema,
  refreshTokenSchema,
} from '../schemas/auth.schema';
import { getCsrfToken } from '../middleware/csrf.middleware';
import { logger } from '../utils/logger';

const router = Router();

/**
 * Signup Protection Middleware
 *
 * Controls public signup access with a simple flag.
 *
 * OPEN_FOR_BUSINESS=true  → Signups allowed (site is live)
 * OPEN_FOR_BUSINESS=false → Signups blocked with "coming soon" (default)
 *
 * Also supports SIGNUP_SECRET_TOKEN for admin access when site is closed.
 */
const requireSignupAccess = (req: Request, res: Response, next: NextFunction): void => {
  const isOpenForBusiness = process.env.OPEN_FOR_BUSINESS === 'true';
  const secretToken = process.env.SIGNUP_SECRET_TOKEN;

  // If site is open for business, allow all signups
  if (isOpenForBusiness) {
    return next();
  }

  // Site is in "coming soon" mode - check for secret token override
  const providedToken =
    (req.query.signup_token as string) ||
    (req.headers['x-signup-token'] as string);

  if (secretToken && providedToken === secretToken) {
    // Valid admin token, allow signup
    return next();
  }

  // Block signup - site not open yet
  logger.info('Signup blocked: Site not open for business', {
    ip: req.ip,
    email: req.body?.email,
  });

  res.status(503).json({
    error: 'Signups are coming soon! We are not yet open for business.',
    code: 'COMING_SOON',
  });
};

/**
 * GET /api/auth/site-status
 * Returns whether the site is open for business (signups allowed)
 * Frontend uses this to show/hide "coming soon" banners
 */
router.get('/site-status', (_req: Request, res: Response) => {
  const isOpenForBusiness = process.env.OPEN_FOR_BUSINESS === 'true';
  res.json({
    openForBusiness: isOpenForBusiness,
    signupsEnabled: isOpenForBusiness,
  });
});

/**
 * GET /api/auth/csrf-token
 * Returns a new CSRF token for the client to use in subsequent requests.
 * This endpoint should be called when the frontend app initializes.
 *
 * The token should be included in the X-CSRF-Token header for all
 * state-changing requests (POST, PUT, PATCH, DELETE).
 */
router.get('/csrf-token', (req: Request, res: Response) => {
  const token = getCsrfToken(req, res);
  res.json({
    csrfToken: token,
  });
});

// Auth routes with validation
// Note: Signup requires OPEN_FOR_BUSINESS=true, or SIGNUP_SECRET_TOKEN for admin override
router.post('/register', requireSignupAccess, authRateLimiter, validate(registerSchema), register);
router.post('/register-for-invitation', authRateLimiter, registerForInvitation);
router.post('/login', authRateLimiter, validate(loginSchema), login);
router.post('/logout', enhancedAuthenticate, logout);
router.post('/refresh', refreshRateLimiter, validate(refreshTokenSchema), refresh);
router.post('/change-password', enhancedAuthenticate, changePassword);
router.get('/me', enhancedAuthenticate, getMe);

// Google OAuth routes
router.get('/google', googleAuth);
router.get('/google/callback', googleCallback);

// Microsoft OAuth routes
router.get('/microsoft', microsoftAuth);
router.get('/microsoft/callback', microsoftCallback);

// Legacy SSO routes (now redirect to Microsoft if configured, else Google)
router.get('/sso/login', (_req, res) => {
  const hasMicrosoft = !!(process.env.MICROSOFT_CLIENT_ID && process.env.MICROSOFT_CLIENT_SECRET);
  res.redirect(hasMicrosoft ? '/api/auth/microsoft' : '/api/auth/google');
});

router.get('/sso/callback', (_req, res) => {
  res.redirect('/api/auth/google/callback');
});

export default router;
