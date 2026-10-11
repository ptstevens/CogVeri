import { Knex } from 'knex';

export async function up(knex: Knex): Promise<void> {
  // Create organization_invitations table for tracking member invitations
  await knex.schema.createTable('organization_invitations', (table) => {
    // Primary key
    table.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));

    // Relationship to organization
    table
      .uuid('organization_id')
      .notNullable()
      .references('id')
      .inTable('organizations')
      .onDelete('CASCADE');

    // Invitation details
    table.string('email', 255).notNullable(); // Email being invited (stored in lowercase)
    table.enum('role', ['owner', 'admin', 'member', 'viewer', 'reviewer']).defaultTo('member');
    table.enum('status', ['pending', 'accepted', 'cancelled', 'expired']).defaultTo('pending');

    // Security token for invitation link
    table.string('invitation_token', 255).notNullable().unique();

    // Who invited this person
    table.uuid('invited_by').references('id').inTable('users').onDelete('SET NULL');

    // Timing
    table.timestamp('created_at').notNullable().defaultTo(knex.fn.now());
    table.timestamp('updated_at').notNullable().defaultTo(knex.fn.now());
    table.timestamp('expires_at').notNullable(); // 7 days from creation
    table.timestamp('accepted_at'); // When user accepts invitation
    table.timestamp('cancelled_at'); // When invitation was cancelled

    // Indexes
    table.index('organization_id');
    table.index('email');
    table.index('invitation_token');
    table.index('status');
    table.index('created_at');
    table.index(['organization_id', 'status']);
    table.index(['organization_id', 'email']);
    table.unique(['organization_id', 'email', 'status']); // One pending invite per email per org
  });
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTableIfExists('organization_invitations');
}
