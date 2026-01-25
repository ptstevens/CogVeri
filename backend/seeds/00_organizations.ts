import { Knex } from 'knex';

export async function seed(knex: Knex): Promise<void> {
  // PRODUCTION SAFEGUARD: Prevent accidental data destruction
  const nodeEnv = process.env.NODE_ENV || 'development';
  const allowProdSeed = process.env.ALLOW_PRODUCTION_SEED === 'true';

  if (nodeEnv === 'production' && !allowProdSeed) {
    console.warn('⚠️  Seed aborted: Running seeds in production is disabled.');
    console.warn('   Set ALLOW_PRODUCTION_SEED=true to override (dangerous!)');
    return;
  }

  if (nodeEnv === 'production' && allowProdSeed) {
    console.warn('⚠️  WARNING: Running seed in production mode!');
  }

  // Clear existing data in correct order (respect foreign keys)
  // Only delete from tables that exist to avoid errors on fresh databases
  const tablesToDelete = [
    'admin_impersonation_tokens',
    'domain_verification_requests',
    'organization_invitations',
    'organization_audit_logs',
    'organization_members',
    'api_metrics',
    'activity_logs',
    'notifications',
    'review_comments',
    'reviews',
    'recordings',
    'tasks',
    'users',
    'organizations'
  ];

  for (const table of tablesToDelete) {
    const exists = await knex.schema.hasTable(table);
    if (exists) {
      await knex(table).del();
    }
  }

  // Create test organization with Enterprise tier (for system admin)
  const organization = await knex('organizations').insert({
    id: '00000000-0000-0000-0000-000000000001',
    name: 'CogVeri Admin',
    description: 'System administration organization',
    subscription_tier: 'enterprise',
    max_tasks: -1,  // Unlimited
    max_users: -1,  // Unlimited
    max_storage_gb: -1,  // Unlimited
    is_active: true,
    is_suspended: false,
  }).returning('*');

  console.log(`Seeded ${organization.length} organizations`);

  // Note: User seeding happens in 01_users.ts
  // Organization membership will be set up there
}
