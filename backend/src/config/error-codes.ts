/**
 * Standardized Error Codes for Consistent API Error Responses
 *
 * This module provides a centralized registry of error codes with:
 * - Unique error codes for machine-readable error identification
 * - HTTP status codes following REST conventions
 * - Default user-friendly error messages
 *
 * Usage:
 * - Import ErrorCodes to reference specific errors
 * - Use with error-helpers.ts to create AppError instances
 *
 * Categories:
 * - Authentication (1xx): Login, tokens, sessions
 * - Authorization (2xx): Permissions, roles, access control
 * - Validation (3xx): Input validation, data format
 * - Resource (4xx): CRUD operations, not found, conflicts
 * - Rate Limiting (5xx): Throttling, quotas
 * - External Services (6xx): Third-party API failures
 * - Server (9xx): Internal errors, infrastructure
 */

export interface ErrorCodeDefinition {
  readonly code: string;
  readonly status: number;
  readonly message: string;
}

/**
 * Authentication Errors (100-199)
 * Used when authentication is missing, invalid, or expired
 */
const AuthenticationErrors = {
  UNAUTHORIZED: {
    code: 'AUTH_001',
    status: 401,
    message: 'Authentication required',
  },
  INVALID_CREDENTIALS: {
    code: 'AUTH_002',
    status: 401,
    message: 'Invalid email or password',
  },
  TOKEN_EXPIRED: {
    code: 'AUTH_003',
    status: 401,
    message: 'Your session has expired. Please log in again.',
  },
  TOKEN_INVALID: {
    code: 'AUTH_004',
    status: 401,
    message: 'Invalid authentication token',
  },
  REFRESH_TOKEN_EXPIRED: {
    code: 'AUTH_005',
    status: 401,
    message: 'Your refresh token has expired. Please log in again.',
  },
  REFRESH_TOKEN_INVALID: {
    code: 'AUTH_006',
    status: 401,
    message: 'Invalid refresh token',
  },
  ACCOUNT_DISABLED: {
    code: 'AUTH_007',
    status: 401,
    message: 'Your account has been disabled. Please contact support.',
  },
  EMAIL_NOT_VERIFIED: {
    code: 'AUTH_008',
    status: 401,
    message: 'Please verify your email address before logging in',
  },
  MAGIC_LINK_EXPIRED: {
    code: 'AUTH_009',
    status: 401,
    message: 'This link has expired. Please request a new one.',
  },
  MAGIC_LINK_INVALID: {
    code: 'AUTH_010',
    status: 401,
    message: 'This link is invalid or has already been used',
  },
  PASSWORD_RESET_EXPIRED: {
    code: 'AUTH_011',
    status: 401,
    message: 'This password reset link has expired. Please request a new one.',
  },
  MFA_REQUIRED: {
    code: 'AUTH_012',
    status: 401,
    message: 'Multi-factor authentication is required',
  },
  MFA_INVALID: {
    code: 'AUTH_013',
    status: 401,
    message: 'Invalid verification code',
  },
} as const;

/**
 * Authorization Errors (200-299)
 * Used when user is authenticated but lacks permission
 */
const AuthorizationErrors = {
  FORBIDDEN: {
    code: 'AUTHZ_001',
    status: 403,
    message: 'You do not have permission to perform this action',
  },
  INSUFFICIENT_ROLE: {
    code: 'AUTHZ_002',
    status: 403,
    message: 'Your role does not have access to this feature',
  },
  ORGANIZATION_ACCESS_DENIED: {
    code: 'AUTHZ_003',
    status: 403,
    message: 'You do not have access to this organization',
  },
  RESOURCE_ACCESS_DENIED: {
    code: 'AUTHZ_004',
    status: 403,
    message: 'You do not have access to this resource',
  },
  FEATURE_NOT_AVAILABLE: {
    code: 'AUTHZ_005',
    status: 403,
    message: 'This feature is not available on your current plan',
  },
  SUBSCRIPTION_REQUIRED: {
    code: 'AUTHZ_006',
    status: 402,
    message: 'An active subscription is required to access this feature',
  },
  SUBSCRIPTION_EXPIRED: {
    code: 'AUTHZ_007',
    status: 402,
    message: 'Your subscription has expired. Please renew to continue.',
  },
  TRIAL_EXPIRED: {
    code: 'AUTHZ_008',
    status: 402,
    message: 'Your trial period has ended. Please subscribe to continue.',
  },
} as const;

