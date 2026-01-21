import { Knex } from 'knex';

/**
 * Migration for comprehensive full-text search indexes
 *
 * Adds PostgreSQL full-text search capabilities to:
 * 1. Tasks - search by title, description
 * 2. Recordings - search by transcripts (already added in 032)
 * 3. Users - search by name, email
 *
 * Uses PostgreSQL's built-in tsvector and GIN indexes for efficient search.
 */
export async function up(knex: Knex): Promise<void> {
  // ============================================================
  // Tasks Search
  // ============================================================

  // Add tsvector column for tasks
  const hasTasksSearch = await knex.schema.hasColumn('tasks', 'search_vector');
  if (!hasTasksSearch) {
    await knex.schema.alterTable('tasks', (table) => {
      table.specificType('search_vector', 'tsvector').nullable();
    });

    // Create GIN index for task search
    await knex.raw(`
      CREATE INDEX IF NOT EXISTS idx_tasks_search_vector
      ON tasks USING GIN (search_vector)
    `);

    // Create trigger function to update search vector
    await knex.raw(`
      CREATE OR REPLACE FUNCTION update_tasks_search_vector()
      RETURNS TRIGGER AS $$
      BEGIN
        NEW.search_vector :=
          setweight(to_tsvector('english', COALESCE(NEW.title, '')), 'A') ||
          setweight(to_tsvector('english', COALESCE(NEW.description, '')), 'B') ||
          setweight(to_tsvector('english', COALESCE(NEW.category, '')), 'C');
        RETURN NEW;
      END;
      $$ LANGUAGE plpgsql;
    `);

    // Create trigger
    await knex.raw(`
      DROP TRIGGER IF EXISTS trigger_update_tasks_search_vector ON tasks;
      CREATE TRIGGER trigger_update_tasks_search_vector
      BEFORE INSERT OR UPDATE OF title, description, category ON tasks
      FOR EACH ROW
      EXECUTE FUNCTION update_tasks_search_vector();
    `);

    // Backfill existing tasks
    await knex.raw(`
      UPDATE tasks SET search_vector =
        setweight(to_tsvector('english', COALESCE(title, '')), 'A') ||
        setweight(to_tsvector('english', COALESCE(description, '')), 'B') ||
        setweight(to_tsvector('english', COALESCE(category, '')), 'C')
    `);
  }

  // ============================================================
  // Users Search
  // ============================================================

  // Add tsvector column for users
  const hasUsersSearch = await knex.schema.hasColumn('users', 'search_vector');
  if (!hasUsersSearch) {
    await knex.schema.alterTable('users', (table) => {
      table.specificType('search_vector', 'tsvector').nullable();
    });

    // Create GIN index for user search
    await knex.raw(`
      CREATE INDEX IF NOT EXISTS idx_users_search_vector
      ON users USING GIN (search_vector)
    `);

    // Create trigger function
    await knex.raw(`
      CREATE OR REPLACE FUNCTION update_users_search_vector()
      RETURNS TRIGGER AS $$
      BEGIN
        NEW.search_vector :=
          setweight(to_tsvector('english', COALESCE(NEW.name, '')), 'A') ||
          setweight(to_tsvector('english', COALESCE(NEW.email, '')), 'B');
        RETURN NEW;
      END;
      $$ LANGUAGE plpgsql;
    `);

    // Create trigger
    await knex.raw(`
      DROP TRIGGER IF EXISTS trigger_update_users_search_vector ON users;
      CREATE TRIGGER trigger_update_users_search_vector
      BEFORE INSERT OR UPDATE OF name, email ON users
      FOR EACH ROW
      EXECUTE FUNCTION update_users_search_vector();
    `);

    // Backfill existing users
    await knex.raw(`
      UPDATE users SET search_vector =
        setweight(to_tsvector('english', COALESCE(name, '')), 'A') ||
        setweight(to_tsvector('english', COALESCE(email, '')), 'B')
    `);
  }

  // ============================================================
  // Combined Search View for Global Search
  // ============================================================

  // Create a materialized view for efficient global search
  await knex.raw(`
    CREATE MATERIALIZED VIEW IF NOT EXISTS global_search_index AS
    SELECT
      'task' as entity_type,
      id::text as entity_id,
      organization_id,
      title as primary_text,
      description as secondary_text,
      search_vector,
      created_at,
      updated_at
    FROM tasks
    WHERE status != 'archived' AND search_vector IS NOT NULL

    UNION ALL

    SELECT
      'recording' as entity_type,
      id::text as entity_id,
      organization_id,
      COALESCE(transcript_text, '') as primary_text,
      '' as secondary_text,
      transcript_tsvector as search_vector,
      created_at,
      updated_at
    FROM recordings
    WHERE status != 'deleted' AND transcript_tsvector IS NOT NULL

    UNION ALL

    SELECT
      'user' as entity_type,
      u.id::text as entity_id,
      u.organization_id,
      u.name as primary_text,
      u.email as secondary_text,
      u.search_vector,
      u.created_at,
      u.updated_at
    FROM users u
    WHERE u.search_vector IS NOT NULL
  `);

  // Create index on the materialized view
  await knex.raw(`
    CREATE INDEX IF NOT EXISTS idx_global_search_vector
    ON global_search_index USING GIN (search_vector)
  `);

  await knex.raw(`
    CREATE INDEX IF NOT EXISTS idx_global_search_org
    ON global_search_index (organization_id)
  `);

  await knex.raw(`
    CREATE INDEX IF NOT EXISTS idx_global_search_type
    ON global_search_index (entity_type)
  `);

  // Create a function to refresh the materialized view
  await knex.raw(`
    CREATE OR REPLACE FUNCTION refresh_global_search_index()
    RETURNS void AS $$
    BEGIN
      REFRESH MATERIALIZED VIEW CONCURRENTLY global_search_index;
    END;
    $$ LANGUAGE plpgsql;
  `);

  // ============================================================
  // Additional Indexes for Search Performance
  // ============================================================

  // Index for searching by date ranges
  await knex.raw(`
    CREATE INDEX IF NOT EXISTS idx_tasks_created_at_desc ON tasks (created_at DESC)
  `);

  await knex.raw(`
    CREATE INDEX IF NOT EXISTS idx_recordings_created_at_desc ON recordings (created_at DESC)
  `);

  // Partial index for active tasks
  await knex.raw(`
    CREATE INDEX IF NOT EXISTS idx_tasks_active
    ON tasks (organization_id, status, created_at DESC)
    WHERE status NOT IN ('archived', 'deleted')
  `);

  // Index for recordings with transcripts
  await knex.raw(`
    CREATE INDEX IF NOT EXISTS idx_recordings_with_transcript
    ON recordings (organization_id, transcription_status, created_at DESC)
    WHERE transcription_status = 'completed'
  `);
}

