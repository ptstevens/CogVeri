import { Knex } from 'knex';

/**
 * Migration: Enable Row Level Security (RLS) on Core Tables
 *
 * This migration enables RLS on the main multi-tenant tables and creates
 * policies that enforce data isolation by organization_id.
 *
 * Tables with RLS:
 * - recordings - Video recordings
 * - tasks - Task assignments
 * - reviews - Recording reviews
 * - notifications - User notifications
 * - organization_members - Membership records
 * - organization_invitations - Pending invitations
 * - task_templates - Task templates (including system defaults)
 * - organization_audit_logs - Audit trail
 * - upload_sessions - File upload tracking
 *
 * Policy pattern:
 * - SELECT/UPDATE/DELETE: Only rows where organization_id = current org
 * - INSERT: Only if organization_id matches current org
 */

export async function up(knex: Knex): Promise<void> {
  // Helper to check if table exists before enabling RLS
  const tableExists = async (tableName: string): Promise<boolean> => {
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
    return result.rows[0]?.exists || false;
  };

  // === RECORDINGS TABLE ===
  if (await tableExists('recordings')) {
    await knex.raw('ALTER TABLE recordings ENABLE ROW LEVEL SECURITY');
    await knex.raw('DROP POLICY IF EXISTS recordings_org_isolation ON recordings');
    await knex.raw(`
      CREATE POLICY recordings_org_isolation ON recordings
      FOR ALL
      USING (organization_id = get_current_org() OR get_current_org() IS NULL)
      WITH CHECK (organization_id = get_current_org())
    `);
    console.log('  ✓ recordings');
  }

  // === TASKS TABLE ===
  if (await tableExists('tasks')) {
    await knex.raw('ALTER TABLE tasks ENABLE ROW LEVEL SECURITY');
    await knex.raw('DROP POLICY IF EXISTS tasks_org_isolation ON tasks');
    await knex.raw(`
      CREATE POLICY tasks_org_isolation ON tasks
      FOR ALL
      USING (organization_id = get_current_org() OR get_current_org() IS NULL)
      WITH CHECK (organization_id = get_current_org())
    `);
    console.log('  ✓ tasks');
  }

  // === REVIEWS TABLE ===
  // Note: reviews table may not have organization_id - it inherits org context via recording_id
  if (await tableExists('reviews')) {
    const hasOrgId = await knex.schema.hasColumn('reviews', 'organization_id');
    if (hasOrgId) {
      await knex.raw('ALTER TABLE reviews ENABLE ROW LEVEL SECURITY');
      await knex.raw('DROP POLICY IF EXISTS reviews_org_isolation ON reviews');
      await knex.raw(`
        CREATE POLICY reviews_org_isolation ON reviews
        FOR ALL
        USING (organization_id = get_current_org() OR get_current_org() IS NULL)
        WITH CHECK (organization_id = get_current_org())
      `);
      console.log('  ✓ reviews');
    } else {
      console.log(
        '  - reviews (skipped - no organization_id column, uses recording_id for org context)'
      );
    }
  }

  // === NOTIFICATIONS TABLE ===
  if (await tableExists('notifications')) {
    const hasOrgId = await knex.schema.hasColumn('notifications', 'organization_id');
    if (hasOrgId) {
      await knex.raw('ALTER TABLE notifications ENABLE ROW LEVEL SECURITY');
      await knex.raw('DROP POLICY IF EXISTS notifications_org_isolation ON notifications');
      await knex.raw(`
        CREATE POLICY notifications_org_isolation ON notifications
        FOR ALL
        USING (organization_id = get_current_org() OR get_current_org() IS NULL)
        WITH CHECK (organization_id = get_current_org())
      `);
      console.log('  ✓ notifications');
    }
  }

  // === ORGANIZATION_MEMBERS TABLE ===
  // Special case: users can see their own memberships across all orgs
  if (await tableExists('organization_members')) {
    await knex.raw('ALTER TABLE organization_members ENABLE ROW LEVEL SECURITY');

    // Policy 1: Org isolation for general access
    await knex.raw('DROP POLICY IF EXISTS org_members_org_isolation ON organization_members');
    await knex.raw(`
      CREATE POLICY org_members_org_isolation ON organization_members
      FOR ALL
      USING (organization_id = get_current_org() OR get_current_org() IS NULL)
      WITH CHECK (organization_id = get_current_org())
    `);

    // Policy 2: Users can always see their own memberships (for org switching)
    await knex.raw('DROP POLICY IF EXISTS org_members_own_memberships ON organization_members');
    await knex.raw(`
      CREATE POLICY org_members_own_memberships ON organization_members
      FOR SELECT
      USING (user_id = get_current_user_id())
    `);
    console.log('  ✓ organization_members (with own-membership policy)');
  }

  // === ORGANIZATION_INVITATIONS TABLE ===
  if (await tableExists('organization_invitations')) {
    await knex.raw('ALTER TABLE organization_invitations ENABLE ROW LEVEL SECURITY');
    await knex.raw(
      'DROP POLICY IF EXISTS org_invitations_org_isolation ON organization_invitations'
    );
    await knex.raw(`
      CREATE POLICY org_invitations_org_isolation ON organization_invitations
      FOR ALL
      USING (organization_id = get_current_org() OR get_current_org() IS NULL)
      WITH CHECK (organization_id = get_current_org())
    `);
    console.log('  ✓ organization_invitations');
  }

  // === TASK_TEMPLATES TABLE ===
  // Special case: system templates (organization_id IS NULL) visible to all
  if (await tableExists('task_templates')) {
    await knex.raw('ALTER TABLE task_templates ENABLE ROW LEVEL SECURITY');
    await knex.raw('DROP POLICY IF EXISTS task_templates_org_or_system ON task_templates');
    await knex.raw(`
      CREATE POLICY task_templates_org_or_system ON task_templates
      FOR SELECT
      USING (
        organization_id = get_current_org()
        OR organization_id IS NULL
        OR get_current_org() IS NULL
      )
    `);
    await knex.raw('DROP POLICY IF EXISTS task_templates_org_write ON task_templates');
    await knex.raw(`
      CREATE POLICY task_templates_org_write ON task_templates
      FOR INSERT
      WITH CHECK (organization_id = get_current_org())
    `);
    await knex.raw('DROP POLICY IF EXISTS task_templates_org_modify ON task_templates');
    await knex.raw(`
      CREATE POLICY task_templates_org_modify ON task_templates
      FOR UPDATE
      USING (organization_id = get_current_org())
      WITH CHECK (organization_id = get_current_org())
    `);
    await knex.raw('DROP POLICY IF EXISTS task_templates_org_delete ON task_templates');
    await knex.raw(`
      CREATE POLICY task_templates_org_delete ON task_templates
      FOR DELETE
      USING (organization_id = get_current_org())
    `);
    console.log('  ✓ task_templates (with system template policy)');
  }

  // === ORGANIZATION_AUDIT_LOGS TABLE ===
  if (await tableExists('organization_audit_logs')) {
    await knex.raw('ALTER TABLE organization_audit_logs ENABLE ROW LEVEL SECURITY');
    await knex.raw('DROP POLICY IF EXISTS audit_logs_org_isolation ON organization_audit_logs');
    await knex.raw(`
      CREATE POLICY audit_logs_org_isolation ON organization_audit_logs
      FOR ALL
      USING (organization_id = get_current_org() OR get_current_org() IS NULL)
      WITH CHECK (organization_id = get_current_org())
    `);
    console.log('  ✓ organization_audit_logs');
  }

  // === UPLOAD_SESSIONS TABLE ===
  if (await tableExists('upload_sessions')) {
    await knex.raw('ALTER TABLE upload_sessions ENABLE ROW LEVEL SECURITY');
    await knex.raw('DROP POLICY IF EXISTS upload_sessions_org_isolation ON upload_sessions');
    await knex.raw(`
      CREATE POLICY upload_sessions_org_isolation ON upload_sessions
      FOR ALL
      USING (organization_id = get_current_org() OR get_current_org() IS NULL)
      WITH CHECK (organization_id = get_current_org())
    `);
    console.log('  ✓ upload_sessions');
  }

  console.log('✅ Enabled RLS on core tables');
}

