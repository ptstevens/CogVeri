import { Knex } from 'knex';

/**
 * Migration: Create Analysis Debug Logs Table
 *
 * Stores detailed debug information for each analysis run to enable:
 * 1. Replay/debugging of any analysis
 * 2. Score variance monitoring (detecting inconsistencies)
 * 3. AI prompt/response auditing
 * 4. Performance tracking per analysis stage
 *
 * This supports Phase 5 (Observability) of the video analysis robustness plan.
 */

export async function up(knex: Knex): Promise<void> {
  console.log('  Creating analysis_debug_logs table...');

  await knex.schema.createTable('analysis_debug_logs', (table) => {
    table.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    table.uuid('analysis_job_id').notNullable().references('id').inTable('analysis_jobs').onDelete('CASCADE');
    table.uuid('recording_id').notNullable().references('id').inTable('recordings').onDelete('CASCADE');
    table.uuid('organization_id').references('id').inTable('organizations').onDelete('SET NULL');

    // Template context (for similarity/calibration tracking)
    table.uuid('template_id').references('id').inTable('task_templates').onDelete('SET NULL');
    table.boolean('is_calibration_run').defaultTo(false);

    // Overall analysis metadata
    table.decimal('overall_score', 5, 2);
    table.string('verdict', 20);
    table.integer('total_steps');
    table.integer('steps_passed');

    // Timing breakdown (milliseconds)
    table.integer('total_duration_ms');
    table.integer('frame_extraction_ms');
    table.integer('speech_analysis_ms');
    table.integer('visual_analysis_ms');
    table.integer('similarity_analysis_ms');
    table.integer('score_calculation_ms');

    // Token usage (for cost tracking)
    table.integer('total_input_tokens');
    table.integer('total_output_tokens');

    // Similarity scoring details
    table.boolean('similarity_used').defaultTo(false);
    table.decimal('avg_similarity_score', 5, 4);
    table.jsonb('similarity_results'); // Full SimilarityAnalysisResponse

    // Calibration/normalization details
    table.boolean('normalization_applied').defaultTo(false);
    table.decimal('normalization_factor', 5, 3);
    table.decimal('raw_score_before_normalization', 5, 2);

    // AI prompts and responses (for debugging)
    table.jsonb('speech_analysis_debug'); // { prompt, response, tokens }
    table.jsonb('visual_analysis_debug'); // { prompt, response, tokens, batchCount }

    // Per-step debug info
    table.jsonb('step_debug_details'); // Array of per-step scoring details

    // Error tracking
    table.boolean('had_errors').defaultTo(false);
    table.jsonb('errors'); // Array of { stage, error, timestamp }

    // Correlation for request tracing
    table.string('correlation_id', 50);

    table.timestamps(true, true);
  });

  // Index for common queries
  await knex.schema.raw(`
    CREATE INDEX idx_analysis_debug_logs_recording ON analysis_debug_logs(recording_id);
    CREATE INDEX idx_analysis_debug_logs_template ON analysis_debug_logs(template_id);
    CREATE INDEX idx_analysis_debug_logs_created ON analysis_debug_logs(created_at DESC);
    CREATE INDEX idx_analysis_debug_logs_calibration ON analysis_debug_logs(is_calibration_run) WHERE is_calibration_run = true;
  `);

  console.log('  Creating analysis_score_variance table for monitoring...');

  // Table to track score variance (same recording analyzed multiple times)
  await knex.schema.createTable('analysis_score_variance', (table) => {
    table.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    table.uuid('recording_id').notNullable().references('id').inTable('recordings').onDelete('CASCADE');
    table.uuid('template_id').references('id').inTable('task_templates').onDelete('SET NULL');

    // Variance metrics
    table.integer('analysis_count').defaultTo(0);
    table.decimal('min_score', 5, 2);
    table.decimal('max_score', 5, 2);
    table.decimal('avg_score', 5, 2);
    table.decimal('std_deviation', 5, 4);
    table.decimal('variance', 5, 4);

    // Alert thresholds
    table.boolean('variance_alert').defaultTo(false); // True if std_deviation > threshold
    table.decimal('variance_threshold', 5, 4).defaultTo(0.05); // 5% default threshold

    // Last analysis reference
    table.uuid('last_analysis_id').references('id').inTable('analysis_jobs').onDelete('SET NULL');
    table.timestamp('last_analyzed_at');

    table.timestamps(true, true);

    // Unique constraint per recording+template combination
    table.unique(['recording_id', 'template_id']);
  });

  await knex.schema.raw(`
    CREATE INDEX idx_analysis_score_variance_alert ON analysis_score_variance(variance_alert) WHERE variance_alert = true;
  `);

  console.log('  Analysis observability tables created successfully.');
}

export async function down(knex: Knex): Promise<void> {
  console.log('  Dropping analysis observability tables...');

  await knex.schema.dropTableIfExists('analysis_score_variance');
  await knex.schema.dropTableIfExists('analysis_debug_logs');

  console.log('  Analysis observability tables dropped successfully.');
}
