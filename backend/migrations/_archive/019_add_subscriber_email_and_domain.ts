import { Knex } from 'knex';

export async function up(knex: Knex): Promise<void> {
  // Add domain verification and subscriber email fields to organizations
  await knex.schema.table('organizations', (table) => {
    // Domain management for auto-provisioning
    table.string('domain', 255).nullable().unique();
    table.boolean('domain_verified').defaultTo(false);
    table.timestamp('domain_verified_at').nullable();
    table.enum('domain_verification_method', ['email', 'dns']).nullable(); // How domain was verified

    // Subscriber email (billing contact)
    table.string('subscriber_email', 255).nullable(); // Current subscriber email
    table.timestamp('subscriber_email_verified_at').nullable();

    // Subscriber email transition (when changing subscriber)
    table.string('subscriber_email_transition_pending_to', 255).nullable(); // Email being transferred to
    table.string('subscriber_email_transition_token', 255).nullable().unique(); // Verification token
    table.timestamp('subscriber_email_transition_expires_at').nullable(); // Token expiry

    // Auto-provisioning toggle (enable/disable adding users by domain)
    table.boolean('auto_provision_enabled').defaultTo(true);

    // Indexes for efficient queries
    table.index('domain');
    table.index('domain_verified');
    table.index('subscriber_email');
    table.index('auto_provision_enabled');
  });
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.table('organizations', (table) => {
    table.dropIndex('domain');
    table.dropIndex('domain_verified');
    table.dropIndex('subscriber_email');
    table.dropIndex('auto_provision_enabled');

    table.dropColumn('auto_provision_enabled');
    table.dropColumn('subscriber_email_transition_expires_at');
    table.dropColumn('subscriber_email_transition_token');
    table.dropColumn('subscriber_email_transition_pending_to');
    table.dropColumn('subscriber_email_verified_at');
    table.dropColumn('subscriber_email');
    table.dropColumn('domain_verification_method');
    table.dropColumn('domain_verified_at');
    table.dropColumn('domain_verified');
    table.dropColumn('domain');
  });
}
