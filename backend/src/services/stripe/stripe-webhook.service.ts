import Stripe from 'stripe';
import { getStripeClient, STRIPE_WEBHOOK_SECRET } from './stripe-client';
import { logger } from '../../utils/logger';
import { BadRequestError, ServiceUnavailableError } from '../../utils/AppError';

/**
 * Stripe Webhook Service
 *
 * Handles webhook verification and signature validation
 */
class StripeWebhookService {
  /**
   * Verify a Stripe webhook signature
   * @param payload - Raw request body
   * @param signature - Stripe-Signature header
   */
  verifyWebhookSignature(payload: string | Buffer, signature: string): Stripe.Event {
    const stripeClient = getStripeClient();

    if (!STRIPE_WEBHOOK_SECRET) {
      throw new ServiceUnavailableError('Stripe webhook secret is not configured');
    }

    try {
      const event = stripeClient.webhooks.constructEvent(payload, signature, STRIPE_WEBHOOK_SECRET);
      return event;
    } catch (error) {
      logger.error('Webhook signature verification failed:', error);
      throw new BadRequestError('Invalid webhook signature');
    }
  }
}

export const stripeWebhookService = new StripeWebhookService();
export default stripeWebhookService;
