import { Knex } from 'knex';

export async function up(knex: Knex): Promise<void> {
  // Create external_contributors table
  await knex.schema.createTable('external_contributors', (table) => {
    table.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    table.string('email', 255).notNullable().unique();
    table.string('first_name', 100);
    table.string('last_name', 100);
    table.integer('total_tasks_assigned').defaultTo(0);
    table.integer('total_tasks_completed').defaultTo(0);
    table.integer('total_tasks_rejected').defaultTo(0);
    table.integer('average_completion_time_seconds');
    table.timestamp('last_active_at');
    table.timestamps(true, true);

    table.index('email');
  });

  // Create task_access_tokens table
  await knex.schema.createTable('task_access_tokens', (table) => {
    table.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    table.uuid('task_id').notNullable().references('id').inTable('tasks').onDelete('CASCADE');
    table.string('token', 255).notNullable().unique();
    table.string('email', 255).notNullable();
    table.uuid('contributor_id').references('id').inTable('external_contributors');
    table.timestamp('expires_at').notNullable();
    table.integer('max_uses'); // NULL means unlimited within expiry
    table.integer('current_uses').defaultTo(0);
    table.timestamp('last_used_at');
    table.boolean('is_revoked').defaultTo(false);
    table.string('ip_address', 50);
    table.text('user_agent');
    table.timestamps(true, true);

    table.index('token');
    table.index('task_id');
    table.index('email');
    table.index('expires_at');
  });

  // Create task_access_logs table for analytics
  await knex.schema.createTable('task_access_logs', (table) => {
    table.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    table
      .uuid('token_id')
      .notNullable()
      .references('id')
      .inTable('task_access_tokens')
      .onDelete('CASCADE');
    table.uuid('task_id').notNullable().references('id').inTable('tasks').onDelete('CASCADE');
    table.uuid('contributor_id').references('id').inTable('external_contributors');
    table.string('action', 50).notNullable(); // 'viewed', 'claimed', 'started_recording', 'submitted', 'downloaded'
    table.string('ip_address', 50);
    table.text('user_agent');
    table.jsonb('metadata');
    table.timestamp('created_at').defaultTo(knex.fn.now());

    table.index('token_id');
    table.index('task_id');
    table.index('contributor_id');
  });

  // Add new fields to tasks table
  await knex.schema.table('tasks', (table) => {
    table.integer('access_token_expires_days').defaultTo(30);
    table.boolean('is_external_task').defaultTo(false);
    table.uuid('external_contributor_id').references('id').inTable('external_contributors');
    table.timestamp('claimed_at');
    table.string('claim_name', 255);
    table.string('claim_email', 255);

    table.index('external_contributor_id');
  });

  // Create function to update external_contributor stats
  await knex.raw(`
    CREATE OR REPLACE FUNCTION update_contributor_stats()
    RETURNS TRIGGER AS $$
    BEGIN
      IF NEW.status = 'completed' AND OLD.status != 'completed' THEN
        UPDATE external_contributors
        SET
          total_tasks_completed = total_tasks_completed + 1,
          last_active_at = CURRENT_TIMESTAMP,
          updated_at = CURRENT_TIMESTAMP
        WHERE id = NEW.external_contributor_id;
      ELSIF NEW.status = 'rejected' AND OLD.status != 'rejected' THEN
        UPDATE external_contributors
        SET
          total_tasks_rejected = total_tasks_rejected + 1,
          last_active_at = CURRENT_TIMESTAMP,
          updated_at = CURRENT_TIMESTAMP
        WHERE id = NEW.external_contributor_id;
      END IF;
      RETURN NEW;
    END;
    $$ LANGUAGE plpgsql;
  `);

  // Create trigger for task status changes
  await knex.raw(`
    DROP TRIGGER IF EXISTS trigger_update_contributor_stats ON tasks;
    CREATE TRIGGER trigger_update_contributor_stats
      AFTER UPDATE ON tasks
      FOR EACH ROW
      WHEN (OLD.status IS DISTINCT FROM NEW.status AND NEW.external_contributor_id IS NOT NULL)
      EXECUTE FUNCTION update_contributor_stats();
  `);
}

export async function down(knex: Knex): Promise<void> {
  // Drop trigger and function
  await knex.raw('DROP TRIGGER IF EXISTS trigger_update_contributor_stats ON tasks');
  await knex.raw('DROP FUNCTION IF EXISTS update_contributor_stats()');

  // Remove fields from tasks table
  await knex.schema.table('tasks', (table) => {
    table.dropColumn('access_token_expires_days');
    table.dropColumn('is_external_task');
    table.dropColumn('external_contributor_id');
    table.dropColumn('claimed_at');
    table.dropColumn('claim_name');
    table.dropColumn('claim_email');
  });

  // Drop tables in reverse order (respecting foreign keys)
  await knex.schema.dropTableIfExists('task_access_logs');
  await knex.schema.dropTableIfExists('task_access_tokens');
  await knex.schema.dropTableIfExists('external_contributors');
}
