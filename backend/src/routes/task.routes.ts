import { Router } from 'express';
import { authenticate } from '../middleware/auth';
import taskController from '../controllers/task.controller';

const router = Router();

// All routes require authentication
router.use(authenticate);

// Task CRUD operations
router.get('/', taskController.getTasks);
router.post('/', taskController.createTask);
router.get('/statistics', taskController.getTaskStatistics);
router.get('/by-status', taskController.getTasksByStatus);
router.get('/:id', taskController.getTask);
router.put('/:id', taskController.updateTask);
router.patch('/:id', taskController.updateTask);
router.delete('/:id', taskController.deleteTask);

// Task actions
router.put('/:id/progress', taskController.updateTaskProgress);
router.post('/:id/submit', taskController.submitTask);
router.post('/:id/review', taskController.submitReview);

export default router;