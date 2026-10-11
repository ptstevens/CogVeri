import { Knex } from 'knex';

/**
 * Migration: Fix upload_sessions column sizes
 *
 * Issues fixed:
 * 1. s3_upload_id was VARCHAR(255) but R2 upload IDs are ~360 chars - increase to 1000
 * 2. browser_info should be JSONB (already is, but ensure it)
 *
 * This aligns the database with the baseline schema expectations.
 */
export async function up(knex: Knex): Promise<void> {
  // Fix s3_upload_id column - R2 upload IDs can be 360+ characters
  await knex.raw(`
    ALTER TABLE upload_sessions
    ALTER COLUMN s3_upload_id TYPE varchar(1000)
  `);

  // Ensure browser_info is JSONB (may already be, but safe to run)
  // Check current type first
  const result = await knex.raw(`
    SELECT data_type FROM information_schema.columns
    WHERE table_name = 'upload_sessions' AND column_name = 'browser_info'
  `);

  if (result.rows[0]?.data_type === 'character varying') {
    await knex.raw(`
      ALTER TABLE upload_sessions
      ALTER COLUMN browser_info TYPE jsonb
      USING CASE
        WHEN browser_info IS NULL THEN NULL
        WHEN browser_info::text LIKE '{%' THEN browser_info::jsonb
        ELSE jsonb_build_object('userAgent', browser_info::text)
      END
    `);
  }
}

export async function down(knex: Knex): Promise<void> {
  // Revert s3_upload_id to original size (this may fail if data is too long)
  await knex.raw(`
    ALTER TABLE upload_sessions
    ALTER COLUMN s3_upload_id TYPE varchar(255)
  `);
}
