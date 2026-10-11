/**
 * Bucket Service
 *
 * Manages per-organization R2/S3 buckets for enterprise data isolation.
 * Supports bucket provisioning, resolution, deletion, and data migration.
 *
 * Bucket Naming Convention: {prefix}-{env}-{orgIdShort}
 * Example: cogveri-prod-a1b2c3d4
 */

import { db } from '../config/database';
import { logger } from '../utils/logger';
import { getS3Client, getS3Bucket, RECORDINGS_PREFIX } from '../config/s3';
import {
  CreateBucketCommand,
  DeleteBucketCommand,
  ListObjectsV2Command,
  CopyObjectCommand,
  DeleteObjectCommand,
  HeadBucketCommand,
  PutBucketCorsCommand,
} from '@aws-sdk/client-s3';

// CORS configuration for R2 buckets - allows direct uploads from frontend
// Note: R2 requires specific format - AllowedHeaders must be explicit, not just '*'
const BUCKET_CORS_RULES = [
  {
    ID: 'CogVeriCORS',
    AllowedOrigins: [
      'https://www.cogveri.com',
      'https://cogveri.com',
      'http://localhost:5173',
      'http://localhost:5174',
    ],
    AllowedMethods: ['GET' as const, 'PUT' as const, 'HEAD' as const, 'DELETE' as const],
    AllowedHeaders: ['Content-Type', 'Content-Length', 'x-amz-*', 'Authorization'],
    ExposeHeaders: ['ETag', 'Content-Length', 'Content-Type'],
    MaxAgeSeconds: 3600,
  },
];

export interface OrganizationBucket {
  id: string;
  organization_id: string;
  bucket_name: string;
  region: string;
  status: 'provisioning' | 'active' | 'failed' | 'deleting' | 'deleted';
  error_message?: string;
  metadata: Record<string, unknown>;
  created_at: Date;
  updated_at: Date;
}

export interface ProvisionBucketResult {
  bucketName: string;
  status: 'active' | 'failed';
  error?: string;
}

// Cache for bucket lookups to avoid repeated DB queries
const bucketCache = new Map<string, { bucket: string; expires: number }>();

class BucketService {
  /**
   * Generate a bucket name for an organization.
   * Format: {prefix}-{orgIdShort}
   * R2 limits: 3-63 chars, lowercase alphanumeric + hyphens
   */
  generateBucketName(organizationId: string): string {
    const prefix = process.env.BUCKET_NAME_PREFIX || 'cogveri';
    // Use first 8 chars of UUID for uniqueness
    const orgIdShort = organizationId.replace(/-/g, '').substring(0, 8).toLowerCase();
    const bucketName = `${prefix}-${orgIdShort}`;

    // Validate R2 bucket naming rules
    if (bucketName.length < 3 || bucketName.length > 63) {
      throw new Error(`Invalid bucket name length: ${bucketName.length}`);
    }

    return bucketName;
  }

  /**
   * Provision a new dedicated bucket for an organization.
   * Uses Cloudflare R2 API if available, falls back to S3 CreateBucket.
   */
  async provisionBucket(organizationId: string): Promise<ProvisionBucketResult> {
    const bucketName = this.generateBucketName(organizationId);

    logger.info(`Provisioning bucket for organization: ${organizationId}`, { bucketName });

    // Check if bucket already exists for this org
    const existing = await db('organization_buckets')
      .where('organization_id', organizationId)
      .first();

    if (existing) {
      if (existing.status === 'active') {
        logger.info(`Bucket already exists and active: ${existing.bucket_name}`);
        return { bucketName: existing.bucket_name, status: 'active' };
      }

      // If previous provision failed, retry
      if (existing.status === 'failed') {
        logger.info(`Retrying failed bucket provision: ${existing.bucket_name}`);
        await db('organization_buckets').where('id', existing.id).update({
          status: 'provisioning',
          error_message: null,
          updated_at: new Date(),
        });
      }
    } else {
      // Insert provisioning record
      await db('organization_buckets').insert({
        organization_id: organizationId,
        bucket_name: bucketName,
        region: process.env.AWS_REGION || 'auto',
        status: 'provisioning',
        created_at: new Date(),
        updated_at: new Date(),
      });
    }

    try {
      // Try Cloudflare R2 API first (recommended for R2)
      if (process.env.CLOUDFLARE_ACCOUNT_ID && process.env.CLOUDFLARE_API_TOKEN) {
        await this.createR2Bucket(bucketName);
      } else {
        // Fallback to S3 CreateBucket command
        await this.createS3Bucket(bucketName);
      }

      // Update status to active
      await db('organization_buckets').where('organization_id', organizationId).update({
        status: 'active',
        error_message: null,
        updated_at: new Date(),
      });

      logger.info(`Bucket provisioned successfully: ${bucketName}`);
      return { bucketName, status: 'active' };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      logger.error(`Failed to provision bucket: ${bucketName}`, { error: errorMessage });

      // Update status to failed
      await db('organization_buckets').where('organization_id', organizationId).update({
        status: 'failed',
        error_message: errorMessage,
        updated_at: new Date(),
      });

      return { bucketName, status: 'failed', error: errorMessage };
    }
  }

