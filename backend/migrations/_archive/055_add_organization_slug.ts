import { Knex } from 'knex';

/**
 * Migration: Add slug column to organizations table
 *
 * The slug column is expected by:
 * - jwt.service.ts - Token generation
 * - organization-v2.routes.ts - Organization listing
 * - onboarding.service.ts - New user setup
 * - admin.controller.ts - Admin views
 *
 * This migration adds the column and populates it from existing organization names.
 */

export async function up(knex: Knex): Promise<void> {
  // Check if slug column already exists
  const hasSlug = await knex.schema.hasColumn('organizations', 'slug');

  if (!hasSlug) {
    // Add slug column (nullable initially to allow population)
    await knex.schema.alterTable('organizations', (table) => {
      table.string('slug', 100);
    });
    console.log('  ✓ Added slug column to organizations table');

    // Populate slug from name for existing orgs
    // Convert to lowercase, replace non-alphanumeric with hyphens, trim hyphens
    await knex.raw(`
      UPDATE organizations
      SET slug = LOWER(
        TRIM(BOTH '-' FROM
          REGEXP_REPLACE(
            REGEXP_REPLACE(name, '[^a-zA-Z0-9]+', '-', 'g'),
            '-+', '-', 'g'
          )
        )
      )
      WHERE slug IS NULL
    `);
    console.log('  ✓ Populated slug values from organization names');

    // Handle potential duplicates by appending a suffix
    const duplicates = await knex.raw(`
      SELECT slug, COUNT(*) as count
      FROM organizations
      GROUP BY slug
      HAVING COUNT(*) > 1
    `);

    if (duplicates.rows.length > 0) {
      console.log(`  ⚠ Found ${duplicates.rows.length} duplicate slugs, making unique...`);

      // For each duplicate slug, update all but the first to have unique suffixes
      for (const dup of duplicates.rows) {
        const orgsWithSlug = await knex('organizations')
          .where('slug', dup.slug)
          .orderBy('created_at', 'asc')
          .select('id');

        // Skip the first one, update the rest with suffixes
        for (let i = 1; i < orgsWithSlug.length; i++) {
          await knex('organizations')
            .where('id', orgsWithSlug[i].id)
            .update({ slug: `${dup.slug}-${i}` });
        }
      }
      console.log('  ✓ Resolved duplicate slugs');
    }

    // Now add unique constraint and index
    await knex.schema.alterTable('organizations', (table) => {
      table.unique(['slug']);
      table.index('slug');
    });
    console.log('  ✓ Added unique constraint and index on slug');
  } else {
    console.log('  - slug column already exists, skipping');
  }

  console.log('✅ Migration 055 complete: organizations.slug column added');
}

export async function down(knex: Knex): Promise<void> {
  const hasSlug = await knex.schema.hasColumn('organizations', 'slug');

  if (hasSlug) {
    await knex.schema.alterTable('organizations', (table) => {
      table.dropIndex('slug');
      table.dropUnique(['slug']);
      table.dropColumn('slug');
    });
    console.log('  ✓ Removed slug column from organizations table');
  }

  console.log('✅ Migration 055 rollback complete');
}
