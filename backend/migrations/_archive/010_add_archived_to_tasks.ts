import { Knex } from 'knex';

export async function up(knex: Knex): Promise<void> {
  await knex.schema.alterTable('tasks', (table) => {
    table.boolean('archived').defaultTo(false).notNullable();
  });
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.alterTable('tasks', (table) => {
    table.dropColumn('archived');
  });
}
