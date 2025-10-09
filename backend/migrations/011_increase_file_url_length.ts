import { Knex } from 'knex';

export async function up(knex: Knex): Promise<void> {
  // Increase file_url and thumbnail_url length to support long S3/R2 signed URLs
  await knex.schema.alterTable('recordings', (table) => {
    table.string('file_url', 2000).alter();
    table.string('thumbnail_url', 2000).alter();
  });
}

export async function down(knex: Knex): Promise<void> {
  // Revert to original length
  await knex.schema.alterTable('recordings', (table) => {
    table.string('file_url', 500).alter();
    table.string('thumbnail_url', 500).alter();
  });
}
