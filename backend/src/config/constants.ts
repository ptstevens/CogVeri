/**
 * Application Constants
 *
 * Centralized configuration for magic numbers and default values used throughout the backend.
 * This file extracts hardcoded values from the codebase to improve maintainability and consistency.
 *
 * Usage:
 *   import { PAGINATION, FILE_LIMITS, TIMEOUTS } from '../config/constants';
 *
 * Note: Environment-variable-driven values should remain in their respective config files.
 * This file contains defaults and fixed values that are used when env vars are not set.
 */

// =============================================================================
// Pagination
// =============================================================================

export const PAGINATION = {
  /** Default number of items per page */
  DEFAULT_PAGE_SIZE: 20,

  /** Maximum allowed items per page to prevent abuse */
  MAX_PAGE_SIZE: 100,

  /** Minimum allowed items per page */
  MIN_PAGE_SIZE: 1,

  /** Default starting page (1-indexed) */
  DEFAULT_PAGE: 1,

  /** Default page size for tasks */
  DEFAULT_TASKS_PER_PAGE: 50,

  /** Maximum tasks per page */
  MAX_TASKS_PER_PAGE: 100,

  /** Default page size for search results */
  DEFAULT_SEARCH_LIMIT: 20,

  /** Maximum search results per page */
  MAX_SEARCH_LIMIT: 100,

  /** Maximum users returned per query */
  MAX_USERS_PER_QUERY: 500,
} as const;

// =============================================================================
// File Limits
// =============================================================================

export const FILE_LIMITS = {
  /** Maximum video file size in bytes (500MB) */
  MAX_VIDEO_SIZE_BYTES: 500 * 1024 * 1024,

  /** Maximum request body size for JSON/form data */
  MAX_REQUEST_BODY_SIZE: '10mb',

  /** Maximum path length for file operations */
  MAX_PATH_LENGTH: 4096,
} as const;

// =============================================================================
// Time Constants (in milliseconds unless otherwise noted)
// =============================================================================

export const TIMEOUTS = {
  /** Cache lookup timeout */
  CACHE_MS: 1000,

  /** Database query timeout */
  DATABASE_MS: 5000,

  /** Internal service call timeout */
  SERVICE_MS: 10000,

  /** External API call timeout */
  EXTERNAL_API_MS: 30000,

  /** File I/O operation timeout */
  FILE_IO_MS: 60000,

  /** Long-running operation timeout (5 minutes) */
  LONG_RUNNING_MS: 300000,

  /** FFmpeg default timeout (30 minutes) */
  FFMPEG_DEFAULT_MS: 30 * 60 * 1000,

  /** Transcription max wait time (30 minutes) */
  TRANSCRIPTION_MAX_WAIT_MS: 30 * 60 * 1000,

  /** Redis connect timeout */
  REDIS_CONNECT_MS: 5000,

  /** Redis command timeout */
  REDIS_COMMAND_MS: 5000,

  /** Database connection timeout */
  DB_CONNECTION_MS: 10000,

  /** Database pool acquire timeout */
  DB_POOL_ACQUIRE_MS: 30000,

  /** Database pool idle timeout */
  DB_POOL_IDLE_MS: 30000,

  /** Redis close timeout during shutdown */
  REDIS_CLOSE_MS: 5000,
} as const;

// =============================================================================
// Token Expiration
// =============================================================================

export const TOKEN_EXPIRY = {
  /** Access token expiry */
  ACCESS_TOKEN: '1h',

  /** Refresh token expiry */
  REFRESH_TOKEN: '7d',

  /** Impersonation token expiry */
  IMPERSONATION_TOKEN: '1h',

  /** User token invalidation TTL in seconds (7 days) */
  USER_TOKEN_INVALIDATION_TTL_SECONDS: 604800,

  /** S3 signed URL expiry for downloads (1 hour in seconds) */
  S3_SIGNED_URL_DOWNLOAD_SECONDS: 3600,

  /** S3 signed URL expiry for playback (24 hours in seconds) */
  S3_SIGNED_URL_PLAYBACK_SECONDS: 3600 * 24,

  /** S3 signed URL expiry for long-term access (7 days in seconds) */
  S3_SIGNED_URL_LONG_TERM_SECONDS: 3600 * 24 * 7,

  /** CDN signed URL default expiry (24 hours in seconds) */
  CDN_SIGNED_URL_DEFAULT_SECONDS: 24 * 60 * 60,

  /** Multipart upload presigned URL expiry (1 hour in seconds) */
  MULTIPART_UPLOAD_URL_EXPIRY_SECONDS: 3600,
} as const;

