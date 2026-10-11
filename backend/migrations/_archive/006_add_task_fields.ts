import { Knex } from 'knex';

export async function up(knex: Knex): Promise<void> {
  // Check which columns already exist and only add missing ones
  const hasColumn = async (tableName: string, columnName: string) => {
    const exists = await knex.schema.hasColumn(tableName, columnName);
    return exists;
  };

  return knex.schema.alterTable('tasks', async (table) => {
    // Add reviewer_id if it doesn't exist
    if (!(await hasColumn('tasks', 'reviewer_id'))) {
      table.uuid('reviewer_id').references('id').inTable('users').nullable();
    }

    // Add estimated_duration if it doesn't exist
    if (!(await hasColumn('tasks', 'estimated_duration'))) {
      table.integer('estimated_duration').nullable();
    }

    // Add actual_duration if it doesn't exist
    if (!(await hasColumn('tasks', 'actual_duration'))) {
      table.integer('actual_duration').nullable();
    }
  });
}

export async function down(knex: Knex): Promise<void> {
  return knex.schema.alterTable('tasks', (table) => {
    table.dropColumn('reviewer_id');
    table.dropColumn('estimated_duration');
    table.dropColumn('actual_duration');
  });
}
