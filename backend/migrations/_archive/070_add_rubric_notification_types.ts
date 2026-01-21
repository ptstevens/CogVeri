import { Knex } from 'knex';

/**
 * Migration: Add rubric template notification types
 *
 * Adds new notification types for background rubric generation:
 * - rubric_template_ready: When AI-generated rubric template is complete
 * - rubric_template_failed: When rubric generation fails
 *
 * Also adds any other types that may be missing from the original constraint:
 * - review_comment
 * - recording_ready
 */
export async function up(knex: Knex): Promise<void> {
  // PostgreSQL doesn't support ALTER TYPE for CHECK constraints directly
  // We need to drop the constraint and recreate it with all values

  // Drop the existing constraint
  await knex.raw(`
    ALTER TABLE notifications DROP CONSTRAINT IF EXISTS notifications_type_check
  `);

  // Add new constraint with all notification types
  await knex.raw(`
    ALTER TABLE notifications ADD CONSTRAINT notifications_type_check
    CHECK (type IN (
      'task_assigned',
      'review_comment',
      'recording_ready',
      'task_due_soon',
      'task_overdue',
      'recording_submitted',
      'review_requested',
      'review_completed',
      'feedback_received',
      'mention',
      'system',
      'rubric_template_ready',
      'rubric_template_failed'
    ))
  `);
}

export async function down(knex: Knex): Promise<void> {
  // Revert to original constraint (without the new types)
  // Note: This will fail if there are rows with the new types
  await knex.raw(`
    ALTER TABLE notifications DROP CONSTRAINT IF EXISTS notifications_type_check
  `);

  await knex.raw(`
    ALTER TABLE notifications ADD CONSTRAINT notifications_type_check
    CHECK (type IN (
      'task_assigned',
      'task_due_soon',
      'task_overdue',
      'recording_submitted',
      'review_requested',
      'review_completed',
      'feedback_received',
      'mention',
      'system'
    ))
  `);
}