// =============================================================================
// Invitation and Magic Link Expiry
// =============================================================================

export const INVITATION_EXPIRY = {
  /** Organization invitation expiry in hours (7 days) */
  INVITATION_EXPIRY_HOURS: 7 * 24,

  /** Default magic link expiry in days */
  DEFAULT_MAGIC_LINK_EXPIRY_DAYS: 30,

  /** Maximum magic link expiry in days */
  MAX_MAGIC_LINK_EXPIRY_DAYS: 365,

  /** Domain verification expiry in hours */
  DOMAIN_VERIFICATION_EXPIRY_HOURS: 24,

  /** Admin impersonation token expiry in hours */
  ADMIN_IMPERSONATION_EXPIRY_HOURS: 1,

  /** Transfer token expiry in hours */
  TRANSFER_TOKEN_EXPIRY_HOURS: 48,
} as const;

// =============================================================================
// Trial and Subscription
// =============================================================================

export const SUBSCRIPTION = {
  /** Trial period in days (Stripe default) */
  TRIAL_PERIOD_DAYS: 14,

  /** Internal trial duration in days */
  INTERNAL_TRIAL_DURATION_DAYS: 7,

  /** Grace period for failed payments before suspension in days */
  GRACE_PERIOD_DAYS: 7,

  /** Default subscription period in days */
  DEFAULT_SUBSCRIPTION_PERIOD_DAYS: 30,
} as const;

// =============================================================================
// Rate Limiting
// =============================================================================

export const RATE_LIMITS = {
  /** Default rate limit window in milliseconds (1 minute) */
  DEFAULT_WINDOW_MS: 60000,

  /** Default max requests per window */
  DEFAULT_MAX_REQUESTS: 200,

  /** Auth rate limit window in milliseconds (15 minutes) */
  AUTH_WINDOW_MS: 15 * 60 * 1000,

  /** Auth max requests (production) */
  AUTH_MAX_REQUESTS_PROD: 5,

  /** Auth max requests (development) */
  AUTH_MAX_REQUESTS_DEV: 100,

  /** Upload rate limit window in milliseconds (1 hour) */
  UPLOAD_WINDOW_MS: 60 * 60 * 1000,

  /** Max uploads per window */
  UPLOAD_MAX_REQUESTS: 10,

  /** Magic link rate limit window in milliseconds (1 minute) */
  MAGIC_LINK_WINDOW_MS: 60 * 1000,

  /** Magic link max requests (production) */
  MAGIC_LINK_MAX_REQUESTS_PROD: 10,

  /** Magic link max requests (development) */
  MAGIC_LINK_MAX_REQUESTS_DEV: 60,

  /** Token validation rate limit window in milliseconds (1 minute) */
  TOKEN_VALIDATION_WINDOW_MS: 60 * 1000,

  /** Token validation max requests (production) */
  TOKEN_VALIDATION_MAX_REQUESTS_PROD: 5,

  /** Token validation max requests (development) */
  TOKEN_VALIDATION_MAX_REQUESTS_DEV: 30,
} as const;

// =============================================================================
// Queue Configuration
// =============================================================================

