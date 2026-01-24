/**
 * SYSADMIN Configuration for Frontend
 *
 * This file defines the primary system administrator email.
 * The PRIMARY_ADMIN_EMAIL is the ONLY account that can grant and revoke
 * SYSADMIN status through the UI.
 *
 * IMPORTANT: This configuration is duplicated on the backend for server-side
 * validation. The frontend check is for UI purposes only - the backend
 * will reject any attempts to grant/revoke SYSADMIN from non-primary admins.
 */

/**
 * The primary admin email - ONLY this account can manage other SYSADMINs
 * This must match the backend configuration in backend/src/config/sysadmin.ts
 */
export const PRIMARY_ADMIN_EMAIL = 'admin@cogveri.com';

/**
 * Check if an email matches the primary admin email
 * @param email - The email to check
 * @returns true if the email is the primary admin
 */
export const isPrimaryAdminEmail = (email: string | undefined | null): boolean => {
  if (!email) return false;
  return email.toLowerCase() === PRIMARY_ADMIN_EMAIL.toLowerCase();
};

/**
 * Check if a user object represents the primary admin
 * @param user - The user object from auth context
 * @returns true if the user is the primary admin
 */
export const isPrimaryAdmin = (user: { email?: string } | null | undefined): boolean => {
  return isPrimaryAdminEmail(user?.email);
};

/**
 * Check if a user is a system admin (SUPER_ADMIN role)
 * @param user - The user object from auth context
 * @returns true if the user is a system admin
 */
export const isSystemAdmin = (user: { is_system_admin?: boolean; system_role?: string } | null | undefined): boolean => {
  if (!user) return false;
  return user.is_system_admin === true || user.system_role === 'SUPER_ADMIN';
};
