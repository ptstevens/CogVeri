import { Knex } from 'knex';

export async function up(knex: Knex): Promise<void> {
  // Create the system_settings table for global configuration
  await knex.schema.createTable('system_settings', (table) => {
    table.string('key', 100).primary();
    table.jsonb('value').notNullable();
    table.text('description');
    table.uuid('updated_by').references('id').inTable('users').onDelete('SET NULL');
    table.timestamp('updated_at').defaultTo(knex.fn.now());
    table.timestamp('created_at').defaultTo(knex.fn.now());
  });

  // Insert default settings
  await knex('system_settings').insert([
    {
      key: 'trial_duration_days',
      value: JSON.stringify(7),
      description: 'Default trial duration in days for new organizations',
    },
  ]);
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTableIfExists('system_settings');
}
