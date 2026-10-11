/**
 * Error Helper Utilities
 *
 * Provides factory functions for creating consistent, typed errors.
 * Uses the standardized error codes from config/error-codes.ts
 * and the AppError classes from utils/AppError.ts.
 *
 * Usage Examples:
 *
 *   // Using createError with error code
 *   throw createError('NOT_FOUND', 'User with ID 123 not found');
 *
 *   // Using convenience functions
 *   throw notFoundError('User');
 *   throw forbiddenError('delete this task');
 *   throw validationError([{ field: 'email', message: 'Invalid format' }]);
 *
 *   // Using resource-specific factories
 *   throw userNotFoundError('123');
 *   throw organizationNotFoundError('abc-org');
 */

import {
  AppError,
  BadRequestError,
  UnauthorizedError,
  ForbiddenError,
  NotFoundError,
  ConflictError,
  ValidationError,
  TooManyRequestsError,
  InternalServerError,
  BadGatewayError,
  ServiceUnavailableError,
  GatewayTimeoutError,
  PaymentRequiredError,
  type ValidationErrorData,
  type NotFoundData,
  type ForbiddenData,
  type RateLimitData,
  type ConflictData,
  type PaymentRequiredData,
  type BadGatewayData,
  type ServiceUnavailableData,
} from './AppError';

import { ErrorCodes, type ErrorCodeKey } from '../config/error-codes';

/**
 * Create an AppError from a standardized error code
 *
 * @param errorCode - Key from ErrorCodes (e.g., 'NOT_FOUND', 'UNAUTHORIZED')
 * @param details - Optional custom message to override default, or additional context
 * @returns Appropriate AppError subclass based on status code
 *
 * @example
 * throw createError('UNAUTHORIZED');
 * throw createError('NOT_FOUND', 'Task with ID abc123 not found');
 * throw createError('VALIDATION_ERROR', { field: 'email', message: 'Required' });
 */
export function createError(
  errorCode: ErrorCodeKey,
  details?: string | Record<string, unknown>
): AppError {
  const errorDef = ErrorCodes[errorCode];
  const message = typeof details === 'string' ? details : errorDef.message;
  const data = typeof details === 'object' ? details : undefined;
  const status = errorDef.status as number;
  const code = errorDef.code as string;

  // Return appropriate error class based on status code
  switch (status) {
    case 400:
      return new BadRequestError(message, data, code);
    case 401:
      return new UnauthorizedError(message, code);
    case 402:
      return new PaymentRequiredError(message, data as PaymentRequiredData);
    case 403:
      return new ForbiddenError(message, data as ForbiddenData);
    case 404:
      return new NotFoundError(message, data as NotFoundData);
    case 409:
      return new ConflictError(message, data as ConflictData);
    case 410:
      return new NotFoundError(message, { ...data, gone: true } as NotFoundData);
    case 422:
      return new ValidationError(message, data as ValidationErrorData);
    case 423:
      return new ConflictError(message, { ...data, locked: true } as ConflictData);
    case 429:
      return new TooManyRequestsError(message, data as RateLimitData);
    case 500:
      return new InternalServerError(message);
    case 502:
      return new BadGatewayError(message, data as BadGatewayData);
    case 503:
      return new ServiceUnavailableError(message, data as ServiceUnavailableData);
    case 504:
      return new GatewayTimeoutError(message);
    default:
      // Fallback for any status codes not explicitly handled
      return new AppError(message, status, data, code);
  }
}

// ============================================================================
// Authentication Error Factories
// ============================================================================

/**
 * Create an unauthorized error (401)
 * @param message - Custom message or undefined for default
 */
export function unauthorizedError(message?: string): UnauthorizedError {
  return new UnauthorizedError(
    message || ErrorCodes.UNAUTHORIZED.message,
    ErrorCodes.UNAUTHORIZED.code
  );
}

/**
 * Create an invalid credentials error (401)
 */
export function invalidCredentialsError(): UnauthorizedError {
  return new UnauthorizedError(
    ErrorCodes.INVALID_CREDENTIALS.message,
    ErrorCodes.INVALID_CREDENTIALS.code
  );
}

/**
 * Create a token expired error (401)
 */
export function tokenExpiredError(): UnauthorizedError {
  return new UnauthorizedError(ErrorCodes.TOKEN_EXPIRED.message, ErrorCodes.TOKEN_EXPIRED.code);
}

/**
 * Create a token invalid error (401)
 */
