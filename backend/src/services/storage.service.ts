import { NotFoundError } from '../utils/AppError';
import { logger } from '../utils/logger';
import { db } from '../config/database';
import { PutObjectCommand, ListObjectsV2Command, DeleteObjectsCommand } from '@aws-sdk/client-s3';
import { getS3Client, getS3Bucket } from '../config/s3';

interface StorageMetrics {
  organizationId: string;
  totalBytesUsed: bigint;
  bytesByRecordings: bigint;
  bytesByOther: bigint;
  maxBytesAllowed: bigint;
  percentageUsed: number;
  recordingCount: number;
  fileCount: number;
  usageExceeded: boolean;
  lastCalculatedAt: Date;
}

/**
 * Storage Service
 * Manages storage metrics, quotas, and alerts for organizations
 * Tracks recording storage usage and enforces storage limits
 */
class StorageService {
  /**
   * Initialize storage metrics for a new organization
   */
  async initializeStorageMetrics(organizationId: string, maxStorageGb: number): Promise<void> {
    try {
      const maxBytes = maxStorageGb * 1024 * 1024 * 1024;

      await db('storage_metrics').insert({
        organization_id: organizationId,
        max_bytes_allowed: maxBytes.toString(),
        total_bytes_used: '0',
        bytes_by_recordings: '0',
        bytes_by_other: '0',
        recording_count: 0,
        file_count: 0,
        created_at: new Date(),
        updated_at: new Date(),
      });

      logger.info(`Initialized storage metrics for organization ${organizationId}`);
    } catch (error) {
      logger.error(`Error initializing storage metrics for organization ${organizationId}:`, error);
      throw error;
    }
  }

  /**
   * Get current storage metrics for an organization
   */
  async getStorageMetrics(organizationId: string): Promise<StorageMetrics> {
    try {
      const metrics = await db('storage_metrics').where('organization_id', organizationId).first();

      if (!metrics) {
        throw new NotFoundError('Storage metrics not found for organization');
      }

      const totalBytesUsed = BigInt(metrics.total_bytes_used);
      const maxBytesAllowed = BigInt(metrics.max_bytes_allowed);
      const percentageUsed = Number((totalBytesUsed * 100n) / maxBytesAllowed);

      return {
        organizationId: metrics.organization_id,
        totalBytesUsed,
        bytesByRecordings: BigInt(metrics.bytes_by_recordings),
        bytesByOther: BigInt(metrics.bytes_by_other),
        maxBytesAllowed,
        percentageUsed,
        recordingCount: metrics.recording_count || 0,
        fileCount: metrics.file_count || 0,
        usageExceeded: totalBytesUsed > maxBytesAllowed,
        lastCalculatedAt: metrics.updated_at,
      };
    } catch (error) {
      logger.error(`Error getting storage metrics for organization ${organizationId}:`, error);
      throw error;
    }
  }

  /**
   * Recalculate storage metrics from database
   */
  async recalculateStorageMetrics(organizationId: string): Promise<void> {
    try {
      // Sum all recording file sizes for organization
      const result = await db('recording_file_sizes')
        .where('organization_id', organizationId)
        .whereNull('deleted_at')
        .sum('file_size_bytes as total')
        .first();

      const totalBytes = result?.total || 0;

      // Count recordings and files
      const countResult = await db('recording_file_sizes')
        .where('organization_id', organizationId)
        .whereNull('deleted_at')
        .count('* as count')
        .first();

      const recordingCount = countResult?.count || 0;

      // Update storage metrics
      await db('storage_metrics').where('organization_id', organizationId).update({
        total_bytes_used: totalBytes.toString(),
        bytes_by_recordings: totalBytes.toString(),
        bytes_by_other: '0',
        recording_count: recordingCount,
        updated_at: new Date(),
      });

      logger.info(`Recalculated storage metrics for organization ${organizationId}`);
    } catch (error) {
      logger.error(
        `Error recalculating storage metrics for organization ${organizationId}:`,
        error
      );
      throw error;
    }
  }

  /**
   * Check if organization storage limit is exceeded
   */
  async isStorageLimitExceeded(organizationId: string): Promise<boolean> {
    try {
      const metrics = await this.getStorageMetrics(organizationId);
      return metrics.usageExceeded;
    } catch (error) {
      logger.error(`Error checking storage limit for organization ${organizationId}:`, error);
      throw error;
    }
  }

