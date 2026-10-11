import { Knex } from 'knex';

/**
 * Migration: Billing System Improvements
 *
 * This migration adds:
 * 1. Status columns to stripe_webhook_events for atomic idempotency and retry tracking
 * 2. Grace period columns to organizations for payment failure handling
 * 3. billing_disputes table for tracking charge disputes
 * 4. Pending tier change columns for scheduled downgrades
 */
export async function up(knex: Knex): Promise<void> {
  // 1. Add status columns to stripe_webhook_events for atomic idempotency (check each column individually)
  const hasStatus = await knex.schema.hasColumn('stripe_webhook_events', 'status');
  const hasErrorMessage = await knex.schema.hasColumn('stripe_webhook_events', 'error_message');
  const hasRetryCount = await knex.schema.hasColumn('stripe_webhook_events', 'retry_count');
  const hasCompletedAt = await knex.schema.hasColumn('stripe_webhook_events', 'completed_at');

  if (!hasStatus) {
    await knex.schema.alterTable('stripe_webhook_events', (table) => {
      table.string('status', 20).defaultTo('completed');
    });
  }

  if (!hasErrorMessage) {
    await knex.schema.alterTable('stripe_webhook_events', (table) => {
      table.text('error_message').nullable();
    });
  }

  if (!hasRetryCount) {
    await knex.schema.alterTable('stripe_webhook_events', (table) => {
      table.integer('retry_count').defaultTo(0);
    });
  }

  if (!hasCompletedAt) {
    await knex.schema.alterTable('stripe_webhook_events', (table) => {
      table.timestamp('completed_at').nullable();
    });
  }

  // Add index for querying failed events for retry
  await knex.raw(`
    CREATE INDEX IF NOT EXISTS stripe_webhook_events_status_idx
    ON stripe_webhook_events(status)
  `);

  // 2. Add grace period columns to organizations (check each column individually)
  const hasGracePeriodExpiry = await knex.schema.hasColumn(
    'organizations',
    'grace_period_expires_at'
  );
  const hasIsSuspended = await knex.schema.hasColumn('organizations', 'is_suspended');
  const hasSuspendedAt = await knex.schema.hasColumn('organizations', 'suspended_at');
  const hasSuspensionReason = await knex.schema.hasColumn('organizations', 'suspension_reason');

  // Add only columns that don't exist
  if (!hasGracePeriodExpiry) {
    await knex.schema.alterTable('organizations', (table) => {
      table.timestamp('grace_period_expires_at').nullable();
    });
  }

  if (!hasIsSuspended) {
    await knex.schema.alterTable('organizations', (table) => {
      table.boolean('is_suspended').defaultTo(false);
    });
  }

  if (!hasSuspendedAt) {
    await knex.schema.alterTable('organizations', (table) => {
      table.timestamp('suspended_at').nullable();
    });
  }

  if (!hasSuspensionReason) {
    await knex.schema.alterTable('organizations', (table) => {
      table.string('suspension_reason', 100).nullable();
    });
  }

  // Add index for querying suspended organizations (if is_suspended exists)
  if (hasIsSuspended || !hasIsSuspended) {
    await knex.raw(`
      CREATE INDEX IF NOT EXISTS organizations_is_suspended_idx
      ON organizations(is_suspended)
      WHERE is_suspended = true
    `);
  }

  // 3. Add pending tier change columns for scheduled downgrades (check each column individually)
  const hasPendingTierChange = await knex.schema.hasColumn('organizations', 'pending_tier_change');
  const hasTierChangeEffectiveAt = await knex.schema.hasColumn(
    'organizations',
    'tier_change_effective_at'
  );

  if (!hasPendingTierChange) {
    await knex.schema.alterTable('organizations', (table) => {
      table.string('pending_tier_change', 50).nullable();
    });
  }

  if (!hasTierChangeEffectiveAt) {
    await knex.schema.alterTable('organizations', (table) => {
      table.timestamp('tier_change_effective_at').nullable();
    });
  }

  // 4. Create billing_disputes table
  const hasDisputesTable = await knex.schema.hasTable('billing_disputes');
  if (!hasDisputesTable) {
    await knex.schema.createTable('billing_disputes', (table) => {
      // Primary key
      table.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));

      // Foreign key to organization
      table
        .uuid('organization_id')
        .notNullable()
        .references('id')
        .inTable('organizations')
        .onDelete('CASCADE');

      // Stripe dispute ID (unique)
      table.string('stripe_dispute_id', 255).notNullable().unique();

      // Stripe charge ID that was disputed
      table.string('stripe_charge_id', 255).notNullable();

      // Amount disputed (in cents)
      table.integer('amount').notNullable();

      // Currency (e.g., 'usd')
      table.string('currency', 3).notNullable();

      // Dispute reason from Stripe
      table.string('reason', 100).nullable();

      // Dispute status (needs_response, under_review, won, lost, etc.)
      table.string('status', 50).notNullable();

      // When the dispute was resolved
      table.timestamp('resolved_at').nullable();

      // Timestamps
      table.timestamps(true, true);

      // Indexes
      table.index('organization_id');
      table.index('status');
      table.index('created_at');
    });
  }

  // 5. Create checkout_sessions table for checkout idempotency
  const hasCheckoutSessionsTable = await knex.schema.hasTable('checkout_sessions');
  if (!hasCheckoutSessionsTable) {
    await knex.schema.createTable('checkout_sessions', (table) => {
      // Primary key
      table.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));

      // Foreign key to organization
      table
        .uuid('organization_id')
        .notNullable()
        .references('id')
        .inTable('organizations')
        .onDelete('CASCADE');

      // Stripe checkout session ID
      table.string('stripe_session_id', 255).notNullable();

      // Checkout URL
      table.text('url').nullable();

      // Session status: pending, completed, expired
      table.string('status', 50).defaultTo('pending');

      // When the session expires
      table.timestamp('expires_at').notNullable();

      // Timestamps
      table.timestamps(true, true);

      // Indexes
      table.index('organization_id');
      table.index(['status', 'expires_at']);
    });
  }
}

