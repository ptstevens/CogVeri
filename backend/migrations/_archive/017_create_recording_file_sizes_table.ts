import { Knex } from 'knex';

export async function up(knex: Knex): Promise<void> {
  // Create the recording_file_sizes table for detailed storage tracking
  return knex.schema.createTable('recording_file_sizes', (table) => {
    // Primary key
    table.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));

    // Relationships
    table.uuid('recording_id').notNullable()
      .references('id').inTable('recordings').onDelete('CASCADE');
    
    table.uuid('organization_id').notNullable()
      .references('id').inTable('organizations').onDelete('CASCADE');

    // Storage information
    table.bigint('file_size_bytes').notNullable();
    
    // File type breakdown
    table.string('file_type', 50); // 'video', 'thumbnail', 'metadata', etc.

    // Storage provider info
    table.string('storage_provider', 50).defaultTo('local'); // 'local', 's3', 'gcs', 'azure'
    table.string('storage_path', 500);

    // Lifecycle
    table.timestamp('created_at').notNullable().defaultTo(knex.fn.now());
    table.timestamp('updated_at').notNullable().defaultTo(knex.fn.now());
    table.timestamp('deleted_at'); // Soft delete for retention policies

    // Metadata
    table.jsonb('metadata'); // Additional storage metadata

    // Indexes for efficient queries
    table.index('recording_id');
    table.index('organization_id');
    table.index('file_type');
  });
}

export async function down(knex: Knex): Promise<void> {
  return knex.schema.dropTable('recording_file_sizes');
}
