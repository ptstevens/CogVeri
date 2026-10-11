import { Knex } from 'knex';

export async function up(knex: Knex): Promise<void> {
  return knex.schema.createTable('users', (table) => {
    // Primary key
    table.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));

    // User information
    table.string('email', 255).notNullable().unique();
    table.string('name', 255).notNullable();
    table.string('password', 255); // Nullable for SSO users
    table.string('avatar_url', 500);

    // Role and permissions
    table
      .enum('role', ['employee', 'manager', 'reviewer', 'admin'])
      .notNullable()
      .defaultTo('employee');

    // SSO fields
    table.string('sso_id', 255).unique();
    table.string('sso_provider', 100); // e.g., 'saml', 'oidc', 'google'

    // Status
    table.boolean('is_active').notNullable().defaultTo(true);
    table.timestamp('last_login_at');

    // Notification preferences (JSON)
    table.jsonb('notification_preferences').defaultTo(
      JSON.stringify({
        email: true,
        slack: true,
        inApp: true,
      })
    );

    // Metadata
    table.string('department', 255);
    table.string('job_title', 255);
    table.uuid('manager_id').references('id').inTable('users').onDelete('SET NULL');

    // Timestamps
    table.timestamps(true, true); // created_at, updated_at

    // Indexes for performance
    table.index('email');
    table.index('role');
    table.index('is_active');
    table.index('manager_id');
    table.index('sso_id');
  });
}

export async function down(knex: Knex): Promise<void> {
  return knex.schema.dropTable('users');
}
