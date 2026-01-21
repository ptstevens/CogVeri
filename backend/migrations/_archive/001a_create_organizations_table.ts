import { Knex } from 'knex';

export async function up(knex: Knex): Promise<void> {
  await knex.schema.createTable('organizations', (table) => {
    // Primary key
    table.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));

    // Organization information
    table.string('name', 255).notNullable();
    table.text('description');
    table.string('logo_url', 500);

    // Subscription/Plan information
    table.string('subscription_tier', 50).defaultTo('free');
    table.datetime('subscription_expiry');
    table.integer('max_tasks').defaultTo(10);
    table.integer('max_users').defaultTo(5);
    table.integer('max_storage_gb').defaultTo(10);

    // Status
    table.boolean('is_active').defaultTo(true);
    table.boolean('is_suspended').defaultTo(false);

    // Owner
    table.uuid('owner_id')
      .references('id').inTable('users').onDelete('SET NULL');

    // Timestamps
    table.timestamps(true, true);

    // Indexes
    table.index('owner_id');
    table.index('subscription_tier');
    table.index('is_active');
  });
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTableIfExists('organizations');
}
