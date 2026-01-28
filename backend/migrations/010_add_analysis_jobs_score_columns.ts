import { Knex } from 'knex';

/**
 * Migration: Add overall_score and verdict columns to analysis_jobs
 *
 * These columns store the final analysis results directly on the job record
 * for quick access without joining to analysis_results. Used by:
 * - template-calibration.service.ts (updating calibration job results)
 * - analysis.processor.ts (updating job with final scores)
 */

export async function up(knex: Knex): Promise<void> {
  console.log('  Adding score columns to analysis_jobs...');

  // Add overall_score - the final percentage score (0-100)
  const hasOverallScore = await knex.schema.hasColumn('analysis_jobs', 'overall_score');
  if (!hasOverallScore) {
    await knex.schema.alterTable('analysis_jobs', (table) => {
      table.decimal('overall_score', 5, 2).nullable();
    });
  }

  // Add verdict - the final verdict (PASS, FAIL, NEEDS_REVIEW)
  const hasVerdict = await knex.schema.hasColumn('analysis_jobs', 'verdict');
  if (!hasVerdict) {
    await knex.schema.alterTable('analysis_jobs', (table) => {
      table.string('verdict', 50).nullable();
    });
  }

  console.log('  Score columns added to analysis_jobs successfully.');
}

export async function down(knex: Knex): Promise<void> {
  console.log('  Removing score columns from analysis_jobs...');

  const hasOverallScore = await knex.schema.hasColumn('analysis_jobs', 'overall_score');
  if (hasOverallScore) {
    await knex.schema.alterTable('analysis_jobs', (table) => {
      table.dropColumn('overall_score');
    });
  }

  const hasVerdict = await knex.schema.hasColumn('analysis_jobs', 'verdict');
  if (hasVerdict) {
    await knex.schema.alterTable('analysis_jobs', (table) => {
      table.dropColumn('verdict');
    });
  }

  console.log('  Score columns removed from analysis_jobs successfully.');
}
