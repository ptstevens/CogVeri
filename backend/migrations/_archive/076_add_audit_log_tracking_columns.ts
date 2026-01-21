import { Knex } from 'knex';

export async function up(knex: Knex): Promise<void> {
  // Add ip_address and user_agent columns to organization_audit_logs
  // These columns were referenced in code but missing from the original schema
  await knex.schema.alterTable('organization_audit_logs', (table) => {
    table.string('ip_address', 45).nullable(); // IPv6 max length is 45 chars
    table.text('user_agent').nullable();
  });

  // Add index on ip_address for security analysis queries
  await knex.schema.alterTable('organization_audit_logs', (table) => {
    table.index('ip_address');
  });
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.alterTable('organization_audit_logs', (table) => {
    table.dropIndex('ip_address');
  });

  await knex.schema.alterTable('organization_audit_logs', (table) => {
    table.dropColumn('user_agent');
    table.dropColumn('ip_address');
  });
}
