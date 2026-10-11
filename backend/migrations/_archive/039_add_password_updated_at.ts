import type { Knex } from 'knex';

export async function up(knex: Knex): Promise<void> {
  // Check if column already exists (idempotent)
  const hasColumn = await knex.schema.hasColumn('users', 'password_updated_at');

  if (!hasColumn) {
    await knex.schema.alterTable('users', (table) => {
      table.timestamp('password_updated_at').defaultTo(knex.fn.now());
    });

    // Backfill existing users
    await knex('users')
      .whereNull('password_updated_at')
      .update({
        password_updated_at: knex.raw('COALESCE(updated_at, created_at, NOW())'),
      });

    // Add index for security compliance queries
    await knex.schema.alterTable('users', (table) => {
      table.index('password_updated_at', 'idx_users_password_updated_at');
    });
  }
}

export async function down(knex: Knex): Promise<void> {
  const hasColumn = await knex.schema.hasColumn('users', 'password_updated_at');

  if (hasColumn) {
    await knex.schema.alterTable('users', (table) => {
      table.dropIndex('password_updated_at', 'idx_users_password_updated_at');
      table.dropColumn('password_updated_at');
    });
  }
}
