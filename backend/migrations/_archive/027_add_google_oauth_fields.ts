import { Knex } from 'knex';

/**
 * Migration: Add Google OAuth fields to users table
 *
 * Adds columns to support Google OAuth authentication:
 * - google_id: Google's unique user identifier
 * - auth_provider: Indicates how user authenticated (email, google, etc.)
 */
export async function up(knex: Knex): Promise<void> {
  await knex.schema.alterTable('users', (table) => {
    // Google's unique user ID
    table.string('google_id', 255).nullable().unique();

    // Authentication provider (email, google, etc.)
    table.string('auth_provider', 50).nullable().defaultTo('email');

    // Index for faster Google ID lookups
    table.index('google_id');
  });

  console.log('Added Google OAuth fields to users table');
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.alterTable('users', (table) => {
    table.dropIndex('google_id');
    table.dropColumn('google_id');
    table.dropColumn('auth_provider');
  });

  console.log('Removed Google OAuth fields from users table');
}
