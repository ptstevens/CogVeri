import { Knex } from 'knex';

/**
 * Migration: Seed system default task templates
 *
 * NOTE: This migration has been superseded by migration 041 which creates
 * 4 comprehensive templates with full rubrics. This is now a no-op.
 */
export async function up(_knex: Knex): Promise<void> {
  console.log('Migration 026 skipped - superseded by migration 041 (4 comprehensive templates)');
}

export async function down(_knex: Knex): Promise<void> {
  console.log('Migration 026 down - no action needed');
}
