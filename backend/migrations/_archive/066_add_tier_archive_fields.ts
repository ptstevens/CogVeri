import { Knex } from 'knex';

export async function up(knex: Knex): Promise<void> {
  // Add archive-related columns to pricing_tiers table
  await knex.schema.alterTable('pricing_tiers', (table) => {
    table.boolean('archived').defaultTo(false);
    table.timestamp('archived_at');
    table.uuid('archived_by').references('id').inTable('users').onDelete('SET NULL');
    table.string('stripe_product_id', 255);
  });

  // Add index for archived queries
  await knex.schema.alterTable('pricing_tiers', (table) => {
    table.index('archived');
  });
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.alterTable('pricing_tiers', (table) => {
    table.dropIndex('archived');
    table.dropColumn('archived');
    table.dropColumn('archived_at');
    table.dropColumn('archived_by');
    table.dropColumn('stripe_product_id');
  });
}
