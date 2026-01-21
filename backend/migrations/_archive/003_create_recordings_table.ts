import { Knex } from 'knex';

export async function up(knex: Knex): Promise<void> {
  return knex.schema.createTable('recordings', (table) => {
    // Primary key
    table.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));

    // Relationships
    table.uuid('task_id').notNullable()
      .references('id').inTable('tasks').onDelete('CASCADE');
    table.uuid('user_id').notNullable()
      .references('id').inTable('users').onDelete('RESTRICT');

    // Recording details
    table.enum('type', ['screen', 'camera', 'screen_camera', 'live_session'])
      .notNullable()
      .defaultTo('screen');
    table.enum('status', [
      'initializing',
      'recording',
      'processing',
      'completed',
      'failed',
      'deleted'
    ]).notNullable().defaultTo('initializing');

    // File information
    table.string('file_url', 500);
    table.string('thumbnail_url', 500);
    table.bigInteger('file_size_bytes').unsigned();
    table.string('file_format', 50); // e.g., 'webm', 'mp4'
    table.string('mime_type', 100);

    // Recording metrics
    table.integer('duration_seconds').unsigned();
    table.integer('width').unsigned();
    table.integer('height').unsigned();
    table.float('fps');
    table.integer('bitrate').unsigned();

    // Timing
    table.timestamp('started_at');
    table.timestamp('ended_at');
    table.timestamp('uploaded_at');
    table.timestamp('processed_at');

    // Live session specific
    table.uuid('live_session_id'); // For grouping live session recordings
    table.specificType('participants', 'text[]'); // Array of user IDs for live sessions
    table.jsonb('webrtc_stats'); // WebRTC performance statistics

    // Processing information
    table.text('processing_error');
    table.integer('retry_count').defaultTo(0);
    table.jsonb('transcription'); // Auto-generated transcription if available

    // Storage
    table.string('storage_provider', 50).defaultTo('s3'); // 's3', 'gcs', 'azure'
    table.string('storage_bucket', 255);
    table.string('storage_key', 500);
    table.timestamp('storage_expires_at'); // For temporary URLs

    // Metadata
    table.jsonb('metadata'); // Browser info, screen resolution, etc.
    table.jsonb('timestamps'); // Important moments/markers in the recording

    // Privacy and compliance
    table.boolean('contains_sensitive_data').defaultTo(false);
    table.timestamp('retention_until'); // Auto-delete after this date

    // Timestamps
    table.timestamps(true, true);

    // Indexes
    table.index('task_id');
    table.index('user_id');
    table.index('status');
    table.index('live_session_id');
    table.index('started_at');
    table.index('storage_expires_at');
  });
}

export async function down(knex: Knex): Promise<void> {
  return knex.schema.dropTable('recordings');
}