import { Knex } from 'knex';

export async function up(knex: Knex): Promise<void> {
  // Create the organization_feature_grants table for time-limited feature grants
  await knex.schema.createTable('organization_feature_grants', (table) => {
    table.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    table.uuid('organization_id').notNullable().references('id').inTable('organizations').onDelete('CASCADE');
    table.string('feature_name', 100).notNullable();
    table.timestamp('granted_at').defaultTo(knex.fn.now());
    table.timestamp('expires_at').notNullable();
    table.uuid('granted_by').references('id').inTable('users').onDelete('SET NULL');
    table.timestamp('revoked_at');
    table.uuid('revoked_by').references('id').inTable('users').onDelete('SET NULL');
    table.text('reason');
    table.timestamp('created_at').defaultTo(knex.fn.now());
  });

  // Add indexes for common queries
  await knex.schema.alterTable('organization_feature_grants', (table) => {
    table.index('organization_id');
    table.index('feature_name');
    table.index('expires_at');
  });

  // Create partial unique index for one active grant per org/feature
  // This also serves as the lookup index for active grants
  // Expiration is checked at query time since NOW() cannot be used in index predicates
  await knex.raw(`
    CREATE UNIQUE INDEX idx_feature_grants_unique_active
    ON organization_feature_grants(organization_id, feature_name)
    WHERE revoked_at IS NULL
  `);
}

export async function down(knex: Knex): Promise<void> {
  await knex.raw('DROP INDEX IF EXISTS idx_feature_grants_unique_active');
  await knex.schema.dropTableIfExists('organization_feature_grants');
}
