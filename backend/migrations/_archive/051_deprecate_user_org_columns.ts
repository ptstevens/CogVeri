import { Knex } from 'knex';

/**
 * Migration: Deprecate legacy organization columns on users table
 *
 * This migration marks the legacy organization-related columns on the users table
 * as deprecated. The columns are NOT removed to maintain backward compatibility
 * during the transition period.
 *
 * Deprecated columns (use organization_members instead):
 * - organization_id
 * - org_role
 * - org_status
 * - invited_at (use organization_members.invited_at)
 * - joined_organization_at (use organization_members.joined_at)
 *
 * Kept columns:
 * - current_organization_id (tracks active session organization)
 */

export async function up(knex: Knex): Promise<void> {
  // Add comments to mark deprecated columns
  // These columns will continue to work but should not be used for new code
  await knex.raw(`
    COMMENT ON COLUMN users.organization_id IS
    'DEPRECATED: Use organization_members table for user-org relationships.
    This column is maintained for backward compatibility during transition.
    Will be removed in a future version.';
  `);

  await knex.raw(`
    COMMENT ON COLUMN users.org_role IS
    'DEPRECATED: Use organization_members.role instead.
    This column is maintained for backward compatibility during transition.
    Will be removed in a future version.';
  `);

  await knex.raw(`
    COMMENT ON COLUMN users.org_status IS
    'DEPRECATED: Use organization_members.status instead.
    This column is maintained for backward compatibility during transition.
    Will be removed in a future version.';
  `);

  // Check if invited_at column exists before commenting
  const hasInvitedAt = await knex.schema.hasColumn('users', 'invited_at');
  if (hasInvitedAt) {
    await knex.raw(`
      COMMENT ON COLUMN users.invited_at IS
      'DEPRECATED: Use organization_members.invited_at instead.
      This column is maintained for backward compatibility during transition.
      Will be removed in a future version.';
    `);
  }

  await knex.raw(`
    COMMENT ON COLUMN users.joined_organization_at IS
    'DEPRECATED: Use organization_members.joined_at instead.
    This column is maintained for backward compatibility during transition.
    Will be removed in a future version.';
  `);

  // Document the current_organization_id column's purpose
  await knex.raw(`
    COMMENT ON COLUMN users.current_organization_id IS
    'Active organization for the user''s current session.
    Updated when user switches between organizations.
    This is the primary organization used for API requests.';
  `);

  console.log('✅ Added deprecation comments to legacy organization columns');
  console.log('  - users.organization_id: DEPRECATED');
  console.log('  - users.org_role: DEPRECATED');
  console.log('  - users.org_status: DEPRECATED');
  console.log('  - users.joined_organization_at: DEPRECATED');
  console.log('  - users.current_organization_id: Active session org (kept)');
}

export async function down(knex: Knex): Promise<void> {
  // Remove deprecation comments
  await knex.raw('COMMENT ON COLUMN users.organization_id IS NULL;');
  await knex.raw('COMMENT ON COLUMN users.org_role IS NULL;');
  await knex.raw('COMMENT ON COLUMN users.org_status IS NULL;');
  await knex.raw('COMMENT ON COLUMN users.joined_organization_at IS NULL;');
  await knex.raw('COMMENT ON COLUMN users.current_organization_id IS NULL;');

  // Check if invited_at exists before removing comment
  const hasInvitedAt = await knex.schema.hasColumn('users', 'invited_at');
  if (hasInvitedAt) {
    await knex.raw('COMMENT ON COLUMN users.invited_at IS NULL;');
  }

  console.log('✅ Removed deprecation comments from organization columns');
}
