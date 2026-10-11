import { Router } from 'express';
import { enhancedAuthenticate } from '../middleware/enhanced-auth.middleware';
import {
  getMe,
  getUsers,
  getUser,
  updateUser,
  updateProfile,
  updateNotificationPreferences,
} from '../controllers/user.controller';

const router = Router();

// All routes require authentication with RLS context
router.use(enhancedAuthenticate);

// Current user operations
router.get('/me', getMe);
router.put('/me', updateProfile);
router.put('/me/notifications', updateNotificationPreferences);

// User operations
router.get('/', getUsers);
router.get('/:id', getUser);
router.put('/:id', updateUser);

export default router;
