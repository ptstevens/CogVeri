import Stripe from 'stripe';
import { getStripeClient } from './stripe-client';
import { logger } from '../../utils/logger';
import { NotFoundError } from '../../utils/AppError';

/**
 * Stripe Customer Service
 *
 * Handles customer management operations:
 * - Creating customers for organizations
 * - Retrieving customer details
 * - Updating customer information
 */
class StripeCustomerService {
  /**
   * Create a Stripe customer for an organization
   * @param organizationId - The organization's ID
   * @param email - Billing email address
   * @param name - Organization name
   * @param metadata - Additional metadata to store
   */
  async createCustomer(
    organizationId: string,
    email: string,
    name: string,
    metadata?: Record<string, string>
  ): Promise<Stripe.Customer> {
    const stripeClient = getStripeClient();

    try {
      logger.info(`Creating Stripe customer for organization: ${organizationId}`);

      const customer = await stripeClient.customers.create({
        email,
        name,
        metadata: {
          organization_id: organizationId,
          ...metadata,
        },
      });

      logger.info(`Stripe customer created: ${customer.id} for organization: ${organizationId}`);

      return customer;
    } catch (error) {
      logger.error('Error creating Stripe customer:', error);
      throw error;
    }
  }

  /**
   * Get customer details from Stripe
   * @param stripeCustomerId - The Stripe customer ID
   */
  async getCustomer(stripeCustomerId: string): Promise<Stripe.Customer | Stripe.DeletedCustomer> {
    const stripeClient = getStripeClient();

    try {
      const customer = await stripeClient.customers.retrieve(stripeCustomerId);
      return customer;
    } catch (error) {
      if (error instanceof Stripe.errors.StripeInvalidRequestError) {
        throw new NotFoundError(`Customer not found: ${stripeCustomerId}`);
      }
      logger.error('Error retrieving Stripe customer:', error);
      throw error;
    }
  }

  /**
   * Update customer details
   * @param stripeCustomerId - The Stripe customer ID
   * @param updates - Fields to update
   */
  async updateCustomer(
    stripeCustomerId: string,
    updates: Stripe.CustomerUpdateParams
  ): Promise<Stripe.Customer> {
    const stripeClient = getStripeClient();

    try {
      const customer = await stripeClient.customers.update(stripeCustomerId, updates);
      logger.info(`Stripe customer updated: ${stripeCustomerId}`);
      return customer;
    } catch (error) {
      logger.error('Error updating Stripe customer:', error);
      throw error;
    }
  }
}

export const stripeCustomerService = new StripeCustomerService();
export default stripeCustomerService;