export async function down(knex: Knex): Promise<void> {
  // Drop indexes
  await knex.raw('DROP INDEX IF EXISTS idx_recordings_with_transcript');
  await knex.raw('DROP INDEX IF EXISTS idx_tasks_active');
  await knex.raw('DROP INDEX IF EXISTS idx_recordings_created_at_desc');
  await knex.raw('DROP INDEX IF EXISTS idx_tasks_created_at_desc');

  // Drop materialized view and function
  await knex.raw('DROP FUNCTION IF EXISTS refresh_global_search_index');
  await knex.raw('DROP MATERIALIZED VIEW IF EXISTS global_search_index');

  // Drop user search
  await knex.raw('DROP TRIGGER IF EXISTS trigger_update_users_search_vector ON users');
  await knex.raw('DROP FUNCTION IF EXISTS update_users_search_vector');
  await knex.raw('DROP INDEX IF EXISTS idx_users_search_vector');
  const hasUsersSearch = await knex.schema.hasColumn('users', 'search_vector');
  if (hasUsersSearch) {
    await knex.schema.alterTable('users', (table) => {
      table.dropColumn('search_vector');
    });
  }

  // Drop task search
  await knex.raw('DROP TRIGGER IF EXISTS trigger_update_tasks_search_vector ON tasks');
  await knex.raw('DROP FUNCTION IF EXISTS update_tasks_search_vector');
  await knex.raw('DROP INDEX IF EXISTS idx_tasks_search_vector');
  const hasTasksSearch = await knex.schema.hasColumn('tasks', 'search_vector');
  if (hasTasksSearch) {
    await knex.schema.alterTable('tasks', (table) => {
      table.dropColumn('search_vector');
    });
  }
}
