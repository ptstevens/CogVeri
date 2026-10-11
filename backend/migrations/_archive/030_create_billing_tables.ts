import { Knex } from 'knex';

/**
 * Migration: Create Billing Tables
 *
 * Creates the foundational tables for Stripe billing integration:
 * - subscriptions: Tracks organization subscription status
 * - invoices: Stores invoice history from Stripe
 * - payment_methods: Stores payment method details
 */
export async function up(knex: Knex): Promise<void> {
  // Create subscription status enum type
  await knex.raw(`
    DO $$ BEGIN
      CREATE TYPE subscription_status AS ENUM (
        'trialing',
        'active',
        'past_due',
        'canceled',
        'unpaid',
        'incomplete',
        'incomplete_expired',
        'paused'
      );
    EXCEPTION
      WHEN duplicate_object THEN null;
    END $$;
  `);

  // Create subscriptions table
  await knex.schema.createTable('subscriptions', (table) => {
    // Primary key
    table.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));

    // Organization relationship (one subscription per organization)
    table
      .uuid('organization_id')
      .notNullable()
      .unique()
      .references('id')
      .inTable('organizations')
      .onDelete('CASCADE');

    // Stripe identifiers
    table.string('stripe_customer_id', 255).notNullable();
    table.string('stripe_subscription_id', 255);
    table.string('stripe_price_id', 255);

    // Subscription status
    table.specificType('status', 'subscription_status').notNullable().defaultTo('trialing');

    // Billing period tracking
    table.timestamp('current_period_start').notNullable().defaultTo(knex.fn.now());
    table.timestamp('current_period_end').notNullable().defaultTo(knex.fn.now());

    // Cancellation tracking
    table.boolean('cancel_at_period_end').notNullable().defaultTo(false);
    table.timestamp('canceled_at');

    // Trial tracking
    table.timestamp('trial_start');
    table.timestamp('trial_end');

    // Billing interval (monthly/yearly)
    table.string('billing_interval', 20).defaultTo('monthly');

    // Metadata
    table.jsonb('metadata').defaultTo('{}');

    // Timestamps
    table.timestamps(true, true);

    // Indexes for efficient lookups
    table.index('stripe_customer_id');
    table.index('stripe_subscription_id');
    table.index('status');
    table.index('current_period_end');
    table.index('trial_end');
  });

  // Create invoices table
  await knex.schema.createTable('invoices', (table) => {
    // Primary key
    table.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));

    // Organization relationship
    table
      .uuid('organization_id')
      .notNullable()
      .references('id')
      .inTable('organizations')
      .onDelete('CASCADE');

    // Stripe identifiers
    table.string('stripe_invoice_id', 255).notNullable().unique();
    table.string('stripe_subscription_id', 255);
    table.string('stripe_payment_intent_id', 255);

    // Invoice amounts (in cents)
    table.integer('amount_due').notNullable().defaultTo(0);
    table.integer('amount_paid').notNullable().defaultTo(0);
    table.integer('amount_remaining').notNullable().defaultTo(0);
    table.integer('subtotal').notNullable().defaultTo(0);
    table.integer('tax').defaultTo(0);
    table.integer('total').notNullable().defaultTo(0);

    // Currency
    table.string('currency', 3).notNullable().defaultTo('usd');

    // Invoice status
    table.string('status', 50).notNullable().defaultTo('draft');

    // Invoice URLs
    table.text('invoice_pdf');
    table.text('hosted_invoice_url');

    // Billing period
    table.timestamp('period_start').notNullable();
    table.timestamp('period_end').notNullable();

    // Invoice details
    table.string('number', 100);
    table.text('description');

    // Payment tracking
    table.timestamp('paid_at');
    table.timestamp('due_date');
    table.integer('attempt_count').defaultTo(0);
    table.timestamp('next_payment_attempt');

    // Timestamps
    table.timestamp('created_at').notNullable().defaultTo(knex.fn.now());

    // Indexes
    table.index('organization_id');
    table.index('stripe_subscription_id');
    table.index('status');
    table.index('created_at');
    table.index('period_start');
    table.index('period_end');
  });

  // Create payment_methods table
  await knex.schema.createTable('payment_methods', (table) => {
    // Primary key
    table.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));

    // Organization relationship
    table
      .uuid('organization_id')
      .notNullable()
      .references('id')
      .inTable('organizations')
      .onDelete('CASCADE');

    // Stripe identifier
    table.string('stripe_payment_method_id', 255).notNullable().unique();

    // Payment method type
    table.string('type', 50).notNullable(); // 'card', 'bank_account', etc.

    // Default payment method flag
    table.boolean('is_default').notNullable().defaultTo(false);

    // Card details (for card type)
    table.string('last_four', 4);
    table.string('brand', 50); // visa, mastercard, amex, etc.
    table.integer('exp_month');
    table.integer('exp_year');
    table.string('funding', 20); // credit, debit, prepaid

    // Bank account details (for bank_account type)
    table.string('bank_name', 255);
    table.string('account_holder_type', 20); // individual, company

    // Billing details
    table.string('billing_name', 255);
    table.string('billing_email', 255);
    table.string('billing_phone', 50);
    table.jsonb('billing_address').defaultTo('{}');

    // Status
    table.boolean('is_active').notNullable().defaultTo(true);

    // Timestamps
    table.timestamp('created_at').notNullable().defaultTo(knex.fn.now());

    // Indexes
    table.index('organization_id');
    table.index('is_default');
    table.index('type');
    table.index('is_active');
  });

  // Create billing_events table for audit trail
  await knex.schema.createTable('billing_events', (table) => {
    // Primary key
    table.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));

    // Organization relationship
    table
      .uuid('organization_id')
      .notNullable()
      .references('id')
      .inTable('organizations')
      .onDelete('CASCADE');

    // Event details
    table.string('event_type', 100).notNullable(); // subscription.created, invoice.paid, etc.
    table.string('stripe_event_id', 255).unique();

    // Related resources
    table.string('stripe_subscription_id', 255);
    table.string('stripe_invoice_id', 255);
    table.string('stripe_payment_method_id', 255);

    // Event data
    table.jsonb('event_data').notNullable().defaultTo('{}');

    // Processing status
    table.string('status', 50).notNullable().defaultTo('pending'); // pending, processed, failed
    table.text('error_message');
    table.integer('retry_count').defaultTo(0);
    table.timestamp('processed_at');

    // Timestamps
    table.timestamp('created_at').notNullable().defaultTo(knex.fn.now());

    // Indexes
    table.index('organization_id');
    table.index('event_type');
    table.index('stripe_event_id');
    table.index('status');
    table.index('created_at');
  });

  // Add billing-related columns to organizations table if not present
  // Check each column individually to handle partial migrations
  const hasStripeCustomerId = await knex.schema.hasColumn('organizations', 'stripe_customer_id');
  const hasBillingEnabled = await knex.schema.hasColumn('organizations', 'billing_enabled');
  const hasBillingEmail = await knex.schema.hasColumn('organizations', 'billing_email');

  if (!hasStripeCustomerId || !hasBillingEnabled || !hasBillingEmail) {
    await knex.schema.alterTable('organizations', (table) => {
      if (!hasStripeCustomerId) {
        table.string('stripe_customer_id', 255);
        table.index('stripe_customer_id');
      }
      if (!hasBillingEnabled) {
        table.boolean('billing_enabled').defaultTo(false);
      }
      if (!hasBillingEmail) {
        table.string('billing_email', 255);
      }
    });
  }
}

export async function down(knex: Knex): Promise<void> {
  // Drop billing-related columns from organizations (check each individually)
  const hasStripeCustomerId = await knex.schema.hasColumn('organizations', 'stripe_customer_id');
  const hasBillingEnabled = await knex.schema.hasColumn('organizations', 'billing_enabled');
  const hasBillingEmail = await knex.schema.hasColumn('organizations', 'billing_email');

  if (hasStripeCustomerId || hasBillingEnabled || hasBillingEmail) {
    await knex.schema.alterTable('organizations', (table) => {
      if (hasStripeCustomerId) {
        table.dropIndex('stripe_customer_id');
        table.dropColumn('stripe_customer_id');
      }
      if (hasBillingEnabled) {
        table.dropColumn('billing_enabled');
      }
      if (hasBillingEmail) {
        table.dropColumn('billing_email');
      }
    });
  }

  // Drop tables in reverse order of dependencies
  await knex.schema.dropTableIfExists('billing_events');
  await knex.schema.dropTableIfExists('payment_methods');
  await knex.schema.dropTableIfExists('invoices');
  await knex.schema.dropTableIfExists('subscriptions');

  // Drop enum type
  await knex.raw('DROP TYPE IF EXISTS subscription_status CASCADE;');
}
