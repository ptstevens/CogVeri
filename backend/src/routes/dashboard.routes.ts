import { Router } from 'express';
import { enhancedAuthenticate } from '../middleware/enhanced-auth.middleware';
import {
  getDashboardStats,
  getTaskStatistics,
  getPerformanceMetrics,
  getActivityFeed,
} from '../controllers/dashboard.controller';

const router = Router();

// All routes require authentication with RLS context
router.use(enhancedAuthenticate);

// Dashboard endpoints
router.get('/stats', getDashboardStats); // Get overall dashboard statistics
router.get('/tasks/statistics', getTaskStatistics); // Get task statistics with period filter
router.get('/performance', getPerformanceMetrics); // Get performance metrics (managers only)
router.get('/activity', getActivityFeed); // Get recent activity feed

export default router;