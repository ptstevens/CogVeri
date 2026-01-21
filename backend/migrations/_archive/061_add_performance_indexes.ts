import { Knex } from 'knex';

/**
 * Migration: Add composite indexes for common query patterns
 *
 * This migration adds optimized indexes identified during the performance review:
 * - Tasks: org + status + created_at for dashboard queries
 * - Tasks: org + assigned_to + created_at for user task lists
 * - Recordings: org + task + created_at for recording listings
 * - API Metrics: org + created_at for rate limiting queries
 *
 * Note: Using standard CREATE INDEX (not CONCURRENTLY) because Knex migrations
 * run inside transactions. For zero-downtime index creation on large production
 * tables, run these indexes manually outside of migrations.
 */
export async function up(knex: Knex): Promise<void> {
  // Check if we're using PostgreSQL
  const client = knex.client.config.client;
  const isPostgres = client === 'pg' || client === 'postgresql';

  if (isPostgres) {
    // Use raw SQL for partial indexes and specific index options

    // Composite index for task visibility queries (dashboard, task lists)
    await knex.raw(`
      CREATE INDEX IF NOT EXISTS idx_tasks_org_status_created
      ON tasks(organization_id, status, created_at DESC)
    `);

    // Composite index for user's assigned tasks (partial index)
    await knex.raw(`
      CREATE INDEX IF NOT EXISTS idx_tasks_org_assigned_created
      ON tasks(organization_id, assigned_to, created_at DESC)
      WHERE assigned_to IS NOT NULL
    `);

    // Composite index for user's created tasks
    await knex.raw(`
      CREATE INDEX IF NOT EXISTS idx_tasks_org_created_by_created
      ON tasks(organization_id, created_by, created_at DESC)
    `);

    // Composite index for recordings by task
    await knex.raw(`
      CREATE INDEX IF NOT EXISTS idx_recordings_org_task_created
      ON recordings(organization_id, task_id, created_at DESC)
    `);

    // Composite index for API rate limiting queries
    await knex.raw(`
      CREATE INDEX IF NOT EXISTS idx_api_metrics_org_created
      ON api_metrics(organization_id, created_at DESC)
    `);

    // Partial index for active tasks (most common query pattern)
    await knex.raw(`
      CREATE INDEX IF NOT EXISTS idx_tasks_org_active
      ON tasks(organization_id, created_at DESC)
      WHERE status NOT IN ('completed', 'archived')
    `);

  } else {
    // Non-PostgreSQL fallback (standard index creation)
    await knex.schema.alterTable('tasks', (table) => {
      table.index(['organization_id', 'status', 'created_at'], 'idx_tasks_org_status_created');
      table.index(['organization_id', 'assigned_to', 'created_at'], 'idx_tasks_org_assigned_created');
      table.index(['organization_id', 'created_by', 'created_at'], 'idx_tasks_org_created_by_created');
    });

    await knex.schema.alterTable('recordings', (table) => {
      table.index(['organization_id', 'task_id', 'created_at'], 'idx_recordings_org_task_created');
    });

    await knex.schema.alterTable('api_metrics', (table) => {
      table.index(['organization_id', 'created_at'], 'idx_api_metrics_org_created');
    });
  }
}

export async function down(knex: Knex): Promise<void> {
  const client = knex.client.config.client;
  const isPostgres = client === 'pg' || client === 'postgresql';

  if (isPostgres) {
    await knex.raw('DROP INDEX IF EXISTS idx_tasks_org_status_created');
    await knex.raw('DROP INDEX IF EXISTS idx_tasks_org_assigned_created');
    await knex.raw('DROP INDEX IF EXISTS idx_tasks_org_created_by_created');
    await knex.raw('DROP INDEX IF EXISTS idx_recordings_org_task_created');
    await knex.raw('DROP INDEX IF EXISTS idx_api_metrics_org_created');
    await knex.raw('DROP INDEX IF EXISTS idx_tasks_org_active');
  } else {
    await knex.schema.alterTable('tasks', (table) => {
      table.dropIndex([], 'idx_tasks_org_status_created');
      table.dropIndex([], 'idx_tasks_org_assigned_created');
      table.dropIndex([], 'idx_tasks_org_created_by_created');
    });

    await knex.schema.alterTable('recordings', (table) => {
      table.dropIndex([], 'idx_recordings_org_task_created');
    });

    await knex.schema.alterTable('api_metrics', (table) => {
      table.dropIndex([], 'idx_api_metrics_org_created');
    });
  }
}
