import { Knex } from 'knex';

/**
 * Migration: Create AI Video Analysis Tables
 *
 * Creates the foundational tables for AI-powered video analysis:
 * - analysis_jobs: Tracks analysis job lifecycle and progress
 * - analysis_step_scores: Per-rubric-step evaluation results with evidence
 * - analysis_results: Overall analysis summary and verdict
 * - analysis_frames: Extracted keyframes for visual analysis
 *
 * Also adds analysis-related fields to recordings table.
 */
export async function up(knex: Knex): Promise<void> {
  // Create analysis job status enum type
  await knex.raw(`
    DO $$ BEGIN
      CREATE TYPE analysis_job_status AS ENUM (
        'pending',
        'extracting_frames',
        'analyzing_speech',
        'analyzing_visual',
        'combining_results',
        'completed',
        'failed',
        'cancelled'
      );
    EXCEPTION
      WHEN duplicate_object THEN null;
    END $$;
  `);

  // Create step score enum type
  await knex.raw(`
    DO $$ BEGIN
      CREATE TYPE analysis_step_score AS ENUM (
        'YES',
        'PARTIAL',
        'NO',
        'UNABLE_TO_ASSESS'
      );
    EXCEPTION
      WHEN duplicate_object THEN null;
    END $$;
  `);

  // Create overall verdict enum type
  await knex.raw(`
    DO $$ BEGIN
      CREATE TYPE analysis_verdict AS ENUM (
        'PASS',
        'PARTIAL_PASS',
        'FAIL',
        'NEEDS_REVIEW'
      );
    EXCEPTION
      WHEN duplicate_object THEN null;
    END $$;
  `);

  // Create analysis_jobs table - tracks analysis job lifecycle
  await knex.schema.createTable('analysis_jobs', (table) => {
    table.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));

    // Relationships
    table.uuid('recording_id').notNullable()
      .references('id').inTable('recordings').onDelete('CASCADE');
    table.uuid('task_id').notNullable()
      .references('id').inTable('tasks').onDelete('CASCADE');
    table.uuid('organization_id').notNullable()
      .references('id').inTable('organizations').onDelete('CASCADE');
    table.uuid('triggered_by_user_id').nullable()
      .references('id').inTable('users').onDelete('SET NULL');

    // Job status tracking
    table.specificType('status', 'analysis_job_status').notNullable().defaultTo('pending');

    // Processing details
    table.integer('total_frames_extracted').defaultTo(0);
    table.integer('frames_analyzed').defaultTo(0);
    table.boolean('speech_analysis_complete').defaultTo(false);
    table.boolean('visual_analysis_complete').defaultTo(false);

    // Progress tracking
    table.integer('progress').notNullable().defaultTo(0); // 0-100
    table.string('stage', 50).nullable();
    table.text('progress_message').nullable();

    // Timing
    table.timestamp('started_at').nullable();
    table.timestamp('completed_at').nullable();
    table.float('processing_duration_seconds').nullable();

    // Error handling
    table.text('error_message').nullable();
    table.integer('retry_count').notNullable().defaultTo(0);
    table.integer('max_retries').notNullable().defaultTo(2);

    // Cost tracking
    table.integer('ai_tokens_used').defaultTo(0);
    table.integer('ai_api_calls').defaultTo(0);
    table.decimal('estimated_cost_usd', 10, 6).defaultTo(0);

    // Queue tracking
    table.string('queue_job_id', 100).nullable();

    // Configuration used at analysis time (snapshot)
    table.jsonb('config_snapshot').nullable();

    // AI model info
    table.string('model_used', 100).nullable();
    table.string('analysis_version', 20).nullable();

    // Timestamps
    table.timestamps(true, true);

    // Indexes
    table.index('recording_id');
    table.index('task_id');
    table.index('organization_id');
    table.index('status');
    table.index('queue_job_id');
    table.index('created_at');
  });

  // Create analysis_step_scores table - per-step evaluation results
  await knex.schema.createTable('analysis_step_scores', (table) => {
    table.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));

    // Relationship to job
    table.uuid('analysis_job_id').notNullable()
      .references('id').inTable('analysis_jobs').onDelete('CASCADE');

    // Step identification (matches rubric step)
    table.string('rubric_step_id', 50).notNullable();
    table.integer('step_order').notNullable();
    table.string('step_title', 255).notNullable();

    // Scoring
    table.specificType('score', 'analysis_step_score').notNullable();
    table.float('confidence').nullable(); // 0.0 - 1.0
    table.float('weighted_score').nullable(); // Score * weight / max_possible

    // Evidence from speech analysis
    table.jsonb('speech_evidence').nullable();
    // Structure: {
    //   keywordsFound: string[],
    //   keywordsMissing: string[],
    //   relevantExcerpts: { text: string, startTime: number, endTime: number }[],
    //   speechScore: 'YES' | 'PARTIAL' | 'NO',
    //   speechConfidence: number
    // }

    // Evidence from visual analysis
    table.jsonb('visual_evidence').nullable();
    // Structure: {
    //   elementsDetected: { element: string, frameTimestamp: number, confidence: number }[],
    //   elementsMissing: string[],
    //   actionsDetected: { action: string, frameTimestamp: number, confidence: number }[],
    //   actionsMissing: string[],
    //   representativeFrameUrl: string,
    //   visualScore: 'YES' | 'PARTIAL' | 'NO',
    //   visualConfidence: number
    // }

    // AI reasoning
    table.text('ai_reasoning').nullable();

    // Timestamps for when step was detected in video
    table.float('detected_at_seconds').nullable();
    table.float('completed_at_seconds').nullable();

    // Timestamps
    table.timestamps(true, true);

    // Unique constraint: one score per step per job
    table.unique(['analysis_job_id', 'rubric_step_id']);

    // Indexes
    table.index('analysis_job_id');
    table.index('score');
    table.index('step_order');
  });

  // Create analysis_results table - overall analysis summary
  await knex.schema.createTable('analysis_results', (table) => {
    table.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));

    // Relationships
    table.uuid('analysis_job_id').notNullable().unique()
      .references('id').inTable('analysis_jobs').onDelete('CASCADE');
    table.uuid('recording_id').notNullable()
      .references('id').inTable('recordings').onDelete('CASCADE');
    table.uuid('task_id').notNullable()
      .references('id').inTable('tasks').onDelete('CASCADE');

    // Overall scores
    table.float('overall_score').nullable(); // 0-100
    table.specificType('overall_verdict', 'analysis_verdict').nullable();
    table.float('overall_confidence').nullable(); // 0.0 - 1.0

    // Score breakdown
    table.integer('steps_passed').defaultTo(0);
    table.integer('steps_partial').defaultTo(0);
    table.integer('steps_failed').defaultTo(0);
    table.integer('steps_total').defaultTo(0);

    // AI Summary
    table.text('summary_text').nullable();
    table.jsonb('strengths').nullable(); // string[]
    table.jsonb('improvements').nullable(); // string[] (coaching suggestions)

    // Processing metadata
    table.float('processing_time_seconds').nullable();

    // Timestamps
    table.timestamps(true, true);

    // Indexes
    table.index('recording_id');
    table.index('task_id');
    table.index('overall_verdict');
    table.index('overall_score');
    table.index('created_at');
  });

  // Create analysis_frames table - extracted keyframes for debugging/caching
  await knex.schema.createTable('analysis_frames', (table) => {
    table.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));

    // Relationship to job
    table.uuid('analysis_job_id').notNullable()
      .references('id').inTable('analysis_jobs').onDelete('CASCADE');

    // Frame identification
    table.integer('frame_index').notNullable();
    table.float('timestamp_seconds').notNullable();

    // Storage
    table.string('frame_url', 500).notNullable();
    table.string('storage_key', 500).nullable();
    table.integer('file_size_bytes').nullable();

    // Frame metadata
    table.integer('width').nullable();
    table.integer('height').nullable();

    // Analysis results for this frame (optional, for debugging)
    table.jsonb('analysis_result').nullable();

    // Whether this was a keyframe (scene change) or regular interval
    table.boolean('is_keyframe').defaultTo(false);

    // Timestamps
    table.timestamp('created_at').notNullable().defaultTo(knex.fn.now());

    // Unique constraint: one entry per frame index per job
    table.unique(['analysis_job_id', 'frame_index']);

    // Indexes
    table.index('analysis_job_id');
    table.index('timestamp_seconds');
  });

  // Add analysis_status field to recordings table
  const hasAnalysisStatus = await knex.schema.hasColumn('recordings', 'analysis_status');

  if (!hasAnalysisStatus) {
    // Create analysis status enum for recordings
    await knex.raw(`
      DO $$ BEGIN
        CREATE TYPE recording_analysis_status AS ENUM (
          'none',
          'pending',
          'processing',
          'completed',
          'failed'
        );
      EXCEPTION
        WHEN duplicate_object THEN null;
      END $$;
    `);

    await knex.schema.alterTable('recordings', (table) => {
      // Analysis status on the recording itself
      table.specificType('analysis_status', 'recording_analysis_status')
        .notNullable().defaultTo('none');

      // Index for filtering
      table.index('analysis_status');
    });
  }
}

export async function down(knex: Knex): Promise<void> {
  // Remove analysis_status from recordings
  const hasAnalysisStatus = await knex.schema.hasColumn('recordings', 'analysis_status');
  if (hasAnalysisStatus) {
    await knex.schema.alterTable('recordings', (table) => {
      table.dropIndex('analysis_status');
      table.dropColumn('analysis_status');
    });
  }

  // Drop tables in reverse order of dependencies
  await knex.schema.dropTableIfExists('analysis_frames');
  await knex.schema.dropTableIfExists('analysis_results');
  await knex.schema.dropTableIfExists('analysis_step_scores');
  await knex.schema.dropTableIfExists('analysis_jobs');

  // Drop enum types
  await knex.raw('DROP TYPE IF EXISTS recording_analysis_status CASCADE;');
  await knex.raw('DROP TYPE IF EXISTS analysis_verdict CASCADE;');
  await knex.raw('DROP TYPE IF EXISTS analysis_step_score CASCADE;');
  await knex.raw('DROP TYPE IF EXISTS analysis_job_status CASCADE;');
}
