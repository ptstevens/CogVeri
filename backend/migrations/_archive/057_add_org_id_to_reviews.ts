import { Knex } from 'knex';

/**
 * Migration: Add organization_id to reviews table
 *
 * The reviews table currently relies on recording_id for org context,
 * which is fragile. This migration adds a direct organization_id column
 * and enables RLS for proper data isolation.
 */

export async function up(knex: Knex): Promise<void> {
  const hasColumn = await knex.schema.hasColumn('reviews', 'organization_id');

  if (!hasColumn) {
    // Add organization_id column
    await knex.schema.alterTable('reviews', (table) => {
      table.uuid('organization_id').references('id').inTable('organizations').onDelete('CASCADE');
    });
    console.log('  ✓ Added organization_id column to reviews table');

    // Populate from recordings
    await knex.raw(`
      UPDATE reviews r
      SET organization_id = (
        SELECT organization_id FROM recordings WHERE id = r.recording_id
      )
      WHERE organization_id IS NULL
    `);
    console.log('  ✓ Populated organization_id from recordings');

    // Add index
    await knex.schema.alterTable('reviews', (table) => {
      table.index('organization_id');
    });
    console.log('  ✓ Added index on organization_id');

    // Enable RLS
    await knex.raw('ALTER TABLE reviews ENABLE ROW LEVEL SECURITY');

    // Create RLS policy (without NULL bypass)
    await knex.raw('DROP POLICY IF EXISTS reviews_org_isolation ON reviews');
    await knex.raw(`
      CREATE POLICY reviews_org_isolation ON reviews
      FOR ALL
      USING (organization_id = get_current_org())
      WITH CHECK (organization_id = get_current_org())
    `);
    console.log('  ✓ Enabled RLS with org isolation policy');
  } else {
    console.log('  - organization_id column already exists on reviews');
  }

  console.log('✅ Migration 057 complete: reviews.organization_id added with RLS');
}

export async function down(knex: Knex): Promise<void> {
  const hasColumn = await knex.schema.hasColumn('reviews', 'organization_id');

  if (hasColumn) {
    // Disable RLS and drop policy
    await knex.raw('DROP POLICY IF EXISTS reviews_org_isolation ON reviews');
    await knex.raw('ALTER TABLE reviews DISABLE ROW LEVEL SECURITY');

    // Remove column
    await knex.schema.alterTable('reviews', (table) => {
      table.dropIndex('organization_id');
      table.dropColumn('organization_id');
    });
    console.log('  ✓ Removed organization_id column from reviews');
  }

  console.log('✅ Migration 057 rollback complete');
}
