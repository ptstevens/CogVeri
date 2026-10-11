import { Knex } from 'knex';

export async function up(knex: Knex): Promise<void> {
  await knex.schema.table('tasks', (table) => {
    table.integer('estimated_duration'); // Estimated duration in minutes
    table.integer('actual_duration'); // Actual duration in minutes
  });
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.table('tasks', (table) => {
    table.dropColumn('estimated_duration');
    table.dropColumn('actual_duration');
  });
}
