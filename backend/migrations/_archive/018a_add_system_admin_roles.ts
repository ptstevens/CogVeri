import { Knex } from 'knex';

export async function up(knex: Knex): Promise<void> {
  // Add system-level admin fields to users table
  // This separates system-level permissions from organization-level permissions
  await knex.schema.table('users', (table) => {
    // System-level role (SUPER_ADMIN, ADMIN, SUPPORT, USER, null)
    table.enum('system_role', ['SUPER_ADMIN', 'ADMIN', 'SUPPORT', 'USER']).nullable().defaultTo(null);

    // Flag for easier querying of system admins
    table.boolean('is_system_admin').defaultTo(false);

    // Timestamp for when system admin access was granted
    table.timestamp('system_admin_since').nullable();

    // Indexes for efficient queries
    table.index('system_role');
    table.index('is_system_admin');
  });
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.table('users', (table) => {
    table.dropIndex('system_role');
    table.dropIndex('is_system_admin');
    table.dropColumn('system_admin_since');
    table.dropColumn('is_system_admin');
    table.dropColumn('system_role');
  });
}