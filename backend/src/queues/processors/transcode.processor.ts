import { Job } from 'bullmq';
import { BaseProcessor } from '../base.processor';
import { TranscodeJobData, TranscodeJobResult, TranscodeQuality } from '../types/job-types';
import { QUEUE_CONFIGS, WORKER_CONCURRENCY } from '../../config/bullmq';
import { logger } from '../../utils/logger';
import { db } from '../../config/database';
import ffmpegService from '../../services/ffmpeg.service';
import { S3Client, PutObjectCommand, GetObjectCommand, DeleteObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import fs from 'fs/promises';
import path from 'path';
import os from 'os';
import { v4 as uuidv4 } from 'uuid';
// Storage path generation and bucket resolution
import { getRecordingBucket, generateTranscodeKey } from '../../config/s3';

/**
 * Transcode Processor
 * Processes video transcoding jobs using FFmpeg.
 */
export class TranscodeProcessor extends BaseProcessor<TranscodeJobData, TranscodeJobResult> {
  private s3Client: S3Client | null = null;
  private tempDir: string;

  constructor() {
    super(QUEUE_CONFIGS.transcode.name, WORKER_CONCURRENCY.transcode);
    this.tempDir = path.join(os.tmpdir(), 'cogveri-transcode');

    // Initialize S3 client
    if (process.env.AWS_ACCESS_KEY_ID && process.env.AWS_SECRET_ACCESS_KEY) {
      const s3Config: any = {
        region: process.env.AWS_REGION || 'auto',
        credentials: {
          accessKeyId: process.env.AWS_ACCESS_KEY_ID,
          secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
        },
      };

      if (process.env.AWS_ENDPOINT_URL) {
        s3Config.endpoint = process.env.AWS_ENDPOINT_URL;
        s3Config.forcePathStyle = true;
      }

      this.s3Client = new S3Client(s3Config);
    }

    this.ensureTempDir();
  }

  private async ensureTempDir(): Promise<void> {
    try {
      await fs.mkdir(this.tempDir, { recursive: true });
    } catch (error) {
      logger.error('Failed to create transcode temp directory:', error);
    }
  }

  /**
   * Main processing logic
   */
  protected async process(job: Job<TranscodeJobData, TranscodeJobResult>): Promise<TranscodeJobResult> {
    const { recordingId, inputFileUrl, organizationId, orgSlug, quality, outputFormat, options } = job.data;
    const jobLog = logger.child({ jobId: job.id, recordingId, orgSlug, quality });

    jobLog.info('Starting transcode job');

    const tempInputPath = path.join(this.tempDir, `input-${uuidv4()}`);
    let tempOutputPath = '';

    try {
      // Stage 1: Download input file
      await this.reportProgress(job, {
        percentage: 5,
        stage: 'downloading',
        message: 'Downloading source video',
      });

      await this.downloadFile(inputFileUrl, tempInputPath);

      // Stage 2: Get video metadata
      await this.reportProgress(job, {
        percentage: 10,
        stage: 'analyzing',
        message: 'Analyzing video',
      });

      // Analyze input metadata (currently used for validation, could be used for adaptive transcoding)
      await ffmpegService.getMetadata(tempInputPath);

      // Stage 3: Transcode
      await this.reportProgress(job, {
        percentage: 20,
        stage: 'transcoding',
        message: `Transcoding to ${quality || 'medium'} quality`,
      });

      const { outputPath, metadata: outputMetadata } = await ffmpegService.transcodeVideo(
        tempInputPath,
        {
          quality: this.mapQuality(quality),
          format: outputFormat || 'mp4',
          maxBitrate: options?.maxBitrate,
          audioBitrate: options?.audioBitrate,
          frameRate: options?.frameRate,
          stripAudio: options?.stripAudio,
        },
        undefined,
        (progress) => {
          // Map 0-100 to 20-85
          const mappedProgress = 20 + (progress * 0.65);
          this.reportProgress(job, {
            percentage: Math.round(mappedProgress),
            stage: 'transcoding',
            message: `Transcoding: ${progress}%`,
          });
        }
      );

      tempOutputPath = outputPath;

      // Stage 4: Upload transcoded file
      await this.reportProgress(job, {
        percentage: 90,
        stage: 'uploading',
        message: 'Uploading transcoded video',
      });

      // Get recording to access storage_bucket
      const recording = await db('recordings').where('id', recordingId).first();
      const bucket = await getRecordingBucket(recording?.storage_bucket, organizationId);

      const outputFileUrl = await this.uploadFile(
        tempOutputPath,
        recordingId,
        quality || TranscodeQuality.MEDIUM,
        outputFormat || 'mp4',
        bucket,
        orgSlug
      );

      // Stage 5: Update database
      await this.reportProgress(job, {
        percentage: 95,
        stage: 'finalizing',
        message: 'Updating records',
      });

      await this.saveRecordingVariant(recordingId, {
        quality: quality || TranscodeQuality.MEDIUM,
        format: outputFormat || 'mp4',
        fileUrl: outputFileUrl,
        width: outputMetadata.width,
        height: outputMetadata.height,
        bitrate: outputMetadata.bitrate,
        fileSize: outputMetadata.size,
        duration: outputMetadata.duration,
      });

      // Delete original webm file and update recording to point to MP4
      if (recording && this.s3Client && bucket) {
        const originalKey = recording.storage_key;

        // Generate the new MP4 key using org-scoped path
        const mp4Key = generateTranscodeKey(
          orgSlug,
          recordingId,
          `${recordingId}_${quality || TranscodeQuality.MEDIUM}`,
          outputFormat || 'mp4'
        );

        // Update recording to point to MP4 as primary file
        await db('recordings')
          .where('id', recordingId)
          .update({
            storage_key: mp4Key,
            file_type: 'video/mp4',
            updated_at: new Date(),
          });

        // Delete original webm file
        if (originalKey) {
          try {
            await this.s3Client.send(new DeleteObjectCommand({
              Bucket: bucket,
              Key: originalKey,
            }));
            jobLog.info(`Deleted original file: ${originalKey}`);
          } catch (deleteError) {
            // Log but don't fail the job if delete fails
            jobLog.warn(`Failed to delete original file: ${originalKey}`, { error: deleteError });
          }
        }
      }

      // Complete
      await this.reportProgress(job, {
        percentage: 100,
        stage: 'completed',
        message: 'Transcode complete',
      });

      const result: TranscodeJobResult = {
        recordingId,
        outputFileUrl,
        format: outputFormat || 'mp4',
        quality: quality || TranscodeQuality.MEDIUM,
        duration: outputMetadata.duration,
        fileSize: outputMetadata.size,
        resolution: {
          width: outputMetadata.width,
          height: outputMetadata.height,
        },
      };

      jobLog.info('Transcode job completed', result);
      return result;

    } finally {
      // Cleanup temp files
      try {
        await fs.unlink(tempInputPath).catch(() => {});
        if (tempOutputPath) {
          await fs.unlink(tempOutputPath).catch(() => {});
        }
      } catch {}
    }
  }

  /**
   * Map TranscodeQuality enum to service quality string
   */
  private mapQuality(quality?: TranscodeQuality): 'low' | 'medium' | 'high' | 'original' {
    switch (quality) {
      case TranscodeQuality.LOW:
        return 'low';
      case TranscodeQuality.MEDIUM:
        return 'medium';
      case TranscodeQuality.HIGH:
        return 'high';
      case TranscodeQuality.ORIGINAL:
        return 'original';
      default:
        return 'medium';
    }
  }

  /**
   * Download file from URL to local path
   */
  private async downloadFile(url: string, destPath: string): Promise<void> {
    if (url.startsWith('http://') || url.startsWith('https://')) {
      logger.info(`Downloading file from URL: ${url.substring(0, 100)}...`);
      const response = await fetch(url);
      if (!response.ok) {
        throw new Error(`Failed to download file: HTTP ${response.status} ${response.statusText}`);
      }
      const buffer = await response.arrayBuffer();
      await fs.writeFile(destPath, Buffer.from(buffer));
      logger.info(`Downloaded ${buffer.byteLength} bytes to ${destPath}`);
    } else if (this.s3Client && process.env.AWS_S3_BUCKET) {
      // Generate signed URL and download
      const key = url.startsWith('s3://') ? url.slice(5) : url;
      const [bucket, ...keyParts] = key.split('/');
      const actualKey = keyParts.join('/');

      logger.info(`Downloading from S3: bucket=${bucket || process.env.AWS_S3_BUCKET}, key=${actualKey || key}`);
      const command = new GetObjectCommand({
        Bucket: bucket || process.env.AWS_S3_BUCKET,
        Key: actualKey || key,
      });

      const signedUrl = await getSignedUrl(this.s3Client, command, { expiresIn: 3600 });
      const response = await fetch(signedUrl);
      if (!response.ok) {
        throw new Error(`Failed to download from S3: HTTP ${response.status} ${response.statusText}`);
      }
      const buffer = await response.arrayBuffer();
      await fs.writeFile(destPath, Buffer.from(buffer));
      logger.info(`Downloaded ${buffer.byteLength} bytes to ${destPath}`);
    } else {
      // Local file
      logger.info(`Copying local file: ${url}`);
      await fs.copyFile(url.replace('file://', ''), destPath);
    }
  }

  /**
   * Upload transcoded file to storage
   */
  private async uploadFile(
    filePath: string,
    recordingId: string,
    quality: TranscodeQuality,
    format: string,
    bucket: string,
    orgSlug: string
  ): Promise<string> {
    const fileName = `${recordingId}_${quality}.${format}`;
    // Use org-scoped path: {orgSlug}/recordings/{recordingId}/variants/{fileName}
    const key = generateTranscodeKey(orgSlug, recordingId, `${recordingId}_${quality}`, format);

    if (this.s3Client && bucket) {
      const fileContent = await fs.readFile(filePath);

      const command = new PutObjectCommand({
        Bucket: bucket,
        Key: key,
        Body: fileContent,
        ContentType: format === 'mp4' ? 'video/mp4' : 'video/webm',
      });

      await this.s3Client.send(command);

      // Generate URL
      const getCommand = new GetObjectCommand({
        Bucket: bucket,
        Key: key,
      });

      // SECURITY: Reduced from 7 days to 4 hours - regenerate URLs as needed
      return await getSignedUrl(this.s3Client, getCommand, { expiresIn: 3600 * 4 });
    } else {
      // Local storage - use org-scoped path
      const localDir = path.join(process.cwd(), 'uploads', orgSlug, 'recordings', recordingId, 'variants');
      await fs.mkdir(localDir, { recursive: true });
      const localPath = path.join(localDir, fileName);
      await fs.copyFile(filePath, localPath);
      return `/uploads/${orgSlug}/recordings/${recordingId}/variants/${fileName}`;
    }
  }

  /**
   * Save recording variant to database
   */
  private async saveRecordingVariant(
    recordingId: string,
    variant: {
      quality: TranscodeQuality;
      format: string;
      fileUrl: string;
      width: number;
      height: number;
      bitrate: number;
      fileSize: number;
      duration: number;
    }
  ): Promise<void> {
    await db('recording_variants')
      .insert({
        recording_id: recordingId,
        quality: variant.quality,
        format: variant.format,
        file_url: variant.fileUrl,
        width: variant.width,
        height: variant.height,
        bitrate: variant.bitrate,
        file_size_bytes: variant.fileSize,
        duration_seconds: variant.duration,
        is_ready: true, // Mark as ready so getRecordingPlaybackUrl serves the transcoded MP4
        created_at: new Date(),
        updated_at: new Date(),
      })
      .onConflict(['recording_id', 'quality'])
      .merge();
  }

  protected onCompleted(job: Job<TranscodeJobData, TranscodeJobResult>, result: TranscodeJobResult): void {
    logger.info(`Transcode completed: ${result.recordingId} @ ${result.quality}`, {
      jobId: job.id,
      resolution: result.resolution,
      fileSize: result.fileSize,
    });
  }

  protected async onFailed(job: Job<TranscodeJobData, TranscodeJobResult>, error: Error): Promise<void> {
    // Call parent to handle DLQ
    await super.onFailed(job, error);

    logger.error(`Transcode failed: ${job.data.recordingId}`, {
      jobId: job.id,
      quality: job.data.quality,
      error: error.message,
    });
  }
}

// Singleton instance
let transcodeProcessorInstance: TranscodeProcessor | null = null;

export function getTranscodeProcessor(): TranscodeProcessor {
  if (!transcodeProcessorInstance) {
    transcodeProcessorInstance = new TranscodeProcessor();
  }
  return transcodeProcessorInstance;
}
