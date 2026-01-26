import { Job } from 'bullmq';
import { BaseProcessor } from '../base.processor';
import { ThumbnailJobData, ThumbnailJobResult } from '../types/job-types';
import { QUEUE_CONFIGS, WORKER_CONCURRENCY } from '../../config/bullmq';
import { logger } from '../../utils/logger';
import { db } from '../../config/database';
import ffmpegService from '../../services/ffmpeg.service';
import { PutObjectCommand, GetObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import fs from 'fs/promises';
import path from 'path';
import os from 'os';
import { v4 as uuidv4 } from 'uuid';
// Centralized S3 client and path generation (Fix #13 - consolidated S3 initialization)
import { getS3Client, getRecordingBucket, generateThumbnailKey } from '../../config/s3';

/**
 * Thumbnail Processor
 * Generates thumbnails from video recordings using FFmpeg.
 */
export class ThumbnailProcessor extends BaseProcessor<ThumbnailJobData, ThumbnailJobResult> {
  private tempDir: string;

  constructor() {
    super(QUEUE_CONFIGS.thumbnail.name, WORKER_CONCURRENCY.thumbnail);
    this.tempDir = path.join(os.tmpdir(), 'cogveri-thumbnails');
    this.ensureTempDir();
  }

  private async ensureTempDir(): Promise<void> {
    try {
      await fs.mkdir(this.tempDir, { recursive: true });
    } catch (error) {
      logger.error('Failed to create thumbnail temp directory:', error);
    }
  }

  /**
   * Main processing logic
   */
  protected async process(job: Job<ThumbnailJobData, ThumbnailJobResult>): Promise<ThumbnailJobResult> {
    const { recordingId, fileUrl, organizationId, orgSlug, options } = job.data;
    const jobLog = logger.child({ jobId: job.id, recordingId, orgSlug });

    jobLog.info('Starting thumbnail generation');

    const tempInputPath = path.join(this.tempDir, `input-${uuidv4()}`);

    try {
      // Stage 1: Download input file
      await this.reportProgress(job, {
        percentage: 10,
        stage: 'downloading',
        message: 'Downloading video',
      });

      await this.downloadFile(fileUrl, tempInputPath);

      // Stage 2: Generate thumbnail
      await this.reportProgress(job, {
        percentage: 40,
        stage: 'generating',
        message: 'Generating thumbnail',
      });

      const { outputPath, width, height, size } = await ffmpegService.generateThumbnail(
        tempInputPath,
        {
          timestamp: options?.timestamp,
          width: options?.width || 320,
          height: options?.height || 180,
          format: options?.format || 'jpeg',
        }
      );

      // Stage 3: Upload thumbnail
      await this.reportProgress(job, {
        percentage: 80,
        stage: 'uploading',
        message: 'Uploading thumbnail',
      });

      // Get recording to access storage_bucket
      const recording = await db('recordings').where('id', recordingId).first();
      const bucket = await getRecordingBucket(recording?.storage_bucket, organizationId);

      const format = options?.format || 'jpeg';
      const thumbnailUrl = await this.uploadThumbnail(
        outputPath,
        recordingId,
        format,
        bucket,
        orgSlug
      );

      // Cleanup temp output file
      await fs.unlink(outputPath).catch(() => {});

      // Stage 4: Update database
      await this.reportProgress(job, {
        percentage: 95,
        stage: 'finalizing',
        message: 'Updating records',
      });

      // Update recording with thumbnail URL
      await db('recordings')
        .where('id', recordingId)
        .update({
          thumbnail_url: thumbnailUrl,
          updated_at: new Date(),
        });

      // Complete
      await this.reportProgress(job, {
        percentage: 100,
        stage: 'completed',
        message: 'Thumbnail generated',
      });

      const result: ThumbnailJobResult = {
        recordingId,
        thumbnailUrl,
        width,
        height,
        format,
        size,
      };

      jobLog.info('Thumbnail generation completed', result);
      return result;

    } finally {
      // Cleanup temp input file
      await fs.unlink(tempInputPath).catch(() => {});
    }
  }

  /**
   * Download file from URL to local path
   */
  private async downloadFile(url: string, destPath: string): Promise<void> {
    if (url.startsWith('http://') || url.startsWith('https://')) {
      const response = await fetch(url);
      const buffer = await response.arrayBuffer();
      await fs.writeFile(destPath, Buffer.from(buffer));
    } else {
      const s3Client = getS3Client();
      if (s3Client && process.env.AWS_S3_BUCKET) {
        const key = url.startsWith('s3://') ? url.slice(5) : url;
        const [bucket, ...keyParts] = key.split('/');
        const actualKey = keyParts.join('/');

        const command = new GetObjectCommand({
          Bucket: bucket || process.env.AWS_S3_BUCKET,
          Key: actualKey || key,
        });

        const signedUrl = await getSignedUrl(s3Client, command, { expiresIn: 3600 });
        const response = await fetch(signedUrl);
        const buffer = await response.arrayBuffer();
        await fs.writeFile(destPath, Buffer.from(buffer));
      } else {
        await fs.copyFile(url.replace('file://', ''), destPath);
      }
    }
  }

  /**
   * Upload thumbnail to storage
   */
  private async uploadThumbnail(
    filePath: string,
    recordingId: string,
    format: string,
    bucket: string,
    orgSlug: string
  ): Promise<string> {
    const extension = format === 'jpeg' ? 'jpg' : format;
    const fileName = `thumbnail_${Date.now()}.${extension}`;
    // Use org-scoped path: {orgSlug}/recordings/{recordingId}/thumbnails/{fileName}
    const key = generateThumbnailKey(orgSlug, recordingId, fileName);

    const contentType = format === 'jpeg' ? 'image/jpeg' :
                        format === 'png' ? 'image/png' : 'image/webp';

    const s3Client = getS3Client();
    if (s3Client && bucket) {
      const fileContent = await fs.readFile(filePath);

      const command = new PutObjectCommand({
        Bucket: bucket,
        Key: key,
        Body: fileContent,
        ContentType: contentType,
      });

      await s3Client.send(command);

      // Generate signed URL
      const getCommand = new GetObjectCommand({
        Bucket: bucket,
        Key: key,
      });

      // SECURITY: Reduced from 7 days to 4 hours - regenerate URLs as needed
      return await getSignedUrl(s3Client, getCommand, { expiresIn: 3600 * 4 });
    } else {
      // Local storage - use org-scoped path
      const localDir = path.join(process.cwd(), 'uploads', orgSlug, 'recordings', recordingId, 'thumbnails');
      await fs.mkdir(localDir, { recursive: true });
      const localPath = path.join(localDir, fileName);
      await fs.copyFile(filePath, localPath);
      return `/uploads/${orgSlug}/recordings/${recordingId}/thumbnails/${fileName}`;
    }
  }

  protected onCompleted(job: Job<ThumbnailJobData, ThumbnailJobResult>, result: ThumbnailJobResult): void {
    logger.info(`Thumbnail generated: ${result.recordingId}`, {
      jobId: job.id,
      dimensions: `${result.width}x${result.height}`,
      size: result.size,
    });
  }

  protected async onFailed(job: Job<ThumbnailJobData, ThumbnailJobResult>, error: Error): Promise<void> {
    // Call parent to handle DLQ
    await super.onFailed(job, error);

    logger.error(`Thumbnail generation failed: ${job.data.recordingId}`, {
      jobId: job.id,
      error: error.message,
    });
  }
}

// Singleton instance
let thumbnailProcessorInstance: ThumbnailProcessor | null = null;

export function getThumbnailProcessor(): ThumbnailProcessor {
  if (!thumbnailProcessorInstance) {
    thumbnailProcessorInstance = new ThumbnailProcessor();
  }
  return thumbnailProcessorInstance;
}
