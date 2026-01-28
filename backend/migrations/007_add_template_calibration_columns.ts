import { Knex } from 'knex';

/**
 * Migration: Add Template Calibration Columns
 *
 * Adds columns to task_templates for storing baseline analysis results.
 * This enables calibration: running the template video through analysis
 * to establish a baseline score, then normalizing submission scores
 * relative to that baseline.
 *
 * If the template video doesn't score 100% against its own rubric,
 * we can either:
 * 1. Flag it for review (rubric may need adjustment)
 * 2. Normalize submission scores relative to the baseline
 *
 * This ensures that identical videos always achieve consistent scores.
 */

export async function up(knex: Knex): Promise<void> {
  console.log('  Adding calibration columns to task_templates...');

  // Add baseline_analysis_results - stores full analysis result for reference
  await knex.schema.alterTable('task_templates', (table) => {
    table.jsonb('baseline_analysis_results').nullable();
  });

  // Add baseline_score - the overall score the template achieved
  await knex.schema.alterTable('task_templates', (table) => {
    table.decimal('baseline_score', 5, 2).nullable();
  });

  // Add baseline_step_scores - per-step scores for detailed calibration
  await knex.schema.alterTable('task_templates', (table) => {
    table.jsonb('baseline_step_scores').nullable();
  });

  // Add calibration_status - tracks calibration state
  // Values: 'pending', 'in_progress', 'completed', 'failed', 'needs_review'
  await knex.schema.alterTable('task_templates', (table) => {
    table.string('calibration_status', 50).nullable();
  });

  // Add calibration_error - stores error message if calibration failed
  await knex.schema.alterTable('task_templates', (table) => {
    table.text('calibration_error').nullable();
  });

  // Add calibrated_at - timestamp of last calibration
  await knex.schema.alterTable('task_templates', (table) => {
    table.timestamp('calibrated_at').nullable();
  });

  // Add source_recording_id - the template video recording used for calibration
  await knex.schema.alterTable('task_templates', (table) => {
    table.uuid('source_recording_id').nullable().references('id').inTable('recordings').onDelete('SET NULL');
  });

  console.log('  Calibration columns added to task_templates successfully.');
}

export async function down(knex: Knex): Promise<void> {
  console.log('  Removing calibration columns from task_templates...');

  await knex.schema.alterTable('task_templates', (table) => {
    table.dropColumn('source_recording_id');
    table.dropColumn('calibrated_at');
    table.dropColumn('calibration_error');
    table.dropColumn('calibration_status');
    table.dropColumn('baseline_step_scores');
    table.dropColumn('baseline_score');
    table.dropColumn('baseline_analysis_results');
  });

  console.log('  Calibration columns removed from task_templates successfully.');
}
