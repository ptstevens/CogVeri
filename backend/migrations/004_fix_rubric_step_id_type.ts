import { Knex } from 'knex';

/**
 * Migration: Fix rubric_step_id column type in analysis_step_scores
 *
 * The baseline schema incorrectly defined `rubric_step_id` as UUID,
 * but rubric step IDs are human-readable strings (e.g., "step-1", "greeting-check")
 * stored in the evaluation_criteria JSON within task_templates.
 *
 * This migration changes the column from UUID to VARCHAR(50) to match
 * the actual data format used by the rubric schema.
 *
 * Error this fixes:
 * "invalid input syntax for type uuid: 'step-1'"
 */

export async function up(knex: Knex): Promise<void> {
  const hasColumn = await knex.schema.hasColumn('analysis_step_scores', 'rubric_step_id');

  if (hasColumn) {
    console.log('  Altering analysis_step_scores.rubric_step_id from UUID to VARCHAR(50)...');

    // Drop the unique constraint that references this column
    await knex.raw(`
      ALTER TABLE analysis_step_scores
      DROP CONSTRAINT IF EXISTS analysis_step_scores_analysis_job_id_rubric_step_id_unique
    `);

    // Change the column type
    await knex.raw(`
      ALTER TABLE analysis_step_scores
      ALTER COLUMN rubric_step_id TYPE VARCHAR(50)
      USING rubric_step_id::VARCHAR(50)
    `);

    // Recreate the unique constraint
    await knex.raw(`
      ALTER TABLE analysis_step_scores
      ADD CONSTRAINT analysis_step_scores_analysis_job_id_rubric_step_id_unique
      UNIQUE (analysis_job_id, rubric_step_id)
    `);

    console.log('  Column type changed successfully.');
  }
}

export async function down(knex: Knex): Promise<void> {
  const hasColumn = await knex.schema.hasColumn('analysis_step_scores', 'rubric_step_id');

  if (hasColumn) {
    console.log('  Reverting analysis_step_scores.rubric_step_id to UUID...');

    // Drop the unique constraint
    await knex.raw(`
      ALTER TABLE analysis_step_scores
      DROP CONSTRAINT IF EXISTS analysis_step_scores_analysis_job_id_rubric_step_id_unique
    `);

    // Note: This will fail if there are non-UUID values in the column
    // First, delete any rows with invalid UUIDs
    await knex.raw(`
      DELETE FROM analysis_step_scores
      WHERE rubric_step_id IS NOT NULL
      AND rubric_step_id !~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
    `);

    // Change the column type back to UUID
    await knex.raw(`
      ALTER TABLE analysis_step_scores
      ALTER COLUMN rubric_step_id TYPE UUID
      USING rubric_step_id::UUID
    `);

    // Recreate the unique constraint
    await knex.raw(`
      ALTER TABLE analysis_step_scores
      ADD CONSTRAINT analysis_step_scores_analysis_job_id_rubric_step_id_unique
      UNIQUE (analysis_job_id, rubric_step_id)
    `);
  }
}