export function tokenInvalidError(): UnauthorizedError {
  return new UnauthorizedError(ErrorCodes.TOKEN_INVALID.message, ErrorCodes.TOKEN_INVALID.code);
}

/**
 * Create a magic link expired error (401)
 */
export function magicLinkExpiredError(): UnauthorizedError {
  return new UnauthorizedError(
    ErrorCodes.MAGIC_LINK_EXPIRED.message,
    ErrorCodes.MAGIC_LINK_EXPIRED.code
  );
}

/**
 * Create a magic link invalid error (401)
 */
export function magicLinkInvalidError(): UnauthorizedError {
  return new UnauthorizedError(
    ErrorCodes.MAGIC_LINK_INVALID.message,
    ErrorCodes.MAGIC_LINK_INVALID.code
  );
}

// ============================================================================
// Authorization Error Factories
// ============================================================================

/**
 * Create a forbidden error (403)
 * @param action - Optional action description (e.g., 'delete this task')
 */
export function forbiddenError(action?: string): ForbiddenError {
  const message = action ? `You do not have permission to ${action}` : ErrorCodes.FORBIDDEN.message;
  return new ForbiddenError(message, undefined);
}

/**
 * Create an insufficient role error (403)
 * @param requiredRole - The role that is required
 */
export function insufficientRoleError(requiredRole: string): ForbiddenError {
  return new ForbiddenError(`This action requires the "${requiredRole}" role`, { requiredRole });
}

/**
 * Create an organization access denied error (403)
 */
export function organizationAccessDeniedError(): ForbiddenError {
  return new ForbiddenError(ErrorCodes.ORGANIZATION_ACCESS_DENIED.message, undefined);
}

/**
 * Create a feature not available error (403)
 * @param feature - Name of the feature
 * @param requiredPlan - Plan that includes this feature
 */
export function featureNotAvailableError(feature: string, requiredPlan?: string): ForbiddenError {
  const message = requiredPlan
    ? `The "${feature}" feature requires the ${requiredPlan} plan`
    : `The "${feature}" feature is not available on your current plan`;
  return new ForbiddenError(message, { requiredPlan });
}

/**
 * Create a subscription required error (402)
 */
export function subscriptionRequiredError(requiredPlan?: string): PaymentRequiredError {
  return new PaymentRequiredError(ErrorCodes.SUBSCRIPTION_REQUIRED.message, { requiredPlan });
}

// ============================================================================
// Not Found Error Factories
// ============================================================================

/**
 * Create a generic not found error (404)
 * @param resource - Type of resource (e.g., 'User', 'Task')
 * @param id - Optional resource identifier
 */
export function notFoundError(resource: string, id?: string): NotFoundError {
  const message = id ? `${resource} with ID "${id}" not found` : `${resource} not found`;
  return new NotFoundError(message, {
    resourceType: resource,
    resourceId: id,
  });
}

/**
 * Create a user not found error (404)
 */
export function userNotFoundError(userId?: string): NotFoundError {
  return notFoundError('User', userId);
}

/**
 * Create an organization not found error (404)
 */
export function organizationNotFoundError(orgId?: string): NotFoundError {
  return notFoundError('Organization', orgId);
}

/**
 * Create a task not found error (404)
 */
export function taskNotFoundError(taskId?: string): NotFoundError {
  return notFoundError('Task', taskId);
}

/**
 * Create a recording not found error (404)
 */
export function recordingNotFoundError(recordingId?: string): NotFoundError {
  return notFoundError('Recording', recordingId);
}

/**
 * Create an invitation not found error (404)
 */
export function invitationNotFoundError(invitationId?: string): NotFoundError {
  return notFoundError('Invitation', invitationId);
}

/**
 * Create a template not found error (404)
 */
export function templateNotFoundError(templateId?: string): NotFoundError {
  return notFoundError('Template', templateId);
}

// ============================================================================
// Validation Error Factories
// ============================================================================

/**
 * Field validation error structure
 */
export interface FieldError {
  field: string;
  message: string;
  code?: string;
}

/**
 * Create a validation error (400/422)
 * @param errors - Array of field errors or single error message
 */
export function validationError(errors: FieldError[] | string): ValidationError {
  if (typeof errors === 'string') {
    return new ValidationError(errors, undefined);
  }

  const message =
    errors.length === 1 && errors[0]
      ? errors[0].message
      : `Validation failed for ${errors.length} field${errors.length === 1 ? '' : 's'}`;

  return new ValidationError(message, { fields: errors });
}

