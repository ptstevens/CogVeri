import { Knex } from 'knex';

/**
 * Migration: Add organization suspension fields
 *
 * Adds fields to track when and why an organization is suspended.
 * Used for trial expiry (vs downgrading to free) - keeps data for 30 days
 * before automatic deletion if no purchase is made.
 */
export async function up(knex: Knex): Promise<void> {
  // Check which columns already exist
  const hasColumn = async (column: string): Promise<boolean> => {
    const result = await knex.raw(
      `
      SELECT column_name
      FROM information_schema.columns
      WHERE table_name = 'organizations' AND column_name = ?
    `,
      [column]
    );
    return result.rows.length > 0;
  };

  const hasSuspendedAt = await hasColumn('suspended_at');
  const hasSuspendedReason = await hasColumn('suspended_reason');
  const hasScheduledDeletionAt = await hasColumn('scheduled_deletion_at');

  // Add columns that don't exist
  if (!hasSuspendedAt) {
    await knex.raw(`
      ALTER TABLE organizations
      ADD COLUMN suspended_at TIMESTAMPTZ NULL
    `);
  }

  if (!hasSuspendedReason) {
    await knex.raw(`
      ALTER TABLE organizations
      ADD COLUMN suspended_reason TEXT NULL
      CHECK (suspended_reason IN ('trial_expired', 'payment_failed', 'admin_action', 'terms_violation'))
    `);
  }

  if (!hasScheduledDeletionAt) {
    await knex.raw(`
      ALTER TABLE organizations
      ADD COLUMN scheduled_deletion_at TIMESTAMPTZ NULL
    `);
  }

  // Check if index exists before creating
  const indexExists = await knex.raw(`
    SELECT indexname
    FROM pg_indexes
    WHERE tablename = 'organizations' AND indexname = 'idx_org_scheduled_deletion'
  `);

  if (indexExists.rows.length === 0) {
    await knex.raw(`
      CREATE INDEX idx_org_scheduled_deletion ON organizations(scheduled_deletion_at)
    `);
  }
}

export async function down(knex: Knex): Promise<void> {
  // Drop index if exists
  await knex.raw(`
    DROP INDEX IF EXISTS idx_org_scheduled_deletion
  `);

  // Drop columns if they exist
  const hasColumn = async (column: string): Promise<boolean> => {
    const result = await knex.raw(
      `
      SELECT column_name
      FROM information_schema.columns
      WHERE table_name = 'organizations' AND column_name = ?
    `,
      [column]
    );
    return result.rows.length > 0;
  };

  if (await hasColumn('scheduled_deletion_at')) {
    await knex.raw(`ALTER TABLE organizations DROP COLUMN scheduled_deletion_at`);
  }
  if (await hasColumn('suspended_reason')) {
    await knex.raw(`ALTER TABLE organizations DROP COLUMN suspended_reason`);
  }
  if (await hasColumn('suspended_at')) {
    await knex.raw(`ALTER TABLE organizations DROP COLUMN suspended_at`);
  }
}