export async function down(knex: Knex): Promise<void> {
  // Drop checkout_sessions table
  await knex.schema.dropTableIfExists('checkout_sessions');

  // Drop billing_disputes table
  await knex.schema.dropTableIfExists('billing_disputes');

  // Remove pending tier change columns from organizations (check each column individually)
  const hasPendingTierChange = await knex.schema.hasColumn('organizations', 'pending_tier_change');
  if (hasPendingTierChange) {
    await knex.schema.alterTable('organizations', (table) => {
      table.dropColumn('pending_tier_change');
    });
  }

  const hasTierChangeEffectiveAt = await knex.schema.hasColumn(
    'organizations',
    'tier_change_effective_at'
  );
  if (hasTierChangeEffectiveAt) {
    await knex.schema.alterTable('organizations', (table) => {
      table.dropColumn('tier_change_effective_at');
    });
  }

  // Remove grace period columns from organizations (check each column individually)
  const hasGracePeriodExpiry = await knex.schema.hasColumn(
    'organizations',
    'grace_period_expires_at'
  );
  if (hasGracePeriodExpiry) {
    await knex.schema.alterTable('organizations', (table) => {
      table.dropColumn('grace_period_expires_at');
    });
  }

  const hasIsSuspended = await knex.schema.hasColumn('organizations', 'is_suspended');
  if (hasIsSuspended) {
    await knex.schema.alterTable('organizations', (table) => {
      table.dropColumn('is_suspended');
    });
  }

  const hasSuspendedAt = await knex.schema.hasColumn('organizations', 'suspended_at');
  if (hasSuspendedAt) {
    await knex.schema.alterTable('organizations', (table) => {
      table.dropColumn('suspended_at');
    });
  }

  const hasSuspensionReason = await knex.schema.hasColumn('organizations', 'suspension_reason');
  if (hasSuspensionReason) {
    await knex.schema.alterTable('organizations', (table) => {
      table.dropColumn('suspension_reason');
    });
  }

  // Remove status columns from stripe_webhook_events (check each column individually)
  const hasStatus = await knex.schema.hasColumn('stripe_webhook_events', 'status');
  if (hasStatus) {
    await knex.schema.alterTable('stripe_webhook_events', (table) => {
      table.dropColumn('status');
    });
  }

  const hasErrorMessage = await knex.schema.hasColumn('stripe_webhook_events', 'error_message');
  if (hasErrorMessage) {
    await knex.schema.alterTable('stripe_webhook_events', (table) => {
      table.dropColumn('error_message');
    });
  }

  const hasRetryCount = await knex.schema.hasColumn('stripe_webhook_events', 'retry_count');
  if (hasRetryCount) {
    await knex.schema.alterTable('stripe_webhook_events', (table) => {
      table.dropColumn('retry_count');
    });
  }

  const hasCompletedAt = await knex.schema.hasColumn('stripe_webhook_events', 'completed_at');
  if (hasCompletedAt) {
    await knex.schema.alterTable('stripe_webhook_events', (table) => {
      table.dropColumn('completed_at');
    });
  }
}
