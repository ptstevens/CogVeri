/**
 * RecordingStorageService
 *
 * Handles file storage operations for recordings.
 * Extracted from RecordingService for better separation of concerns (Fix #1).
 *
 * Responsibilities:
 * - Upload files to S3/R2 or local storage
 * - Clean up uploaded files
 * - Delete S3 prefixes (for hard delete operations)
 */

import { db } from '../config/database';
import { logger } from '../utils/logger';
import { PutObjectCommand, GetObjectCommand, DeleteObjectCommand, ListObjectsV2Command, DeleteObjectsCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import path from 'path';
import fs from 'fs/promises';
import {
  getS3Client,
  resolveOrganizationBucket,
  generateRecordingKey,
} from '../config/s3';

/**
 * Multer File type definition
 */
interface MulterFile {
  fieldname: string;
  originalname: string;
  encoding: string;
  mimetype: string;
  size: number;
  destination?: string;
  filename?: string;
  path?: string;
  buffer?: Buffer;
}

/**
 * Recording interface (minimal fields needed for storage)
 */
interface Recording {
  id: string;
  task_id: string;
  organization_id: string;
}

/**
 * Storage upload result for clean abstraction
 */
export interface StorageUploadResult {
  fileUrl: string;
  storageKey: string;
  storageBucket?: string;
  storageProvider: 'local' | 's3';
}

export class RecordingStorageService {
  private uploadDir = path.join(process.cwd(), 'uploads', 'recordings');

  constructor() {
    // Ensure local upload directory exists on startup
    this.ensureUploadDir();
  }

  /**
   * Ensure local upload directory exists
   */
  async ensureUploadDir(): Promise<void> {
    try {
      await fs.mkdir(this.uploadDir, { recursive: true });
    } catch (error) {
      logger.error('Failed to create upload directory:', error);
    }
  }

  /**
   * Upload a file to storage (S3/R2 or local fallback)
   */
  async uploadToStorage(
    file: MulterFile,
    recording: Recording,
    recordingId: string,
    userId: string
  ): Promise<StorageUploadResult> {
    // Fetch org slug for path construction
    const org = await db('organizations')
      .where('id', recording.organization_id)
      .select('slug')
      .first();
    const orgSlug = org?.slug || 'unknown';

    // Get file content - handle both memory storage (buffer) and disk storage (path)
    let fileContent: Buffer;
    if (file.buffer) {
      fileContent = file.buffer;
    } else if (file.path) {
      fileContent = await fs.readFile(file.path);
    } else {
      throw new Error('No file content available for upload');
    }

    // Upload to S3 if configured, otherwise save locally
    const s3Client = getS3Client();
    if (s3Client && process.env.AWS_S3_BUCKET) {
      try {
        logger.info(`Attempting S3/R2 upload for recording ${recordingId}`, {
          fileSize: fileContent.length,
          hasBuffer: !!file.buffer,
          hasPath: !!file.path,
        });

        // Resolve bucket (now returns the single environment bucket)
        const storageBucket = await resolveOrganizationBucket(recording.organization_id);
        // Use org-scoped path: {orgSlug}/recordings/{taskId}/{recordingId}/{filename}
        const storageKey = generateRecordingKey(orgSlug, recording.task_id, recordingId, file.originalname);

        const command = new PutObjectCommand({
          Bucket: storageBucket,
          Key: storageKey,
          Body: fileContent,
          ContentType: file.mimetype,
          Metadata: {
            task_id: recording.task_id,
            user_id: userId,
            recording_id: recordingId,
            organization_id: recording.organization_id,
            org_slug: orgSlug,
          },
        });

        await s3Client.send(command);
        logger.info(`S3/R2 upload successful for recording ${recordingId}`, { bucket: storageBucket, orgSlug });

        // Generate signed URL for access
        const getCommand = new GetObjectCommand({
          Bucket: storageBucket,
          Key: storageKey,
        });
        // SECURITY: Reduced from 7 days to 4 hours - regenerate URLs as needed
        const fileUrl = await getSignedUrl(s3Client, getCommand, { expiresIn: 3600 * 4 }); // 4 hours

        return {
          fileUrl,
          storageKey,
          storageBucket,
          storageProvider: 's3',
        };
      } catch (s3Error) {
        // Log S3 error and fall back to local storage
        logger.error(`S3/R2 upload failed for recording ${recordingId}, falling back to local storage:`, s3Error);
        return this.uploadToLocalStorage(file, recordingId, orgSlug);
      }
    }

    return this.uploadToLocalStorage(file, recordingId, orgSlug);
  }

  /**
   * Upload a file to local storage
   */
  async uploadToLocalStorage(file: MulterFile, recordingId: string, orgSlug: string): Promise<StorageUploadResult> {
    const fileName = `${recordingId}-${Date.now()}${path.extname(file.originalname)}`;
    // Use org-scoped local path
    const localDir = path.join(this.uploadDir, orgSlug, 'recordings');
    const filePath = path.join(localDir, fileName);

    // Get file content - handle both memory storage (buffer) and disk storage (path)
    let fileContent: Buffer;
    if (file.buffer) {
      fileContent = file.buffer;
    } else if (file.path) {
      fileContent = await fs.readFile(file.path);
    } else {
      throw new Error('No file content available for local upload');
    }

    // Ensure directory exists
    await fs.mkdir(localDir, { recursive: true });
    await fs.writeFile(filePath, fileContent);
    logger.info(`Saved to local storage: ${fileName}`, { orgSlug, fileSize: fileContent.length });

    return {
      fileUrl: `/uploads/${orgSlug}/recordings/${fileName}`,
      storageKey: `${orgSlug}/recordings/${fileName}`,
      storageProvider: 'local',
    };
  }

  /**
   * Clean up an uploaded file (delete from storage)
   */
  async cleanupUploadedFile(uploadResult: StorageUploadResult): Promise<void> {
    const s3Client = getS3Client();
    if (uploadResult.storageProvider === 's3' && s3Client && uploadResult.storageBucket) {
      const command = new DeleteObjectCommand({
        Bucket: uploadResult.storageBucket,
        Key: uploadResult.storageKey,
      });
      await s3Client.send(command);
      logger.info(`Cleaned up S3 file: ${uploadResult.storageKey}`);
    } else if (uploadResult.storageProvider === 'local') {
      const filePath = path.join(this.uploadDir, uploadResult.storageKey);
      await fs.unlink(filePath);
      logger.info(`Cleaned up local file: ${uploadResult.storageKey}`);
    }
  }

  /**
   * Delete all S3 objects with a given prefix
   * Used for hard delete operations to remove all files associated with a recording
   */
  async deleteS3Prefix(bucket: string, prefix: string): Promise<void> {
    const s3Client = getS3Client();
    if (!s3Client) return;

    try {
      // List all objects with the prefix
      const listResponse = await s3Client.send(new ListObjectsV2Command({
        Bucket: bucket,
        Prefix: prefix,
      }));

      if (!listResponse.Contents || listResponse.Contents.length === 0) {
        logger.debug(`No objects found with prefix: ${prefix}`);
        return;
      }

      // Delete all found objects
      const objectsToDelete = listResponse.Contents
        .filter(obj => obj.Key)
        .map(obj => ({ Key: obj.Key! }));

      if (objectsToDelete.length > 0) {
        await s3Client.send(new DeleteObjectsCommand({
          Bucket: bucket,
          Delete: { Objects: objectsToDelete },
        }));
        logger.info(`Deleted ${objectsToDelete.length} objects with prefix: ${prefix}`);
      }
    } catch (error) {
      logger.error(`Failed to delete S3 prefix ${prefix}:`, error);
      // Don't throw - storage cleanup failure shouldn't block deletion
    }
  }

  /**
   * Get the upload directory path
   */
  getUploadDir(): string {
    return this.uploadDir;
  }
}

// Export singleton instance
export const recordingStorageService = new RecordingStorageService();
export default recordingStorageService;
