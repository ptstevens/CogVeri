import { Knex } from 'knex';

/**
 * Migration: Create refresh_tokens table for token rotation
 *
 * This table supports secure refresh token rotation with family tracking
 * to detect token reuse attacks.
 *
 * Security features:
 * - Family ID groups related tokens (rotation chain)
 * - Token reuse detection invalidates entire family
 * - Automatic cleanup of old/revoked tokens
 */
export async function up(knex: Knex): Promise<void> {
  // Check if table already exists
  const tableExists = await knex.schema.hasTable('refresh_tokens');

  if (!tableExists) {
    await knex.schema.createTable('refresh_tokens', (table) => {
      table.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
      table.uuid('user_id').notNullable().references('id').inTable('users').onDelete('CASCADE');

      // Token hash (we don't store the actual token, just a hash for lookup)
      table.string('token_hash', 64).notNullable().unique();

      // Family ID for token rotation chain
      // All tokens in a rotation chain share the same family_id
      table.uuid('family_id').notNullable();

      // Parent token (for tracking rotation chain)
      table.uuid('parent_id').nullable().references('id').inTable('refresh_tokens').onDelete('SET NULL');

      // Token status
      table.boolean('revoked').defaultTo(false);
      table.timestamp('revoked_at').nullable();
      table.string('revoked_reason', 50).nullable(); // 'rotation', 'logout', 'reuse_detected', 'manual'

      // Device/session info for audit
      table.string('device_fingerprint', 255).nullable();
      table.string('ip_address', 45).nullable();
      table.string('user_agent', 500).nullable();

      // Timestamps
      table.timestamp('expires_at').notNullable();
      table.timestamp('created_at').defaultTo(knex.fn.now());
      table.timestamp('last_used_at').nullable();

      // Indexes for efficient queries
      table.index(['user_id', 'revoked'], 'idx_refresh_tokens_user_active');
      table.index(['family_id'], 'idx_refresh_tokens_family');
      table.index(['expires_at'], 'idx_refresh_tokens_expires');
      table.index(['token_hash'], 'idx_refresh_tokens_hash');
    });

    // Create cleanup function for expired tokens
    const client = knex.client.config.client;
    const isPostgres = client === 'pg' || client === 'postgresql';

    if (isPostgres) {
      // Create a function to clean up expired tokens (can be called by cron)
      await knex.raw(`
        CREATE OR REPLACE FUNCTION cleanup_expired_refresh_tokens()
        RETURNS INTEGER AS $$
        DECLARE
          deleted_count INTEGER;
        BEGIN
          DELETE FROM refresh_tokens
          WHERE expires_at < NOW() - INTERVAL '7 days'
             OR (revoked = true AND revoked_at < NOW() - INTERVAL '24 hours');
          GET DIAGNOSTICS deleted_count = ROW_COUNT;
          RETURN deleted_count;
        END;
        $$ LANGUAGE plpgsql;
      `);

      // Create a function to invalidate a token family (for reuse detection)
      await knex.raw(`
        CREATE OR REPLACE FUNCTION invalidate_token_family(p_family_id UUID, p_reason VARCHAR(50))
        RETURNS INTEGER AS $$
        DECLARE
          updated_count INTEGER;
        BEGIN
          UPDATE refresh_tokens
          SET revoked = true,
              revoked_at = NOW(),
              revoked_reason = p_reason
          WHERE family_id = p_family_id
            AND revoked = false;
          GET DIAGNOSTICS updated_count = ROW_COUNT;
          RETURN updated_count;
        END;
        $$ LANGUAGE plpgsql;
      `);
    }
  }
}

export async function down(knex: Knex): Promise<void> {
  const client = knex.client.config.client;
  const isPostgres = client === 'pg' || client === 'postgresql';

  if (isPostgres) {
    await knex.raw('DROP FUNCTION IF EXISTS cleanup_expired_refresh_tokens()');
    await knex.raw('DROP FUNCTION IF EXISTS invalidate_token_family(UUID, VARCHAR)');
  }

  await knex.schema.dropTableIfExists('refresh_tokens');
}
