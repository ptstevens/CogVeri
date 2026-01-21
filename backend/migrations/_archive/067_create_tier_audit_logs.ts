import { Knex } from 'knex';

export async function up(knex: Knex): Promise<void> {
  // Create the tier_audit_logs table for tracking tier-level changes
  await knex.schema.createTable('tier_audit_logs', (table) => {
    table.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    table.string('tier_name', 50).notNullable();
    table.string('action', 50).notNullable(); // created, updated, archived, reactivated, stripe_synced, price_changed
    table.uuid('actor_id').references('id').inTable('users').onDelete('SET NULL');
    table.jsonb('changes'); // { field: { from: oldValue, to: newValue } }
    table.jsonb('stripe_details'); // { productId, priceIdMonthly, priceIdYearly, oldPriceId, newPriceId }
    table.timestamp('created_at').defaultTo(knex.fn.now());
  });

  // Add indexes for common queries
  await knex.schema.alterTable('tier_audit_logs', (table) => {
    table.index('tier_name');
    table.index('action');
    table.index('created_at');
  });
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTableIfExists('tier_audit_logs');
}
