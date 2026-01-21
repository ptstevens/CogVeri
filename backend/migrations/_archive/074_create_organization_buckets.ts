import { Knex } from 'knex';

/**
 * Migration: Create organization_buckets table
 *
 * This table enables per-organization dedicated R2/S3 buckets for true data isolation.
 * Supports enterprise compliance requirements (SOC 2, HIPAA, data residency).
 *
 * Features:
 * - Each organization can have its own dedicated bucket
 * - Bucket naming follows R2 conventions (3-63 chars, lowercase, alphanumeric + hyphens)
 * - Status tracking for provisioning workflow
 * - Region support for data residency requirements
 */

export async function up(knex: Knex): Promise<void> {
  await knex.schema.createTable('organization_buckets', (table) => {
    // Primary key
    table.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));

    // Foreign key to organization (one bucket per org)
    table.uuid('organization_id')
      .notNullable()
      .unique()
      .references('id')
      .inTable('organizations')
      .onDelete('CASCADE');

    // Bucket name - must be globally unique, follows R2 naming conventions
    // R2 limit: 3-63 chars, lowercase alphanumeric + hyphens, no consecutive hyphens
    table.string('bucket_name', 63).notNullable().unique();

    // Region for data residency (R2 uses 'auto' by default)
    table.string('region', 50).notNullable().defaultTo('auto');

    // Provisioning status
    table.string('status', 20).notNullable().defaultTo('provisioning');

    // Error message if provisioning failed
    table.text('error_message');

    // Metadata for future use (e.g., custom settings, compliance tags)
    table.jsonb('metadata').defaultTo('{}');

    // Audit timestamps
    table.timestamp('created_at').notNullable().defaultTo(knex.fn.now());
    table.timestamp('updated_at').notNullable().defaultTo(knex.fn.now());
  });

  // Add CHECK constraint for status values
  await knex.raw(`
    ALTER TABLE organization_buckets
    ADD CONSTRAINT organization_buckets_status_check
    CHECK (status IN ('provisioning', 'active', 'failed', 'deleting', 'deleted'))
  `);

  // Performance indexes
  await knex.raw(`
    CREATE INDEX idx_org_buckets_org_id ON organization_buckets(organization_id);
    CREATE INDEX idx_org_buckets_bucket_name ON organization_buckets(bucket_name);
    CREATE INDEX idx_org_buckets_status ON organization_buckets(status);
  `);

  console.log('Created organization_buckets table with indexes');
}

export async function down(knex: Knex): Promise<void> {
  // Drop indexes first
  await knex.raw('DROP INDEX IF EXISTS idx_org_buckets_org_id');
  await knex.raw('DROP INDEX IF EXISTS idx_org_buckets_bucket_name');
  await knex.raw('DROP INDEX IF EXISTS idx_org_buckets_status');

  // Drop the table
  await knex.schema.dropTableIfExists('organization_buckets');

  console.log('Dropped organization_buckets table');
}
