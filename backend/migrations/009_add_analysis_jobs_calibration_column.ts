import { Knex } from 'knex';

/**
 * Migration: Add is_calibration column to analysis_jobs
 *
 * This column marks analysis jobs that are calibration runs
 * (template video being analyzed against its own rubric).
 * Useful for filtering and debugging calibration-specific jobs.
 */

export async function up(knex: Knex): Promise<void> {
  console.log('  Adding is_calibration column to analysis_jobs...');

  // Check if column already exists (idempotent)
  const hasColumn = await knex.schema.hasColumn('analysis_jobs', 'is_calibration');

  if (!hasColumn) {
    await knex.schema.alterTable('analysis_jobs', (table) => {
      table.boolean('is_calibration').defaultTo(false);
    });

    // Add index for filtering calibration jobs
    await knex.raw(`
      CREATE INDEX IF NOT EXISTS idx_analysis_jobs_is_calibration
      ON analysis_jobs(is_calibration)
      WHERE is_calibration = true
    `);
  }

  console.log('  is_calibration column added to analysis_jobs successfully.');
}

export async function down(knex: Knex): Promise<void> {
  console.log('  Removing is_calibration column from analysis_jobs...');

  // Drop index first
  await knex.raw('DROP INDEX IF EXISTS idx_analysis_jobs_is_calibration');

  // Drop column
  const hasColumn = await knex.schema.hasColumn('analysis_jobs', 'is_calibration');
  if (hasColumn) {
    await knex.schema.alterTable('analysis_jobs', (table) => {
      table.dropColumn('is_calibration');
    });
  }

  console.log('  is_calibration column removed from analysis_jobs successfully.');
}
