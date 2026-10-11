/**
 * SYSADMIN Configuration
 *
 * This file defines the primary system administrator who has exclusive
 * rights to grant and revoke SYSADMIN status to other users.
 *
 * The PRIMARY_ADMIN_EMAIL is the ONLY account that can:
 * - Grant SYSADMIN privileges to other users
 * - Revoke SYSADMIN privileges from other users
 *
 * This email should match the admin@cogveri.com seed account.
 */

/**
 * The primary admin email - ONLY this account can grant/revoke SYSADMIN
 * This is hardcoded intentionally for security - it should not be configurable
 * via environment variables as that could be exploited.
 */
export const PRIMARY_ADMIN_EMAIL = 'admin@cogveri.com';

/**
 * System roles - separate from organization roles
 */
export const SYSTEM_ROLES = {
  SUPER_ADMIN: 'SUPER_ADMIN',
} as const;

export type SystemRole = (typeof SYSTEM_ROLES)[keyof typeof SYSTEM_ROLES];
