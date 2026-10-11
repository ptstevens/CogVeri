import { Knex } from 'knex';

/**
 * Migration: Rename 'member' role to 'limited'
 *
 * This migration renames the 'member' organization role to 'limited' to better
 * reflect its restricted permissions. The 'limited' role has the most restricted
 * access - can only view recordings, cannot download, view tasks, or reviews.
 *
 * Role hierarchy after this migration:
 * - owner (5): Full control
 * - admin (4): Administrative access
 * - creator (3): Content creation (if exists)
 * - reviewer (2): Review and feedback
 * - viewer (1): Read-only access to all content
 * - limited (0): Restricted - view recordings only
 */

export async function up(knex: Knex): Promise<void> {
  // Step 1: Drop the existing CHECK constraint on org_role
  // The constraint name follows PostgreSQL naming convention: {table}_{column}_check
  await knex.raw(`
    ALTER TABLE users DROP CONSTRAINT IF EXISTS users_org_role_check
  `);

  // Step 2: Add 'limited' to the allowed values and remove 'member'
  // Create new CHECK constraint with updated values
  await knex.raw(`
    ALTER TABLE users ADD CONSTRAINT users_org_role_check
    CHECK (org_role IN ('owner', 'admin', 'member', 'viewer', 'reviewer', 'limited', 'creator'))
  `);

  // Step 3: Update users table - rename 'member' to 'limited' in org_role column
  await knex.raw(`
    UPDATE users
    SET org_role = 'limited'
    WHERE org_role = 'member'
  `);

  // Step 4: Update organization_invitations table if it has role column
  // First check if the constraint exists
  await knex.raw(`
    ALTER TABLE organization_invitations DROP CONSTRAINT IF EXISTS organization_invitations_role_check
  `);

  // Add constraint with limited
  await knex.raw(`
    ALTER TABLE organization_invitations ADD CONSTRAINT organization_invitations_role_check
    CHECK (role IN ('owner', 'admin', 'member', 'viewer', 'reviewer', 'limited', 'creator'))
  `);

  // Update the data
  await knex.raw(`
    UPDATE organization_invitations
    SET role = 'limited'
    WHERE role = 'member'
  `);

  // Step 5: Update the constraints to remove 'member' (now that data is migrated)
  await knex.raw(`
    ALTER TABLE users DROP CONSTRAINT IF EXISTS users_org_role_check
  `);
  await knex.raw(`
    ALTER TABLE users ADD CONSTRAINT users_org_role_check
    CHECK (org_role IN ('owner', 'admin', 'viewer', 'reviewer', 'limited', 'creator'))
  `);

  // Step 6: Update the default value from 'member' to 'limited'
  await knex.raw(`
    ALTER TABLE users ALTER COLUMN org_role SET DEFAULT 'limited'
  `);

  await knex.raw(`
    ALTER TABLE organization_invitations DROP CONSTRAINT IF EXISTS organization_invitations_role_check
  `);
  await knex.raw(`
    ALTER TABLE organization_invitations ADD CONSTRAINT organization_invitations_role_check
    CHECK (role IN ('owner', 'admin', 'viewer', 'reviewer', 'limited', 'creator'))
  `);

  console.log('✅ Renamed member role to limited in users and organization_invitations tables');
}

export async function down(knex: Knex): Promise<void> {
  // Step 1: Add 'member' back to constraints
  await knex.raw(`
    ALTER TABLE users DROP CONSTRAINT IF EXISTS users_org_role_check
  `);
  await knex.raw(`
    ALTER TABLE users ADD CONSTRAINT users_org_role_check
    CHECK (org_role IN ('owner', 'admin', 'member', 'viewer', 'reviewer', 'limited', 'creator'))
  `);

  await knex.raw(`
    ALTER TABLE organization_invitations DROP CONSTRAINT IF EXISTS organization_invitations_role_check
  `);
  await knex.raw(`
    ALTER TABLE organization_invitations ADD CONSTRAINT organization_invitations_role_check
    CHECK (role IN ('owner', 'admin', 'member', 'viewer', 'reviewer', 'limited', 'creator'))
  `);

  // Step 2: Revert data
  await knex.raw(`
    UPDATE users
    SET org_role = 'member'
    WHERE org_role = 'limited'
  `);

  await knex.raw(`
    UPDATE organization_invitations
    SET role = 'member'
    WHERE role = 'limited'
  `);

  // Step 3: Revert default value
  await knex.raw(`
    ALTER TABLE users ALTER COLUMN org_role SET DEFAULT 'member'
  `);

  // Step 4: Remove 'limited' from constraints
  await knex.raw(`
    ALTER TABLE users DROP CONSTRAINT IF EXISTS users_org_role_check
  `);
  await knex.raw(`
    ALTER TABLE users ADD CONSTRAINT users_org_role_check
    CHECK (org_role IN ('owner', 'admin', 'member', 'viewer', 'reviewer', 'creator'))
  `);

  await knex.raw(`
    ALTER TABLE organization_invitations DROP CONSTRAINT IF EXISTS organization_invitations_role_check
  `);
  await knex.raw(`
    ALTER TABLE organization_invitations ADD CONSTRAINT organization_invitations_role_check
    CHECK (role IN ('owner', 'admin', 'member', 'viewer', 'reviewer', 'creator'))
  `);

  console.log('✅ Reverted limited role back to member');
}
