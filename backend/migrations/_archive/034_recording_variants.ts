import { Knex } from 'knex';

/**
 * Migration for recording variants (multi-resolution transcoded videos)
 *
 * Adds:
 * 1. recording_variants table for storing different quality versions
 * 2. Updates recordings table with processing status fields
 */
export async function up(knex: Knex): Promise<void> {
  // Create recording_variants table
  await knex.schema.createTable('recording_variants', (table) => {
    table.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));

    table.uuid('recording_id').notNullable()
      .references('id').inTable('recordings').onDelete('CASCADE');

    // Variant details
    table.string('quality', 20).notNullable(); // low, medium, high, original
    table.string('format', 10).notNullable(); // mp4, webm, hls

    // File location
    table.string('file_url', 500).notNullable();
    table.string('storage_key', 500).nullable();

    // Video properties
    table.integer('width').notNullable();
    table.integer('height').notNullable();
    table.integer('bitrate').nullable();
    table.bigInteger('file_size_bytes').notNullable();
    table.float('duration_seconds').nullable();

    // For HLS variants
    table.string('playlist_url', 500).nullable();
    table.integer('segment_count').nullable();

    // Status
    table.boolean('is_ready').notNullable().defaultTo(true);

    // Timestamps
    table.timestamps(true, true);

    // Unique constraint: one variant per quality per recording
    table.unique(['recording_id', 'quality']);

    // Indexes
    table.index('recording_id');
    table.index(['recording_id', 'quality']);
  });

  // Add processing status fields to recordings
  const hasProcessingStatus = await knex.schema.hasColumn('recordings', 'processing_status');
  if (!hasProcessingStatus) {
    await knex.schema.alterTable('recordings', (table) => {
      // Overall processing status
      table.enum('processing_status', ['pending', 'processing', 'completed', 'failed', 'partial'])
        .notNullable().defaultTo('pending');

      // Individual process statuses
      table.enum('transcode_status', ['none', 'pending', 'processing', 'completed', 'failed'])
        .notNullable().defaultTo('none');

      table.enum('thumbnail_status', ['none', 'pending', 'processing', 'completed', 'failed'])
        .notNullable().defaultTo('none');

      // Processing metadata
      table.jsonb('processing_metadata').nullable();

      // Indexes
      table.index('processing_status');
      table.index('transcode_status');
    });
  }

  // Create processing_jobs table for tracking all processing jobs
  await knex.schema.createTable('processing_jobs', (table) => {
    table.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));

    table.uuid('recording_id').notNullable()
      .references('id').inTable('recordings').onDelete('CASCADE');

    table.uuid('organization_id').notNullable()
      .references('id').inTable('organizations').onDelete('CASCADE');

    // Job type
    table.enum('job_type', ['transcode', 'thumbnail', 'hls'])
      .notNullable();

    // Job details
    table.string('quality', 20).nullable(); // For transcode jobs
    table.string('format', 10).nullable();

    // Status
    table.enum('status', ['pending', 'processing', 'completed', 'failed', 'cancelled'])
      .notNullable().defaultTo('pending');

    // Progress
    table.integer('progress').notNullable().defaultTo(0);
    table.string('stage', 50).nullable();
    table.text('message').nullable();

    // Timing
    table.timestamp('started_at').nullable();
    table.timestamp('completed_at').nullable();
    table.float('processing_duration_seconds').nullable();

    // Error handling
    table.text('error_message').nullable();
    table.integer('retry_count').notNullable().defaultTo(0);

    // Queue tracking
    table.string('queue_job_id', 100).nullable();

    // Timestamps
    table.timestamps(true, true);

    // Indexes
    table.index('recording_id');
    table.index('organization_id');
    table.index('status');
    table.index('job_type');
    table.index('queue_job_id');
  });
}

export async function down(knex: Knex): Promise<void> {
  // Drop processing_jobs table
  await knex.schema.dropTableIfExists('processing_jobs');

  // Remove processing fields from recordings
  const hasProcessingStatus = await knex.schema.hasColumn('recordings', 'processing_status');
  if (hasProcessingStatus) {
    await knex.schema.alterTable('recordings', (table) => {
      table.dropColumn('processing_status');
      table.dropColumn('transcode_status');
      table.dropColumn('thumbnail_status');
      table.dropColumn('processing_metadata');
    });
  }

  // Drop recording_variants table
  await knex.schema.dropTableIfExists('recording_variants');
}
