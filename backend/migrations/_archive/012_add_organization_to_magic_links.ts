import { Knex } from 'knex';

export async function up(knex: Knex): Promise<void> {
  // Add organization_id to external_contributors table
  await knex.schema.table('external_contributors', (table) => {
    table.uuid('organization_id').references('id').inTable('organizations').onDelete('CASCADE');
    table.index('organization_id');
  });

  // Add organization_id to task_access_tokens table
  await knex.schema.table('task_access_tokens', (table) => {
    table.uuid('organization_id').references('id').inTable('organizations').onDelete('CASCADE');
    table.index('organization_id');
  });

  // Add organization_id to task_access_logs table
  await knex.schema.table('task_access_logs', (table) => {
    table.uuid('organization_id').references('id').inTable('organizations').onDelete('CASCADE');
    table.index('organization_id');
  });

  // Create compound unique index on task_id and token to ensure uniqueness per task
  await knex.raw(`
    ALTER TABLE task_access_tokens 
    ADD CONSTRAINT unique_task_token UNIQUE (task_id, token);
  `);

  // Update the trigger function to include organization_id
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
}

export async function down(knex: Knex): Promise<void> {
  // Remove compound unique constraint
  await knex.raw(`
    ALTER TABLE task_access_tokens 
    DROP CONSTRAINT unique_task_token;
  `);

  // Remove organization_id columns
  await knex.schema.table('task_access_logs', (table) => {
    table.dropColumn('organization_id');
  });

  await knex.schema.table('task_access_tokens', (table) => {
    table.dropColumn('organization_id');
  });

  await knex.schema.table('external_contributors', (table) => {
    table.dropColumn('organization_id');
  });
}
