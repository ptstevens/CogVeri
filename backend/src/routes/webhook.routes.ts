import { Router, raw } from 'express';
import { handleStripeWebhook } from '../webhooks/stripe';

const router = Router();

/**
 * POST /api/webhooks/stripe
 * Stripe webhook endpoint
 *
 * IMPORTANT: This route uses raw body parser for signature verification.
 * The express.json() middleware must NOT be applied to this route.
 *
 * Security:
 * - Verifies Stripe signature using STRIPE_WEBHOOK_SECRET
 * - Returns 200 immediately, processes async
 * - Idempotent (safe to replay events)
 */
router.post(
  '/stripe',
  // Use raw body parser - required for Stripe signature verification
  raw({ type: 'application/json' }),
  handleStripeWebhook
);

export default router;
