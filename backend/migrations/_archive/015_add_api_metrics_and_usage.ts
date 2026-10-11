import { Knex } from 'knex';

export async function up(knex: Knex): Promise<void> {
  // Create api_metrics table for tracking API call counts
  await knex.schema.createTable('api_metrics', (table) => {
    table.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    table
      .uuid('organization_id')
      .notNullable()
      .references('id')
      .inTable('organizations')
      .onDelete('CASCADE');
    table.uuid('user_id').nullable().references('id').inTable('users').onDelete('SET NULL');
    table.string('endpoint', 500).notNullable(); // e.g., 'POST /api/recordings'
    table.string('method', 10).notNullable(); // GET, POST, PUT, DELETE, PATCH
    table.integer('status_code').notNullable(); // HTTP status code
    table.integer('response_time_ms').notNullable(); // Response time in milliseconds
    table.bigint('request_size_bytes').defaultTo(0); // Request size
    table.bigint('response_size_bytes').defaultTo(0); // Response size
    table.string('ip_address', 45).nullable(); // IPv4 or IPv6
    table.string('user_agent', 500).nullable();
    table.boolean('error').defaultTo(false); // Whether request resulted in error
    table.text('error_message').nullable(); // Error message if error occurred
    table.timestamp('created_at').notNullable().defaultTo(knex.fn.now());

    // Indexes for efficient querying
    table.index('organization_id');
    table.index('user_id');
    table.index('endpoint');
    table.index('created_at');
    table.index(['organization_id', 'created_at']);
    table.index(['organization_id', 'user_id', 'created_at']);
  });

  // Create api_usage_summary table for aggregated usage statistics
  await knex.schema.createTable('api_usage_summary', (table) => {
    table.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    table
      .uuid('organization_id')
      .notNullable()
      .references('id')
      .inTable('organizations')
      .onDelete('CASCADE');
    table.uuid('user_id').nullable().references('id').inTable('users').onDelete('SET NULL');
    table.string('period', 20).notNullable(); // 'hourly', 'daily', 'monthly'
    table.timestamp('period_start').notNullable();
    table.timestamp('period_end').notNullable();
    table.integer('total_requests').defaultTo(0);
    table.integer('successful_requests').defaultTo(0); // 2xx status codes
    table.integer('failed_requests').defaultTo(0); // 4xx, 5xx status codes
    table.bigint('total_request_bytes').defaultTo(0);
    table.bigint('total_response_bytes').defaultTo(0);
    table.integer('average_response_time_ms').defaultTo(0);
    table.integer('slowest_response_time_ms').defaultTo(0);
    table.integer('fastest_response_time_ms').defaultTo(0);
    table.json('endpoint_breakdown').nullable(); // { 'POST /api/recordings': { count: 100, avgTime: 150 } }
    table.timestamp('calculated_at').notNullable().defaultTo(knex.fn.now());
    table.timestamp('updated_at').notNullable().defaultTo(knex.fn.now());

    // Unique constraint for org/user/period combination
    table.unique(['organization_id', 'user_id', 'period', 'period_start']);

    // Indexes
    table.index('organization_id');
    table.index('user_id');
    table.index('period');
    table.index(['organization_id', 'period_start']);
    table.index(['organization_id', 'user_id', 'period_start']);
  });

  // Create rate_limit_rules table for per-tier rate limiting
  await knex.schema.createTable('rate_limit_rules', (table) => {
    table.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    table
      .uuid('organization_id')
      .notNullable()
      .references('id')
      .inTable('organizations')
      .onDelete('CASCADE');
    table.string('tier').notNullable(); // 'free', 'pro', 'enterprise'
    table.integer('requests_per_minute').notNullable().defaultTo(60);
    table.integer('requests_per_hour').notNullable().defaultTo(3600);
    table.integer('requests_per_day').notNullable().defaultTo(86400);
    table.integer('burst_limit').notNullable().defaultTo(100); // Max concurrent requests
    table.json('endpoint_limits').nullable(); // Custom limits per endpoint
    table.boolean('is_active').defaultTo(true);
    table.timestamp('created_at').notNullable().defaultTo(knex.fn.now());
    table.timestamp('updated_at').notNullable().defaultTo(knex.fn.now());

    // Unique constraint on organization and tier
    table.unique(['organization_id', 'tier']);

    // Indexes
    table.index('organization_id');
    table.index('tier');
  });

  // Create rate_limit_violations table for tracking exceeded limits
  await knex.schema.createTable('rate_limit_violations', (table) => {
    table.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    table
      .uuid('organization_id')
      .notNullable()
      .references('id')
      .inTable('organizations')
      .onDelete('CASCADE');
    table.uuid('user_id').nullable().references('id').inTable('users').onDelete('SET NULL');
    table.string('endpoint', 500).notNullable();
    table.string('violation_type').notNullable(); // 'minute', 'hour', 'day', 'burst'
    table.integer('limit_exceeded').notNullable(); // How much it exceeded
    table.integer('current_count').notNullable(); // Current count
    table.integer('limit').notNullable(); // The limit
    table.string('ip_address', 45).nullable();
    table.string('action_taken').notNullable().defaultTo('throttled'); // 'throttled', 'blocked', 'warned'
    table.timestamp('created_at').notNullable().defaultTo(knex.fn.now());

    // Indexes
    table.index('organization_id');
    table.index('user_id');
    table.index('created_at');
    table.index(['organization_id', 'created_at']);
  });

  // Create feature_usage table for tracking feature-specific usage
  await knex.schema.createTable('feature_usage', (table) => {
    table.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    table
      .uuid('organization_id')
      .notNullable()
      .references('id')
      .inTable('organizations')
      .onDelete('CASCADE');
    table.uuid('user_id').nullable().references('id').inTable('users').onDelete('SET NULL');
    table.string('feature_name', 100).notNullable(); // 'recordings', 'tasks', 'reviews', 'api_calls', etc.
    table.integer('usage_count').defaultTo(1);
    table.json('usage_data').nullable(); // Additional metadata: { duration_minutes: 45, size_gb: 2.5 }
    table.date('date').notNullable();
    table.timestamp('created_at').notNullable().defaultTo(knex.fn.now());
    table.timestamp('updated_at').notNullable().defaultTo(knex.fn.now());

    // Unique constraint for deduplication
    table.unique(['organization_id', 'user_id', 'feature_name', 'date']);

    // Indexes
    table.index('organization_id');
    table.index('user_id');
    table.index('feature_name');
    table.index('date');
    table.index(['organization_id', 'date']);
  });

  // Create api_keys table for API access authentication
  await knex.schema.createTable('api_keys', (table) => {
    table.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    table
      .uuid('organization_id')
      .notNullable()
      .references('id')
      .inTable('organizations')
      .onDelete('CASCADE');
    table.uuid('user_id').notNullable().references('id').inTable('users').onDelete('CASCADE');
    table.string('name', 255).notNullable(); // User-friendly name
    table.string('key_hash', 255).notNullable().unique(); // Hashed API key
    table.string('key_prefix', 20).notNullable(); // First 20 chars of key for display
    table.boolean('is_active').defaultTo(true);
    table.string('scopes', 1000).nullable(); // Comma-separated: 'read:recordings,write:tasks'
    table.integer('rate_limit_override').nullable(); // Optional override for base rate limit
    table.timestamp('last_used_at').nullable();
    table.integer('usage_count').defaultTo(0);
    table.timestamp('expires_at').nullable();
    table.timestamp('created_at').notNullable().defaultTo(knex.fn.now());
    table.timestamp('updated_at').notNullable().defaultTo(knex.fn.now());

    // Indexes
    table.index('organization_id');
    table.index('user_id');
    table.index('key_hash');
    table.index('is_active');
    table.index(['organization_id', 'is_active']);
  });
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTableIfExists('api_keys');
  await knex.schema.dropTableIfExists('feature_usage');
  await knex.schema.dropTableIfExists('rate_limit_violations');
  await knex.schema.dropTableIfExists('rate_limit_rules');
  await knex.schema.dropTableIfExists('api_usage_summary');
  await knex.schema.dropTableIfExists('api_metrics');
}