  /**
   * Create bucket using Cloudflare R2 API.
   */
  private async createR2Bucket(bucketName: string): Promise<void> {
    const accountId = process.env.CLOUDFLARE_ACCOUNT_ID;
    const apiToken = process.env.CLOUDFLARE_API_TOKEN;

    if (!accountId || !apiToken) {
      throw new Error('Cloudflare R2 credentials not configured');
    }

    const response = await fetch(
      `https://api.cloudflare.com/client/v4/accounts/${accountId}/r2/buckets`,
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${apiToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ name: bucketName }),
      }
    );

    if (!response.ok) {
      const errorBody = await response.text();
      // Check if bucket already exists (409 Conflict)
      if (response.status === 409) {
        logger.info(`Bucket already exists in R2: ${bucketName}`);
        // Still configure CORS in case it wasn't set before
        await this.configureBucketCors(bucketName);
        return;
      }
      throw new Error(`Cloudflare R2 API error: ${response.status} ${errorBody}`);
    }

    logger.info(`Created R2 bucket via Cloudflare API: ${bucketName}`);

    // Configure CORS for the new bucket
    await this.configureBucketCors(bucketName);
  }

  /**
   * Configure CORS rules for a bucket.
   * This allows direct uploads from the frontend to R2.
   * Uses Cloudflare API for R2 buckets (more reliable than S3 API for CORS).
   */
  private async configureBucketCors(bucketName: string): Promise<void> {
    const accountId = process.env.CLOUDFLARE_ACCOUNT_ID;
    const apiToken = process.env.CLOUDFLARE_API_TOKEN;

    // Use Cloudflare API if available (recommended for R2)
    if (accountId && apiToken) {
      try {
        await this.configureCorsViaCloudflareApi(bucketName, accountId, apiToken);
        return;
      } catch (error) {
        logger.warn(`Cloudflare API CORS config failed, trying S3 API`, {
          bucket: bucketName,
          error: error instanceof Error ? error.message : 'Unknown error',
        });
      }
    }

    // Fallback to S3 API
    const s3Client = getS3Client();
    if (!s3Client) {
      logger.warn(`S3 client not available, skipping CORS configuration for: ${bucketName}`);
      return;
    }

    try {
      await s3Client.send(
        new PutBucketCorsCommand({
          Bucket: bucketName,
          CORSConfiguration: {
            CORSRules: BUCKET_CORS_RULES,
          },
        })
      );
      logger.info(`Configured CORS for bucket via S3 API: ${bucketName}`);
    } catch (error) {
      logger.error(`Failed to configure CORS for bucket: ${bucketName}`, {
        error: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  }

  /**
   * Configure CORS using Cloudflare R2 API directly.
   */
  private async configureCorsViaCloudflareApi(
    bucketName: string,
    accountId: string,
    apiToken: string
  ): Promise<void> {
    const corsRules = [
      {
        AllowedOrigins: [
          'https://www.cogveri.com',
          'https://cogveri.com',
          'http://localhost:5173',
          'http://localhost:5174',
        ],
        AllowedMethods: ['GET', 'PUT', 'HEAD', 'DELETE'],
        AllowedHeaders: ['*'],
        ExposeHeaders: ['ETag', 'Content-Length', 'Content-Type'],
        MaxAgeSeconds: 3600,
      },
    ];

    const response = await fetch(
      `https://api.cloudflare.com/client/v4/accounts/${accountId}/r2/buckets/${bucketName}/cors`,
      {
        method: 'PUT',
        headers: {
          Authorization: `Bearer ${apiToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ rules: corsRules }),
      }
    );

    if (!response.ok) {
      const errorBody = await response.text();
      throw new Error(`Cloudflare CORS API error: ${response.status} ${errorBody}`);
    }

    logger.info(`Configured CORS for bucket via Cloudflare API: ${bucketName}`);
  }

  /**
   * Create bucket using S3 CreateBucket command (fallback).
   */
  private async createS3Bucket(bucketName: string): Promise<void> {
    const s3Client = getS3Client();
    if (!s3Client) {
      throw new Error('S3 client not available');
    }

    try {
      // Check if bucket already exists
      await s3Client.send(new HeadBucketCommand({ Bucket: bucketName }));
      logger.info(`Bucket already exists: ${bucketName}`);
      // Still configure CORS in case it wasn't set before
      await this.configureBucketCors(bucketName);
      return;
    } catch (error: unknown) {
      // If bucket doesn't exist (404), create it
      const statusCode = (error as { $metadata?: { httpStatusCode?: number } }).$metadata
        ?.httpStatusCode;
      if (statusCode !== 404) {
        throw error;
      }
    }

    await s3Client.send(new CreateBucketCommand({ Bucket: bucketName }));
    logger.info(`Created S3 bucket: ${bucketName}`);

    // Configure CORS for the new bucket
    await this.configureBucketCors(bucketName);
  }

  /**
   * Get the bucket name for an organization.
   *
   * With the new folder-based isolation model, all organizations share
   * the same environment bucket (cogveri-main or cogveri-staging).
   * Organization isolation is achieved via folder prefixes.
   *
   * This method now simply returns the configured bucket.
   *
   * @deprecated The per-org bucket model is deprecated. Use getS3Bucket() directly
   * or resolveOrganizationBucket() from s3.ts for the canonical approach.
   */
  async getBucketForOrganization(_organizationId: string): Promise<string> {
    const defaultBucket = getS3Bucket();
    if (!defaultBucket) {
      throw new Error('No bucket configured - set AWS_S3_BUCKET environment variable');
    }
    return defaultBucket;
  }

  /**
   * Get bucket info from database.
   */
  async getOrganizationBucket(organizationId: string): Promise<OrganizationBucket | null> {
    return await db('organization_buckets').where('organization_id', organizationId).first();
  }

  /**
   * Check if an organization has a dedicated bucket.
   */
  async hasDedicatedBucket(organizationId: string): Promise<boolean> {
    const bucket = await db('organization_buckets')
      .where('organization_id', organizationId)
      .where('status', 'active')
      .first();

    return !!bucket;
  }

  /**
   * Delete a bucket and all its contents.
   * Called when an organization is deleted.
   */
  async deleteBucket(organizationId: string): Promise<void> {
    const orgBucket = await this.getOrganizationBucket(organizationId);

    if (!orgBucket || orgBucket.status !== 'active') {
      logger.info(`No active bucket to delete for organization: ${organizationId}`);
      return;
    }

    const bucketName = orgBucket.bucket_name;
    logger.info(`Deleting bucket for organization: ${organizationId}`, { bucketName });

    // Update status to deleting
    await db('organization_buckets').where('id', orgBucket.id).update({
      status: 'deleting',
      updated_at: new Date(),
    });

    try {
      // Try Cloudflare R2 API first
      if (process.env.CLOUDFLARE_ACCOUNT_ID && process.env.CLOUDFLARE_API_TOKEN) {
        await this.deleteR2Bucket(bucketName);
      } else {
        // Fallback: Empty and delete via S3 commands
        await this.emptyAndDeleteS3Bucket(bucketName);
      }

      // Update status to deleted
      await db('organization_buckets').where('id', orgBucket.id).update({
        status: 'deleted',
        updated_at: new Date(),
      });

      // Clear cache
      bucketCache.delete(organizationId);

      logger.info(`Bucket deleted successfully: ${bucketName}`);
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      logger.error(`Failed to delete bucket: ${bucketName}`, { error: errorMessage });

      // Update status back to active with error
      await db('organization_buckets')
        .where('id', orgBucket.id)
        .update({
          status: 'active',
          error_message: `Delete failed: ${errorMessage}`,
          updated_at: new Date(),
        });

      throw error;
    }
  }

  /**
   * Delete bucket using Cloudflare R2 API.
   * R2 buckets must be empty before deletion.
   */
  private async deleteR2Bucket(bucketName: string): Promise<void> {
    const accountId = process.env.CLOUDFLARE_ACCOUNT_ID;
    const apiToken = process.env.CLOUDFLARE_API_TOKEN;

    if (!accountId || !apiToken) {
      throw new Error('Cloudflare R2 credentials not configured');
    }

    // First empty the bucket via S3 API
    await this.emptyBucket(bucketName);

    // Then delete via Cloudflare API
    const response = await fetch(
      `https://api.cloudflare.com/client/v4/accounts/${accountId}/r2/buckets/${bucketName}`,
      {
        method: 'DELETE',
        headers: {
          Authorization: `Bearer ${apiToken}`,
        },
      }
    );

    if (!response.ok && response.status !== 404) {
      const errorBody = await response.text();
      throw new Error(`Cloudflare R2 API error: ${response.status} ${errorBody}`);
    }

    logger.info(`Deleted R2 bucket via Cloudflare API: ${bucketName}`);
  }

  /**
   * Empty and delete bucket via S3 commands.
   */
  private async emptyAndDeleteS3Bucket(bucketName: string): Promise<void> {
    await this.emptyBucket(bucketName);

    const s3Client = getS3Client();
    if (!s3Client) {
      throw new Error('S3 client not available');
    }

    await s3Client.send(new DeleteBucketCommand({ Bucket: bucketName }));
    logger.info(`Deleted S3 bucket: ${bucketName}`);
  }

  /**
   * Empty all objects from a bucket.
   */
  private async emptyBucket(bucketName: string): Promise<void> {
    const s3Client = getS3Client();
    if (!s3Client) {
      throw new Error('S3 client not available');
    }

    let continuationToken: string | undefined;

    do {
      const listResponse = await s3Client.send(
        new ListObjectsV2Command({
          Bucket: bucketName,
          ContinuationToken: continuationToken,
        })
      );

      if (listResponse.Contents && listResponse.Contents.length > 0) {
        // Delete objects in parallel (up to 1000 at a time per S3 limits)
        await Promise.all(
          listResponse.Contents.map((obj) =>
            s3Client.send(
              new DeleteObjectCommand({
                Bucket: bucketName,
                Key: obj.Key!,
              })
            )
          )
        );

        logger.info(`Deleted ${listResponse.Contents.length} objects from bucket: ${bucketName}`);
      }

      continuationToken = listResponse.NextContinuationToken;
    } while (continuationToken);
  }

  /**
   * Migrate all recordings from shared bucket to organization's dedicated bucket.
   * Used for migrating existing organizations to dedicated buckets.
   */
  async migrateOrganizationData(organizationId: string): Promise<{
    copied: number;
    failed: number;
    errors: string[];
  }> {
    const orgBucket = await this.getOrganizationBucket(organizationId);
    if (!orgBucket || orgBucket.status !== 'active') {
      throw new Error(`No active dedicated bucket for organization: ${organizationId}`);
    }

    const sourceBucket = getS3Bucket();
    if (!sourceBucket) {
      throw new Error('Source bucket not configured');
    }

    const targetBucket = orgBucket.bucket_name;

    if (sourceBucket === targetBucket) {
      logger.info('Source and target buckets are the same, skipping migration');
      return { copied: 0, failed: 0, errors: [] };
    }

    const s3Client = getS3Client();
    if (!s3Client) {
      throw new Error('S3 client not available');
    }

    logger.info(`Starting migration for organization: ${organizationId}`, {
      sourceBucket,
      targetBucket,
    });

    // Get all recordings for this organization
    const recordings = await db('recordings')
      .where('organization_id', organizationId)
      .whereNotNull('storage_key')
      .select('id', 'storage_key', 'storage_bucket');

    let copied = 0;
    let failed = 0;
    const errors: string[] = [];

    for (const recording of recordings) {
      try {
        // Skip if already in target bucket
        if (recording.storage_bucket === targetBucket) {
          continue;
        }

        const sourceKey = recording.storage_key;

        // Copy main recording file
        await s3Client.send(
          new CopyObjectCommand({
            Bucket: targetBucket,
            Key: sourceKey,
            CopySource: `${sourceBucket}/${sourceKey}`,
          })
        );

        // Update recording with new bucket
        await db('recordings').where('id', recording.id).update({
          storage_bucket: targetBucket,
          updated_at: new Date(),
        });

        copied++;

        // Copy related files (variants, thumbnails)
        await this.copyRelatedFiles(s3Client, sourceBucket, targetBucket, recording.id);

        logger.info(`Migrated recording: ${recording.id}`);
      } catch (error) {
        failed++;
        const errorMsg = `Failed to migrate recording ${recording.id}: ${error instanceof Error ? error.message : 'Unknown error'}`;
        errors.push(errorMsg);
        logger.error(errorMsg);
      }
    }

    logger.info(`Migration complete for organization: ${organizationId}`, {
      copied,
      failed,
      totalRecordings: recordings.length,
    });

    return { copied, failed, errors };
  }

  /**
   * Copy related files (variants, thumbnails) for a recording.
   */
  private async copyRelatedFiles(
    s3Client: NonNullable<ReturnType<typeof getS3Client>>,
    sourceBucket: string,
    targetBucket: string,
    recordingId: string
  ): Promise<void> {
    // List objects with recording ID prefix
    const prefixes = [
      `${RECORDINGS_PREFIX}/${recordingId}/variants/`,
      `${RECORDINGS_PREFIX}/${recordingId}/thumbnails/`,
    ];

    for (const prefix of prefixes) {
      const listResponse = await s3Client.send(
        new ListObjectsV2Command({
          Bucket: sourceBucket,
          Prefix: prefix,
        })
      );

      if (listResponse.Contents) {
        await Promise.all(
          listResponse.Contents.map((obj) =>
            s3Client.send(
              new CopyObjectCommand({
                Bucket: targetBucket,
                Key: obj.Key!,
                CopySource: `${sourceBucket}/${obj.Key}`,
              })
            )
          )
        );
      }
    }
  }

  /**
   * Clear the bucket cache (useful for testing).
   */
  clearCache(): void {
    bucketCache.clear();
  }

  /**
   * Configure CORS on all existing organization buckets.
   * Useful for migration when CORS rules are added/changed.
   */
  async configureCorsOnAllBuckets(): Promise<{
    configured: number;
    failed: number;
    errors: string[];
  }> {
    let configured = 0;
    let failed = 0;
    const errors: string[] = [];

    // Configure CORS on all active org buckets
    const orgBuckets = await db('organization_buckets')
      .where('status', 'active')
      .select('bucket_name', 'organization_id');

    for (const bucket of orgBuckets) {
      try {
        await this.configureBucketCors(bucket.bucket_name);
        configured++;
        logger.info(`Configured CORS for org bucket: ${bucket.bucket_name}`);
      } catch (error) {
        failed++;
        const errorMsg = `Failed to configure CORS for ${bucket.bucket_name}: ${error instanceof Error ? error.message : 'Unknown error'}`;
        errors.push(errorMsg);
        logger.error(errorMsg);
      }
    }

    // Also configure the default bucket if it exists
    const defaultBucket = getS3Bucket();
    if (defaultBucket) {
      try {
        await this.configureBucketCors(defaultBucket);
        configured++;
        logger.info(`Configured CORS for default bucket: ${defaultBucket}`);
      } catch (error) {
        failed++;
        const errorMsg = `Failed to configure CORS for default bucket ${defaultBucket}: ${error instanceof Error ? error.message : 'Unknown error'}`;
        errors.push(errorMsg);
        logger.error(errorMsg);
      }
    }

    logger.info(`CORS configuration complete`, { configured, failed });
    return { configured, failed, errors };
  }

  /**
   * Configure CORS on a specific bucket (public method for admin use).
   */
  async configureCorsForBucket(bucketName: string): Promise<void> {
    await this.configureBucketCors(bucketName);
  }
}

export const bucketService = new BucketService();
export default bucketService;