export const QUEUE = {
  /** Default job retry attempts */
  DEFAULT_JOB_ATTEMPTS: 3,

  /** Email job retry attempts */
  EMAIL_JOB_ATTEMPTS: 5,

  /** Transcription job retry attempts */
  TRANSCRIPTION_JOB_ATTEMPTS: 2,

  /** Analysis job retry attempts */
  ANALYSIS_JOB_ATTEMPTS: 2,

  /** Transcode job retry attempts */
  TRANSCODE_JOB_ATTEMPTS: 2,

  /** Thumbnail job retry attempts */
  THUMBNAIL_JOB_ATTEMPTS: 3,

  /** Frame extraction job retry attempts */
  FRAME_EXTRACTION_JOB_ATTEMPTS: 3,

  /** Default backoff delay in milliseconds */
  DEFAULT_BACKOFF_DELAY_MS: 1000,

  /** Email backoff delay in milliseconds */
  EMAIL_BACKOFF_DELAY_MS: 2000,

  /** Transcription backoff delay in milliseconds */
  TRANSCRIPTION_BACKOFF_DELAY_MS: 5000,

  /** Transcode backoff delay in milliseconds */
  TRANSCODE_BACKOFF_DELAY_MS: 10000,

  /** Analysis backoff delay in milliseconds */
  ANALYSIS_BACKOFF_DELAY_MS: 30000,

  /** Completed job retention in seconds (24 hours) */
  COMPLETED_JOB_RETENTION_SECONDS: 24 * 60 * 60,

  /** Failed job retention in seconds (7 days) */
  FAILED_JOB_RETENTION_SECONDS: 7 * 24 * 60 * 60,

  /** Max completed jobs to keep */
  MAX_COMPLETED_JOBS: 1000,

  /** Max completed analysis jobs to keep */
  MAX_COMPLETED_ANALYSIS_JOBS: 500,

  /** Default worker concurrency for email */
  DEFAULT_EMAIL_CONCURRENCY: 5,

  /** Default worker concurrency for transcription */
  DEFAULT_TRANSCRIPTION_CONCURRENCY: 2,

  /** Default worker concurrency for thumbnail */
  DEFAULT_THUMBNAIL_CONCURRENCY: 3,

  /** Default worker concurrency for transcode */
  DEFAULT_TRANSCODE_CONCURRENCY: 1,

  /** Default worker concurrency for analysis */
  DEFAULT_ANALYSIS_CONCURRENCY: 1,

  /** Default worker concurrency for frame extraction */
  DEFAULT_FRAME_EXTRACTION_CONCURRENCY: 2,
} as const;

// =============================================================================
// Cache Configuration
// =============================================================================

export const CACHE = {
  /** Default cache TTL in seconds (5 minutes) */
  DEFAULT_TTL_SECONDS: 300,

  /** Increment counter TTL in seconds (1 minute) */
  INCREMENT_TTL_SECONDS: 60,

  /** Dashboard cache TTL in seconds (5 minutes) */
  DASHBOARD_TTL_SECONDS: 5 * 60,

  /** Observability metrics cache TTL in milliseconds (30 seconds) */
  OBSERVABILITY_CACHE_TTL_MS: 30000,

  /** Pricing tiers cache TTL in milliseconds (1 minute) */
  PRICING_CACHE_TTL_MS: 60000,

  /** Request cache TTL in milliseconds (60 seconds) */
  REQUEST_CACHE_TTL_MS: 60000,

  /** Redis SCAN count for bulk operations */
  REDIS_SCAN_COUNT: 100,

  /** Delete batch size for cache cleanup */
  DELETE_BATCH_SIZE: 100,

  /** Transcription segment batch size */
  TRANSCRIPTION_BATCH_SIZE: 100,

  /** Visual analysis batch size */
  VISUAL_ANALYSIS_BATCH_SIZE: 4,
} as const;

// =============================================================================
// Database Connection Pool
// =============================================================================

export const DB_POOL = {
  /** Minimum connections to keep open */
  MIN_CONNECTIONS: 2,

  /** Maximum connections to create */
  MAX_CONNECTIONS: 10,
} as const;

// =============================================================================
// Redis Configuration
// =============================================================================

