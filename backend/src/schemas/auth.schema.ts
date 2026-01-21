import { z } from 'zod';

/**
 * Authentication validation schemas using Zod.
 * These schemas validate and transform incoming request data for auth endpoints.
 */

// Email validation helper
const emailSchema = z.string().email('Invalid email address').toLowerCase().trim();

// Password validation with complexity requirements
const passwordSchema = z
  .string()
  .min(8, 'Password must be at least 8 characters')
  .max(128, 'Password must be 128 characters or less')
  .regex(/[A-Z]/, 'Password must contain at least one uppercase letter')
  .regex(/[a-z]/, 'Password must contain at least one lowercase letter')
  .regex(/[0-9]/, 'Password must contain at least one number')
  .regex(/[^A-Za-z0-9]/, 'Password must contain at least one special character');

// Simple password for login (don't reveal requirements on login failure)
const loginPasswordSchema = z.string().min(1, 'Password is required');

// Login schema
export const loginSchema = z.object({
  email: emailSchema,
  password: loginPasswordSchema,
});

// Register schema
export const registerSchema = z.object({
  email: emailSchema,
  password: passwordSchema,
  name: z
    .string()
    .min(1, 'Name is required')
    .max(100, 'Name must be 100 characters or less')
    .trim(),
  organizationName: z
    .string()
    .min(1, 'Organization name is required')
    .max(100, 'Organization name must be 100 characters or less')
    .trim()
    .optional(),
});

// Refresh token schema
// refreshToken in body is optional - we prefer HttpOnly cookie
// Kept for backward compatibility during migration
export const refreshTokenSchema = z.object({
  refreshToken: z.string().optional(),
});

// Change password schema
export const changePasswordSchema = z
  .object({
    currentPassword: z.string().min(1, 'Current password is required'),
    newPassword: passwordSchema,
    confirmPassword: z.string().min(1, 'Confirm password is required'),
  })
  .refine((data) => data.newPassword === data.confirmPassword, {
    message: 'Passwords do not match',
    path: ['confirmPassword'],
  })
  .refine((data) => data.currentPassword !== data.newPassword, {
    message: 'New password must be different from current password',
    path: ['newPassword'],
  });

// Forgot password schema
export const forgotPasswordSchema = z.object({
  email: emailSchema,
});

// Reset password schema
export const resetPasswordSchema = z
  .object({
    token: z.string().min(1, 'Reset token is required'),
    password: passwordSchema,
    confirmPassword: z.string().min(1, 'Confirm password is required'),
  })
  .refine((data) => data.password === data.confirmPassword, {
    message: 'Passwords do not match',
    path: ['confirmPassword'],
  });

// Google OAuth schema
export const googleAuthSchema = z.object({
  code: z.string().min(1, 'Authorization code is required'),
  redirectUri: z.string().url().optional(),
});

// Type exports
export type LoginInput = z.infer<typeof loginSchema>;
export type RegisterInput = z.infer<typeof registerSchema>;
export type RefreshTokenInput = z.infer<typeof refreshTokenSchema>;
export type ChangePasswordInput = z.infer<typeof changePasswordSchema>;
export type ForgotPasswordInput = z.infer<typeof forgotPasswordSchema>;
export type ResetPasswordInput = z.infer<typeof resetPasswordSchema>;
export type GoogleAuthInput = z.infer<typeof googleAuthSchema>;
