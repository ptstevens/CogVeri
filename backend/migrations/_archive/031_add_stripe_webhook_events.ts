import { Knex } from 'knex';

/**
 * Migration: Add Stripe Webhook Events Table
 *
 * Creates a table for tracking processed webhook events to ensure idempotency.
 * Also adds missing Stripe-related fields to the organizations table.
 */
export async function up(knex: Knex): Promise<void> {
  // Create stripe_webhook_events table for idempotency tracking
  const hasWebhookEventsTable = await knex.schema.hasTable('stripe_webhook_events');
  if (!hasWebhookEventsTable) {
    await knex.schema.createTable('stripe_webhook_events', (table) => {
      // Primary key
      table.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));

      // Stripe event ID (unique identifier from Stripe)
      table.string('event_id', 255).notNullable().unique();

      // Event type (e.g., 'checkout.session.completed', 'customer.subscription.updated')
      table.string('event_type', 100).notNullable();

      // Processing timestamp
      table.timestamp('processed_at').notNullable().defaultTo(knex.fn.now());

      // Indexes for efficient lookups
      table.index('event_id');
      table.index('event_type');
      table.index('processed_at');
    });
  }

  // Add missing Stripe-related columns to organizations table
  const hasStripeCustomerId = await knex.schema.hasColumn('organizations', 'stripe_customer_id');
  if (!hasStripeCustomerId) {
    await knex.schema.alterTable('organizations', (table) => {
      table.string('stripe_customer_id', 255).nullable();
    });
  }

  const hasStripeSubscriptionId = await knex.schema.hasColumn('organizations', 'stripe_subscription_id');
  if (!hasStripeSubscriptionId) {
    await knex.schema.alterTable('organizations', (table) => {
      table.string('stripe_subscription_id', 255).nullable();
    });
  }

  const hasSubscriptionStatus = await knex.schema.hasColumn('organizations', 'subscription_status');
  if (!hasSubscriptionStatus) {
    await knex.schema.alterTable('organizations', (table) => {
      table.string('subscription_status', 50).nullable().defaultTo('none');
    });
  }

  const hasCancelAtPeriodEnd = await knex.schema.hasColumn('organizations', 'cancel_at_period_end');
  if (!hasCancelAtPeriodEnd) {
    await knex.schema.alterTable('organizations', (table) => {
      table.boolean('cancel_at_period_end').nullable().defaultTo(false);
    });
  }

  const hasCancelAt = await knex.schema.hasColumn('organizations', 'cancel_at');
  if (!hasCancelAt) {
    await knex.schema.alterTable('organizations', (table) => {
      table.timestamp('cancel_at').nullable();
    });
  }

  const hasPaymentFailedAt = await knex.schema.hasColumn('organizations', 'payment_failed_at');
  if (!hasPaymentFailedAt) {
    await knex.schema.alterTable('organizations', (table) => {
      table.timestamp('payment_failed_at').nullable();
    });
  }

  const hasPaymentFailureCount = await knex.schema.hasColumn('organizations', 'payment_failure_count');
  if (!hasPaymentFailureCount) {
    await knex.schema.alterTable('organizations', (table) => {
      table.integer('payment_failure_count').nullable().defaultTo(0);
    });
  }

  // Add indexes for Stripe lookups if they don't exist
  // We need to check for index existence and create if missing
  try {
    await knex.raw(`
      CREATE INDEX IF NOT EXISTS organizations_stripe_customer_id_idx
      ON organizations(stripe_customer_id)
      WHERE stripe_customer_id IS NOT NULL
    `);
  } catch (error) {
    // Index might already exist, ignore error
  }

  try {
    await knex.raw(`
      CREATE INDEX IF NOT EXISTS organizations_stripe_subscription_id_idx
      ON organizations(stripe_subscription_id)
      WHERE stripe_subscription_id IS NOT NULL
    `);
  } catch (error) {
    // Index might already exist, ignore error
  }
}

export async function down(knex: Knex): Promise<void> {
  // Drop the stripe_webhook_events table
  await knex.schema.dropTableIfExists('stripe_webhook_events');

  // Note: We don't drop the organization columns in down migration
  // as they may contain important billing data and other migrations might depend on them
}