  /**
   * Get remaining storage for organization
   */
  async getStorageRemaining(organizationId: string): Promise<bigint> {
    try {
      const metrics = await this.getStorageMetrics(organizationId);
      const remaining = metrics.maxBytesAllowed - metrics.totalBytesUsed;
      return remaining > 0n ? remaining : 0n;
    } catch (error) {
      logger.error(`Error getting storage remaining for organization ${organizationId}:`, error);
      throw error;
    }
  }

  /**
   * Get storage usage as percentage
   */
  async getStoragePercentageUsed(organizationId: string): Promise<number> {
    try {
      const metrics = await this.getStorageMetrics(organizationId);
      return metrics.percentageUsed;
    } catch (error) {
      logger.error(`Error getting storage percentage for organization ${organizationId}:`, error);
      throw error;
    }
  }

  /**
   * Create a storage quota alert
   */
  async createStorageQuotaAlert(
    organizationId: string,
    thresholdPercentage: number,
    alertType: 'warning' | 'critical'
  ): Promise<void> {
    try {
      // Check if alert already exists
      const existingAlert = await db('storage_quota_alerts')
        .where('organization_id', organizationId)
        .where('threshold_percentage', thresholdPercentage)
        .where('alert_type', alertType)
        .where('is_active', true)
        .first();

      if (existingAlert) {
        return; // Alert already exists
      }

      // Create new alert
      await db('storage_quota_alerts').insert({
        organization_id: organizationId,
        threshold_percentage: thresholdPercentage,
        alert_type: alertType,
        is_active: true,
        triggered: true,
        triggered_at: new Date(),
        created_at: new Date(),
        updated_at: new Date(),
      });

      logger.info(
        `Created storage quota alert for organization ${organizationId} at ${thresholdPercentage}%`
      );
    } catch (error) {
      logger.error(`Error creating storage quota alert for organization ${organizationId}:`, error);
      throw error;
    }
  }

  /**
   * Check and trigger storage alerts if thresholds exceeded
   */
  async checkStorageAlerts(organizationId: string): Promise<void> {
    try {
      const metrics = await this.getStorageMetrics(organizationId);

      // Trigger warning at 75%
      if (metrics.percentageUsed >= 75 && metrics.percentageUsed < 90) {
        await this.createStorageQuotaAlert(organizationId, 75, 'warning');
      }

      // Trigger critical at 90%
      if (metrics.percentageUsed >= 90) {
        await this.createStorageQuotaAlert(organizationId, 90, 'critical');
      }

      logger.info(`Checked storage alerts for organization ${organizationId}`);
    } catch (error) {
      logger.error(`Error checking storage alerts for organization ${organizationId}:`, error);
    }
  }

  /**
   * Track recording file size when uploaded
   */
  async trackRecordingSize(
    recordingId: string,
    organizationId: string,
    fileSizeBytes: number
  ): Promise<void> {
    try {
      // Record file size entry
      await db('recording_file_sizes').insert({
        recording_id: recordingId,
        organization_id: organizationId,
        file_size_bytes: fileSizeBytes,
        created_at: new Date(),
        updated_at: new Date(),
      });

      // Update storage metrics
      const metrics = await db('storage_metrics').where('organization_id', organizationId).first();

      if (metrics) {
        const newTotalBytes = BigInt(metrics.total_bytes_used) + BigInt(fileSizeBytes);
        const newRecordingBytes = BigInt(metrics.bytes_by_recordings) + BigInt(fileSizeBytes);

        await db('storage_metrics')
          .where('organization_id', organizationId)
          .update({
            total_bytes_used: newTotalBytes.toString(),
            bytes_by_recordings: newRecordingBytes.toString(),
            percentage_used: db.raw('percentage_used + 1'),
            recording_count: db.raw('recording_count + 1'),
            updated_at: new Date(),
          });

        await this.checkStorageAlerts(organizationId);
      }
    } catch (error) {
      logger.error(`Error tracking recording size for recording ${recordingId}:`, error);
    }
  }

  /**
   * Untrack recording file size when deleted
   */
  async untrackRecordingSize(
    recordingId: string,
    organizationId: string,
    fileSizeBytes: number
  ): Promise<void> {
    try {
      const metrics = await db('storage_metrics').where('organization_id', organizationId).first();

      if (metrics) {
        const newTotalBytes = BigInt(metrics.total_bytes_used) - BigInt(fileSizeBytes);
        const newRecordingBytes = BigInt(metrics.bytes_by_recordings) - BigInt(fileSizeBytes);

        await db('storage_metrics')
          .where('organization_id', organizationId)
          .update({
            total_bytes_used: Math.max(0, Number(newTotalBytes)).toString(),
            bytes_by_recordings: Math.max(0, Number(newRecordingBytes)).toString(),
            recording_count: db.raw('MAX(0, recording_count - 1)'),
            updated_at: new Date(),
          });

        await this.recalculateStorageMetrics(organizationId);
      }
    } catch (error) {
      logger.error(`Error untracking recording size for recording ${recordingId}:`, error);
    }
  }

