/**
 * Zod schemas for API response validation
 * Provides runtime type safety for API responses
 *
 * SECURITY: Strict validation to reject unexpected data shapes.
 * Schema must match actual backend response exactly.
 */
import { z } from 'zod';

/**
 * User schema - represents authenticated user data from the backend
 * STRICT: Matches exact backend response shape for security
 *
 * Last verified against backend response: 2026-01-07
 */
export const userSchema = z.object({
  // Required fields
  id: z.string().uuid(),
  email: z.string(),
  name: z.string(),
  role: z.string(),
  is_active: z.boolean(),
  is_system_admin: z.boolean(),

  // Optional/nullable string fields
  avatar_url: z.string().nullable(),
  bio: z.string().nullable(),
  phone: z.string().nullable(),
  department: z.string().nullable(),
  job_title: z.string().nullable(),
  manager_id: z.string().uuid().nullable(),
  organization_id: z.string().uuid().nullable(),
  org_role: z.string().nullable(),
  org_status: z.string().nullable(),
  current_organization_id: z.string().uuid().nullable(),
  system_role: z.string().nullable(), // Could be 'SUPER_ADMIN' | 'ADMIN' | 'SUPPORT' | 'USER' | null
  sso_id: z.string().nullable(),
  sso_provider: z.string().nullable(),
  google_id: z.string().nullable(),
  auth_provider: z.string().nullable(),
  search_vector: z.string().nullable().optional(), // Not always returned by backend
  preferences: z.unknown().nullable(), // JSON object, structure varies

  // Notification preferences object
  notification_preferences: z.object({
    email: z.boolean(),
    inApp: z.boolean(),
    slack: z.boolean(),
  }).nullable().optional(),

  // Timestamps
  created_at: z.string(),
  updated_at: z.string(),
  last_login_at: z.string().nullable(),
  invited_at: z.string().nullable(),
  joined_organization_at: z.string().nullable(),
  system_admin_since: z.string().nullable(),
  onboarding_completed_at: z.string().nullable(),
  password_updated_at: z.string().nullable(),

  // Boolean flags
  onboarding_completed: z.boolean(),
}).strict(); // SECURITY: Reject any unexpected fields

/**
 * Login response schema
 * Note: refreshToken is now optional - stored in HttpOnly cookie instead
 */
export const loginResponseSchema = z.object({
  token: z.string(),
  refreshToken: z.string().optional(), // Now in HttpOnly cookie
  user: userSchema,
  message: z.string().optional(),
});

/**
 * Refresh token response schema
 * Note: refreshToken is now optional - stored in HttpOnly cookie instead
 */
export const refreshResponseSchema = z.object({
  token: z.string(),
  refreshToken: z.string().optional(), // Now in HttpOnly cookie
  user: userSchema,
});

/**
 * Get me response schema (user endpoint)
 */
export const getMeResponseSchema = z.object({
  user: userSchema,
});

// Export types derived from schemas
export type User = z.infer<typeof userSchema>;
export type LoginResponse = z.infer<typeof loginResponseSchema>;
export type RefreshResponse = z.infer<typeof refreshResponseSchema>;
export type GetMeResponse = z.infer<typeof getMeResponseSchema>;

/**
 * Safe parse helper - returns null on validation failure instead of throwing
 * Logs validation errors in development for debugging
 */
export function safeParse<T>(schema: z.ZodSchema<T>, data: unknown): T | null {
  const result = schema.safeParse(data);
  if (!result.success) {
    if (process.env.NODE_ENV === 'development') {
      console.warn('API response validation failed:', result.error.format());
    }
    return null;
  }
  return result.data;
}

/**
 * Parse with error - throws descriptive error on validation failure
 */
export function parseOrThrow<T>(schema: z.ZodSchema<T>, data: unknown, context: string): T {
  const result = schema.safeParse(data);
  if (!result.success) {
    const errorMessage = result.error.issues
      .map(issue => `${issue.path.join('.')}: ${issue.message}`)
      .join(', ');
    throw new Error(`Invalid ${context} response: ${errorMessage}`);
  }
  return result.data;
}
