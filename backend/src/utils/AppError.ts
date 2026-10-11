/**
 * Application Error Classes
 *
 * Provides typed error classes for consistent error handling across the application.
 * FIX #28: Replaced `any` with generic types for type safety.
 */

/**
 * Base error data that can be attached to errors
 */
export interface ErrorData {
  [key: string]: unknown;
}

/**
 * Base application error class with type-safe data
 */
export class AppError<T extends ErrorData = ErrorData> extends Error {
  public readonly statusCode: number;
  public readonly isOperational: boolean;
  public readonly data?: T;
  public readonly code?: string;
  public readonly timestamp: Date;

  constructor(message: string, statusCode: number, data?: T, code?: string) {
    super(message);
    this.name = this.constructor.name;
    this.statusCode = statusCode;
    this.isOperational = true;
    this.data = data;
    this.code = code;
    this.timestamp = new Date();

    // Maintains proper stack trace for where error was thrown
    Error.captureStackTrace(this, this.constructor);
  }

  /**
   * Serialize error for API response
   */
  toJSON(): Record<string, unknown> {
    return {
      error: this.name,
      message: this.message,
      statusCode: this.statusCode,
      code: this.code,
      data: this.data,
      timestamp: this.timestamp.toISOString(),
    };
  }
}

/**
 * 400 Bad Request - Invalid input or malformed request
 */
export class BadRequestError<T extends ErrorData = ErrorData> extends AppError<T> {
  constructor(message: string = 'Bad Request', data?: T, code?: string) {
    super(message, 400, data, code || 'BAD_REQUEST');
  }
}

/**
 * 401 Unauthorized - Authentication required or failed
 */
export class UnauthorizedError extends AppError {
  constructor(message: string = 'Unauthorized', code?: string) {
    super(message, 401, undefined, code || 'UNAUTHORIZED');
  }
}

/**
 * 402 Payment Required - Payment needed to access resource
 */
export interface PaymentRequiredData extends ErrorData {
  requiredPlan?: string;
  currentPlan?: string;
  upgradeUrl?: string;
}

export class PaymentRequiredError extends AppError<PaymentRequiredData> {
  constructor(message: string = 'Payment required', data?: PaymentRequiredData) {
    super(message, 402, data, 'PAYMENT_REQUIRED');
  }
}

/**
 * 403 Forbidden - Authenticated but not authorized
 */
export interface ForbiddenData extends ErrorData {
  requiredRole?: string;
  requiredPermission?: string;
}

export class ForbiddenError extends AppError<ForbiddenData> {
  constructor(message: string = 'Forbidden', data?: ForbiddenData) {
    super(message, 403, data, 'FORBIDDEN');
  }
}

/**
 * 404 Not Found - Resource doesn't exist
 */
export interface NotFoundData extends ErrorData {
  resourceType?: string;
  resourceId?: string;
}

export class NotFoundError extends AppError<NotFoundData> {
  constructor(message: string = 'Resource not found', data?: NotFoundData) {
    super(message, 404, data, 'NOT_FOUND');
  }
}

/**
 * 409 Conflict - Resource state conflict (e.g., optimistic locking, duplicate)
 */
export interface ConflictData extends ErrorData {
  conflictType?: 'VERSION_MISMATCH' | 'DUPLICATE' | 'STATE_CONFLICT';
  expectedVersion?: number;
  actualVersion?: number;
  conflictingResource?: string;
}

export class ConflictError extends AppError<ConflictData> {
  constructor(message: string = 'Resource conflict', data?: ConflictData) {
    super(message, 409, data, 'CONFLICT');
  }
}

/**
 * Organization exists error - special case for domain-based org matching
 */
export interface OrganizationExistsData extends ErrorData {
  organizationName: string;
  subscriberEmail: string;
  subscriberName?: string;
  errorCode: 'ORGANIZATION_EXISTS_MULTI_MEMBER';
}

export class OrganizationExistsError extends AppError<OrganizationExistsData> {
  constructor(organizationName: string, subscriberEmail: string, subscriberName?: string) {
    const maskedEmail = maskEmail(subscriberEmail);
    const contactName = subscriberName || 'the account administrator';

    super(
      `An organization for your domain already exists. Please contact ${contactName} (${maskedEmail}) to request an invitation.`,
      409,
      {
        organizationName,
        subscriberEmail: maskedEmail,
        subscriberName: contactName,
        errorCode: 'ORGANIZATION_EXISTS_MULTI_MEMBER',
      },
      'ORGANIZATION_EXISTS'
    );
  }
}

/**
 * Helper to mask email for privacy (show first 2 chars + domain)
 */
function maskEmail(email: string): string {
  const [local, domain] = email.split('@');
  if (!domain || !local) return email;
  const maskedLocal =
    local.length > 2 ? local.substring(0, 2) + '***' : local.substring(0, 1) + '***';
  return `${maskedLocal}@${domain}`;
}

/**
 * 422 Unprocessable Entity - Validation failed
 */
export interface ValidationErrorData extends ErrorData {
  field?: string;
  fields?: Array<{ field: string; message: string }>;
}

export class ValidationError extends AppError<ValidationErrorData> {
  constructor(message: string = 'Validation failed', data?: ValidationErrorData) {
    super(message, 422, data, 'VALIDATION_ERROR');
  }
}

/**
 * 429 Too Many Requests - Rate limit exceeded
 */
export interface RateLimitData extends ErrorData {
  retryAfter?: number;
  limit?: number;
  windowMs?: number;
}

export class TooManyRequestsError extends AppError<RateLimitData> {
  constructor(message: string = 'Too many requests', data?: RateLimitData) {
    super(message, 429, data, 'RATE_LIMIT_EXCEEDED');
  }
}

/**
 * 500 Internal Server Error - Unexpected server error
 */
export class InternalServerError extends AppError {
  constructor(message: string = 'Internal server error') {
    super(message, 500, undefined, 'INTERNAL_ERROR');
  }
}

/**
 * 502 Bad Gateway - Upstream service error
 */
export interface BadGatewayData extends ErrorData {
  upstreamService?: string;
  upstreamError?: string;
}

export class BadGatewayError extends AppError<BadGatewayData> {
  constructor(message: string = 'Bad gateway', data?: BadGatewayData) {
    super(message, 502, data, 'BAD_GATEWAY');
  }
}

/**
 * 503 Service Unavailable - Service temporarily down
 */
export interface ServiceUnavailableData extends ErrorData {
  retryAfter?: number;
  reason?: string;
}

export class ServiceUnavailableError extends AppError<ServiceUnavailableData> {
  constructor(message: string = 'Service temporarily unavailable', data?: ServiceUnavailableData) {
    super(message, 503, data, 'SERVICE_UNAVAILABLE');
  }
}

/**
 * 504 Gateway Timeout - Upstream timeout
 */
export class GatewayTimeoutError extends AppError {
  constructor(message: string = 'Gateway timeout') {
    super(message, 504, undefined, 'GATEWAY_TIMEOUT');
  }
}

/**
 * Type guard to check if an error is an AppError
 */
export function isAppError(error: unknown): error is AppError {
  return error instanceof AppError;
}

/**
 * Type guard to check if error is operational (vs programming error)
 */
export function isOperationalError(error: unknown): boolean {
  if (isAppError(error)) {
    return error.isOperational;
  }
  return false;
}

/**
 * Convert unknown error to AppError
 */
export function toAppError(error: unknown): AppError {
  if (isAppError(error)) {
    return error;
  }

  if (error instanceof Error) {
    return new InternalServerError(error.message);
  }

  return new InternalServerError(String(error));
}
