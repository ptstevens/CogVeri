/**
 * S3 Client Configuration
 *
 * Centralized S3/R2 client factory to avoid code duplication (Fix #13)
 * across recording service, transcription processor, and other file storage consumers.
 *
 * Storage Structure (org-scoped):
 *   {bucket}/{orgSlug}/recordings/{taskId}/{recordingId}/video.webm
 *   {bucket}/{orgSlug}/recordings/{recordingId}/thumbnails/thumbnail.jpg
 *   {bucket}/{orgSlug}/recordings/{recordingId}/variants/{quality}.mp4
 *   {bucket}/{orgSlug}/rubrics/{tempVideoId}/{filename}
 *
 * Buckets:
 *   - Production: cogveri-main (set via AWS_S3_BUCKET)
 *   - Staging: cogveri-staging (set via AWS_S3_BUCKET)
 */

import { S3Client, S3ClientConfig } from '@aws-sdk/client-s3';
import { logger } from '../utils/logger';

/**
 * @deprecated Use org-scoped path functions instead (generateRecordingKey, etc.)
 * Kept for backward compatibility during migration.
 */
export const RECORDINGS_PREFIX = 'cogveri-recordings';

/**
 * S3 client singleton instance
 */
let s3ClientInstance: S3Client | null = null;

/**
 * Whether S3 storage is configured and available
 */
let s3Configured = false;

/**
 * Initialize the S3 client (call once at startup)
 */
export function initializeS3Client(): void {
  if (s3ClientInstance) {
    logger.debug('S3 client already initialized');
    return;
  }

  // Check for required configuration
  if (!process.env.AWS_ACCESS_KEY_ID || !process.env.AWS_SECRET_ACCESS_KEY) {
    logger.info('S3 storage not configured - missing AWS credentials');
    s3Configured = false;
    return;
  }

  if (!process.env.AWS_S3_BUCKET) {
    logger.info('S3 storage not configured - missing AWS_S3_BUCKET');
    s3Configured = false;
    return;
  }

  try {
    const s3Config: S3ClientConfig = {
      region: process.env.AWS_REGION || 'auto',
      credentials: {
        accessKeyId: process.env.AWS_ACCESS_KEY_ID,
        secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
      },
    };

    // Add custom endpoint for Cloudflare R2 or other S3-compatible storage
    if (process.env.AWS_ENDPOINT_URL) {
      s3Config.endpoint = process.env.AWS_ENDPOINT_URL;
      s3Config.forcePathStyle = true; // Required for R2 and many S3-compatible services
      logger.info(`S3-compatible storage configured with endpoint: ${process.env.AWS_ENDPOINT_URL}`);
    }

    s3ClientInstance = new S3Client(s3Config);
    s3Configured = true;

    logger.info('S3/R2 storage client initialized successfully', {
      bucket: process.env.AWS_S3_BUCKET,
      region: process.env.AWS_REGION || 'auto',
      customEndpoint: !!process.env.AWS_ENDPOINT_URL,
    });
  } catch (error) {
    logger.error('Failed to initialize S3 client:', error);
    s3ClientInstance = null;
    s3Configured = false;
  }
}

/**
 * Get the S3 client instance
 * Returns null if S3 is not configured
 */
export function getS3Client(): S3Client | null {
  if (!s3ClientInstance && !s3Configured) {
    // Try to initialize if not already attempted
    initializeS3Client();
  }
  return s3ClientInstance;
}

/**
 * Check if S3 storage is available
 */
export function isS3Available(): boolean {
  if (!s3ClientInstance && !s3Configured) {
    initializeS3Client();
  }
  return s3Configured && s3ClientInstance !== null;
}

/**
 * Get the configured S3 bucket name
 */
export function getS3Bucket(): string | undefined {
  return process.env.AWS_S3_BUCKET;
}


/**
 * Get the public URL base for S3 objects (if CDN is configured)
 */
export function getS3PublicUrlBase(): string | undefined {
  return process.env.AWS_S3_PUBLIC_URL || process.env.CDN_URL;
}

