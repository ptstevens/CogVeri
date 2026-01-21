import { Knex } from 'knex';

/**
 * Seed: Initialize default rate limit rules for each pricing tier
 * This seeds the rate_limit_rules table with tier-based rate limiting configuration
 */
export async function seed(knex: Knex): Promise<void> {
  // Get the search_path from environment
  const searchPath = process.env.DB_SEARCH_PATH || 'public';
  
  // Set the search path for this connection
  await knex.raw(`SET search_path = '${searchPath}'`);

  // Check if rate limit rules already exist
  const existingRules = await knex('rate_limit_rules').count('* as count').first();

  if (existingRules && (existingRules.count as number) > 0) {
    console.log('Rate limit rules already seeded, skipping...');
    return;
  }

  // Define default rate limit rules for each tier
  const ORG_ID = '00000000-0000-0000-0000-000000000001';
  const rateLimitRules = [
    {
      organization_id: ORG_ID,
      tier: 'free',
      requests_per_minute: 30,
      requests_per_hour: 1000,
      requests_per_day: 10000,
      burst_limit: 50,
      endpoint_limits: JSON.stringify({
        'POST /api/recordings': { per_minute: 5, per_hour: 100 },
        'GET /api/recordings': { per_minute: 60, per_hour: 1000 },
        'POST /api/tasks': { per_minute: 20, per_hour: 500 },
      }),
      created_at: knex.fn.now(),
      updated_at: knex.fn.now(),
    },
    {
      organization_id: ORG_ID,
      tier: 'pro',
      requests_per_minute: 300,
      requests_per_hour: 10000,
      requests_per_day: 100000,
      burst_limit: 500,
      endpoint_limits: JSON.stringify({
        'POST /api/recordings': { per_minute: 50, per_hour: 1000 },
        'GET /api/recordings': { per_minute: 300, per_hour: 10000 },
        'POST /api/tasks': { per_minute: 100, per_hour: 5000 },
      }),
      created_at: knex.fn.now(),
      updated_at: knex.fn.now(),
    },
    {
      organization_id: ORG_ID,
      tier: 'enterprise',
      requests_per_minute: 1000,
      requests_per_hour: 50000,
      requests_per_day: 500000,
      burst_limit: 2000,
      endpoint_limits: JSON.stringify({
        'POST /api/recordings': { per_minute: 200, per_hour: 5000 },
        'GET /api/recordings': { per_minute: 1000, per_hour: 50000 },
        'POST /api/tasks': { per_minute: 500, per_hour: 25000 },
      }),
      created_at: knex.fn.now(),
      updated_at: knex.fn.now(),
    },
  ];

  // Insert the rate limit rules
  await knex('rate_limit_rules').insert(rateLimitRules);

  console.log('Seeded default rate limit rules for free, pro, and enterprise tiers');
}
