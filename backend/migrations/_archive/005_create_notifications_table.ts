import { Knex } from 'knex';

export async function up(knex: Knex): Promise<void> {
  // Notifications table
  await knex.schema.createTable('notifications', (table) => {
    // Primary key
    table.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));

    // Recipient
    table.uuid('user_id').notNullable().references('id').inTable('users').onDelete('CASCADE');

    // Notification details
    table
      .enum('type', [
        'task_assigned',
        'task_due_soon',
        'task_overdue',
        'recording_submitted',
        'review_requested',
        'review_completed',
        'feedback_received',
        'mention',
        'system',
      ])
      .notNullable();

    table.string('title', 255).notNullable();
    table.text('message').notNullable();

    // Related entities (polymorphic references)
    table.string('entity_type', 50); // 'task', 'recording', 'review', etc.
    table.uuid('entity_id'); // ID of the related entity

    // Delivery channels
    table.boolean('in_app').notNullable().defaultTo(true);
    table.boolean('email_sent').notNullable().defaultTo(false);
    table.boolean('slack_sent').notNullable().defaultTo(false);

    // Status
    table.boolean('is_read').notNullable().defaultTo(false);
    table.timestamp('read_at');

    // Priority
    table.enum('priority', ['low', 'medium', 'high', 'urgent']).notNullable().defaultTo('medium');

    // Action URL (where to navigate when clicked)
    table.string('action_url', 500);

    // Metadata
    table.jsonb('metadata'); // Additional context-specific data
    table
      .uuid('triggered_by') // User who triggered the notification
      .references('id')
      .inTable('users')
      .onDelete('SET NULL');

    // Expiration
    table.timestamp('expires_at'); // Auto-delete after this time

    // Timestamps
    table.timestamps(true, true);

    // Indexes
    table.index('user_id');
    table.index('type');
    table.index('is_read');
    table.index('priority');
    table.index(['entity_type', 'entity_id']);
    table.index('created_at');
    table.index('expires_at');
  });

  // Activity log table (for audit trail)
  await knex.schema.createTable('activity_logs', (table) => {
    // Primary key
    table.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));

    // Actor
    table.uuid('user_id').notNullable().references('id').inTable('users').onDelete('CASCADE');

    // Activity details
    table.string('action', 100).notNullable(); // e.g., 'task.created', 'recording.uploaded'
    table.string('entity_type', 50).notNullable();
    table.uuid('entity_id').notNullable();

    // Change tracking
    table.jsonb('old_values'); // Previous state
    table.jsonb('new_values'); // New state
    table.jsonb('metadata'); // Additional context

    // Request information
    table.string('ip_address', 45);
    table.text('user_agent');
    table.string('session_id', 255);

    // Timestamp
    table.timestamp('created_at').notNullable().defaultTo(knex.fn.now());

    // Indexes
    table.index('user_id');
    table.index('action');
    table.index(['entity_type', 'entity_id']);
    table.index('created_at');
  });
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTable('activity_logs');
  await knex.schema.dropTable('notifications');
}
