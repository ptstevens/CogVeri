import { Knex } from 'knex';

/**
 * Migration: Add is_temp_rubric_generation column and make task_id nullable
 *
 * This migration:
 * 1. Makes task_id nullable to support temp recordings for rubric generation
 * 2. Adds is_temp_rubric_generation column to identify temporary recordings
 * 3. Adds cleanup index for efficient querying of temp recordings
 *
 * Temp recordings are created for the AI rubric generation feature where users
 * upload videos for transcription and analysis. These are deleted after the
 * rubric is saved or the modal is closed.
 */
export async function up(knex: Knex): Promise<void> {
  // First, make task_id nullable to support temp recordings
  // We need to drop the NOT NULL constraint
  await knex.raw(`
    ALTER TABLE recordings
    ALTER COLUMN task_id DROP NOT NULL
  `);

  // Add the is_temp_rubric_generation column
  await knex.schema.alterTable('recordings', (table) => {
    table.boolean('is_temp_rubric_generation').defaultTo(false).notNullable();
  });

  // Add index for efficient cleanup queries
  await knex.schema.alterTable('recordings', (table) => {
    table.index(['is_temp_rubric_generation', 'created_at'], 'idx_recordings_temp_rubric_cleanup');
  });
}

export async function down(knex: Knex): Promise<void> {
  // First, delete any temp recordings that would violate the NOT NULL constraint
  await knex('recordings').where('task_id', null).del();

  // Remove the index and column
  await knex.schema.alterTable('recordings', (table) => {
    table.dropIndex(
      ['is_temp_rubric_generation', 'created_at'],
      'idx_recordings_temp_rubric_cleanup'
    );
    table.dropColumn('is_temp_rubric_generation');
  });

  // Restore NOT NULL constraint on task_id
  await knex.raw(`
    ALTER TABLE recordings
    ALTER COLUMN task_id SET NOT NULL
  `);
}
