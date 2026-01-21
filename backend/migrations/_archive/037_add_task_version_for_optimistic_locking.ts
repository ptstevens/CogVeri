import { Knex } from 'knex';

/**
 * Migration: Add version column for optimistic locking on tasks
 *
 * Optimistic locking prevents race conditions when multiple users/processes
 * attempt to update the same task simultaneously. Each update must include
 * the current version, and the version is incremented on successful update.
 * If versions don't match, the update fails with a conflict error.
 */
export async function up(knex: Knex): Promise<void> {
  // Add version column for optimistic locking
  await knex.schema.alterTable('tasks', (table) => {
    table.integer('version').notNullable().defaultTo(1);
  });

  // Create an index for faster version checks during updates
  await knex.schema.alterTable('tasks', (table) => {
    table.index(['id', 'version'], 'idx_tasks_optimistic_lock');
  });
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.alterTable('tasks', (table) => {
    table.dropIndex(['id', 'version'], 'idx_tasks_optimistic_lock');
    table.dropColumn('version');
  });
}