/**
 * Resolve bucket for an organization.
 * With the new folder-based isolation, all orgs share the same environment bucket.
 * Org isolation is achieved via folder prefixes (orgSlug/recordings/...).
 *
 * @param _organizationId - Kept for backward compatibility, not used
 * @returns The configured S3 bucket name
 */
export function resolveOrganizationBucket(
  _organizationId?: string | null
): string {
  const bucket = getS3Bucket();
  if (!bucket) {
    throw new Error('No bucket configured - set AWS_S3_BUCKET environment variable');
  }
  return bucket;
}

/**
 * Get bucket for a recording by checking the recording's storage_bucket field
 * or resolving from organization.
 */
export function getRecordingBucket(
  storageBucket: string | null | undefined,
  organizationId: string | null | undefined
): string {
  // If recording has explicit bucket, use it
  if (storageBucket) {
    return storageBucket;
  }

  // Otherwise resolve from organization
  return resolveOrganizationBucket(organizationId);
}

/**
 * Get the org-scoped prefix for recordings.
 * Example: "cogveri-system/recordings"
 */
export function getOrgRecordingsPrefix(orgSlug: string): string {
  return `${orgSlug}/recordings`;
}

/**
 * Get the org-scoped prefix for rubrics.
 * Example: "cogveri-system/rubrics"
 */
export function getOrgRubricsPrefix(orgSlug: string): string {
  return `${orgSlug}/rubrics`;
}

/**
 * Generate an S3 key for a recording file.
 * Path: {orgSlug}/recordings/{taskId}/{recordingId}/{filename}
 */
export function generateRecordingKey(
  orgSlug: string,
  taskId: string,
  recordingId: string,
  filename: string
): string {
  return `${orgSlug}/recordings/${taskId}/${recordingId}/${filename}`;
}

/**
 * Generate an S3 key for a thumbnail.
 * Path: {orgSlug}/recordings/{recordingId}/thumbnails/{filename}
 */
export function generateThumbnailKey(
  orgSlug: string,
  recordingId: string,
  filename: string = 'thumbnail.jpg'
): string {
  return `${orgSlug}/recordings/${recordingId}/thumbnails/${filename}`;
}

/**
 * Generate an S3 key for a transcoded video variant.
 * Path: {orgSlug}/recordings/{recordingId}/variants/{variant}.{extension}
 */
export function generateTranscodeKey(
  orgSlug: string,
  recordingId: string,
  variant: string,
  extension: string = 'mp4'
): string {
  return `${orgSlug}/recordings/${recordingId}/variants/${variant}.${extension}`;
}

/**
 * Generate an S3 key for a rubric template video.
 * Path: {orgSlug}/rubrics/{tempVideoId}/{filename}
 */
export function generateRubricVideoKey(
  orgSlug: string,
  tempVideoId: string,
  filename: string
): string {
  return `${orgSlug}/rubrics/${tempVideoId}/${filename}`;
}

/**
 * Generate an S3 key for a temporary file (org-scoped).
 * Path: {orgSlug}/temp/{prefix}/{timestamp}-{random}-{filename}
 */
export function generateTempKey(
  orgSlug: string,
  prefix: string,
  filename: string
): string {
  const timestamp = Date.now();
  const random = Math.random().toString(36).substring(2, 8);
  return `${orgSlug}/temp/${prefix}/${timestamp}-${random}-${filename}`;
}

/**
 * S3 upload options with sensible defaults
 */
export interface S3UploadOptions {
  contentType?: string;
  cacheControl?: string;
  metadata?: Record<string, string>;
  acl?: 'private' | 'public-read';
}

/**
 * Default upload options for recordings
 */
export const DEFAULT_RECORDING_UPLOAD_OPTIONS: S3UploadOptions = {
  cacheControl: 'max-age=31536000', // 1 year for immutable content
  acl: 'private',
};

/**
 * Default upload options for public assets
 */
export const DEFAULT_PUBLIC_ASSET_OPTIONS: S3UploadOptions = {
  cacheControl: 'max-age=86400', // 1 day
  acl: 'public-read',
};

// Initialize S3 client on module load (lazy initialization)
// The actual initialization will happen on first use via getS3Client()
