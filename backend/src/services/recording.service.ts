import { db } from '../config/database';
import { NotFoundError, BadRequestError } from '../utils/AppError';
import { logger } from '../utils/logger';
import { S3Client, PutObjectCommand, GetObjectCommand, DeleteObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import path from 'path';
import fs from 'fs/promises';
import { v4 as uuidv4 } from 'uuid';
import { emailService } from './email.service';

export interface Recording {
  id: string;
  task_id: string;
  user_id: string;
  type: 'screen' | 'camera' | 'screen_camera' | 'live_session';
  status: 'initializing' | 'recording' | 'processing' | 'completed' | 'failed' | 'deleted';
  file_url?: string;
  thumbnail_url?: string;
  file_size_bytes?: string;
  file_format?: string;
  mime_type?: string;
  duration_seconds?: number;
  width?: number;
  height?: number;
  fps?: number;
  bitrate?: number;
  started_at?: Date;
  ended_at?: Date;
  uploaded_at?: Date;
  processed_at?: Date;
  storage_provider?: string;
  storage_bucket?: string;
  storage_key?: string;
  metadata?: any;
  created_at: Date;
  updated_at: Date;
}

export interface CreateRecordingDto {
  task_id: string;
  duration_seconds: number;
  has_audio: boolean;
  mime_type: string;
  resolution?: string;
  frame_rate?: number;
  browser_info?: string;
}

export interface UploadRecordingDto {
  file: Express.Multer.File;
  recording_id: string;
}

class RecordingService {
  private s3Client: S3Client | null = null;
  private uploadDir = path.join(process.cwd(), 'uploads', 'recordings');

  constructor() {
    // Initialize S3 client if AWS credentials are configured AND S3 bucket is specified
    if (process.env.AWS_ACCESS_KEY_ID && process.env.AWS_SECRET_ACCESS_KEY && process.env.AWS_S3_BUCKET) {
      const s3Config: any = {
        region: process.env.AWS_REGION || 'auto',
        credentials: {
          accessKeyId: process.env.AWS_ACCESS_KEY_ID,
          secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
        },
      };

      // Add custom endpoint for Cloudflare R2 or other S3-compatible storage
      if (process.env.AWS_ENDPOINT_URL) {
        s3Config.endpoint = process.env.AWS_ENDPOINT_URL;
        s3Config.forcePathStyle = true; // Required for R2
        logger.info(`S3-compatible storage configured with custom endpoint: ${process.env.AWS_ENDPOINT_URL}`);
      }

      this.s3Client = new S3Client(s3Config);
      logger.info('S3/R2 storage configured for recordings');
    } else {
      logger.info('Using local storage for recordings');
    }

    // Ensure local upload directory exists
    this.ensureUploadDir();
  }

  private async ensureUploadDir(): Promise<void> {
    try {
      await fs.mkdir(this.uploadDir, { recursive: true });
    } catch (error) {
      logger.error('Failed to create upload directory:', error);
    }
  }

  async createRecording(userId: string | null, data: CreateRecordingDto): Promise<Recording> {
    try {
      // Parse resolution if provided
      let width: number | undefined;
      let height: number | undefined;
      if (data.resolution) {
        const [w, h] = data.resolution.split('x').map(Number);
        width = w;
        height = h;
      }

      // Create recording entry
      const [recording] = await db('recordings')
        .insert({
          task_id: data.task_id,
          user_id: userId,
          type: 'screen',
          status: 'initializing',
          mime_type: data.mime_type,
          duration_seconds: data.duration_seconds,
          width,
          height,
          fps: data.frame_rate,
          metadata: {
            browser_info: data.browser_info,
            has_audio: data.has_audio,
          },
          started_at: new Date(),
          created_at: new Date(),
          updated_at: new Date(),
        })
        .returning('*');

      logger.info(`Recording created: ${recording.id}`);
      return recording;
    } catch (error) {
      logger.error('Error creating recording:', error);
      throw error;
    }
  }

  async uploadRecording(userId: string, recordingId: string, file: Express.Multer.File): Promise<Recording> {
    try {
      // Verify recording exists and belongs to user
      const recording = await this.getRecordingById(recordingId);
      if (!recording) {
        throw new NotFoundError('Recording not found');
      }

      // Check ownership - either user_id or external_contributor_id must match
      const isOwner = recording.user_id === userId ||
                      (recording as any).external_contributor_id === userId;

      if (!isOwner) {
        throw new BadRequestError('Unauthorized to upload to this recording');
      }

      let fileUrl: string;
      let storageKey: string;
      let storageBucket: string | undefined;

      // Upload to S3 if configured, otherwise save locally
      if (this.s3Client && process.env.AWS_S3_BUCKET) {
        // Upload to S3
        storageBucket = process.env.AWS_S3_BUCKET;
        storageKey = `recordings/${recording.task_id}/${recordingId}/${file.originalname}`;

        const command = new PutObjectCommand({
          Bucket: storageBucket,
          Key: storageKey,
          Body: file.buffer,
          ContentType: file.mimetype,
          Metadata: {
            task_id: recording.task_id,
            user_id: userId,
            recording_id: recordingId,
          },
        });

        await this.s3Client.send(command);

        // Generate signed URL for access
        const getCommand = new GetObjectCommand({
          Bucket: storageBucket,
          Key: storageKey,
        });
        fileUrl = await getSignedUrl(this.s3Client, getCommand, { expiresIn: 3600 * 24 * 7 }); // 7 days
      } else {
        // Save locally
        const fileName = `${recordingId}-${Date.now()}${path.extname(file.originalname)}`;
        const filePath = path.join(this.uploadDir, fileName);

        await fs.writeFile(filePath, file.buffer);

        storageKey = fileName;
        fileUrl = `/uploads/recordings/${fileName}`;
      }

      // Update recording with file information
      const [updatedRecording] = await db('recordings')
        .where('id', recordingId)
        .update({
          status: 'completed',
          file_url: fileUrl,
          file_size_bytes: file.size.toString(),
          file_format: path.extname(file.originalname).slice(1),
          storage_provider: this.s3Client ? 's3' : 'local',
          storage_bucket: storageBucket,
          storage_key: storageKey,
          uploaded_at: new Date(),
          ended_at: new Date(),
          updated_at: new Date(),
        })
        .returning('*');

      logger.info(`Recording uploaded: ${recordingId}`);

      // Send notification to reviewer if task has one
      try {
        // Get task details with reviewer information
        const task = await db('tasks')
          .where('id', recording.task_id)
          .first();

        if (task && task.reviewed_by) {
          // Get reviewer details
          const reviewer = await db('users')
            .where('id', task.reviewed_by)
            .first();

          // Try to get assignee from users table first, then external contributors
          let assignee = await db('users')
            .where('id', userId)
            .first();

          // If not found in users table, check external_contributors table
          if (!assignee) {
            const contributor = await db('external_contributors')
              .where('id', userId)
              .first();

            if (contributor) {
              // Create a user-like object for external contributor
              assignee = {
                id: contributor.id,
                name: `${contributor.first_name || ''} ${contributor.last_name || ''}`.trim() || contributor.email,
                email: contributor.email,
              };
            }
          }

          if (reviewer && assignee) {
            // Send email notification to reviewer
            await emailService.sendReviewNotification(
              {
                ...task,
                recording_url: fileUrl
              },
              reviewer,
              assignee
            );
            logger.info(`Review notification sent to ${reviewer.email} for recording ${recordingId}`);
          }
        }

        // Update task status to 'submitted' since recording is uploaded
        // If no reviewer is assigned, assign the task creator as reviewer
        const updateData: any = {
          status: 'submitted',
          updated_at: new Date()
        };

        if (!task.reviewed_by && task.created_by) {
          updateData.reviewed_by = task.created_by;
          logger.info(`Auto-assigned task creator ${task.created_by} as reviewer for task ${recording.task_id}`);
        }

        await db('tasks')
          .where('id', recording.task_id)
          .update(updateData);

      } catch (notificationError) {
        // Log error but don't fail the upload
        logger.error('Failed to send review notification:', notificationError);
      }

      return updatedRecording;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      const errorStack = error instanceof Error ? error.stack : undefined;
      logger.error('Error uploading recording:', { message: errorMessage, stack: errorStack });

      // Update recording status to failed
      await db('recordings')
        .where('id', recordingId)
        .update({
          status: 'failed',
          processing_error: error instanceof Error ? error.message : 'Upload failed',
          updated_at: new Date(),
        });

      throw error;
    }
  }

  async getRecordingById(id: string): Promise<Recording | null> {
    try {
      const recording = await db('recordings')
        .where('id', id)
        .first();

      return recording || null;
    } catch (error) {
      logger.error('Error fetching recording:', error);
      throw error;
    }
  }

  async getRecordings(filters?: {
    task_id?: string;
    user_id?: string;
    status?: string;
    type?: string;
  }): Promise<Recording[]> {
    try {
      let query = db('recordings')
        .select('*')
        .orderBy('created_at', 'desc');

      if (filters?.task_id) {
        query = query.where('task_id', filters.task_id);
      }

      if (filters?.user_id) {
        query = query.where('user_id', filters.user_id);
      }

      if (filters?.status) {
        query = query.where('status', filters.status);
      }

      if (filters?.type) {
        query = query.where('type', filters.type);
      }

      const recordings = await query;
      return recordings;
    } catch (error) {
      logger.error('Error fetching recordings:', error);
      throw error;
    }
  }

  async deleteRecording(userId: string, recordingId: string): Promise<void> {
    try {
      const recording = await this.getRecordingById(recordingId);

      if (!recording) {
        throw new NotFoundError('Recording not found');
      }

      // Check permission (user can delete their own recordings, admins can delete any)
      if (recording.user_id !== userId) {
        // TODO: Add admin role check here
        throw new BadRequestError('Unauthorized to delete this recording');
      }

      // Delete file from storage
      if (recording.storage_provider === 's3' && this.s3Client && recording.storage_bucket && recording.storage_key) {
        const command = new DeleteObjectCommand({
          Bucket: recording.storage_bucket,
          Key: recording.storage_key,
        });
        await this.s3Client.send(command);
      } else if (recording.storage_provider === 'local' && recording.storage_key) {
        const filePath = path.join(this.uploadDir, recording.storage_key);
        await fs.unlink(filePath).catch(err => {
          logger.warn(`Failed to delete local file: ${filePath}`, err);
        });
      }

      // Update recording status to deleted (soft delete)
      await db('recordings')
        .where('id', recordingId)
        .update({
          status: 'deleted',
          file_url: null,
          updated_at: new Date(),
        });

      logger.info(`Recording deleted: ${recordingId}`);
    } catch (error) {
      logger.error('Error deleting recording:', error);
      throw error;
    }
  }

  async getRecordingDownloadUrl(recordingId: string): Promise<string> {
    try {
      const recording = await this.getRecordingById(recordingId);

      if (!recording) {
        throw new NotFoundError('Recording not found');
      }

      if (recording.status !== 'completed') {
        throw new BadRequestError('Recording is not ready for download');
      }

      // If using S3, generate a new signed URL
      if (recording.storage_provider === 's3' && this.s3Client && recording.storage_bucket && recording.storage_key) {
        const command = new GetObjectCommand({
          Bucket: recording.storage_bucket,
          Key: recording.storage_key,
          ResponseContentDisposition: `attachment; filename="recording-${recordingId}.${recording.file_format || 'webm'}"`,
        });

        const url = await getSignedUrl(this.s3Client, command, { expiresIn: 3600 }); // 1 hour
        return url;
      }

      // For local storage, return the file URL
      if (recording.file_url) {
        return recording.file_url;
      }

      throw new BadRequestError('Recording file not available');
    } catch (error) {
      logger.error('Error generating download URL:', error);
      throw error;
    }
  }

  async updateRecordingStatus(recordingId: string, status: Recording['status'], error?: string): Promise<void> {
    try {
      const updateData: any = {
        status,
        updated_at: new Date(),
      };

      if (status === 'processing') {
        updateData.uploaded_at = new Date();
      }

      if (status === 'completed') {
        updateData.processed_at = new Date();
      }

      if (status === 'failed' && error) {
        updateData.processing_error = error;
      }

      await db('recordings')
        .where('id', recordingId)
        .update(updateData);

      logger.info(`Recording status updated: ${recordingId} -> ${status}`);
    } catch (error) {
      logger.error('Error updating recording status:', error);
      throw error;
    }
  }

  async getTaskRecordings(taskId: string): Promise<Recording[]> {
    try {
      const recordings = await db('recordings')
        .where('task_id', taskId)
        .where('status', '!=', 'deleted')
        .orderBy('created_at', 'desc');

      return recordings;
    } catch (error) {
      logger.error('Error fetching task recordings:', error);
      throw error;
    }
  }
}

export default new RecordingService();