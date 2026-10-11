import { Knex } from 'knex';

export async function up(knex: Knex): Promise<void> {
  // Create table for storing admin impersonation tokens
  // Allows system admins to temporarily access organizations for support purposes
  await knex.schema.createTable('admin_impersonation_tokens', (table) => {
    // Primary key
    table.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));

    // System admin who initiated impersonation
    table
      .uuid('system_admin_id')
      .notNullable()
      .references('id')
      .inTable('users')
      .onDelete('CASCADE');

    // Organization being accessed
    table
      .uuid('organization_id')
      .notNullable()
      .references('id')
      .inTable('organizations')
      .onDelete('CASCADE');

    // Token for authentication
    table.string('token', 255).notNullable().unique();

    // Timestamps
    table.timestamp('created_at').notNullable().defaultTo(knex.fn.now());
    table.timestamp('expires_at').notNullable(); // 1 hour by default

    // Track when impersonation was ended/revoked
    table.timestamp('revoked_at').nullable();

    // Indexes for efficient queries
    table.index('system_admin_id');
    table.index('organization_id');
    table.index('token');
    table.index('expires_at');
    table.index(['system_admin_id', 'created_at']);
  });
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTableIfExists('admin_impersonation_tokens');
}