export const REDIS = {
  /** Default Redis database number */
  DEFAULT_DB: 0,

  /** Default Redis port */
  DEFAULT_PORT: 6379,

  /** Max retry attempts for Redis connection */
  MAX_RETRY_ATTEMPTS: 5,

  /** Max retries per Redis request */
  MAX_RETRIES_PER_REQUEST: 3,

  /** Max reconnection delay in milliseconds */
  MAX_RECONNECT_DELAY_MS: 2000,
} as const;

// =============================================================================
// Password and Security
// =============================================================================

export const SECURITY = {
  /** Minimum password length */
  MIN_PASSWORD_LENGTH: 8,

  /** Minimum acceptable bcrypt cost factor */
  MIN_BCRYPT_COST_FACTOR: 11,

  /** Stripe webhook max event age in seconds */
  STRIPE_WEBHOOK_MAX_EVENT_AGE_SECONDS: 300,

  /** Circuit breaker reset time in milliseconds (30 seconds) */
  CIRCUIT_BREAKER_RESET_MS: 30000,
} as const;

// =============================================================================
// Time Period Constants (in milliseconds)
// =============================================================================

export const TIME_PERIODS = {
  /** One minute in milliseconds */
  ONE_MINUTE_MS: 60 * 1000,

  /** One hour in milliseconds */
  ONE_HOUR_MS: 60 * 60 * 1000,

  /** One day in milliseconds */
  ONE_DAY_MS: 24 * 60 * 60 * 1000,

  /** One week in milliseconds */
  ONE_WEEK_MS: 7 * 24 * 60 * 60 * 1000,

  /** 30 days in milliseconds */
  THIRTY_DAYS_MS: 30 * 24 * 60 * 60 * 1000,

  /** 90 days in milliseconds */
  NINETY_DAYS_MS: 90 * 24 * 60 * 60 * 1000,

  /** One minute in seconds */
  ONE_MINUTE_SECONDS: 60,

  /** One hour in seconds */
  ONE_HOUR_SECONDS: 3600,

  /** One day in seconds */
  ONE_DAY_SECONDS: 24 * 60 * 60,

  /** One week in seconds */
  ONE_WEEK_SECONDS: 7 * 24 * 60 * 60,
} as const;

// =============================================================================
// Analysis Configuration
// =============================================================================

export const ANALYSIS = {
  /** Default max frames for visual analysis */
  DEFAULT_MAX_FRAMES: 45,

  /** Default max retries for analysis */
  DEFAULT_MAX_RETRIES: 3,

  /** Default retry delay in milliseconds */
  DEFAULT_RETRY_DELAY_MS: 1000,
} as const;

// =============================================================================
// Notification Configuration
// =============================================================================

export const NOTIFICATIONS = {
  /** Default unread notifications limit */
  DEFAULT_UNREAD_LIMIT: 50,
} as const;

// =============================================================================
// Organization Configuration
// =============================================================================

export const ORGANIZATION = {
  /** Default organizations list limit */
  DEFAULT_LIST_LIMIT: 50,
} as const;

// =============================================================================
// Type exports for type safety
// =============================================================================

export type PaginationConfig = typeof PAGINATION;
export type FileLimitsConfig = typeof FILE_LIMITS;
export type TimeoutsConfig = typeof TIMEOUTS;
export type TokenExpiryConfig = typeof TOKEN_EXPIRY;
export type InvitationExpiryConfig = typeof INVITATION_EXPIRY;
export type SubscriptionConfig = typeof SUBSCRIPTION;
export type RateLimitsConfig = typeof RATE_LIMITS;
export type QueueConfig = typeof QUEUE;
export type CacheConfig = typeof CACHE;
export type DbPoolConfig = typeof DB_POOL;
export type RedisConfig = typeof REDIS;
export type SecurityConfig = typeof SECURITY;
export type TimePeriodsConfig = typeof TIME_PERIODS;
export type AnalysisConfig = typeof ANALYSIS;
export type NotificationsConfig = typeof NOTIFICATIONS;
export type OrganizationConfig = typeof ORGANIZATION;
