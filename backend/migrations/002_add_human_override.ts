import { Knex } from 'knex';

/**
 * Add human override columns to analysis_step_scores
 *
 * Enables compliance-grade human review workflow:
 * - Reviewer can override any AI-generated step score
 * - Full audit trail of who overrode, when, with reasoning
 * - Original AI score preserved for accuracy benchmarking
 */
export async function up(knex: Knex): Promise<void> {
  await knex.schema.alterTable('analysis_step_scores', (table) => {
    table.string('human_override_score', 10).nullable(); // YES | PARTIAL | NO — null means AI score stands
    table.text('override_reason').nullable();
    table.uuid('overridden_by').nullable().references('id').inTable('users');
    table.timestamp('overridden_at').nullable();
  });

  // Also add an overall override flag to analysis_results
  await knex.schema.alterTable('analysis_results', (table) => {
    table.boolean('has_human_overrides').defaultTo(false);
    table.integer('human_override_score').nullable(); // Recalculated overall score after overrides
    table.string('human_override_verdict', 20).nullable();
  });
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.alterTable('analysis_step_scores', (table) => {
    table.dropColumn('human_override_score');
    table.dropColumn('override_reason');
    table.dropColumn('overridden_by');
    table.dropColumn('overridden_at');
  });

  await knex.schema.alterTable('analysis_results', (table) => {
    table.dropColumn('has_human_overrides');
    table.dropColumn('human_override_score');
    table.dropColumn('human_override_verdict');
  });
}