/**
 * Validation Errors (300-399)
 * Used for input validation failures
 */
const ValidationErrors = {
  VALIDATION_ERROR: {
    code: 'VAL_001',
    status: 400,
    message: 'Invalid input data',
  },
  REQUIRED_FIELD_MISSING: {
    code: 'VAL_002',
    status: 400,
    message: 'Required field is missing',
  },
  INVALID_FORMAT: {
    code: 'VAL_003',
    status: 400,
    message: 'Invalid data format',
  },
  INVALID_EMAIL: {
    code: 'VAL_004',
    status: 400,
    message: 'Invalid email address format',
  },
  INVALID_PASSWORD: {
    code: 'VAL_005',
    status: 400,
    message: 'Password does not meet security requirements',
  },
  INVALID_UUID: {
    code: 'VAL_006',
    status: 400,
    message: 'Invalid identifier format',
  },
  VALUE_OUT_OF_RANGE: {
    code: 'VAL_007',
    status: 400,
    message: 'Value is out of acceptable range',
  },
  STRING_TOO_LONG: {
    code: 'VAL_008',
    status: 400,
    message: 'Input exceeds maximum length',
  },
  STRING_TOO_SHORT: {
    code: 'VAL_009',
    status: 400,
    message: 'Input is below minimum length',
  },
  INVALID_FILE_TYPE: {
    code: 'VAL_010',
    status: 400,
    message: 'File type is not supported',
  },
  FILE_TOO_LARGE: {
    code: 'VAL_011',
    status: 400,
    message: 'File size exceeds the maximum allowed',
  },
  INVALID_DATE: {
    code: 'VAL_012',
    status: 400,
    message: 'Invalid date format',
  },
  INVALID_JSON: {
    code: 'VAL_013',
    status: 400,
    message: 'Invalid JSON format',
  },
} as const;

/**
 * Resource Errors (400-499)
 * Used for resource-related operations
 */
const ResourceErrors = {
  NOT_FOUND: {
    code: 'RES_001',
    status: 404,
    message: 'Resource not found',
  },
  USER_NOT_FOUND: {
    code: 'RES_002',
    status: 404,
    message: 'User not found',
  },
  ORGANIZATION_NOT_FOUND: {
    code: 'RES_003',
    status: 404,
    message: 'Organization not found',
  },
  TASK_NOT_FOUND: {
    code: 'RES_004',
    status: 404,
    message: 'Task not found',
  },
  RECORDING_NOT_FOUND: {
    code: 'RES_005',
    status: 404,
    message: 'Recording not found',
  },
  INVITATION_NOT_FOUND: {
    code: 'RES_006',
    status: 404,
    message: 'Invitation not found',
  },
  TEMPLATE_NOT_FOUND: {
    code: 'RES_007',
    status: 404,
    message: 'Template not found',
  },
  CONFLICT: {
    code: 'RES_010',
    status: 409,
    message: 'Resource conflict',
  },
  DUPLICATE_RESOURCE: {
    code: 'RES_011',
    status: 409,
    message: 'A resource with this identifier already exists',
  },
  EMAIL_ALREADY_EXISTS: {
    code: 'RES_012',
    status: 409,
    message: 'An account with this email already exists',
  },
  ORGANIZATION_ALREADY_EXISTS: {
    code: 'RES_013',
    status: 409,
    message: 'An organization with this name already exists',
  },
  VERSION_CONFLICT: {
    code: 'RES_014',
    status: 409,
    message: 'Resource has been modified. Please refresh and try again.',
  },
  RESOURCE_LOCKED: {
    code: 'RES_015',
    status: 423,
    message: 'This resource is currently locked and cannot be modified',
  },
  RESOURCE_DELETED: {
    code: 'RES_016',
    status: 410,
    message: 'This resource has been deleted',
  },
} as const;

/**
 * Rate Limiting Errors (500-599)
 * Used for throttling and quota enforcement
 */
