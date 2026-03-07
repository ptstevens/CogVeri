import { Router } from 'express';
import { enhancedAuthenticate } from '../middleware/enhanced-auth.middleware';
import {
  getDashboardStats,
  getTaskStatistics,
  getPerformanceMetrics,
  getActivityFeed,
  getCohortStats,
  exportOrgData,
} from '../controllers/dashboard.controller';
const router = Router();

// All routes require authentication with RLS context
router.use(enhancedAuthenticate);

// Dashboard endpoints
router.get('/stats', getDashboardStats);
router.get('/tasks/statistics', getTaskStatistics);
router.get('/performance', getPerformanceMetrics);
router.get('/activity', getActivityFeed);

// Cohort benchmarking — managers, admins, owners only
router.get('/cohort', getCohortStats);

// Org-wide CSV export — admins and owners only
router.get('/export', exportOrgData);

export default router;