  /**
   * Update maximum storage allocation for organization (e.g., on tier upgrade/downgrade)
   */
  async updateMaxStorage(organizationId: string, maxStorageGb: number): Promise<void> {
    try {
      const maxBytes = maxStorageGb * 1024 * 1024 * 1024;

      const metrics = await db('storage_metrics').where('organization_id', organizationId).first();

      if (!metrics) {
        throw new Error(`Storage metrics not found for organization ${organizationId}`);
      }

      // Update max storage
      await db('storage_metrics').where('organization_id', organizationId).update({
        max_bytes_allowed: maxBytes.toString(),
        updated_at: new Date(),
      });

      // Check if this change triggers alerts (e.g., downgrading below current usage)
      await this.checkStorageAlerts(organizationId);

      logger.info(`Updated max storage for organization ${organizationId} to ${maxStorageGb} GB`);
    } catch (error) {
      logger.error(`Error updating max storage for organization ${organizationId}:`, error);
      throw error;
    }
  }

  /**
   * Create storage folder structure for a new organization.
   * Creates marker files (.keep) at:
   *   - {orgSlug}/recordings/.keep
   *   - {orgSlug}/rubrics/.keep
   *
   * Note: S3/R2 doesn't have real folders, just key prefixes.
   * The .keep files serve as placeholders to "create" the folder structure.
   */
  async createOrgFolders(orgSlug: string): Promise<void> {
    const s3Client = getS3Client();
    const bucket = getS3Bucket();

    if (!s3Client || !bucket) {
      logger.warn(`S3 not configured, skipping folder creation for org: ${orgSlug}`);
      return;
    }

    const folders = [`${orgSlug}/recordings/.keep`, `${orgSlug}/rubrics/.keep`];

    try {
      for (const key of folders) {
        await s3Client.send(
          new PutObjectCommand({
            Bucket: bucket,
            Key: key,
            Body: '',
            ContentType: 'application/x-empty',
          })
        );
      }

      logger.info(`Created storage folders for organization: ${orgSlug}`, {
        bucket,
        folders: folders.map((f) => f.replace('/.keep', '')),
      });
    } catch (error) {
      logger.error(`Failed to create storage folders for org ${orgSlug}:`, error);
      // Don't throw - org creation should continue even if folder creation fails
    }
  }

  /**
   * Delete all storage objects for an organization.
   * Deletes all objects with the prefix: {orgSlug}/
   *
   * Called when an organization is deleted.
   */
  async deleteOrgStorage(orgSlug: string): Promise<{ deleted: number; errors: number }> {
    const s3Client = getS3Client();
    const bucket = getS3Bucket();

    if (!s3Client || !bucket) {
      logger.warn(`S3 not configured, skipping storage deletion for org: ${orgSlug}`);
      return { deleted: 0, errors: 0 };
    }

    const prefix = `${orgSlug}/`;
    let deleted = 0;
    let errors = 0;
    let continuationToken: string | undefined;

    try {
      do {
        // List all objects with this prefix
        const listResponse = await s3Client.send(
          new ListObjectsV2Command({
            Bucket: bucket,
            Prefix: prefix,
            ContinuationToken: continuationToken,
          })
        );

        if (listResponse.Contents && listResponse.Contents.length > 0) {
          // Delete objects in batches of 1000 (S3 limit)
          const objectsToDelete = listResponse.Contents.filter((obj) => obj.Key).map((obj) => ({
            Key: obj.Key!,
          }));

          if (objectsToDelete.length > 0) {
            try {
              await s3Client.send(
                new DeleteObjectsCommand({
                  Bucket: bucket,
                  Delete: { Objects: objectsToDelete },
                })
              );
              deleted += objectsToDelete.length;
            } catch (deleteError) {
              logger.error(`Failed to delete batch of objects for org ${orgSlug}:`, deleteError);
              errors += objectsToDelete.length;
            }
          }
        }

        continuationToken = listResponse.NextContinuationToken;
      } while (continuationToken);

      logger.info(`Deleted storage for organization: ${orgSlug}`, {
        bucket,
        deleted,
        errors,
      });

      return { deleted, errors };
    } catch (error) {
      logger.error(`Failed to delete storage for org ${orgSlug}:`, error);
      return { deleted, errors: errors + 1 };
    }
  }
}

export default new StorageService();