const RateLimitErrors = {
  RATE_LIMIT_EXCEEDED: {
    code: 'RATE_001',
    status: 429,
    message: 'Too many requests. Please try again later.',
  },
  API_QUOTA_EXCEEDED: {
    code: 'RATE_002',
    status: 429,
    message: 'API quota exceeded for your plan',
  },
  STORAGE_QUOTA_EXCEEDED: {
    code: 'RATE_003',
    status: 429,
    message: 'Storage quota exceeded. Please upgrade your plan or delete some files.',
  },
  RECORDING_LIMIT_EXCEEDED: {
    code: 'RATE_004',
    status: 429,
    message: 'Recording limit exceeded for this billing period',
  },
  MEMBER_LIMIT_EXCEEDED: {
    code: 'RATE_005',
    status: 429,
    message: 'Member limit exceeded for your plan',
  },
  CONCURRENT_LIMIT_EXCEEDED: {
    code: 'RATE_006',
    status: 429,
    message: 'Too many concurrent operations. Please wait and try again.',
  },
} as const;

/**
 * External Service Errors (600-699)
 * Used when third-party services fail
 */
const ExternalServiceErrors = {
  EXTERNAL_SERVICE_ERROR: {
    code: 'EXT_001',
    status: 502,
    message: 'External service is currently unavailable',
  },
  STORAGE_SERVICE_ERROR: {
    code: 'EXT_002',
    status: 502,
    message: 'Storage service is currently unavailable',
  },
  EMAIL_SERVICE_ERROR: {
    code: 'EXT_003',
    status: 502,
    message: 'Email service is currently unavailable',
  },
  PAYMENT_SERVICE_ERROR: {
    code: 'EXT_004',
    status: 502,
    message: 'Payment service is currently unavailable',
  },
  AI_SERVICE_ERROR: {
    code: 'EXT_005',
    status: 502,
    message: 'AI analysis service is currently unavailable',
  },
  TRANSCRIPTION_SERVICE_ERROR: {
    code: 'EXT_006',
    status: 502,
    message: 'Transcription service is currently unavailable',
  },
  EXTERNAL_SERVICE_TIMEOUT: {
    code: 'EXT_010',
    status: 504,
    message: 'External service request timed out',
  },
} as const;

/**
 * Server Errors (900-999)
 * Used for internal server errors
 */
const ServerErrors = {
  INTERNAL_ERROR: {
    code: 'SRV_001',
    status: 500,
    message: 'An unexpected error occurred. Please try again later.',
  },
  DATABASE_ERROR: {
    code: 'SRV_002',
    status: 500,
    message: 'Database error occurred. Please try again later.',
  },
  CONFIGURATION_ERROR: {
    code: 'SRV_003',
    status: 500,
    message: 'Server configuration error',
  },
  SERVICE_UNAVAILABLE: {
    code: 'SRV_004',
    status: 503,
    message: 'Service is temporarily unavailable. Please try again later.',
  },
  MAINTENANCE_MODE: {
    code: 'SRV_005',
    status: 503,
    message: 'Service is under maintenance. Please try again later.',
  },
  REQUEST_TIMEOUT: {
    code: 'SRV_006',
    status: 504,
    message: 'Request timed out. Please try again.',
  },
} as const;

/**
 * Combined Error Codes Registry
 * All error codes in a single object for easy access
 */
export const ErrorCodes = {
  // Authentication
  ...AuthenticationErrors,
  // Authorization
  ...AuthorizationErrors,
  // Validation
  ...ValidationErrors,
  // Resources
  ...ResourceErrors,
  // Rate Limiting
  ...RateLimitErrors,
  // External Services
  ...ExternalServiceErrors,
  // Server
  ...ServerErrors,
} as const;

/**
 * Type for all error code keys
 */
export type ErrorCodeKey = keyof typeof ErrorCodes;

/**
 * Type guard to check if a string is a valid error code key
 */
export function isValidErrorCode(code: string): code is ErrorCodeKey {
  return code in ErrorCodes;
}

/**
 * Get error definition by code string (e.g., 'AUTH_001')
 */
export function getErrorByCode(code: string): ErrorCodeDefinition | undefined {
  return Object.values(ErrorCodes).find((err) => err.code === code);
}

/**
 * Error categories for filtering and grouping
 */
export const ErrorCategories = {
  AUTHENTICATION: AuthenticationErrors,
  AUTHORIZATION: AuthorizationErrors,
  VALIDATION: ValidationErrors,
  RESOURCE: ResourceErrors,
  RATE_LIMIT: RateLimitErrors,
  EXTERNAL_SERVICE: ExternalServiceErrors,
  SERVER: ServerErrors,
} as const;

export type ErrorCategory = keyof typeof ErrorCategories;