export async function down(knex: Knex): Promise<void> {
  // Helper to safely drop policy and disable RLS
  const disableRLS = async (tableName: string, policies: string[]) => {
    try {
      for (const policy of policies) {
        await knex.raw(`DROP POLICY IF EXISTS ${policy} ON ${tableName}`);
      }
      await knex.raw(`ALTER TABLE ${tableName} DISABLE ROW LEVEL SECURITY`);
      console.log(`  ✓ ${tableName}`);
    } catch (error) {
      console.log(`  - ${tableName} (skipped - table may not exist)`);
    }
  };

  console.log('Disabling RLS on core tables:');

  await disableRLS('recordings', ['recordings_org_isolation']);
  await disableRLS('tasks', ['tasks_org_isolation']);
  // reviews may not have RLS if it doesn't have organization_id
  const reviewsHasOrgId = await knex.schema.hasColumn('reviews', 'organization_id');
  if (reviewsHasOrgId) {
    await disableRLS('reviews', ['reviews_org_isolation']);
  }
  await disableRLS('notifications', ['notifications_org_isolation']);
  await disableRLS('organization_members', [
    'org_members_org_isolation',
    'org_members_own_memberships',
  ]);
  await disableRLS('organization_invitations', ['org_invitations_org_isolation']);
  await disableRLS('task_templates', [
    'task_templates_org_or_system',
    'task_templates_org_write',
    'task_templates_org_modify',
    'task_templates_org_delete',
  ]);
  await disableRLS('organization_audit_logs', ['audit_logs_org_isolation']);
  await disableRLS('upload_sessions', ['upload_sessions_org_isolation']);

  console.log('✅ Disabled RLS on core tables');
}
