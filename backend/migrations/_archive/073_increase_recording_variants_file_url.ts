import { Knex } from 'knex';

/**
 * Increase file_url column size in recording_variants table.
 *
 * Signed S3/R2 URLs can exceed 500 characters, causing transcode jobs to fail.
 * This migration increases the limit to 2000 characters.
 */
export async function up(knex: Knex): Promise<void> {
  await knex.raw('ALTER TABLE recording_variants ALTER COLUMN file_url TYPE varchar(2000)');
}

export async function down(knex: Knex): Promise<void> {
  // Note: This could truncate data if URLs exceed 500 chars
  await knex.raw('ALTER TABLE recording_variants ALTER COLUMN file_url TYPE varchar(500)');
}