/**
 * Create a required field error (400)
 * @param field - Name of the required field
 */
export function requiredFieldError(field: string): ValidationError {
  return new ValidationError(`${field} is required`, {
    field,
    fields: [{ field, message: `${field} is required` }],
  });
}

/**
 * Create an invalid format error (400)
 * @param field - Name of the field with invalid format
 * @param expectedFormat - Description of expected format
 */
export function invalidFormatError(field: string, expectedFormat?: string): ValidationError {
  const message = expectedFormat
    ? `${field} has invalid format. Expected: ${expectedFormat}`
    : `${field} has invalid format`;
  return new ValidationError(message, {
    field,
    fields: [{ field, message }],
  });
}

/**
 * Create an invalid email error (400)
 */
export function invalidEmailError(): ValidationError {
  return new ValidationError(ErrorCodes.INVALID_EMAIL.message, {
    field: 'email',
    fields: [{ field: 'email', message: ErrorCodes.INVALID_EMAIL.message }],
  });
}

/**
 * Create an invalid password error (400)
 * @param requirements - Optional password requirements description
 */
export function invalidPasswordError(requirements?: string): ValidationError {
  const message = requirements
    ? `${ErrorCodes.INVALID_PASSWORD.message}. ${requirements}`
    : ErrorCodes.INVALID_PASSWORD.message;
  return new ValidationError(message, {
    field: 'password',
    fields: [{ field: 'password', message }],
  });
}

/**
 * Create an invalid file type error (400)
 * @param allowedTypes - List of allowed file types
 */
export function invalidFileTypeError(allowedTypes?: string[]): ValidationError {
  const message = allowedTypes
    ? `File type is not supported. Allowed types: ${allowedTypes.join(', ')}`
    : ErrorCodes.INVALID_FILE_TYPE.message;
  return new ValidationError(message, { allowedTypes });
}

/**
 * Create a file too large error (400)
 * @param maxSize - Maximum allowed size (e.g., '10MB')
 */
export function fileTooLargeError(maxSize?: string): ValidationError {
  const message = maxSize
    ? `File size exceeds maximum allowed (${maxSize})`
    : ErrorCodes.FILE_TOO_LARGE.message;
  return new ValidationError(message, { maxSize });
}

// ============================================================================
// Conflict Error Factories
// ============================================================================

/**
 * Create a duplicate resource error (409)
 * @param resource - Type of resource
 * @param identifier - The conflicting identifier (e.g., email, name)
 */
export function duplicateResourceError(resource: string, identifier?: string): ConflictError {
  const message = identifier
    ? `A ${resource} with "${identifier}" already exists`
    : ErrorCodes.DUPLICATE_RESOURCE.message;
  return new ConflictError(message, {
    conflictType: 'DUPLICATE',
    conflictingResource: resource,
  });
}

/**
 * Create an email already exists error (409)
 */
export function emailExistsError(): ConflictError {
  return new ConflictError(ErrorCodes.EMAIL_ALREADY_EXISTS.message, {
    conflictType: 'DUPLICATE',
    conflictingResource: 'email',
  });
}

/**
 * Create a version conflict error (409) for optimistic locking
 * @param expectedVersion - The expected version
 * @param actualVersion - The actual version found
 */
export function versionConflictError(
  expectedVersion?: number,
  actualVersion?: number
): ConflictError {
  return new ConflictError(ErrorCodes.VERSION_CONFLICT.message, {
    conflictType: 'VERSION_MISMATCH',
    expectedVersion,
    actualVersion,
  });
}

// ============================================================================
// Rate Limit Error Factories
// ============================================================================

/**
 * Create a rate limit exceeded error (429)
 * @param retryAfter - Seconds until retry is allowed
 */
export function rateLimitError(retryAfter?: number): TooManyRequestsError {
  return new TooManyRequestsError(ErrorCodes.RATE_LIMIT_EXCEEDED.message, {
    retryAfter,
  });
}

/**
 * Create a quota exceeded error (429)
 * @param quotaType - Type of quota exceeded
 * @param limit - The quota limit
 */
export function quotaExceededError(
  quotaType: 'storage' | 'recordings' | 'members' | 'api',
  limit?: number
): TooManyRequestsError {
  const messages: Record<string, string> = {
    storage: ErrorCodes.STORAGE_QUOTA_EXCEEDED.message,
    recordings: ErrorCodes.RECORDING_LIMIT_EXCEEDED.message,
    members: ErrorCodes.MEMBER_LIMIT_EXCEEDED.message,
    api: ErrorCodes.API_QUOTA_EXCEEDED.message,
  };
  return new TooManyRequestsError(messages[quotaType], { limit });
}

