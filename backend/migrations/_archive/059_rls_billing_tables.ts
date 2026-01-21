import { Knex } from 'knex';

/**
 * Migration: Enable RLS on Billing Tables
 *
 * This migration enables Row Level Security on billing-related tables
 * to ensure complete data isolation between organizations.
 *
 * Tables covered:
 * - subscriptions
 * - invoices
 * - payment_methods
 * - billing_disputes
 * - checkout_sessions
 */

export async function up(knex: Knex): Promise<void> {
  console.log('Enabling RLS on billing tables...');

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

  // Enable RLS on billing tables
  await enableSecureRLS('subscriptions', 'subscriptions_org_isolation');
  await enableSecureRLS('invoices', 'invoices_org_isolation');
  await enableSecureRLS('payment_methods', 'payment_methods_org_isolation');
  await enableSecureRLS('billing_disputes', 'billing_disputes_org_isolation');
  await enableSecureRLS('checkout_sessions', 'checkout_sessions_org_isolation');

  console.log('✅ Enabled RLS on billing tables');
}

export async function down(knex: Knex): Promise<void> {
  console.log('Disabling RLS on billing tables...');

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

  await disableRLS('subscriptions', 'subscriptions_org_isolation');
  await disableRLS('invoices', 'invoices_org_isolation');
  await disableRLS('payment_methods', 'payment_methods_org_isolation');
  await disableRLS('billing_disputes', 'billing_disputes_org_isolation');
  await disableRLS('checkout_sessions', 'checkout_sessions_org_isolation');

  console.log('✅ Disabled RLS on billing tables');
}
