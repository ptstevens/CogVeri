import { Knex } from 'knex';

export async function up(knex: Knex): Promise<void> {
  // Add template_id column to tasks table
  await knex.schema.alterTable('tasks', (table) => {
    table.uuid('template_id').references('id').inTable('task_templates').onDelete('SET NULL');
  });

  // Add index for template_id
  await knex.schema.alterTable('tasks', (table) => {
    table.index('template_id');
  });
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.alterTable('tasks', (table) => {
    table.dropIndex('template_id');
    table.dropColumn('template_id');
  });
}
