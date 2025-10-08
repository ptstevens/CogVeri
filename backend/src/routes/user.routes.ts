import { Router } from 'express';
import { authenticate } from '../middleware/auth';
import {
  getMe,
  getUsers,
  getUser,
  updateUser,
  updateProfile,
  updateNotificationPreferences,
} from '../controllers/user.controller';

const router = Router();

// All routes require authentication
router.use(authenticate);

// Current user operations
router.get('/me', getMe);
router.put('/me', updateProfile);
router.put('/me/notifications', updateNotificationPreferences);

// User operations
router.get('/', getUsers);
router.get('/:id', getUser);
router.put('/:id', updateUser);

export default router;