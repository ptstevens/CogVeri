import { Knex } from 'knex';

/**
 * Migration: Add custom limits and features for enterprise organizations
 *
 * This allows system admins to set custom limits and feature flags
 * for enterprise customers with custom pricing.
 */
export async function up(knex: Knex): Promise<void> {
  await knex.schema.alterTable('organizations', (table) => {
    // Custom limits override - JSONB for flexibility
    // Structure matches PricingTier.limits
    table.jsonb('custom_limits').nullable();

    // Custom features override - JSONB for flexibility
    // Structure matches PricingTier.features
    table.jsonb('custom_features').nullable();

    // Enterprise-specific metadata
    table.jsonb('enterprise_config').nullable();

    // Track who set up the enterprise config
    table.uuid('enterprise_configured_by').references('id').inTable('users').onDelete('SET NULL');
    table.timestamp('enterprise_configured_at').nullable();

    // Custom contract details
    table.text('enterprise_notes').nullable(); // Internal notes about the deal
    table.date('contract_start_date').nullable();
    table.date('contract_end_date').nullable();
  });

  // Add index for finding enterprise organizations
  await knex.schema.raw(`
    CREATE INDEX idx_organizations_enterprise
    ON organizations ((custom_limits IS NOT NULL OR subscription_tier = 'enterprise'))
  `);
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.raw('DROP INDEX IF EXISTS idx_organizations_enterprise');

  await knex.schema.alterTable('organizations', (table) => {
    table.dropColumn('custom_limits');
    table.dropColumn('custom_features');
    table.dropColumn('enterprise_config');
    table.dropColumn('enterprise_configured_by');
    table.dropColumn('enterprise_configured_at');
    table.dropColumn('enterprise_notes');
    table.dropColumn('contract_start_date');
    table.dropColumn('contract_end_date');
  });
}
