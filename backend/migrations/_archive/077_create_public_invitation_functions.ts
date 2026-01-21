import { Knex } from 'knex';

/**
 * Migration: Create Public Invitation Functions
 *
 * Creates PostgreSQL functions with SECURITY DEFINER to allow public
 * (unauthenticated) access to invitation operations. These functions
 * bypass RLS policies safely by only exposing necessary data and
 * performing controlled operations.
 *
 * This is the proper pattern for handling RLS with public endpoints -
 * rather than disabling RLS or using workarounds, we create controlled
 * functions that can access data across RLS boundaries.
 */

export async function up(knex: Knex): Promise<void> {
  // Create a function to validate invitation tokens without RLS restrictions
  // SECURITY DEFINER means the function runs with the privileges of the user who created it
  // (typically the migration user with full access), not the calling user
  await knex.raw(`
    CREATE OR REPLACE FUNCTION public.validate_invitation_token(p_token TEXT)
    RETURNS JSON
    LANGUAGE plpgsql
    SECURITY DEFINER
    SET search_path = public
    AS $$
    DECLARE
      v_invitation RECORD;
      v_organization RECORD;
      v_result JSON;
    BEGIN
      -- Find the invitation by token
      SELECT id, organization_id, email, role, status, expires_at
      INTO v_invitation
      FROM organization_invitations
      WHERE invitation_token = p_token;

      -- Check if invitation exists
      IF NOT FOUND THEN
        RETURN json_build_object(
          'valid', false,
          'error', 'Invitation not found'
        );
      END IF;

      -- Check if expired
      IF v_invitation.expires_at < NOW() THEN
        RETURN json_build_object(
          'valid', false,
          'error', 'Invitation has expired'
        );
      END IF;

      -- Check if already used
      IF v_invitation.status != 'pending' THEN
        RETURN json_build_object(
          'valid', false,
          'error', 'Invitation has already been ' || v_invitation.status
        );
      END IF;

      -- Get organization details
      SELECT id, name
      INTO v_organization
      FROM organizations
      WHERE id = v_invitation.organization_id;

      IF NOT FOUND THEN
        RETURN json_build_object(
          'valid', false,
          'error', 'Organization not found'
        );
      END IF;

      -- Return valid invitation details
      RETURN json_build_object(
        'valid', true,
        'invitation', json_build_object(
          'id', v_invitation.id,
          'email', v_invitation.email,
          'role', v_invitation.role,
          'expiresAt', v_invitation.expires_at
        ),
        'organizationId', v_organization.id,
        'organizationName', v_organization.name
      );
    END;
    $$;
  `);

  // Grant execute permission to the application user
  await knex.raw(`
    GRANT EXECUTE ON FUNCTION public.validate_invitation_token(TEXT) TO PUBLIC;
  `);

  await knex.raw(`
    COMMENT ON FUNCTION public.validate_invitation_token(TEXT) IS
    'Validates an invitation token and returns invitation details.
    Uses SECURITY DEFINER to bypass RLS for public (unauthenticated) access.
    Safe because it only exposes limited, non-sensitive data.';
  `);

  console.log('✅ Created public.validate_invitation_token function');

  // Create a function to accept invitation and create membership
  // This function handles the full flow: validate, create membership, update invitation
  await knex.raw(`
    CREATE OR REPLACE FUNCTION public.accept_invitation_for_user(
      p_token TEXT,
      p_user_id UUID
    )
    RETURNS JSON
    LANGUAGE plpgsql
    SECURITY DEFINER
    SET search_path = public
    AS $$
    DECLARE
      v_invitation RECORD;
      v_user RECORD;
      v_org RECORD;
      v_existing_membership RECORD;
      v_now TIMESTAMP := NOW();
    BEGIN
      -- Find and validate the invitation
      SELECT id, organization_id, email, role, status, expires_at, invited_by, created_at
      INTO v_invitation
      FROM organization_invitations
      WHERE invitation_token = p_token;

      IF NOT FOUND THEN
        RETURN json_build_object('success', false, 'error', 'Invitation not found or already used');
      END IF;

      IF v_invitation.status != 'pending' THEN
        RETURN json_build_object('success', false, 'error', 'Invitation is no longer valid');
      END IF;

      IF v_now > v_invitation.expires_at THEN
        RETURN json_build_object('success', false, 'error', 'Invitation has expired');
      END IF;

      -- Get user details
      SELECT id, email, organization_id
      INTO v_user
      FROM users
      WHERE id = p_user_id;

      IF NOT FOUND THEN
        RETURN json_build_object('success', false, 'error', 'User not found');
      END IF;

      -- Verify email matches
      IF LOWER(v_user.email) != LOWER(v_invitation.email) THEN
        RETURN json_build_object('success', false, 'error', 'User email does not match invitation');
      END IF;

      -- Check for existing membership
      SELECT user_id
      INTO v_existing_membership
      FROM organization_members
      WHERE user_id = p_user_id AND organization_id = v_invitation.organization_id;

      IF FOUND THEN
        RETURN json_build_object('success', false, 'error', 'User is already a member of this organization');
      END IF;

      -- Get organization details for response
      SELECT id, name
      INTO v_org
      FROM organizations
      WHERE id = v_invitation.organization_id;

      -- Update user: set current organization, and primary org if not set
      IF v_user.organization_id IS NULL THEN
        UPDATE users
        SET
          organization_id = v_invitation.organization_id,
          current_organization_id = v_invitation.organization_id,
          org_role = v_invitation.role,
          org_status = 'active',
          joined_organization_at = v_now
        WHERE id = p_user_id;
      ELSE
        UPDATE users
        SET current_organization_id = v_invitation.organization_id
        WHERE id = p_user_id;
      END IF;

      -- Create membership record
      INSERT INTO organization_members (
        user_id, organization_id, role, status,
        invited_by, invited_at, joined_at,
        created_at, updated_at
      ) VALUES (
        p_user_id, v_invitation.organization_id, v_invitation.role, 'active',
        v_invitation.invited_by, v_invitation.created_at, v_now,
        v_now, v_now
      );

      -- Mark invitation as accepted
      UPDATE organization_invitations
      SET status = 'accepted', accepted_at = v_now, updated_at = v_now
      WHERE id = v_invitation.id;

      -- Log to audit (insert directly, bypassing RLS)
      INSERT INTO organization_audit_logs (
        organization_id, actor_id, action, resource_type, resource_id,
        metadata, status, created_at
      ) VALUES (
        v_invitation.organization_id, p_user_id, 'MEMBER_JOINED', 'user', p_user_id,
        json_build_object(
          'role', v_invitation.role,
          'invitationId', v_invitation.id,
          'email', v_user.email
        )::jsonb,
        'success', v_now
      );

      RETURN json_build_object(
        'success', true,
        'organizationId', v_invitation.organization_id,
        'organizationName', v_org.name,
        'role', v_invitation.role
      );
    END;
    $$;
  `);

  await knex.raw(`
    GRANT EXECUTE ON FUNCTION public.accept_invitation_for_user(TEXT, UUID) TO PUBLIC;
  `);

  await knex.raw(`
    COMMENT ON FUNCTION public.accept_invitation_for_user(TEXT, UUID) IS
    'Accepts an invitation for a user, creating organization membership.
    Uses SECURITY DEFINER to bypass RLS for the registration flow.
    Validates all inputs and performs atomic updates.';
  `);

  console.log('✅ Created public.accept_invitation_for_user function');
}

export async function down(knex: Knex): Promise<void> {
  await knex.raw(`DROP FUNCTION IF EXISTS public.accept_invitation_for_user(TEXT, UUID);`);
  await knex.raw(`DROP FUNCTION IF EXISTS public.validate_invitation_token(TEXT);`);
  console.log('✅ Dropped public invitation functions');
}
