import { Router } from 'express';
import { enhancedAuthenticate } from '../middleware/enhanced-auth.middleware';
import {
  createReview,
  getReviews,
  getReview,
  updateReview,
  submitFeedback,
} from '../controllers/review.controller';

const router = Router();

// All routes require authentication with RLS context
router.use(enhancedAuthenticate);

// Review operations
router.get('/', getReviews);
router.post('/', createReview);
router.get('/:id', getReview);
router.put('/:id', updateReview);

// Submit feedback for a review
router.post('/:id/feedback', submitFeedback);

export default router;
