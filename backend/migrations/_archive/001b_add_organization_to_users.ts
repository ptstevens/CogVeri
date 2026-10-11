import { Knex } from 'knex';

export async function up(knex: Knex): Promise<void> {
  await knex.schema.alterTable('users', (table) => {
    // Add organization relationship
    table.uuid('organization_id').references('id').inTable('organizations').onDelete('CASCADE');

    // Add role within organization (separate from global role)
    table.enum('org_role', ['owner', 'admin', 'member', 'viewer', 'reviewer']).defaultTo('member');

    // Track user's status within organization
    table.enum('org_status', ['active', 'inactive', 'pending', 'invited']).defaultTo('active');

    // Timestamps
    table.timestamp('invited_at');
    table.timestamp('joined_organization_at');

    // Indexes
    table.index('organization_id');
    table.index('org_status');
  });
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.alterTable('users', (table) => {
    table.dropIndex('organization_id');
    table.dropIndex('org_status');
    table.dropColumn('organization_id');
    table.dropColumn('org_role');
    table.dropColumn('org_status');
    table.dropColumn('invited_at');
    table.dropColumn('joined_organization_at');
  });
}
