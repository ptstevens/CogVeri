import { Knex } from 'knex';

export async function up(knex: Knex): Promise<void> {
  await knex.schema.createTable('task_templates', (table) => {
    // Primary key
    table.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));

    // Template metadata
    table.string('title', 255).notNullable();
    table.text('description');
    table.string('category', 100);
    table.text('icon_emoji').defaultTo('📝');

    // Organization relationship - null means it's a system-wide default template
    table.uuid('organization_id')
      .references('id').inTable('organizations').onDelete('CASCADE').nullable();

    // Template content (mirrors task schema)
    table.enum('type', ['recording', 'live_demo', 'hybrid']).notNullable().defaultTo('recording');
    table.text('instructions');
    table.integer('min_duration_seconds');
    table.integer('max_duration_seconds');
    table.jsonb('required_features');
    table.jsonb('evaluation_criteria');
    table.enum('priority', ['low', 'medium', 'high', 'urgent']).notNullable().defaultTo('medium');
    table.specificType('tags', 'text[]');
    table.jsonb('metadata');

    // Creator information
    table.uuid('created_by').notNullable().references('id').inTable('users').onDelete('RESTRICT');

    // Template status
    table.boolean('is_active').defaultTo(true);
    table.boolean('is_system_default').defaultTo(false); // Mark official system templates

    // Timestamps
    table.timestamps(true, true);

    // Indexes
    table.index('organization_id');
    table.index('created_by');
    table.index('is_system_default');
    table.index(['organization_id', 'is_active']);
    table.index(['category', 'is_active']);
  });
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTableIfExists('task_templates');
}
