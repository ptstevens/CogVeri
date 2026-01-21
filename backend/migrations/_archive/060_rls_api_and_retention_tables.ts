import { Knex } from 'knex';

/**
 * Migration: Enable RLS on API Metrics and Retention Tables
 *
 * This migration enables Row Level Security on:
 * - API metrics and usage tracking tables
 * - Rate limiting tables
 * - Feature usage tracking
 * - API keys
 * - Recording retention policies
 * - Storage quota alerts
 */

export async function up(knex: Knex): Promise<void> {
  console.log('Enabling RLS on API metrics and retention tables...');

  // Helper to check if table exists and has organization_id column
  const canEnableRLS = async (tableName: string): Promise<boolean> => {
    const exists = await knex.schema.hasTable(tableName);
    if (!exists) return false;
    return await knex.schema.hasColumn(tableName, 'organization_id');
  };

  // Helper to enable RLS with secure policy (no NULL bypass)
  const enableSecureRLS = async (tableName: string, policyName: string) => {
    if (await canEnableRLS(tableName)) {
      await knex.raw(`ALTER TABLE ${tableName} ENABLE ROW LEVEL SECURITY`);
      await knex.raw(`DROP POLICY IF EXISTS ${policyName} ON ${tableName}`);
      await knex.raw(`
        CREATE POLICY ${policyName} ON ${tableName}
        FOR ALL
        USING (organization_id = get_current_org())
        WITH CHECK (organization_id = get_current_org())
      `);
      console.log(`  ✓ ${tableName}`);
      return true;
    }
    console.log(`  - ${tableName} (skipped - table or organization_id column missing)`);
    return false;
  };

  // API metrics and usage tables
  await enableSecureRLS('api_metrics', 'api_metrics_org_isolation');
  await enableSecureRLS('api_usage_summary', 'api_usage_summary_org_isolation');
  await enableSecureRLS('rate_limit_rules', 'rate_limit_rules_org_isolation');
  await enableSecureRLS('rate_limit_violations', 'rate_limit_violations_org_isolation');
  await enableSecureRLS('feature_usage', 'feature_usage_org_isolation');
  await enableSecureRLS('api_keys', 'api_keys_org_isolation');

  // Retention and storage tables
  await enableSecureRLS('recording_retention_policies', 'recording_retention_policies_org_isolation');
  await enableSecureRLS('retention_execution_logs', 'retention_execution_logs_org_isolation');
  await enableSecureRLS('storage_quota_alerts', 'storage_quota_alerts_org_isolation');

  console.log('✅ Enabled RLS on API metrics and retention tables');
}

export async function down(knex: Knex): Promise<void> {
  console.log('Disabling RLS on API metrics and retention tables...');

  // Helper to safely disable RLS
  const disableRLS = async (tableName: string, policyName: string) => {
    try {
      await knex.raw(`DROP POLICY IF EXISTS ${policyName} ON ${tableName}`);
      await knex.raw(`ALTER TABLE ${tableName} DISABLE ROW LEVEL SECURITY`);
      console.log(`  ✓ ${tableName}`);
    } catch {
      console.log(`  - ${tableName} (skipped)`);
    }
  };

  // API metrics and usage tables
  await disableRLS('api_metrics', 'api_metrics_org_isolation');
  await disableRLS('api_usage_summary', 'api_usage_summary_org_isolation');
  await disableRLS('rate_limit_rules', 'rate_limit_rules_org_isolation');
  await disableRLS('rate_limit_violations', 'rate_limit_violations_org_isolation');
  await disableRLS('feature_usage', 'feature_usage_org_isolation');
  await disableRLS('api_keys', 'api_keys_org_isolation');

  // Retention and storage tables
  await disableRLS('recording_retention_policies', 'recording_retention_policies_org_isolation');
  await disableRLS('retention_execution_logs', 'retention_execution_logs_org_isolation');
  await disableRLS('storage_quota_alerts', 'storage_quota_alerts_org_isolation');

  console.log('✅ Disabled RLS on API metrics and retention tables');
}
