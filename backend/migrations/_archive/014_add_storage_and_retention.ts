import { Knex } from 'knex';

export async function up(knex: Knex): Promise<void> {
  // Create storage_metrics table to track organization storage usage
  await knex.schema.createTable('storage_metrics', (table) => {
    // Primary key
    table.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));

    // Relationship to organization
    table.uuid('organization_id').notNullable()
      .references('id').inTable('organizations').onDelete('CASCADE');

    // Storage metrics
    table.bigint('total_bytes_used').notNullable().defaultTo(0); // Total storage in bytes
    table.bigint('bytes_by_recordings').notNullable().defaultTo(0); // Space used by recordings
    table.bigint('bytes_by_other').notNullable().defaultTo(0); // Space used by other files

    // Limits
    table.bigint('max_bytes_allowed').notNullable(); // Based on subscription tier
    table.integer('percentage_used').defaultTo(0); // Cached percentage for quick access

    // Snapshot data
    table.integer('recording_count').defaultTo(0);
    table.integer('file_count').defaultTo(0);
    table.timestamp('last_calculated_at'); // When metrics were last recalculated
    table.timestamp('last_cleanup_at'); // When retention cleanup last ran

    // Alerting
    table.boolean('usage_exceeded').defaultTo(false);
    table.boolean('alert_sent').defaultTo(false);
    table.timestamp('alert_sent_at');

    // Timestamps
    table.timestamps(true, true);

    // Indexes
    table.unique('organization_id');
    table.index('usage_exceeded');
    table.index('updated_at');
  });

  // Create recording_retention_policies table
  await knex.schema.createTable('recording_retention_policies', (table) => {
    // Primary key
    table.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));

    // Relationship to organization
    table.uuid('organization_id').notNullable()
      .references('id').inTable('organizations').onDelete('CASCADE');

    // Policy details
    table.string('name', 255).notNullable(); // e.g., \"Standard Retention\", \"Compliance Retention\"
    table.text('description'); // Policy description

    // Retention period
    table.integer('retention_days').notNullable(); // How many days to keep recordings
    table.enum('retention_unit', ['days', 'weeks', 'months', 'years']).defaultTo('days');

    // Apply rules
    table.enum('apply_to', ['all', 'by_status', 'by_type', 'by_age']).defaultTo('all');
    table.jsonb('apply_rules'); // Rules for which recordings to apply this to
    // Example: { status: ['completed', 'approved'], types: ['screen', 'camera'] }

    // Action when retention expires
    table.enum('action_on_expiry', ['delete', 'archive', 'anonymize']).defaultTo('delete');

    // Activity tracking
    table.boolean('is_active').defaultTo(true);
    table.boolean('is_default').defaultTo(false); // Default policy for new recordings
    table.integer('priority').defaultTo(0); // Higher priority policies apply first

    // Automation
    table.boolean('auto_enforce').defaultTo(true); // Automatically delete/archive expired recordings
    table.integer('check_interval_days').defaultTo(1); // How often to check for expired recordings
    table.timestamp('last_enforcement_at'); // When this policy was last applied
    table.integer('recordings_affected_count').defaultTo(0); // Total recordings affected by this policy

    // Exemptions
    table.jsonb('exemption_rules'); // Rules for recordings exempt from this policy
    // Example: { tags: ['important'], contains_sensitive: true }

    // Timestamps
    table.timestamps(true, true);

    // Indexes
    table.index('organization_id');
    table.index('is_active');
    table.index('is_default');
    table.index('last_enforcement_at');
    table.unique(['organization_id', 'name']);
  });

  // Create retention_execution_log table to track policy enforcement
  await knex.schema.createTable('retention_execution_logs', (table) => {
    // Primary key
    table.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));

    // Relationship to organization and policy
    table.uuid('organization_id').notNullable()
      .references('id').inTable('organizations').onDelete('CASCADE');
    table.uuid('policy_id').notNullable()
      .references('id').inTable('recording_retention_policies').onDelete('CASCADE');

    // Execution details
    table.enum('action', ['delete', 'archive', 'anonymize']).notNullable();
    table.enum('status', ['pending', 'running', 'completed', 'failed']).defaultTo('pending');

    // Results
    table.integer('recordings_processed').defaultTo(0);
    table.integer('recordings_affected').defaultTo(0);
    table.integer('recordings_failed').defaultTo(0);
    table.text('error_message'); // If failed, error details

    // Execution timing
    table.timestamp('started_at');
    table.timestamp('completed_at');
    table.integer('duration_seconds'); // How long enforcement took

    // Audit info
    table.uuid('initiated_by'); // User who manually triggered if not automatic
    table.boolean('is_manual').defaultTo(false);

    // Batch info
    table.string('batch_id', 100); // Group multiple executions in one batch
    table.integer('batch_number').defaultTo(0); // Which batch in a series

    // Timestamps
    table.timestamps(true, true);

    // Indexes
    table.index('organization_id');
    table.index('policy_id');
    table.index('status');
    table.index('created_at');
    table.index(['organization_id', 'status']);
  });

  // Create storage_quota_alerts table
  await knex.schema.createTable('storage_quota_alerts', (table) => {
    // Primary key
    table.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));

    // Relationship to organization
    table.uuid('organization_id').notNullable()
      .references('id').inTable('organizations').onDelete('CASCADE');

    // Alert configuration
    table.integer('threshold_percentage').notNullable(); // 75%, 90%, 100%, etc.
    table.enum('alert_type', ['warning', 'critical']).notNullable();

    // Activity
    table.boolean('is_active').defaultTo(true);
    table.boolean('triggered').defaultTo(false);
    table.timestamp('triggered_at');
    table.timestamp('resolved_at'); // When usage fell below threshold again

    // Notification
    table.boolean('notification_sent').defaultTo(false);
    table.timestamp('notification_sent_at');
    table.text('notification_channels'); // email, slack, webhook, etc.

    // Actions taken
    table.jsonb('actions_taken'); // Auto-actions triggered (e.g., disable uploads)
    table.text('action_log');

    // Timestamps
    table.timestamps(true, true);

    // Indexes
    table.index('organization_id');
    table.index('triggered');
    table.index('alert_type');
    table.unique(['organization_id', 'threshold_percentage', 'alert_type']);
  });
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTableIfExists('storage_quota_alerts');
  await knex.schema.dropTableIfExists('retention_execution_logs');
  await knex.schema.dropTableIfExists('recording_retention_policies');
  await knex.schema.dropTableIfExists('storage_metrics');
}
