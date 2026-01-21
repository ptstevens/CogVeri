import { Knex } from 'knex';

/**
 * Migration: Add analysis_complete notification type
 *
 * Adds notification type for when AI analysis of a recording completes:
 * - analysis_complete: Notifies task creator when recording analysis finishes
 */
export async function up(knex: Knex): Promise<void> {
  // Drop the existing constraint
  await knex.raw(`
    ALTER TABLE notifications DROP CONSTRAINT IF EXISTS notifications_type_check
  `);

  // Add new constraint with analysis_complete type
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
      'rubric_template_failed',
      'analysis_complete'
    ))
  `);
}

export async function down(knex: Knex): Promise<void> {
  // Revert to previous constraint (without analysis_complete)
  await knex.raw(`
    ALTER TABLE notifications DROP CONSTRAINT IF EXISTS notifications_type_check
  `);

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
