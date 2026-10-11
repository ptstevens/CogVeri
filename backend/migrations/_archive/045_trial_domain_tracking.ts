import { Knex } from 'knex';

export async function up(knex: Knex): Promise<void> {
  // Create table to track which email domains have used trials
  // This prevents trial abuse by tracking one trial per corporate domain
  await knex.schema.createTable('trial_email_domains', (table) => {
    table.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    table.string('email_domain', 255).notNullable().unique(); // e.g., "acme.com"
    table.uuid('organization_id').references('id').inTable('organizations').onDelete('SET NULL');
    table.timestamp('trial_started_at').notNullable();
    table.timestamp('trial_ended_at').nullable();
    table.timestamp('created_at').defaultTo(knex.fn.now());
  });

  // Index for fast domain lookups during registration
  await knex.schema.raw(`
    CREATE INDEX idx_trial_email_domains_domain
    ON trial_email_domains(email_domain)
  `);
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTableIfExists('trial_email_domains');
}
