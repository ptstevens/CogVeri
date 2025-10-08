import { Router } from 'express';
import { authenticate } from '../middleware/auth';
import {
  getDashboardStats,
  getTaskStatistics,
  getPerformanceMetrics,
  getActivityFeed,
} from '../controllers/dashboard.controller';

const router = Router();

// All routes require authentication
router.use(authenticate);

// Dashboard endpoints
router.get('/stats', getDashboardStats); // Get overall dashboard statistics
router.get('/tasks/statistics', getTaskStatistics); // Get task statistics with period filter
router.get('/performance', getPerformanceMetrics); // Get performance metrics (managers only)
router.get('/activity', getActivityFeed); // Get recent activity feed

export default router;