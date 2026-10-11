import { Knex } from 'knex';

/**
 * Migration: Fix RLS NULL Context Bypass
 *
 * SECURITY FIX: Previous RLS policies contained:
 *   USING (organization_id = get_current_org() OR get_current_org() IS NULL)
 *
 * This allows access to ALL data when no org context is set, defeating
 * the purpose of RLS as a security boundary.
 *
 * This migration updates all policies to require org context:
 *   USING (organization_id = get_current_org())
 *
 * Note: Admin/migration operations should use a BYPASSRLS role instead.
 */

export async function up(knex: Knex): Promise<void> {
  console.log('Fixing RLS policies to remove NULL context bypass...');

  // Helper to check if table has RLS enabled
  const hasRLS = async (tableName: string): Promise<boolean> => {
    const result = await knex.raw(
      `
      SELECT relrowsecurity FROM pg_class
      WHERE relname = ? AND relnamespace = 'public'::regnamespace
    `,
      [tableName]
    );
    return result.rows[0]?.relrowsecurity || false;
  };

  // Helper to update a policy - drop and recreate without NULL bypass
  const fixStandardPolicy = async (tableName: string, policyName: string) => {
    if (!(await hasRLS(tableName))) {
      console.log(`  - ${tableName} (RLS not enabled, skipping)`);
      return;
    }

    try {
      // Drop existing policy
      await knex.raw(`DROP POLICY IF EXISTS ${policyName} ON ${tableName}`);

      // Create new policy WITHOUT the NULL bypass
      await knex.raw(`
        CREATE POLICY ${policyName} ON ${tableName}
        FOR ALL
        USING (organization_id = get_current_org())
        WITH CHECK (organization_id = get_current_org())
      `);
      console.log(`  ✓ ${tableName}`);
    } catch (error) {
      console.log(`  - ${tableName} (error: ${(error as Error).message})`);
    }
  };

  // Fix core tables from migration 053
  await fixStandardPolicy('recordings', 'recordings_org_isolation');
  await fixStandardPolicy('tasks', 'tasks_org_isolation');
  await fixStandardPolicy('notifications', 'notifications_org_isolation');
  await fixStandardPolicy('organization_invitations', 'org_invitations_org_isolation');
  await fixStandardPolicy('organization_audit_logs', 'audit_logs_org_isolation');
  await fixStandardPolicy('upload_sessions', 'upload_sessions_org_isolation');

  // Fix organization_members - need to keep own-memberships policy
  if (await hasRLS('organization_members')) {
    await knex.raw('DROP POLICY IF EXISTS org_members_org_isolation ON organization_members');
    await knex.raw(`
      CREATE POLICY org_members_org_isolation ON organization_members
      FOR ALL
      USING (organization_id = get_current_org())
      WITH CHECK (organization_id = get_current_org())
    `);
    // Note: org_members_own_memberships policy remains unchanged (user_id based)
    console.log('  ✓ organization_members');
  }

  // Fix task_templates - keep system template visibility
  if (await hasRLS('task_templates')) {
    await knex.raw('DROP POLICY IF EXISTS task_templates_org_or_system ON task_templates');
    await knex.raw(`
      CREATE POLICY task_templates_org_or_system ON task_templates
      FOR SELECT
      USING (
        organization_id = get_current_org()
        OR organization_id IS NULL
      )
    `);
    // Note: Other task_template policies (write, modify, delete) already don't have NULL bypass
    console.log('  ✓ task_templates');
  }

  // Fix additional tables from migration 054
  await fixStandardPolicy('analysis_jobs', 'analysis_jobs_org_isolation');
  await fixStandardPolicy('analysis_results', 'analysis_results_org_isolation');
  await fixStandardPolicy('analysis_step_scores', 'analysis_step_scores_org_isolation');
  await fixStandardPolicy('analysis_frames', 'analysis_frames_org_isolation');
  await fixStandardPolicy('transcription_jobs', 'transcription_jobs_org_isolation');
  await fixStandardPolicy('storage_metrics', 'storage_metrics_org_isolation');
  await fixStandardPolicy('recording_file_sizes', 'recording_file_sizes_org_isolation');
  await fixStandardPolicy('admin_impersonation_tokens', 'admin_impersonation_tokens_org_isolation');
  await fixStandardPolicy('external_contributors', 'external_contributors_org_isolation');
  await fixStandardPolicy('task_access_tokens', 'task_access_tokens_org_isolation');
  await fixStandardPolicy('task_access_logs', 'task_access_logs_org_isolation');
  await fixStandardPolicy(
    'domain_verification_requests',
    'domain_verification_requests_org_isolation'
  );

  console.log('✅ Fixed RLS policies - NULL context bypass removed');
}

export async function down(knex: Knex): Promise<void> {
  console.log('Reverting RLS policies to include NULL context bypass...');

  // Helper to revert a policy - add back the NULL bypass
  const revertPolicy = async (tableName: string, policyName: string) => {
    try {
      await knex.raw(`DROP POLICY IF EXISTS ${policyName} ON ${tableName}`);
      await knex.raw(`
        CREATE POLICY ${policyName} ON ${tableName}
        FOR ALL
        USING (organization_id = get_current_org() OR get_current_org() IS NULL)
        WITH CHECK (organization_id = get_current_org())
      `);
      console.log(`  ✓ ${tableName}`);
    } catch {
      console.log(`  - ${tableName} (skipped)`);
    }
  };

  // Revert all tables
  await revertPolicy('recordings', 'recordings_org_isolation');
  await revertPolicy('tasks', 'tasks_org_isolation');
  await revertPolicy('notifications', 'notifications_org_isolation');
  await revertPolicy('organization_members', 'org_members_org_isolation');
  await revertPolicy('organization_invitations', 'org_invitations_org_isolation');
  await revertPolicy('organization_audit_logs', 'audit_logs_org_isolation');
  await revertPolicy('upload_sessions', 'upload_sessions_org_isolation');
  await revertPolicy('analysis_jobs', 'analysis_jobs_org_isolation');
  await revertPolicy('analysis_results', 'analysis_results_org_isolation');
  await revertPolicy('analysis_step_scores', 'analysis_step_scores_org_isolation');
  await revertPolicy('analysis_frames', 'analysis_frames_org_isolation');
  await revertPolicy('transcription_jobs', 'transcription_jobs_org_isolation');
  await revertPolicy('storage_metrics', 'storage_metrics_org_isolation');
  await revertPolicy('recording_file_sizes', 'recording_file_sizes_org_isolation');
  await revertPolicy('admin_impersonation_tokens', 'admin_impersonation_tokens_org_isolation');
  await revertPolicy('external_contributors', 'external_contributors_org_isolation');
  await revertPolicy('task_access_tokens', 'task_access_tokens_org_isolation');
  await revertPolicy('task_access_logs', 'task_access_logs_org_isolation');
  await revertPolicy('domain_verification_requests', 'domain_verification_requests_org_isolation');

  // Revert task_templates
  try {
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
    console.log('  ✓ task_templates');
  } catch {
    console.log('  - task_templates (skipped)');
  }

  console.log('✅ Reverted RLS policies - NULL context bypass restored');
}
