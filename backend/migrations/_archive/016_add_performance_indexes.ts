import { Knex } from 'knex';

export async function up(knex: Knex): Promise<void> {
  // Add missing organization_id column to recordings table first (if not already present)
  const hasOrgIdColumn = await knex.schema.hasColumn('recordings', 'organization_id');

  if (!hasOrgIdColumn) {
    await knex.schema.table('recordings', (table) => {
      table.uuid('organization_id').references('id').inTable('organizations').onDelete('CASCADE');
    });
  }

  // Add missing organization_id column to tasks table (if not already present)
  const tasksHasOrgId = await knex.schema.hasColumn('tasks', 'organization_id');

  if (!tasksHasOrgId) {
    await knex.schema.table('tasks', (table) => {
      table.uuid('organization_id').references('id').inTable('organizations').onDelete('CASCADE');
    });
  }

  // Add critical composite indexes for tasks table
  // These are used in every task query for multi-tenant isolation
  await knex.raw(`
    CREATE INDEX IF NOT EXISTS idx_tasks_org_status 
    ON tasks(organization_id, status)
    WHERE organization_id IS NOT NULL
  `);

  await knex.raw(`
    CREATE INDEX IF NOT EXISTS idx_tasks_org_assigned 
    ON tasks(organization_id, assigned_to)
    WHERE organization_id IS NOT NULL AND assigned_to IS NOT NULL
  `);

  await knex.raw(`
    CREATE INDEX IF NOT EXISTS idx_tasks_org_created 
    ON tasks(organization_id, created_by)
    WHERE organization_id IS NOT NULL
  `);

  await knex.raw(`
    CREATE INDEX IF NOT EXISTS idx_tasks_org_reviewed 
    ON tasks(organization_id, reviewed_by)
    WHERE organization_id IS NOT NULL AND reviewed_by IS NOT NULL
  `);

  // Index for overdue task queries in dashboard
  await knex.raw(`
    CREATE INDEX IF NOT EXISTS idx_tasks_status_due_date 
    ON tasks(status, due_date)
    WHERE status IN ('assigned', 'in_progress', 'submitted') AND due_date IS NOT NULL
  `);

  // Critical composite indexes for recordings table
  // Used in every recording query for multi-tenant isolation
  await knex.raw(`
    CREATE INDEX IF NOT EXISTS idx_recordings_org_user 
    ON recordings(organization_id, user_id)
    WHERE organization_id IS NOT NULL
  `);

  await knex.raw(`
    CREATE INDEX IF NOT EXISTS idx_recordings_org_status 
    ON recordings(organization_id, status)
    WHERE organization_id IS NOT NULL
  `);

  // Index for time-based queries in dashboard and metrics
  await knex.raw(`
    CREATE INDEX IF NOT EXISTS idx_recordings_org_created_at 
    ON recordings(organization_id, created_at DESC)
    WHERE organization_id IS NOT NULL
  `);

  // Index for task recording lookups
  await knex.raw(`
    CREATE INDEX IF NOT EXISTS idx_recordings_task_status 
    ON recordings(task_id, status)
    WHERE task_id IS NOT NULL AND status != 'deleted'
  `);

  // Indexes for API metrics table (for usage tracking and analytics)
  await knex.raw(`
    CREATE INDEX IF NOT EXISTS idx_api_metrics_org_created_endpoint 
    ON api_metrics(organization_id, created_at, endpoint)
    WHERE organization_id IS NOT NULL
  `);

  await knex.raw(`
    CREATE INDEX IF NOT EXISTS idx_api_metrics_org_user_created 
    ON api_metrics(organization_id, user_id, created_at DESC)
    WHERE organization_id IS NOT NULL
  `);

  // Index for error tracking in metrics
  await knex.raw(`
    CREATE INDEX IF NOT EXISTS idx_api_metrics_created_status 
    ON api_metrics(created_at, status_code)
    WHERE error = true
  `);

  // Index for feature usage analytics
  await knex.raw(`
    CREATE INDEX IF NOT EXISTS idx_feature_usage_org_date_feature 
    ON feature_usage(organization_id, date, feature_name)
    WHERE organization_id IS NOT NULL
  `);

  // Index for storage metrics queries
  await knex.raw(`
    CREATE INDEX IF NOT EXISTS idx_storage_metrics_org_updated 
    ON storage_metrics(organization_id, updated_at)
    WHERE organization_id IS NOT NULL
  `);

  // Index for review comments with timestamp lookups
  await knex.raw(`
    CREATE INDEX IF NOT EXISTS idx_review_comments_review_timestamp 
    ON review_comments(review_id, timestamp_seconds)
    WHERE timestamp_seconds IS NOT NULL
  `);
}

export async function down(knex: Knex): Promise<void> {
  // Drop all the composite indexes we created
  const indexesToDrop = [
    'idx_tasks_org_status',
    'idx_tasks_org_assigned',
    'idx_tasks_org_created',
    'idx_tasks_org_reviewed',
    'idx_tasks_status_due_date',
    'idx_recordings_org_user',
    'idx_recordings_org_status',
    'idx_recordings_org_created_at',
    'idx_recordings_task_status',
    'idx_api_metrics_org_created_endpoint',
    'idx_api_metrics_org_user_created',
    'idx_api_metrics_created_status',
    'idx_feature_usage_org_date_feature',
    'idx_storage_metrics_org_updated',
    'idx_review_comments_review_timestamp',
  ];

  for (const indexName of indexesToDrop) {
    await knex.raw(`DROP INDEX IF NOT EXISTS ${indexName}`);
  }

  // Remove organization_id columns if they were added by this migration
  const hasOrgIdInRecordings = await knex.schema.hasColumn('recordings', 'organization_id');
  if (hasOrgIdInRecordings) {
    // Check if it's safe to drop (would need to verify it's not a foreign key constraint)
    try {
      await knex.schema.table('recordings', (table) => {
        table.dropColumn('organization_id');
      });
    } catch (e) {
      // Column might have constraints, skip if error
    }
  }

  const hasOrgIdInTasks = await knex.schema.hasColumn('tasks', 'organization_id');
  if (hasOrgIdInTasks) {
    try {
      await knex.schema.table('tasks', (table) => {
        table.dropColumn('organization_id');
      });
    } catch (e) {
      // Column might have constraints, skip if error
    }
  }
}
