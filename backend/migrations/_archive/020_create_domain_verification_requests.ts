import { Knex } from 'knex';

export async function up(knex: Knex): Promise<void> {
  // Create table for tracking domain verification requests
  // Each verification can use email (admin@domain.com) or DNS (TXT record) verification
  await knex.schema.createTable('domain_verification_requests', (table) => {
    // Primary key
    table.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));

    // Relationship to organization
    table.uuid('organization_id').notNullable()
      .references('id').inTable('organizations').onDelete('CASCADE');

    // Domain being verified
    table.string('domain', 255).notNullable();

    // Verification method ('email' or 'dns')
    table.enum('verification_method', ['email', 'dns']).notNullable();

    // Verification token (for email verification links)
    table.string('verification_token', 255).notNullable().unique();

    // Verification code (for DNS TXT record)
    table.string('verification_code', 50).nullable();

    // Email address to send verification to (for email method)
    table.string('verification_email', 255).nullable();

    // Timestamps
    table.timestamp('created_at').notNullable().defaultTo(knex.fn.now());
    table.timestamp('expires_at').notNullable(); // When this verification request expires (7 days)
    table.timestamp('verified_at').nullable(); // When verification was completed

    // Status
    table.enum('status', ['pending', 'verified', 'expired']).defaultTo('pending');

    // Indexes for efficient queries
    table.index('organization_id');
    table.index(['organization_id', 'domain']);
    table.index('verification_token');
    table.index('verification_code');
    table.index('status');
    table.index('created_at');
  });
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTableIfExists('domain_verification_requests');
}
