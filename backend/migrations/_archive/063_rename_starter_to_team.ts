import { Knex } from 'knex';

/**
 * Migration: Rename 'starter' tier to 'team'
 *
 * This migration renames the 'starter' pricing tier to 'team' to better
 * reflect the target audience (small teams). The tier functionality
 * and pricing remain the same.
 */
export async function up(knex: Knex): Promise<void> {
  // Update the pricing_tiers table
  await knex('pricing_tiers').where('name', 'starter').update({
    name: 'team',
    display_name: 'Team',
    updated_at: knex.fn.now(),
  });

  // Update any organizations currently on the 'starter' tier
  await knex('organization_subscriptions').where('tier', 'starter').update({
    tier: 'team',
    updated_at: knex.fn.now(),
  });
}

export async function down(knex: Knex): Promise<void> {
  // Revert the pricing_tiers table
  await knex('pricing_tiers').where('name', 'team').update({
    name: 'starter',
    display_name: 'Starter',
    updated_at: knex.fn.now(),
  });

  // Revert any organizations on the 'team' tier
  await knex('organization_subscriptions').where('tier', 'team').update({
    tier: 'starter',
    updated_at: knex.fn.now(),
  });
}
