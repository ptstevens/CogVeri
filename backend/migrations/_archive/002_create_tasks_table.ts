import { Knex } from 'knex';

export async function up(knex: Knex): Promise<void> {
  return knex.schema.createTable('tasks', (table) => {
    // Primary key
    table.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));

    // Task information
    table.string('title', 255).notNullable();
    table.text('description').notNullable();
    table.text('instructions'); // Detailed instructions for the task

    // Task type
    table.enum('type', ['recording', 'live_demo', 'hybrid']).notNullable().defaultTo('recording');

    // Status tracking
    table
      .enum('status', [
        'draft',
        'assigned',
        'in_progress',
        'submitted',
        'in_review',
        'completed',
        'rejected',
      ])
      .notNullable()
      .defaultTo('draft');

    // Relationships
    table.uuid('created_by').notNullable().references('id').inTable('users').onDelete('RESTRICT');
    table.uuid('assigned_to').references('id').inTable('users').onDelete('SET NULL');
    table.uuid('reviewed_by').references('id').inTable('users').onDelete('SET NULL');

    // Timing
    table.timestamp('due_date');
    table.timestamp('started_at');
    table.timestamp('submitted_at');
    table.timestamp('completed_at');

    // Task requirements
    table.integer('min_duration_seconds'); // Minimum recording duration
    table.integer('max_duration_seconds'); // Maximum recording duration
    table.jsonb('required_features'); // Features that must be demonstrated
    table.jsonb('evaluation_criteria'); // Criteria for evaluation

    // Priority and categorization
    table.enum('priority', ['low', 'medium', 'high', 'urgent']).notNullable().defaultTo('medium');
    table.string('category', 100); // e.g., 'onboarding', 'compliance', 'training'
    table.specificType('tags', 'text[]'); // Array of tags

    // Metadata
    table.jsonb('metadata'); // Additional flexible data
    table.text('rejection_reason'); // If status is rejected
    table.integer('attempt_number').defaultTo(1); // Track resubmissions

    // Timestamps
    table.timestamps(true, true);

    // Indexes
    table.index('status');
    table.index('assigned_to');
    table.index('created_by');
    table.index('due_date');
    table.index('priority');
    table.index('category');
  });
}

export async function down(knex: Knex): Promise<void> {
  return knex.schema.dropTable('tasks');
}
