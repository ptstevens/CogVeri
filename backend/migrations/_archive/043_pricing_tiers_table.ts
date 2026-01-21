import { Knex } from 'knex';

export async function up(knex: Knex): Promise<void> {
  // Create the pricing_tiers table for database-driven pricing management
  await knex.schema.createTable('pricing_tiers', (table) => {
    table.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    table.string('name', 50).unique().notNullable(); // e.g., 'free', 'team', 'pro'
    table.string('display_name', 100).notNullable();
    table.text('description');
    table.integer('monthly_price').notNullable().defaultTo(0); // Price in cents
    table.integer('yearly_price').notNullable().defaultTo(0); // Price in cents
    table.string('stripe_price_id_monthly', 255);
    table.string('stripe_price_id_yearly', 255);
    table.jsonb('limits').notNullable(); // maxMembers, maxStorageGb, etc.
    table.jsonb('features').notNullable(); // Feature flags (boolean map)
    table.boolean('highlighted').defaultTo(false); // "Most Popular" badge
    table.string('cta_text', 100).defaultTo('Get Started');
    table.integer('sort_order').defaultTo(0);
    table.boolean('is_active').defaultTo(true);
    table.timestamp('created_at').defaultTo(knex.fn.now());
    table.timestamp('updated_at').defaultTo(knex.fn.now());
  });

  // Add indexes for common queries
  await knex.schema.alterTable('pricing_tiers', (table) => {
    table.index('name');
    table.index('is_active');
    table.index('sort_order');
  });
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTableIfExists('pricing_tiers');
}
