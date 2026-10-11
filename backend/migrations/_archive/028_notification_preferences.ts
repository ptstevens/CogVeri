import { Knex } from 'knex';

export async function up(knex: Knex): Promise<void> {
  // Create notification_preferences table
  await knex.schema.createTable('notification_preferences', (table) => {
    // Primary key
    table.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));

    // User relationship (one preference record per user)
    table
      .uuid('user_id')
      .notNullable()
      .unique()
      .references('id')
      .inTable('users')
      .onDelete('CASCADE');

    // Global toggles
    table.boolean('email_enabled').notNullable().defaultTo(true);
    table.boolean('push_enabled').notNullable().defaultTo(true);
    table.boolean('in_app_enabled').notNullable().defaultTo(true);

    // Digest frequency: 'immediate', 'daily', 'weekly', 'never'
    table
      .enum('digest_frequency', ['immediate', 'daily', 'weekly', 'never'])
      .notNullable()
      .defaultTo('immediate');

    // Per-notification-type settings stored as JSON
    // Example: { "task_assigned": { "email": true, "push": true, "in_app": true }, ... }
    table.jsonb('preferences_json').defaultTo(
      JSON.stringify({
        task_assigned: { email: true, push: true, in_app: true },
        review_comment: { email: true, push: true, in_app: true },
        recording_ready: { email: true, push: true, in_app: true },
        task_due_soon: { email: true, push: true, in_app: true },
        task_overdue: { email: true, push: true, in_app: true },
        recording_submitted: { email: true, push: true, in_app: true },
        review_requested: { email: true, push: true, in_app: true },
        review_completed: { email: true, push: true, in_app: true },
        feedback_received: { email: true, push: true, in_app: true },
        mention: { email: true, push: true, in_app: true },
        system: { email: false, push: true, in_app: true },
      })
    );

    // Quiet hours (optional)
    table.time('quiet_hours_start');
    table.time('quiet_hours_end');
    table.string('timezone', 50).defaultTo('UTC');

    // Digest tracking
    table.timestamp('last_digest_sent_at');
    table.timestamp('last_email_sent_at');

    // Timestamps
    table.timestamps(true, true);

    // Indexes
    table.index('user_id');
    table.index('digest_frequency');
    table.index('last_digest_sent_at');
  });

  // Add organization_id to notifications table if not present
  // (The notifications table already exists from migration 005)
  const hasOrgId = await knex.schema.hasColumn('notifications', 'organization_id');
  if (!hasOrgId) {
    await knex.schema.alterTable('notifications', (table) => {
      table.uuid('organization_id').references('id').inTable('organizations').onDelete('CASCADE');
      table.index('organization_id');
    });
  }
}

export async function down(knex: Knex): Promise<void> {
  // Remove organization_id from notifications if we added it
  const hasOrgId = await knex.schema.hasColumn('notifications', 'organization_id');
  if (hasOrgId) {
    await knex.schema.alterTable('notifications', (table) => {
      table.dropIndex('organization_id');
      table.dropColumn('organization_id');
    });
  }

  await knex.schema.dropTableIfExists('notification_preferences');
}
