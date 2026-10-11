import { Knex } from 'knex';

/**
 * Migration for transcription functionality
 *
 * Adds:
 * 1. Enhanced transcription fields to recordings table
 * 2. Transcription jobs table for tracking processing status
 * 3. Full-text search indexes for transcript content
 */
export async function up(knex: Knex): Promise<void> {
  // Create transcription_jobs table to track processing status
  await knex.schema.createTable('transcription_jobs', (table) => {
    table.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));

    table
      .uuid('recording_id')
      .notNullable()
      .references('id')
      .inTable('recordings')
      .onDelete('CASCADE');

    table
      .uuid('organization_id')
      .notNullable()
      .references('id')
      .inTable('organizations')
      .onDelete('CASCADE');

    table.uuid('user_id').nullable().references('id').inTable('users').onDelete('SET NULL');

    // Job status tracking
    table
      .enum('status', ['pending', 'processing', 'completed', 'failed', 'cancelled'])
      .notNullable()
      .defaultTo('pending');

    // Processing details
    table.string('language', 10).nullable(); // e.g., 'en', 'es', 'auto'
    table.string('model_used', 50).nullable(); // e.g., 'base.en', 'small', 'medium'

    // Progress tracking
    table.integer('progress').notNullable().defaultTo(0); // 0-100
    table.string('stage', 50).nullable(); // 'downloading', 'transcribing', 'processing', 'completed'
    table.text('progress_message').nullable();

    // Timing
    table.timestamp('started_at').nullable();
    table.timestamp('completed_at').nullable();
    table.float('processing_duration_seconds').nullable();

    // Error handling
    table.text('error_message').nullable();
    table.integer('retry_count').notNullable().defaultTo(0);
    table.integer('max_retries').notNullable().defaultTo(2);

    // Job options (stored as JSON)
    table.jsonb('options').nullable(); // { includeSpeakerDiarization, includeTimestamps, vocabularyFilter }

    // Queue tracking
    table.string('queue_job_id', 100).nullable(); // BullMQ job ID

    // Timestamps
    table.timestamps(true, true);

    // Indexes
    table.index('recording_id');
    table.index('organization_id');
    table.index('status');
    table.index('queue_job_id');
    table.index('created_at');
  });

  // Add enhanced transcription fields to recordings table
  const hasTranscriptStatus = await knex.schema.hasColumn('recordings', 'transcription_status');

  if (!hasTranscriptStatus) {
    await knex.schema.alterTable('recordings', (table) => {
      // Transcription status on the recording itself
      table
        .enum('transcription_status', ['none', 'pending', 'processing', 'completed', 'failed'])
        .notNullable()
        .defaultTo('none');

      // Full text for the complete transcript
      table.text('transcript_text').nullable();

      // Language detected or used
      table.string('transcript_language', 10).nullable();

      // Duration of audio transcribed (may differ from video duration)
      table.float('transcript_duration_seconds').nullable();

      // Full-text search vector (PostgreSQL specific)
      table.specificType('transcript_tsvector', 'tsvector').nullable();

      // Index for full-text search
      table.index('transcription_status');
    });

    // Create GIN index for full-text search (requires raw SQL)
    await knex.raw(`
      CREATE INDEX IF NOT EXISTS idx_recordings_transcript_fts
      ON recordings USING GIN (transcript_tsvector)
    `);

    // Create trigger to auto-update tsvector when transcript changes
    await knex.raw(`
      CREATE OR REPLACE FUNCTION update_transcript_tsvector()
      RETURNS TRIGGER AS $$
      BEGIN
        IF NEW.transcript_text IS NOT NULL THEN
          NEW.transcript_tsvector := to_tsvector('english', NEW.transcript_text);
        ELSE
          NEW.transcript_tsvector := NULL;
        END IF;
        RETURN NEW;
      END;
      $$ LANGUAGE plpgsql;
    `);

    await knex.raw(`
      DROP TRIGGER IF EXISTS trigger_update_transcript_tsvector ON recordings;
      CREATE TRIGGER trigger_update_transcript_tsvector
      BEFORE INSERT OR UPDATE OF transcript_text ON recordings
      FOR EACH ROW
      EXECUTE FUNCTION update_transcript_tsvector();
    `);
  }

  // Create transcription_segments table for word-level timestamps
  await knex.schema.createTable('transcription_segments', (table) => {
    table.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));

    table
      .uuid('recording_id')
      .notNullable()
      .references('id')
      .inTable('recordings')
      .onDelete('CASCADE');

    // Segment timing (in seconds)
    table.float('start_time').notNullable();
    table.float('end_time').notNullable();

    // Segment content
    table.text('text').notNullable();

    // Speaker identification (for diarization)
    table.string('speaker', 50).nullable();

    // Confidence score (0-1)
    table.float('confidence').nullable();

    // Segment index for ordering
    table.integer('segment_index').notNullable();

    // Timestamps
    table.timestamps(true, true);

    // Indexes
    table.index('recording_id');
    table.index('start_time');
    table.index(['recording_id', 'segment_index']);
  });
}

export async function down(knex: Knex): Promise<void> {
  // Drop trigger and function
  await knex.raw('DROP TRIGGER IF EXISTS trigger_update_transcript_tsvector ON recordings');
  await knex.raw('DROP FUNCTION IF EXISTS update_transcript_tsvector');

  // Drop full-text search index
  await knex.raw('DROP INDEX IF EXISTS idx_recordings_transcript_fts');

  // Remove transcription fields from recordings
  const hasTranscriptStatus = await knex.schema.hasColumn('recordings', 'transcription_status');
  if (hasTranscriptStatus) {
    await knex.schema.alterTable('recordings', (table) => {
      table.dropColumn('transcription_status');
      table.dropColumn('transcript_text');
      table.dropColumn('transcript_language');
      table.dropColumn('transcript_duration_seconds');
      table.dropColumn('transcript_tsvector');
    });
  }

  // Drop tables
  await knex.schema.dropTableIfExists('transcription_segments');
  await knex.schema.dropTableIfExists('transcription_jobs');
}
