import { Router } from 'express';
import { enhancedAuthenticate } from '../middleware/enhanced-auth.middleware';
import taskController from '../controllers/task.controller';
import { invalidateDashboardCache } from '../middleware/cache-invalidation';
import { validate, validateRequest } from '../middleware/validate';
import { requireTrialWriteAccess } from '../middleware/quota-enforcer';
import {
  createTaskSchema,
  updateTaskSchema,
  getTasksQuerySchema,
  updateTaskProgressSchema,
  submitTaskSchema,
  submitReviewSchema,
  idParamSchema,
} from '../schemas/task.schema';

const router = Router();

// All routes require authentication with RLS context
router.use(enhancedAuthenticate);

// Task CRUD operations with validation
router.get('/', validate(getTasksQuerySchema, 'query'), taskController.getTasks);

router.post(
  '/',
  requireTrialWriteAccess(),
  validate(createTaskSchema, 'body'),
  taskController.createTask,
  invalidateDashboardCache
);

router.get('/statistics', taskController.getTaskStatistics);
router.get('/by-status', taskController.getTasksByStatus);

router.get('/:id', validate(idParamSchema, 'params'), taskController.getTask);

router.put(
  '/:id',
  validateRequest({
    params: idParamSchema,
    body: updateTaskSchema,
  }),
  taskController.updateTask,
  invalidateDashboardCache
);

router.patch(
  '/:id',
  validateRequest({
    params: idParamSchema,
    body: updateTaskSchema,
  }),
  taskController.updateTask,
  invalidateDashboardCache
);

router.delete(
  '/:id',
  validate(idParamSchema, 'params'),
  taskController.deleteTask,
  invalidateDashboardCache
);

// Task actions with validation
router.put(
  '/:id/progress',
  validateRequest({
    params: idParamSchema,
    body: updateTaskProgressSchema,
  }),
  taskController.updateTaskProgress,
  invalidateDashboardCache
);

router.post(
  '/:id/submit',
  validateRequest({
    params: idParamSchema,
    body: submitTaskSchema,
  }),
  taskController.submitTask,
  invalidateDashboardCache
);

router.post(
  '/:id/review',
  validateRequest({
    params: idParamSchema,
    body: submitReviewSchema,
  }),
  taskController.submitReview,
  invalidateDashboardCache
);

export default router;
