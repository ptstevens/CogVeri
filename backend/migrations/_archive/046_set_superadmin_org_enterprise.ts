import { Knex } from 'knex';

/**
 * Migration: Set SUPER_ADMIN organizations to Enterprise tier
 *
 * This ensures that system administrators (SUPER_ADMIN) have full platform access
 * with Enterprise tier and unlimited limits. This is NOT for organization admins -
 * only for platform-level system administrators.
 */
export async function up(knex: Knex): Promise<void> {
  // Find all organizations owned by SUPER_ADMIN users
  const superAdminOrgs = await knex('organizations as o')
    .join('users as u', 'o.owner_id', 'u.id')
    .where('u.system_role', 'SUPER_ADMIN')
    .select('o.id', 'o.name', 'o.subscription_tier');

  if (superAdminOrgs.length === 0) {
    console.log('No SUPER_ADMIN organizations found');
    return;
  }

  console.log(`Found ${superAdminOrgs.length} SUPER_ADMIN organization(s):`);
  for (const org of superAdminOrgs) {
    console.log(`  - ${org.name} (current tier: ${org.subscription_tier})`);
  }

  // Update all SUPER_ADMIN organizations to Enterprise tier with unlimited limits
  const updated = await knex('organizations')
    .whereIn('owner_id', knex('users').where('system_role', 'SUPER_ADMIN').select('id'))
    .update({
      subscription_tier: 'enterprise',
      max_tasks: -1, // Unlimited
      max_users: -1, // Unlimited
      max_storage_gb: -1, // Unlimited
      updated_at: knex.fn.now(),
    });

  console.log(`Updated ${updated} organization(s) to Enterprise tier`);
}

export async function down(knex: Knex): Promise<void> {
  // Revert to free tier (safe default)
  // In practice, you probably wouldn't want to downgrade SUPER_ADMIN orgs
  console.log('Note: This will revert SUPER_ADMIN orgs to free tier');

  await knex('organizations')
    .whereIn('owner_id', knex('users').where('system_role', 'SUPER_ADMIN').select('id'))
    .update({
      subscription_tier: 'free',
      max_tasks: 10,
      max_users: 5,
      max_storage_gb: 10,
      updated_at: knex.fn.now(),
    });
}
