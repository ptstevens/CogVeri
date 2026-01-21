import { Knex } from 'knex';

export async function up(knex: Knex): Promise<void> {
  // Add onboarding-related fields to users table
  await knex.schema.table('users', (table) => {
    table.boolean('onboarding_completed').defaultTo(false);
    table.timestamp('onboarding_completed_at');
    table.jsonb('preferences').defaultTo(null);
    table.uuid('current_organization_id').references('id').inTable('organizations').onDelete('SET NULL');
    
    table.index('onboarding_completed');
  });

  // Add owner_email to organizations table for tracking
  if (!(await knex.schema.hasColumn('organizations', 'owner_email'))) {
    await knex.schema.table('organizations', (table) => {
      table.string('owner_email', 255);
      table.index('owner_email');
    });
  }
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.table('organizations', (table) => {
    table.dropColumn('owner_email');
  });

  await knex.schema.table('users', (table) => {
    table.dropColumn('onboarding_completed');
    table.dropColumn('onboarding_completed_at');
    table.dropColumn('preferences');
    table.dropColumn('current_organization_id');
  });
}
