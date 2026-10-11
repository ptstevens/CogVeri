import { Knex } from 'knex';

export async function up(knex: Knex): Promise<void> {
  // Make organization_id nullable in api_metrics table
  // This allows tracking metrics for unauthenticated requests (e.g., health checks)
  await knex.schema.alterTable('api_metrics', (table) => {
    table.uuid('organization_id').nullable().alter();
  });

  // Make organization_id nullable in api_usage_summary table as well
  await knex.schema.alterTable('api_usage_summary', (table) => {
    table.uuid('organization_id').nullable().alter();
  });
}

export async function down(knex: Knex): Promise<void> {
  // Revert changes
  await knex.schema.alterTable('api_metrics', (table) => {
    table.uuid('organization_id').notNullable().alter();
  });

  await knex.schema.alterTable('api_usage_summary', (table) => {
    table.uuid('organization_id').notNullable().alter();
  });
}
