import { Knex } from 'knex';

/**
 * Migration: Populate organization_members from existing users
 *
 * This migration copies existing user-organization relationships from the users table
 * to the new organization_members table, enabling the transition to multi-tenancy.
 *
 * What it does:
 * 1. Copies organization_id, org_role, org_status from users to organization_members
 * 2. Sets current_organization_id for users who have an organization but no current set
 * 3. Preserves all existing membership data
 */

export async function up(knex: Knex): Promise<void> {
  // Get count of users with organizations before migration
  const beforeCount = await knex('users')
    .whereNotNull('organization_id')
    .count('id as count')
    .first();

  console.log(`Found ${beforeCount?.count || 0} users with organizations to migrate`);

  // Migrate existing memberships from users table to organization_members
  // Handle NULL org_role by defaulting to 'limited'
  // Handle NULL org_status by defaulting to 'active'
  const migrated = await knex.raw(`
    INSERT INTO organization_members (
      user_id,
      organization_id,
      role,
      status,
      joined_at,
      created_at,
      updated_at
    )
    SELECT
      id as user_id,
      organization_id,
      COALESCE(org_role, 'limited') as role,
      COALESCE(org_status, 'active') as status,
      COALESCE(joined_organization_at, created_at) as joined_at,
      NOW() as created_at,
      NOW() as updated_at
    FROM users
    WHERE organization_id IS NOT NULL
    ON CONFLICT (user_id, organization_id) DO NOTHING
    RETURNING id
  `);

  const migratedCount = migrated.rows?.length || 0;
  console.log(`Migrated ${migratedCount} memberships to organization_members`);

  // Update current_organization_id for users who have an organization but no current set
  const updatedCurrentOrg = await knex('users')
    .whereNotNull('organization_id')
    .whereNull('current_organization_id')
    .update({ current_organization_id: knex.ref('organization_id') });

  console.log(`Updated current_organization_id for ${updatedCurrentOrg} users`);

  // Verify migration success
  const afterCount = await knex('organization_members').count('id as count').first();

  console.log(`✅ organization_members table now has ${afterCount?.count || 0} records`);

  // Log any discrepancies
  const usersWithOrg = Number(beforeCount?.count || 0);
  const memberships = Number(afterCount?.count || 0);

  if (memberships < usersWithOrg) {
    console.warn(`⚠️ Warning: ${usersWithOrg - memberships} users may not have been migrated`);
  }
}

export async function down(knex: Knex): Promise<void> {
  // Clear the organization_members table
  // Note: This doesn't affect the source data in users table
  const deleted = await knex('organization_members').delete();

  console.log(`✅ Deleted ${deleted} records from organization_members`);
  console.log('Note: Original data in users table is preserved');
}
