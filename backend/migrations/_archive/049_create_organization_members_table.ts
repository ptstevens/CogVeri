import { Knex } from 'knex';

/**
 * Migration: Create organization_members table
 *
 * This table enables multi-tenancy by allowing users to belong to multiple organizations.
 * It replaces the single organization_id foreign key on users with a proper many-to-many relationship.
 *
 * Features:
 * - User can belong to multiple organizations
 * - Each membership has its own role and status
 * - Tracks invitation and join timestamps
 * - Unique constraint prevents duplicate memberships
 */

export async function up(knex: Knex): Promise<void> {
  await knex.schema.createTable('organization_members', (table) => {
    // Primary key
    table.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));

    // Foreign keys - the core relationship
    table.uuid('user_id').notNullable().references('id').inTable('users').onDelete('CASCADE');
    table.uuid('organization_id').notNullable().references('id').inTable('organizations').onDelete('CASCADE');

    // Membership attributes
    table.string('role', 50).notNullable().defaultTo('limited');
    table.string('status', 50).notNullable().defaultTo('active');

    // Invitation tracking
    table.uuid('invited_by').references('id').inTable('users').onDelete('SET NULL');
    table.timestamp('invited_at');
    table.timestamp('joined_at');

    // Audit timestamps
    table.timestamp('created_at').notNullable().defaultTo(knex.fn.now());
    table.timestamp('updated_at').notNullable().defaultTo(knex.fn.now());

    // Ensure unique membership per user-org pair
    table.unique(['user_id', 'organization_id']);
  });

  // Add CHECK constraint for role values
  await knex.raw(`
    ALTER TABLE organization_members
    ADD CONSTRAINT organization_members_role_check
    CHECK (role IN ('owner', 'admin', 'limited', 'viewer', 'reviewer', 'creator'))
  `);

  // Add CHECK constraint for status values
  await knex.raw(`
    ALTER TABLE organization_members
    ADD CONSTRAINT organization_members_status_check
    CHECK (status IN ('active', 'inactive', 'pending', 'invited'))
  `);

  // Performance indexes
  await knex.raw(`
    CREATE INDEX idx_org_members_user_id ON organization_members(user_id);
    CREATE INDEX idx_org_members_org_id ON organization_members(organization_id);
    CREATE INDEX idx_org_members_status ON organization_members(status);
    CREATE INDEX idx_org_members_org_status ON organization_members(organization_id, status);
    CREATE INDEX idx_org_members_user_status ON organization_members(user_id, status);
    CREATE INDEX idx_org_members_org_role ON organization_members(organization_id, role);
  `);

  console.log('✅ Created organization_members table with indexes');
}

export async function down(knex: Knex): Promise<void> {
  // Drop indexes first
  await knex.raw('DROP INDEX IF EXISTS idx_org_members_user_id');
  await knex.raw('DROP INDEX IF EXISTS idx_org_members_org_id');
  await knex.raw('DROP INDEX IF EXISTS idx_org_members_status');
  await knex.raw('DROP INDEX IF EXISTS idx_org_members_org_status');
  await knex.raw('DROP INDEX IF EXISTS idx_org_members_user_status');
  await knex.raw('DROP INDEX IF EXISTS idx_org_members_org_role');

  // Drop the table
  await knex.schema.dropTableIfExists('organization_members');

  console.log('✅ Dropped organization_members table');
}
