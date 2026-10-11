import { Knex } from 'knex';

export async function up(knex: Knex): Promise<void> {
  // Drop the foreign key constraint
  await knex.schema.alterTable('recordings', (table) => {
    table.dropForeign(['user_id']);
  });

  // Make user_id nullable and add it back without constraint
  await knex.schema.alterTable('recordings', (table) => {
    table.uuid('user_id').nullable().alter();
  });

  // Add external_contributor_id column
  await knex.schema.alterTable('recordings', (table) => {
    table
      .uuid('external_contributor_id')
      .references('id')
      .inTable('external_contributors')
      .onDelete('SET NULL');
    table.index('external_contributor_id');
  });
}

export async function down(knex: Knex): Promise<void> {
  // Remove external_contributor_id
  await knex.schema.alterTable('recordings', (table) => {
    table.dropIndex(['external_contributor_id']);
    table.dropForeign(['external_contributor_id']);
    table.dropColumn('external_contributor_id');
  });

  // Make user_id not nullable and restore foreign key
  await knex.schema.alterTable('recordings', (table) => {
    table.uuid('user_id').notNullable().alter();
  });

  await knex.schema.alterTable('recordings', (table) => {
    table.foreign('user_id').references('id').inTable('users').onDelete('RESTRICT');
  });
}
