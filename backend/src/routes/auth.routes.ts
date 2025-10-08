import { Router } from 'express';
import { login, logout, refresh, getMe, register } from '../controllers/auth.controller';
import { authenticate } from '../middleware/auth';
import { authRateLimiter } from '../middleware/rateLimiter';

const router = Router();

// Auth routes
router.post('/register', authRateLimiter, register);
router.post('/login', authRateLimiter, login);
router.post('/logout', authenticate, logout);
router.post('/refresh', refresh);
router.get('/me', authenticate, getMe);

// SSO routes (to be implemented)
router.get('/sso/login', (_req, res) => {
  res.json({ message: 'SSO login endpoint - to be implemented' });
});

router.get('/sso/callback', (_req, res) => {
  res.json({ message: 'SSO callback endpoint - to be implemented' });
});

export default router;