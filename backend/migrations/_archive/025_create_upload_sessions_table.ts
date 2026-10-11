import { Knex } from 'knex';

export async function up(knex: Knex): Promise<void> {
  // Create the upload_sessions table for tracking multipart uploads
  return knex.schema.createTable('upload_sessions', (table) => {
    // Primary key
    table.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));

    // Relationships
    table.uuid('task_id').notNullable().references('id').inTable('tasks').onDelete('CASCADE');

    table
      .uuid('organization_id')
      .notNullable()
      .references('id')
      .inTable('organizations')
      .onDelete('CASCADE');

    // User can be null for external contributors
    table.uuid('user_id').references('id').inTable('users').onDelete('SET NULL');

    table
      .uuid('external_contributor_id')
      .references('id')
      .inTable('external_contributors')
      .onDelete('SET NULL');

    // Recording reference (created when session starts)
    table.uuid('recording_id').references('id').inTable('recordings').onDelete('CASCADE');

    // S3/R2 Multipart Upload Details
    table.string('s3_upload_id', 500).notNullable(); // The uploadId from S3/R2
    table.string('s3_bucket', 255).notNullable();
    table.string('s3_key', 500).notNullable(); // Full path: recordings/{taskId}/{recordingId}/video.webm

    // Upload progress tracking
    table.integer('total_parts').defaultTo(0); // Number of parts uploaded so far
    table.bigint('total_bytes_uploaded').defaultTo(0); // Total bytes uploaded
    table.jsonb('uploaded_parts').defaultTo('[]'); // Array of { partNumber, etag, size }

    // Recording metadata (stored here until finalization)
    table.string('mime_type', 100).notNullable();
    table.integer('duration_seconds').defaultTo(0); // Updated as recording progresses
    table.boolean('has_audio').defaultTo(false);
    table.string('resolution', 50); // e.g., "1920x1080"
    table.integer('frame_rate');
    table.string('browser_info', 500);

    // Session status
    table
      .enum('status', ['active', 'completing', 'completed', 'failed', 'expired', 'aborted'])
      .defaultTo('active');
    table.text('error_message'); // Error details if failed

    // Timestamps
    table.timestamp('created_at').notNullable().defaultTo(knex.fn.now());
    table.timestamp('updated_at').notNullable().defaultTo(knex.fn.now());
    table.timestamp('last_activity_at').notNullable().defaultTo(knex.fn.now()); // For cleanup job
    table.timestamp('completed_at');
    table.timestamp('expires_at'); // Auto-cleanup after this time

    // Indexes for efficient queries
    table.index('task_id');
    table.index('organization_id');
    table.index('user_id');
    table.index('external_contributor_id');
    table.index('recording_id');
    table.index('s3_upload_id');
    table.index('status');
    table.index('last_activity_at'); // For cleanup job
    table.index('expires_at'); // For cleanup job
  });
}

export async function down(knex: Knex): Promise<void> {
  return knex.schema.dropTable('upload_sessions');
}
