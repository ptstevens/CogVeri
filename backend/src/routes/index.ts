import { Router } from 'express';
import authRoutes from './auth.routes';
import taskRoutes from './task.routes';
import recordingRoutes from './recording.routes';
import reviewRoutes from './review.routes';
import userRoutes from './user.routes';
import dashboardRoutes from './dashboard.routes';
import testRoutes from './test.routes';
import magicLinkRoutes from './magicLink.routes';
import debugRoutes from './debug.routes';

const router = Router();

// API version and status
router.get('/', (_req, res) => {
  res.json({
    message: 'Relay API',
    version: '1.0.0',
    timestamp: new Date().toISOString(),
  });
});

// Mount routes
router.use('/auth', authRoutes);
router.use('/tasks', taskRoutes);
router.use('/recordings', recordingRoutes);
router.use('/reviews', reviewRoutes);
router.use('/users', userRoutes);
router.use('/dashboard', dashboardRoutes);
router.use('/test', testRoutes);
router.use('/magic-links', magicLinkRoutes);

// Debug routes (only in non-production or for troubleshooting)
if (process.env.NODE_ENV !== 'production' || process.env.ENABLE_DEBUG === 'true') {
  router.use('/debug', debugRoutes);
}

export default router;