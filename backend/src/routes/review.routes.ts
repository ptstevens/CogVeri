import { Router } from 'express';
import { authenticate } from '../middleware/auth';
import {
  createReview,
  getReviews,
  getReview,
  updateReview,
  submitFeedback,
} from '../controllers/review.controller';

const router = Router();

// All routes require authentication
router.use(authenticate);

// Review operations
router.get('/', getReviews);
router.post('/', createReview);
router.get('/:id', getReview);
router.put('/:id', updateReview);

// Submit feedback for a review
router.post('/:id/feedback', submitFeedback);

export default router;