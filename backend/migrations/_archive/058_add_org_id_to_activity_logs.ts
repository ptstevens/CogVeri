import { Knex } from 'knex';

/**
 * Migration: Add organization_id to activity_logs table
 *
 * The activity_logs table currently only has user_id for tracking.
 * This migration adds organization_id for proper multi-tenant isolation
 * and enables RLS.
 */

export async function up(knex: Knex): Promise<void> {
  const tableExists = await knex.schema.hasTable('activity_logs');
  if (!tableExists) {
    console.log('  - activity_logs table does not exist, skipping');
    return;
  }

  const hasColumn = await knex.schema.hasColumn('activity_logs', 'organization_id');

  if (!hasColumn) {
    // Add organization_id column
    await knex.schema.alterTable('activity_logs', (table) => {
      table.uuid('organization_id').references('id').inTable('organizations').onDelete('CASCADE');
    });
    console.log('  ✓ Added organization_id column to activity_logs table');

    // Populate from users table (get org from the user who performed the action)
    await knex.raw(`
      UPDATE activity_logs al
      SET organization_id = (
        SELECT COALESCE(u.current_organization_id, u.organization_id)
        FROM users u
        WHERE u.id = al.user_id
      )
      WHERE organization_id IS NULL
    `);
    console.log('  ✓ Populated organization_id from users');

    // Add index
    await knex.schema.alterTable('activity_logs', (table) => {
      table.index('organization_id');
    });
    console.log('  ✓ Added index on organization_id');

    // Enable RLS
    await knex.raw('ALTER TABLE activity_logs ENABLE ROW LEVEL SECURITY');

    // Create RLS policy (without NULL bypass)
    await knex.raw('DROP POLICY IF EXISTS activity_logs_org_isolation ON activity_logs');
    await knex.raw(`
      CREATE POLICY activity_logs_org_isolation ON activity_logs
      FOR ALL
      USING (organization_id = get_current_org())
      WITH CHECK (organization_id = get_current_org())
    `);
    console.log('  ✓ Enabled RLS with org isolation policy');
  } else {
    console.log('  - organization_id column already exists on activity_logs');
  }

  console.log('✅ Migration 058 complete: activity_logs.organization_id added with RLS');
}

export async function down(knex: Knex): Promise<void> {
  const tableExists = await knex.schema.hasTable('activity_logs');
  if (!tableExists) {
    return;
  }

  const hasColumn = await knex.schema.hasColumn('activity_logs', 'organization_id');

  if (hasColumn) {
    // Disable RLS and drop policy
    await knex.raw('DROP POLICY IF EXISTS activity_logs_org_isolation ON activity_logs');
    await knex.raw('ALTER TABLE activity_logs DISABLE ROW LEVEL SECURITY');

    // Remove column
    await knex.schema.alterTable('activity_logs', (table) => {
      table.dropIndex('organization_id');
      table.dropColumn('organization_id');
    });
    console.log('  ✓ Removed organization_id column from activity_logs');
  }

  console.log('✅ Migration 058 rollback complete');
}
