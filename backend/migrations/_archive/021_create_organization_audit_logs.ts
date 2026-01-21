import { Knex } from 'knex';

export async function up(knex: Knex): Promise<void> {
  // Create comprehensive audit logging table for organization-level activities
  // Tracks all organization changes for compliance, troubleshooting, and analytics
  await knex.schema.createTable('organization_audit_logs', (table) => {
    // Primary key
    table.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));

    // Organization being audited
    table.uuid('organization_id').notNullable()
      .references('id').inTable('organizations').onDelete('CASCADE');

    // User who performed the action (may be system for automated actions)
    table.uuid('actor_id').nullable()
      .references('id').inTable('users').onDelete('SET NULL');

    // Action being logged (e.g., 'organization_created', 'domain_verified', 'member_added')
    table.string('action', 100).notNullable();

    // Type of resource affected (e.g., 'domain', 'member', 'settings')
    table.string('resource_type', 100).nullable();

    // ID of the resource affected
    table.uuid('resource_id').nullable();

    // Changes made (JSON for before/after values)
    table.jsonb('changes').nullable();

    // Additional metadata
    table.jsonb('metadata').nullable();

    // Status of the action
    table.enum('status', ['success', 'pending', 'failed']).defaultTo('success');

    // Error message if action failed
    table.text('error_message').nullable();

    // Timestamp
    table.timestamp('created_at').notNullable().defaultTo(knex.fn.now());

    // Indexes for efficient queries
    table.index('organization_id');
    table.index('actor_id');
    table.index('action');
    table.index('resource_type');
    table.index('created_at');
    table.index(['organization_id', 'created_at']);
  });
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTableIfExists('organization_audit_logs');
}
