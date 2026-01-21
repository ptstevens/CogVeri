import { Knex } from 'knex';

/**
 * Migration: Enable Row Level Security (RLS) on Additional Tables
 *
 * This migration enables RLS on billing, analysis, and other multi-tenant tables.
 *
 * Tables with RLS:
 * - analysis_jobs - AI analysis job records
 * - analysis_results - Analysis results
 * - transcription_jobs - Transcription processing
 * - storage_metrics - Storage usage tracking
 * - recording_file_sizes - File size tracking
 */

export async function up(knex: Knex): Promise<void> {
  // Helper to check if table exists and has organization_id column
  const canEnableRLS = async (tableName: string): Promise<boolean> => {
    const exists = await knex.schema.hasTable(tableName);
    if (!exists) return false;
    return await knex.schema.hasColumn(tableName, 'organization_id');
  };

  // Helper to enable RLS with standard policy
  const enableStandardRLS = async (tableName: string) => {
    if (await canEnableRLS(tableName)) {
      await knex.raw(`ALTER TABLE ${tableName} ENABLE ROW LEVEL SECURITY`);
      await knex.raw(`
        CREATE POLICY ${tableName}_org_isolation ON ${tableName}
        FOR ALL
        USING (organization_id = get_current_org() OR get_current_org() IS NULL)
        WITH CHECK (organization_id = get_current_org())
      `);
      console.log(`  ✓ ${tableName}`);
      return true;
    }
    console.log(`  - ${tableName} (skipped - no organization_id column)`);
    return false;
  };

  console.log('Enabling RLS on additional tables:');

  // Analysis tables
  await enableStandardRLS('analysis_jobs');
  await enableStandardRLS('analysis_results');
  await enableStandardRLS('analysis_step_scores');
  await enableStandardRLS('analysis_frames');

  // Transcription tables
  await enableStandardRLS('transcription_jobs');

  // Storage and metrics tables
  await enableStandardRLS('storage_metrics');
  await enableStandardRLS('recording_file_sizes');

  // Admin and impersonation tables
  await enableStandardRLS('admin_impersonation_tokens');

  // External access tables
  if (await canEnableRLS('external_contributors')) {
    await enableStandardRLS('external_contributors');
  }
  if (await canEnableRLS('task_access_tokens')) {
    await enableStandardRLS('task_access_tokens');
  }
  if (await canEnableRLS('task_access_logs')) {
    await enableStandardRLS('task_access_logs');
  }

  // Domain verification
  if (await canEnableRLS('domain_verification_requests')) {
    await enableStandardRLS('domain_verification_requests');
  }

  console.log('✅ Enabled RLS on additional tables');
}

export async function down(knex: Knex): Promise<void> {
  // Helper to safely drop policy and disable RLS
  const disableRLS = async (tableName: string) => {
    try {
      await knex.raw(`DROP POLICY IF EXISTS ${tableName}_org_isolation ON ${tableName}`);
      await knex.raw(`ALTER TABLE ${tableName} DISABLE ROW LEVEL SECURITY`);
      console.log(`  ✓ ${tableName}`);
    } catch {
      console.log(`  - ${tableName} (skipped)`);
    }
  };

  console.log('Disabling RLS on additional tables:');

  // Analysis tables
  await disableRLS('analysis_jobs');
  await disableRLS('analysis_results');
  await disableRLS('analysis_step_scores');
  await disableRLS('analysis_frames');

  // Transcription tables
  await disableRLS('transcription_jobs');

  // Storage and metrics tables
  await disableRLS('storage_metrics');
  await disableRLS('recording_file_sizes');

  // Admin and impersonation tables
  await disableRLS('admin_impersonation_tokens');

  // External access tables
  await disableRLS('external_contributors');
  await disableRLS('task_access_tokens');
  await disableRLS('task_access_logs');

  // Domain verification
  await disableRLS('domain_verification_requests');

  console.log('✅ Disabled RLS on additional tables');
}
