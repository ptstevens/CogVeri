import { Knex } from 'knex';

/**
 * Migration for billing and subscription management
 *
 * Adds:
 * 1. organization_subscriptions table - tracks subscription history and trials
 * 2. organization_usage table - tracks monthly usage for quota enforcement
 * 3. Updates organizations table with additional billing fields
 */
export async function up(knex: Knex): Promise<void> {
  // Create organization_subscriptions table
  await knex.schema.createTable('organization_subscriptions', (table) => {
    table.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));

    table
      .uuid('organization_id')
      .notNullable()
      .references('id')
      .inTable('organizations')
      .onDelete('CASCADE');

    // Subscription details
    table.string('tier', 50).notNullable(); // free, pro, team, business, enterprise
    table
      .enum('status', ['active', 'trialing', 'past_due', 'canceled', 'expired'])
      .notNullable()
      .defaultTo('active');
    table.enum('billing_interval', ['monthly', 'yearly']).notNullable().defaultTo('monthly');

    // Trial information
    table.boolean('is_trial').notNullable().defaultTo(false);
    table.timestamp('trial_start').nullable();
    table.timestamp('trial_end').nullable();

    // Subscription period
    table.timestamp('current_period_start').notNullable();
    table.timestamp('current_period_end').notNullable();

    // Payment provider info (Stripe, etc.)
    table.string('stripe_subscription_id', 255).nullable();
    table.string('stripe_customer_id', 255).nullable();
    table.string('stripe_price_id', 255).nullable();

    // Cancellation info
    table.timestamp('canceled_at').nullable();
    table.string('cancellation_reason', 500).nullable();
    table.boolean('cancel_at_period_end').notNullable().defaultTo(false);

    // Reminder tracking
    table.boolean('trial_reminder_7d_sent').notNullable().defaultTo(false);
    table.boolean('trial_reminder_3d_sent').notNullable().defaultTo(false);
    table.boolean('trial_reminder_1d_sent').notNullable().defaultTo(false);
    table.boolean('trial_ended_notification_sent').notNullable().defaultTo(false);

    // Timestamps
    table.timestamps(true, true);

    // Indexes
    table.index('organization_id');
    table.index('status');
    table.index('trial_end');
    table.index('current_period_end');
    table.index('stripe_subscription_id');
    table.index('stripe_customer_id');
  });

  // Create organization_usage table for monthly quota tracking
  await knex.schema.createTable('organization_usage', (table) => {
    table.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));

    table
      .uuid('organization_id')
      .notNullable()
      .references('id')
      .inTable('organizations')
      .onDelete('CASCADE');

    // Usage period (monthly tracking)
    table.integer('year').notNullable();
    table.integer('month').notNullable(); // 1-12

    // Usage counts
    table.integer('tasks_count').notNullable().defaultTo(0);
    table.integer('videos_count').notNullable().defaultTo(0);
    table.bigInteger('storage_bytes').notNullable().defaultTo(0);
    table.integer('members_count').notNullable().defaultTo(0);
    table.integer('external_contributors_count').notNullable().defaultTo(0);
    table.integer('workspaces_count').notNullable().defaultTo(0);

    // Video duration tracking (in seconds)
    table.bigInteger('total_video_duration_seconds').notNullable().defaultTo(0);

    // Timestamps
    table.timestamps(true, true);

    // Unique constraint: one record per org per month
    table.unique(['organization_id', 'year', 'month']);

    // Indexes
    table.index('organization_id');
    table.index(['year', 'month']);
  });

  // Create external_contributors table if it doesn't exist
  const hasExternalContributors = await knex.schema.hasTable('external_contributors');
  if (!hasExternalContributors) {
    await knex.schema.createTable('external_contributors', (table) => {
      table.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));

      table
        .uuid('organization_id')
        .notNullable()
        .references('id')
        .inTable('organizations')
        .onDelete('CASCADE');

      table.string('email', 255).notNullable();
      table.string('first_name', 100);
      table.string('last_name', 100);

      // Track the magic link they came from
      table
        .uuid('magic_link_id')
        .nullable()
        .references('id')
        .inTable('magic_links')
        .onDelete('SET NULL');

      // Status
      table.boolean('is_active').notNullable().defaultTo(true);
      table.timestamp('last_activity_at');

      // Timestamps
      table.timestamps(true, true);

      // Unique constraint: one record per email per org
      table.unique(['organization_id', 'email']);

      // Indexes
      table.index('organization_id');
      table.index('email');
      table.index('is_active');
    });
  }

  // Add billing-related fields to organizations table
  await knex.schema.alterTable('organizations', (table) => {
    // Add columns if they don't exist
    table.integer('max_members').nullable();
    table.integer('max_recordings_gb').nullable();
    table.integer('max_tasks_per_month').nullable();
    table.integer('max_videos_per_month').nullable();
    table.integer('max_video_length_minutes').nullable();
    table.integer('max_external_contributors').nullable();
    table.integer('max_workspaces').nullable();

    // Billing contact
    table.string('billing_email', 255).nullable();
    table.string('billing_name', 255).nullable();

    // Trial tracking (deprecated - use organization_subscriptions)
    table.boolean('has_used_trial').defaultTo(false);
  });
}

export async function down(knex: Knex): Promise<void> {
  // Remove billing fields from organizations
  await knex.schema.alterTable('organizations', (table) => {
    table.dropColumn('max_members');
    table.dropColumn('max_recordings_gb');
    table.dropColumn('max_tasks_per_month');
    table.dropColumn('max_videos_per_month');
    table.dropColumn('max_video_length_minutes');
    table.dropColumn('max_external_contributors');
    table.dropColumn('max_workspaces');
    table.dropColumn('billing_email');
    table.dropColumn('billing_name');
    table.dropColumn('has_used_trial');
  });

  // Drop tables in reverse order
  await knex.schema.dropTableIfExists('external_contributors');
  await knex.schema.dropTableIfExists('organization_usage');
  await knex.schema.dropTableIfExists('organization_subscriptions');
}
