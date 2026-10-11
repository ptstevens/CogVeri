import { Knex } from 'knex';

export async function up(knex: Knex): Promise<void> {
  // Main reviews table
  await knex.schema.createTable('reviews', (table) => {
    // Primary key
    table.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));

    // Relationships
    table
      .uuid('recording_id')
      .notNullable()
      .references('id')
      .inTable('recordings')
      .onDelete('CASCADE');
    table.uuid('task_id').notNullable().references('id').inTable('tasks').onDelete('CASCADE');
    table.uuid('reviewer_id').notNullable().references('id').inTable('users').onDelete('RESTRICT');
    table.uuid('reviewee_id').notNullable().references('id').inTable('users').onDelete('RESTRICT');

    // Review status
    table
      .enum('status', ['pending', 'in_progress', 'completed', 'disputed'])
      .notNullable()
      .defaultTo('pending');

    // Overall assessment
    table.enum('decision', ['approved', 'needs_improvement', 'rejected', null]);
    table.float('score'); // Optional numerical score (0-100)
    table.text('summary'); // Overall review summary

    // Review content
    table.text('strengths'); // What was done well
    table.text('improvements'); // Areas for improvement
    table.text('knowledge_gaps'); // Identified knowledge gaps

    // Timing
    table.timestamp('started_at');
    table.timestamp('completed_at');
    table.integer('review_duration_seconds'); // Time spent reviewing

    // Metadata
    table.jsonb('evaluation_results'); // Structured evaluation against criteria
    table.boolean('meets_requirements').defaultTo(false);
    table.boolean('requires_resubmission').defaultTo(false);

    // Timestamps
    table.timestamps(true, true);

    // Indexes
    table.index('recording_id');
    table.index('task_id');
    table.index('reviewer_id');
    table.index('reviewee_id');
    table.index('status');
    table.index('decision');
  });

  // Feedback comments table (for timestamp-specific feedback)
  await knex.schema.createTable('review_comments', (table) => {
    // Primary key
    table.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));

    // Relationship
    table.uuid('review_id').notNullable().references('id').inTable('reviews').onDelete('CASCADE');
    table.uuid('author_id').notNullable().references('id').inTable('users').onDelete('RESTRICT');

    // Comment details
    table.text('comment').notNullable();
    table.integer('timestamp_seconds'); // Specific moment in recording
    table.integer('duration_seconds'); // For range comments

    // Comment type
    table
      .enum('type', ['positive', 'improvement', 'critical', 'question', 'general'])
      .notNullable()
      .defaultTo('general');

    // Comment metadata
    table.jsonb('annotation'); // For visual annotations (coordinates, shapes)
    table.boolean('is_resolved').defaultTo(false);
    table.uuid('resolved_by').references('id').inTable('users').onDelete('SET NULL');
    table.timestamp('resolved_at');

    // Threading
    table.uuid('parent_comment_id').references('id').inTable('review_comments').onDelete('CASCADE');

    // Timestamps
    table.timestamps(true, true);

    // Indexes
    table.index('review_id');
    table.index('author_id');
    table.index('timestamp_seconds');
    table.index('type');
    table.index('parent_comment_id');
  });
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTable('review_comments');
  await knex.schema.dropTable('reviews');
}
