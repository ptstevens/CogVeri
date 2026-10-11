import { Knex } from 'knex';

/**
 * Migration: Create impersonation_logs table
 *
 * This table provides audit trail for admin impersonation sessions.
 * Required for security compliance and accountability.
 *
 * Features:
 * - Full audit trail of who impersonated whom
 * - Session tracking with start/end times
 * - IP address and user agent for security forensics
 * - Status tracking (active, ended, expired)
 */

export async function up(knex: Knex): Promise<void> {
  await knex.schema.createTable('impersonation_logs', (table) => {
    // Primary key
    table.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));

    // Organization context
    table
      .uuid('organization_id')
      .notNullable()
      .references('id')
      .inTable('organizations')
      .onDelete('CASCADE');

    // The admin who initiated the impersonation
    table.uuid('actor_id').notNullable().references('id').inTable('users').onDelete('CASCADE');

    // The user being impersonated
    table
      .uuid('target_user_id')
      .notNullable()
      .references('id')
      .inTable('users')
      .onDelete('CASCADE');

    // Session timestamps
    table.timestamp('started_at').notNullable().defaultTo(knex.fn.now());
    table.timestamp('ended_at');

    // Security metadata
    table.string('ip_address', 45); // IPv6 max length
    table.string('user_agent', 500);

    // Session status
    table.string('status', 20).notNullable().defaultTo('active');

    // Additional metadata (JSON for flexibility)
    table.jsonb('metadata').defaultTo('{}');

    // Audit timestamps
    table.timestamp('created_at').notNullable().defaultTo(knex.fn.now());
    table.timestamp('updated_at').notNullable().defaultTo(knex.fn.now());
  });

  // Add CHECK constraint for status values
  await knex.raw(`
    ALTER TABLE impersonation_logs
    ADD CONSTRAINT impersonation_logs_status_check
    CHECK (status IN ('active', 'ended', 'expired'))
  `);

  // Performance indexes
  await knex.raw(`
    CREATE INDEX idx_impersonation_logs_org_id ON impersonation_logs(organization_id);
    CREATE INDEX idx_impersonation_logs_actor_id ON impersonation_logs(actor_id);
    CREATE INDEX idx_impersonation_logs_target_user_id ON impersonation_logs(target_user_id);
    CREATE INDEX idx_impersonation_logs_status ON impersonation_logs(status);
    CREATE INDEX idx_impersonation_logs_started_at ON impersonation_logs(started_at DESC);
  `);

  // Composite index for common query patterns
  await knex.raw(`
    CREATE INDEX idx_impersonation_logs_org_started ON impersonation_logs(organization_id, started_at DESC);
    CREATE INDEX idx_impersonation_logs_actor_active ON impersonation_logs(actor_id, status) WHERE status = 'active';
  `);

  console.log('Created impersonation_logs table with indexes');
}

export async function down(knex: Knex): Promise<void> {
  // Drop indexes first
  await knex.raw('DROP INDEX IF EXISTS idx_impersonation_logs_org_id');
  await knex.raw('DROP INDEX IF EXISTS idx_impersonation_logs_actor_id');
  await knex.raw('DROP INDEX IF EXISTS idx_impersonation_logs_target_user_id');
  await knex.raw('DROP INDEX IF EXISTS idx_impersonation_logs_status');
  await knex.raw('DROP INDEX IF EXISTS idx_impersonation_logs_started_at');
  await knex.raw('DROP INDEX IF EXISTS idx_impersonation_logs_org_started');
  await knex.raw('DROP INDEX IF EXISTS idx_impersonation_logs_actor_active');

  // Drop the table
  await knex.schema.dropTableIfExists('impersonation_logs');

  console.log('Dropped impersonation_logs table');
}
