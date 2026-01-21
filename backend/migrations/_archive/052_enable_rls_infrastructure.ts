import { Knex } from 'knex';

/**
 * Migration: Enable PostgreSQL Row Level Security (RLS) Infrastructure
 *
 * This migration creates the PostgreSQL functions needed for Row Level Security.
 * RLS provides database-level data isolation, ensuring that even if application
 * code has bugs, data from one organization cannot leak to another.
 *
 * Functions created:
 * - set_current_org(uuid) - Sets the current organization context for the session
 * - get_current_org() - Returns the current organization ID from session context
 * - set_current_user_id(uuid) - Sets the current user context for the session
 * - get_current_user_id() - Returns the current user ID from session context
 *
 * These functions use PostgreSQL session variables (via set_config/current_setting)
 * which are scoped to the current database connection/transaction.
 */

export async function up(knex: Knex): Promise<void> {
  // Create function to set current organization context
  await knex.raw(`
    CREATE OR REPLACE FUNCTION set_current_org(org_id uuid)
    RETURNS void AS $$
    BEGIN
      PERFORM set_config('app.current_organization_id', COALESCE(org_id::text, ''), true);
    END;
    $$ LANGUAGE plpgsql SECURITY DEFINER;
  `);

  // Create function to get current organization context
  await knex.raw(`
    CREATE OR REPLACE FUNCTION get_current_org()
    RETURNS uuid AS $$
    DECLARE
      org_text text;
    BEGIN
      org_text := current_setting('app.current_organization_id', true);
      IF org_text IS NULL OR org_text = '' THEN
        RETURN NULL;
      END IF;
      RETURN org_text::uuid;
    EXCEPTION WHEN OTHERS THEN
      RETURN NULL;
    END;
    $$ LANGUAGE plpgsql STABLE SECURITY DEFINER;
  `);

  // Create function to set current user context
  await knex.raw(`
    CREATE OR REPLACE FUNCTION set_current_user_id(user_id uuid)
    RETURNS void AS $$
    BEGIN
      PERFORM set_config('app.current_user_id', COALESCE(user_id::text, ''), true);
    END;
    $$ LANGUAGE plpgsql SECURITY DEFINER;
  `);

  // Create function to get current user context
  await knex.raw(`
    CREATE OR REPLACE FUNCTION get_current_user_id()
    RETURNS uuid AS $$
    DECLARE
      user_text text;
    BEGIN
      user_text := current_setting('app.current_user_id', true);
      IF user_text IS NULL OR user_text = '' THEN
        RETURN NULL;
      END IF;
      RETURN user_text::uuid;
    EXCEPTION WHEN OTHERS THEN
      RETURN NULL;
    END;
    $$ LANGUAGE plpgsql STABLE SECURITY DEFINER;
  `);

  // Create function to check if current user is member of current org
  await knex.raw(`
    CREATE OR REPLACE FUNCTION current_user_is_org_member()
    RETURNS boolean AS $$
    DECLARE
      current_user_id uuid;
      current_org_id uuid;
    BEGIN
      current_user_id := get_current_user_id();
      current_org_id := get_current_org();

      IF current_user_id IS NULL OR current_org_id IS NULL THEN
        RETURN false;
      END IF;

      RETURN EXISTS (
        SELECT 1 FROM organization_members
        WHERE user_id = current_user_id
        AND organization_id = current_org_id
        AND status = 'active'
      );
    END;
    $$ LANGUAGE plpgsql STABLE SECURITY DEFINER;
  `);

  // Create function to check if current user is admin of current org
  await knex.raw(`
    CREATE OR REPLACE FUNCTION current_user_is_org_admin()
    RETURNS boolean AS $$
    DECLARE
      current_user_id uuid;
      current_org_id uuid;
    BEGIN
      current_user_id := get_current_user_id();
      current_org_id := get_current_org();

      IF current_user_id IS NULL OR current_org_id IS NULL THEN
        RETURN false;
      END IF;

      RETURN EXISTS (
        SELECT 1 FROM organization_members
        WHERE user_id = current_user_id
        AND organization_id = current_org_id
        AND role IN ('owner', 'admin')
        AND status = 'active'
      );
    END;
    $$ LANGUAGE plpgsql STABLE SECURITY DEFINER;
  `);

  console.log('✅ Created RLS infrastructure functions:');
  console.log('  - set_current_org(uuid)');
  console.log('  - get_current_org()');
  console.log('  - set_current_user_id(uuid)');
  console.log('  - get_current_user_id()');
  console.log('  - current_user_is_org_member()');
  console.log('  - current_user_is_org_admin()');
}

export async function down(knex: Knex): Promise<void> {
  // Drop functions in reverse order of dependency
  await knex.raw('DROP FUNCTION IF EXISTS current_user_is_org_admin()');
  await knex.raw('DROP FUNCTION IF EXISTS current_user_is_org_member()');
  await knex.raw('DROP FUNCTION IF EXISTS get_current_user_id()');
  await knex.raw('DROP FUNCTION IF EXISTS set_current_user_id(uuid)');
  await knex.raw('DROP FUNCTION IF EXISTS get_current_org()');
  await knex.raw('DROP FUNCTION IF EXISTS set_current_org(uuid)');

  console.log('✅ Dropped RLS infrastructure functions');
}
