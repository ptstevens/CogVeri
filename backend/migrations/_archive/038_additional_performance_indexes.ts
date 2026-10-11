import { Knex } from 'knex';

/**
 * Additional performance indexes for:
 * - Compound cursor pagination (Fix #9)
 * - Transcription job deduplication (Fix #23)
 * - Notification queries
 * - User organization lookups
 *
 * NOTE: Each index creation checks if the table exists first to handle
 * partial migrations or databases missing certain tables.
 */

// Helper to check if a table exists
async function tableExists(knex: Knex, tableName: string): Promise<boolean> {
  const result = await knex.raw(
    `
    SELECT EXISTS (
      SELECT FROM information_schema.tables
      WHERE table_schema = 'public'
      AND table_name = ?
    )
  `,
    [tableName]
  );
  return result.rows[0]?.exists ?? false;
}

// Helper to safely create index only if table exists
async function createIndexIfTableExists(
  knex: Knex,
  tableName: string,
  indexSql: string
): Promise<void> {
  if (await tableExists(knex, tableName)) {
    await knex.raw(indexSql);
  }
}

export async function up(knex: Knex): Promise<void> {
  // Compound cursor index for recordings (created_at + id for stable pagination)
  await createIndexIfTableExists(
    knex,
    'recordings',
    `
    CREATE INDEX IF NOT EXISTS idx_recordings_cursor_pagination
    ON recordings(organization_id, created_at DESC, id DESC)
    WHERE organization_id IS NOT NULL AND status != 'deleted'
  `
  );

  // Compound cursor index for tasks
  await createIndexIfTableExists(
    knex,
    'tasks',
    `
    CREATE INDEX IF NOT EXISTS idx_tasks_cursor_pagination
    ON tasks(organization_id, created_at DESC, id DESC)
    WHERE organization_id IS NOT NULL
  `
  );

  // Index for transcription job deduplication (Fix #23)
  await createIndexIfTableExists(
    knex,
    'transcription_jobs',
    `
    CREATE INDEX IF NOT EXISTS idx_transcription_jobs_pending
    ON transcription_jobs(recording_id, status)
    WHERE status IN ('pending', 'processing')
  `
  );

  // Index for user lookups by organization
  await createIndexIfTableExists(
    knex,
    'users',
    `
    CREATE INDEX IF NOT EXISTS idx_users_org_active
    ON users(organization_id, is_active)
    WHERE organization_id IS NOT NULL AND is_active = true
  `
  );

  // Index for notification queries (unread by user)
  await createIndexIfTableExists(
    knex,
    'notifications',
    `
    CREATE INDEX IF NOT EXISTS idx_notifications_user_unread
    ON notifications(user_id, is_read, created_at DESC)
    WHERE is_read = false
  `
  );

  // Index for billing event lookups
  await createIndexIfTableExists(
    knex,
    'billing_events',
    `
    CREATE INDEX IF NOT EXISTS idx_billing_events_org_type
    ON billing_events(organization_id, event_type, created_at DESC)
    WHERE organization_id IS NOT NULL
  `
  );

  // Index for magic link lookups (by token hash for fast validation)
  await createIndexIfTableExists(
    knex,
    'magic_links',
    `
    CREATE INDEX IF NOT EXISTS idx_magic_links_token_valid
    ON magic_links(token_hash, is_used, expires_at)
    WHERE is_used = false
  `
  );

  // Index for activity log queries
  await createIndexIfTableExists(
    knex,
    'activity_logs',
    `
    CREATE INDEX IF NOT EXISTS idx_activity_logs_entity
    ON activity_logs(entity_type, entity_id, created_at DESC)
  `
  );

  // Index for subscription lookups by organization
  await createIndexIfTableExists(
    knex,
    'subscriptions',
    `
    CREATE INDEX IF NOT EXISTS idx_subscriptions_org_status
    ON subscriptions(organization_id, status)
  `
  );
}

export async function down(knex: Knex): Promise<void> {
  const indexesToDrop = [
    'idx_recordings_cursor_pagination',
    'idx_tasks_cursor_pagination',
    'idx_transcription_jobs_pending',
    'idx_users_org_active',
    'idx_notifications_user_unread',
    'idx_billing_events_org_type',
    'idx_magic_links_token_valid',
    'idx_activity_logs_entity',
    'idx_subscriptions_org_status',
  ];

  for (const indexName of indexesToDrop) {
    await knex.raw(`DROP INDEX IF EXISTS ${indexName}`);
  }
}