// ============================================================================
// External Service Error Factories
// ============================================================================

/**
 * Create an external service error (502)
 * @param service - Name of the service that failed
 * @param error - Original error message
 */
export function externalServiceError(service: string, error?: string): BadGatewayError {
  const message = `${service} service is currently unavailable`;
  return new BadGatewayError(message, {
    upstreamService: service,
    upstreamError: error,
  });
}

/**
 * Create a storage service error (502)
 */
export function storageServiceError(error?: string): BadGatewayError {
  return new BadGatewayError(ErrorCodes.STORAGE_SERVICE_ERROR.message, {
    upstreamService: 'storage',
    upstreamError: error,
  });
}

/**
 * Create an AI service error (502)
 */
export function aiServiceError(error?: string): BadGatewayError {
  return new BadGatewayError(ErrorCodes.AI_SERVICE_ERROR.message, {
    upstreamService: 'ai-analysis',
    upstreamError: error,
  });
}

/**
 * Create a transcription service error (502)
 */
export function transcriptionServiceError(error?: string): BadGatewayError {
  return new BadGatewayError(ErrorCodes.TRANSCRIPTION_SERVICE_ERROR.message, {
    upstreamService: 'transcription',
    upstreamError: error,
  });
}

/**
 * Create a service timeout error (504)
 * @param service - Name of the service that timed out
 */
export function serviceTimeoutError(service?: string): GatewayTimeoutError {
  const message = service
    ? `${service} request timed out`
    : ErrorCodes.EXTERNAL_SERVICE_TIMEOUT.message;
  return new GatewayTimeoutError(message);
}

// ============================================================================
// Server Error Factories
// ============================================================================

/**
 * Create an internal server error (500)
 * @param message - Optional message (hidden in production)
 */
export function internalError(message?: string): InternalServerError {
  return new InternalServerError(message || ErrorCodes.INTERNAL_ERROR.message);
}

/**
 * Create a database error (500)
 */
export function databaseError(): InternalServerError {
  return new InternalServerError(ErrorCodes.DATABASE_ERROR.message);
}

/**
 * Create a service unavailable error (503)
 * @param reason - Optional reason for unavailability
 * @param retryAfter - Seconds until service should be available
 */
export function serviceUnavailableError(
  reason?: string,
  retryAfter?: number
): ServiceUnavailableError {
  return new ServiceUnavailableError(reason || ErrorCodes.SERVICE_UNAVAILABLE.message, {
    reason,
    retryAfter,
  });
}

/**
 * Create a maintenance mode error (503)
 * @param retryAfter - Estimated seconds until maintenance completes
 */
export function maintenanceModeError(retryAfter?: number): ServiceUnavailableError {
  return new ServiceUnavailableError(ErrorCodes.MAINTENANCE_MODE.message, {
    reason: 'maintenance',
    retryAfter,
  });
}

// ============================================================================
// Utility Functions
// ============================================================================

/**
 * Wrap an async function to catch errors and convert to AppError
 * Useful for service layer functions
 */
export function catchError<T extends (...args: any[]) => Promise<any>>(
  fn: T,
  defaultError?: ErrorCodeKey
): T {
  return (async (...args: Parameters<T>) => {
    try {
      return await fn(...args);
    } catch (error) {
      if (error instanceof AppError) {
        throw error;
      }
      if (defaultError) {
        throw createError(defaultError);
      }
      throw internalError(error instanceof Error ? error.message : String(error));
    }
  }) as T;
}

/**
 * Assert a condition and throw an error if false
 * Useful for guard clauses
 */
export function assertOrThrow(
  condition: boolean,
  errorCode: ErrorCodeKey,
  message?: string
): asserts condition {
  if (!condition) {
    throw createError(errorCode, message);
  }
}

/**
 * Assert a value exists (not null/undefined) or throw not found
 */
export function assertFound<T>(
  value: T | null | undefined,
  resource: string,
  id?: string
): asserts value is T {
  if (value === null || value === undefined) {
    throw notFoundError(resource, id);
  }
}

/**
 * Assert user has permission or throw forbidden
 */
export function assertPermission(hasPermission: boolean, action?: string): asserts hasPermission {
  if (!hasPermission) {
    throw forbiddenError(action);
  }
}
