/**
 * Frame Extraction Service
 *
 * Extracts keyframes from video recordings for visual analysis.
 * Uses FFmpeg for frame extraction and uploads to S3.
 */

import { spawn } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import https from 'https';
import http from 'http';
// uuid not needed - frames are identified by index
import { ExtractedFrame } from '../../queues/types/job-types';
import { logger } from '../../utils/logger';
import { getAnalysisConfig } from '../../config/gemini';
import {
  getS3Client,
  getS3PublicUrlBase,
  isS3Available,
  resolveOrganizationBucket,
} from '../../config/s3';
import { PutObjectCommand, DeleteObjectCommand } from '@aws-sdk/client-s3';
import { db } from '../../config/database';

// Helper to check if S3 is configured
const isS3Configured = (): boolean => isS3Available();

// Helper to upload to S3 with org-specific bucket
const uploadToS3 = async (
  key: string,
  data: Buffer,
  contentType: string,
  bucket: string
): Promise<void> => {
  const s3Client = getS3Client();
  if (!s3Client) throw new Error('S3 not configured');

  await s3Client.send(
    new PutObjectCommand({
      Bucket: bucket,
      Key: key,
      Body: data,
      ContentType: contentType,
    })
  );
};

// Helper to get public URL
const getPublicUrl = (key: string): string => {
  const baseUrl = getS3PublicUrlBase();
  if (!baseUrl) return key;
  return `${baseUrl}/${key}`;
};

// Helper to delete from S3 with org-specific bucket
const deleteFromS3 = async (key: string, bucket: string): Promise<void> => {
  const s3Client = getS3Client();
  if (!s3Client) throw new Error('S3 not configured');

  await s3Client.send(
    new DeleteObjectCommand({
      Bucket: bucket,
      Key: key,
    })
  );
};

export interface FrameExtractionOptions {
  frameIntervalSeconds?: number;
  maxFrames?: number;
  outputFormat?: 'jpeg' | 'png';
  quality?: number;
  /** Enable scene change detection to capture important moments */
  enableSceneDetection?: boolean;
  /** Scene change sensitivity (0.0-1.0, lower = more sensitive). Default 0.3 */
  sceneChangeThreshold?: number;
}

export interface FrameExtractionResult {
  frames: ExtractedFrame[];
  processingTimeMs: number;
}

class FrameExtractionService {
  /**
   * Download video from URL to temp file
   * This is more reliable than having FFprobe access URLs directly
   */
  private async downloadToTempFile(url: string, tempDir: string): Promise<string> {
    const tempPath = path.join(tempDir, 'video.webm');
    logger.info(`Downloading video to temp file: ${tempPath}`);

    return new Promise((resolve, reject) => {
      const file = fs.createWriteStream(tempPath);
      const protocol = url.startsWith('https') ? https : http;

      protocol
        .get(url, (response) => {
          // Handle redirects
          if (response.statusCode === 301 || response.statusCode === 302) {
            const redirectUrl = response.headers.location;
            if (redirectUrl) {
              logger.debug(`Following redirect to: ${redirectUrl.substring(0, 50)}...`);
              this.downloadToTempFile(redirectUrl, tempDir).then(resolve).catch(reject);
              return;
            }
          }

          if (response.statusCode !== 200) {
            reject(new Error(`Failed to download video: HTTP ${response.statusCode}`));
            return;
          }

          response.pipe(file);
          file.on('finish', () => {
            file.close();
            logger.info(`Video downloaded: ${tempPath}`);
            resolve(tempPath);
          });
        })
        .on('error', (err) => {
          fs.unlink(tempPath, () => {}); // Clean up on error
          logger.error(`Video download failed:`, err);
          reject(err);
        });
    });
  }

  /**
   * Extract frames from a video file
   *
   * Uses a hybrid approach for long videos:
   * 1. Scene detection captures important visual changes (page loads, clicks, etc.)
   * 2. Interval frames fill gaps to ensure coverage
   * 3. Results are merged and deduplicated
   */
  async extractFrames(
    videoUrl: string,
    analysisJobId: string,
    organizationId: string,
    options?: FrameExtractionOptions
  ): Promise<FrameExtractionResult> {
    const startTime = Date.now();
    const config = getAnalysisConfig();

    const frameInterval = options?.frameIntervalSeconds ?? config.frameIntervalSeconds;
    const maxFrames = options?.maxFrames ?? config.maxFrames;
    const format = options?.outputFormat ?? 'jpeg';
    const quality = options?.quality ?? 85;
    // Scene detection settings from config or options
    const enableSceneDetection = options?.enableSceneDetection ?? config.enableSceneDetection;
    const sceneThreshold = options?.sceneChangeThreshold ?? config.sceneChangeThreshold;

    // Create temp directory for frames
    const tempDir = path.join(os.tmpdir(), `frames-${analysisJobId}`);
    await fs.promises.mkdir(tempDir, { recursive: true });

    // Resolve org-specific bucket
    const bucket = await resolveOrganizationBucket(organizationId);

    let localVideoPath: string | null = null;

    try {
      // Download video to temp file first (more reliable than FFprobe accessing URLs directly)
      localVideoPath = await this.downloadToTempFile(videoUrl, tempDir);

      // Get video duration using local file
      const duration = await this.getVideoDuration(localVideoPath);

      // Calculate actual interval to respect maxFrames
      const theoreticalFrames = Math.ceil(duration / frameInterval);
      const actualInterval = theoreticalFrames > maxFrames ? duration / maxFrames : frameInterval;

      logger.info(
        `Extracting frames: duration=${duration}s, interval=${actualInterval}s, max=${maxFrames}`
      );

      // For longer videos (> 2 minutes), use hybrid extraction
      const usesHybridExtraction = enableSceneDetection && duration > 120;

      let keyframeTimestamps: number[] = [];

      if (usesHybridExtraction) {
        // Step 1: Extract scene-change keyframes (up to half of maxFrames)
        const keyframeDir = path.join(tempDir, 'keyframes');
        await fs.promises.mkdir(keyframeDir, { recursive: true });

        logger.info(`Using hybrid extraction: scene detection + interval frames`);
        keyframeTimestamps = await this.extractSceneChangeFrames(
          localVideoPath,
          keyframeDir,
          Math.floor(maxFrames / 2), // Reserve half for scene changes
          sceneThreshold,
          format,
          quality
        );

        logger.info(`Scene detection found ${keyframeTimestamps.length} keyframes`);
      }

      // Step 2: Extract interval-based frames
      const intervalDir = path.join(tempDir, 'interval');
      await fs.promises.mkdir(intervalDir, { recursive: true });
      const framePattern = path.join(intervalDir, `frame_%04d.${format}`);
      await this.runFFmpeg(localVideoPath, framePattern, actualInterval, quality);

      // Step 3: Merge and deduplicate frames
      const allFrameData: Array<{
        filePath: string;
        timestamp: number;
        isKeyframe: boolean;
      }> = [];

      // Add interval frames
      const intervalFiles = await fs.promises.readdir(intervalDir);
      const sortedIntervalFrames = intervalFiles.filter((f) => f.startsWith('frame_')).sort();

      for (let i = 0; i < sortedIntervalFrames.length; i++) {
        const filename = sortedIntervalFrames[i]!;
        allFrameData.push({
          filePath: path.join(intervalDir, filename),
          timestamp: i * actualInterval,
          isKeyframe: false,
        });
      }

      // Add scene-detected keyframes
      if (usesHybridExtraction && keyframeTimestamps.length > 0) {
        const keyframeDir = path.join(tempDir, 'keyframes');
        const keyframeFiles = await fs.promises.readdir(keyframeDir);
        const sortedKeyframes = keyframeFiles.filter((f) => f.startsWith('keyframe_')).sort();

        for (let i = 0; i < sortedKeyframes.length && i < keyframeTimestamps.length; i++) {
          const filename = sortedKeyframes[i]!;
          allFrameData.push({
            filePath: path.join(keyframeDir, filename),
            timestamp: keyframeTimestamps[i]!,
            isKeyframe: true,
          });
        }
      }

      // Deduplicate: Remove interval frames that are within 2 seconds of a keyframe
      const deduplicatedFrames = this.deduplicateFrames(allFrameData, 2.0);

      // Sort by timestamp and limit to maxFrames
      deduplicatedFrames.sort((a, b) => a.timestamp - b.timestamp);
      const finalFrames = deduplicatedFrames.slice(0, maxFrames);

      logger.info(
        `After deduplication: ${finalFrames.length} frames (${finalFrames.filter((f) => f.isKeyframe).length} keyframes)`
      );

      // Upload frames and create records - PERFORMANCE FIX: parallelize with concurrency limit
      const frames: ExtractedFrame[] = [];
      const CONCURRENCY_LIMIT = 5; // Process 5 frames concurrently

      // Process frames in parallel batches
      for (let batchStart = 0; batchStart < finalFrames.length; batchStart += CONCURRENCY_LIMIT) {
        const batch = finalFrames.slice(batchStart, batchStart + CONCURRENCY_LIMIT);

        const batchResults = await Promise.all(
          batch.map(async (frameData, batchIndex) => {
            const globalIndex = batchStart + batchIndex;
            try {
              return await this.processFrame(
                frameData.filePath,
                globalIndex,
                frameData.timestamp,
                analysisJobId,
                organizationId,
                format,
                bucket,
                frameData.isKeyframe
              );
            } catch (error) {
              logger.warn(`Failed to process frame at ${frameData.timestamp}s:`, error);
              return null;
            }
          })
        );

        // Add successful results to frames array
        for (const result of batchResults) {
          if (result) {
            frames.push(result);
          }
        }
      }

      // Store frame records in database
      await this.storeFrameRecords(analysisJobId, frames);

      // Update analysis job with frame count
      await db('analysis_jobs').where('id', analysisJobId).update({
        total_frames_extracted: frames.length,
        updated_at: new Date(),
      });

      const keyframeCount = frames.filter((f) => f.isKeyframe).length;
      logger.info(
        `Frame extraction complete: ${frames.length} frames (${keyframeCount} keyframes from scene detection)`
      );

      return {
        frames,
        processingTimeMs: Date.now() - startTime,
      };
    } finally {
      // Cleanup temp directory
      try {
        await fs.promises.rm(tempDir, { recursive: true, force: true });
      } catch (error) {
        logger.warn('Failed to cleanup temp directory:', error);
      }
    }
  }

  /**
   * Extract frames at scene changes using FFmpeg's scene detection
   * Returns array of timestamps where scene changes were detected
   */
  private async extractSceneChangeFrames(
    videoPath: string,
    outputDir: string,
    maxKeyframes: number,
    threshold: number,
    format: string,
    quality: number
  ): Promise<number[]> {
    return new Promise((resolve) => {
      const outputPattern = path.join(outputDir, `keyframe_%04d.${format}`);

      // Use FFmpeg scene detection filter
      // select='gt(scene,threshold)' captures frames where scene change > threshold
      // showinfo outputs timestamp information to stderr
      const args = [
        '-i',
        videoPath,
        '-vf',
        `select='gt(scene,${threshold})',showinfo`,
        '-vsync',
        'vfr',
        '-q:v',
        Math.round((100 - quality) / 3).toString(),
        '-frames:v',
        maxKeyframes.toString(),
        outputPattern,
      ];

      const ffmpeg = spawn('ffmpeg', args);
      let _stderrOutput = '';
      const timestamps: number[] = [];

      ffmpeg.stderr.on('data', (data) => {
        _stderrOutput += data.toString();

        // Parse timestamps from showinfo output
        // Format: [Parsed_showinfo_1 @ ...] n:   0 pts:  12345 pts_time:1.234567
        const matches = data.toString().matchAll(/pts_time:(\d+\.?\d*)/g);
        for (const match of matches) {
          const timestamp = parseFloat(match[1]);
          if (!isNaN(timestamp) && !timestamps.includes(timestamp)) {
            timestamps.push(timestamp);
          }
        }
      });

      ffmpeg.on('close', (code) => {
        if (code === 0) {
          resolve(timestamps);
        } else {
          // Scene detection might fail on some videos - that's okay, fall back to interval-only
          logger.warn(`Scene detection returned code ${code}, using interval frames only`);
          resolve([]);
        }
      });

      ffmpeg.on('error', (err) => {
        logger.warn('Scene detection error:', err);
        resolve([]); // Don't fail, just skip scene detection
      });
    });
  }

  /**
   * Deduplicate frames by removing interval frames that are too close to keyframes
   * Keyframes are always preserved; interval frames near keyframes are removed
   */
  private deduplicateFrames(
    frames: Array<{ filePath: string; timestamp: number; isKeyframe: boolean }>,
    proximityThreshold: number
  ): Array<{ filePath: string; timestamp: number; isKeyframe: boolean }> {
    const keyframes = frames.filter((f) => f.isKeyframe);
    const intervalFrames = frames.filter((f) => !f.isKeyframe);

    // Keep interval frames that aren't too close to any keyframe
    const filteredIntervalFrames = intervalFrames.filter((intervalFrame) => {
      return !keyframes.some(
        (keyframe) => Math.abs(keyframe.timestamp - intervalFrame.timestamp) < proximityThreshold
      );
    });

    return [...keyframes, ...filteredIntervalFrames];
  }

  /**
   * Get video duration using FFprobe
   * WebM files from screen recordings often don't have duration in metadata,
   * so we try multiple methods.
   */
  private async getVideoDuration(videoPath: string): Promise<number> {
    // Method 1: Try format duration (fastest)
    try {
      const formatDuration = await this.probeForDuration(videoPath, 'format=duration');
      if (formatDuration > 0) {
        logger.info(`Video duration (from format): ${formatDuration}s`);
        return formatDuration;
      }
    } catch (e) {
      logger.debug('Format duration not available, trying stream duration...');
    }

    // Method 2: Try stream duration (for WebM files)
    try {
      const streamDuration = await this.probeForDuration(videoPath, 'stream=duration');
      if (streamDuration > 0) {
        logger.info(`Video duration (from stream): ${streamDuration}s`);
        return streamDuration;
      }
    } catch (e) {
      logger.debug('Stream duration not available, calculating from frames...');
    }

    // Method 3: Count frames and calculate duration (slowest but most reliable)
    try {
      const calculatedDuration = await this.calculateDurationFromFrames(videoPath);
      if (calculatedDuration > 0) {
        logger.info(`Video duration (calculated): ${calculatedDuration}s`);
        return calculatedDuration;
      }
    } catch (e) {
      logger.warn('Could not calculate duration from frames:', e);
    }

    // Fallback: Use a default duration for frame extraction
    logger.warn('Could not determine video duration, using default of 60 seconds');
    return 60;
  }

  /**
   * Probe for duration using specific entry
   */
  private async probeForDuration(videoPath: string, showEntry: string): Promise<number> {
    return new Promise((resolve, reject) => {
      const args = [
        '-v',
        'quiet',
        '-show_entries',
        showEntry,
        '-of',
        'default=noprint_wrappers=1:nokey=1',
        videoPath,
      ];

      const ffprobe = spawn('ffprobe', args);
      let output = '';

      ffprobe.stdout.on('data', (data) => {
        output += data.toString();
      });

      ffprobe.on('close', (code) => {
        if (code === 0) {
          const lines = output
            .trim()
            .split('\n')
            .filter((l) => l && l !== 'N/A');
          for (const line of lines) {
            const duration = parseFloat(line);
            if (!isNaN(duration) && duration > 0) {
              resolve(duration);
              return;
            }
          }
        }
        reject(new Error('Duration not found'));
      });

      ffprobe.on('error', reject);
    });
  }

  /**
   * Calculate duration by decoding video and counting frames
   */
  private async calculateDurationFromFrames(videoPath: string): Promise<number> {
    return new Promise((resolve, reject) => {
      // Get frame count and fps
      const args = [
        '-v',
        'quiet',
        '-select_streams',
        'v:0',
        '-count_frames',
        '-show_entries',
        'stream=nb_read_frames,r_frame_rate',
        '-of',
        'default=noprint_wrappers=1',
        videoPath,
      ];

      const ffprobe = spawn('ffprobe', args);
      let output = '';

      ffprobe.stdout.on('data', (data) => {
        output += data.toString();
      });

      ffprobe.on('close', (code) => {
        if (code === 0) {
          const frameMatch = output.match(/nb_read_frames=(\d+)/);
          const fpsMatch = output.match(/r_frame_rate=(\d+)\/(\d+)/);

          if (frameMatch && fpsMatch) {
            const frames = parseInt(frameMatch[1]!);
            const fpsNum = parseInt(fpsMatch[1]!);
            const fpsDen = parseInt(fpsMatch[2]!);
            const fps = fpsNum / fpsDen;

            if (frames > 0 && fps > 0) {
              const duration = frames / fps;
              resolve(duration);
              return;
            }
          }
        }
        reject(new Error('Could not calculate duration'));
      });

      ffprobe.on('error', reject);
    });
  }

  /**
   * Run FFmpeg to extract frames
   */
  private async runFFmpeg(
    inputUrl: string,
    outputPattern: string,
    interval: number,
    quality: number
  ): Promise<void> {
    return new Promise((resolve, reject) => {
      const args = [
        '-i',
        inputUrl,
        '-vf',
        `fps=1/${interval}`,
        '-q:v',
        Math.round((100 - quality) / 3).toString(), // FFmpeg quality (lower is better)
        '-vsync',
        'vfr',
        outputPattern,
      ];

      const ffmpeg = spawn('ffmpeg', args);
      let errorOutput = '';

      ffmpeg.stderr.on('data', (data) => {
        errorOutput += data.toString();
      });

      ffmpeg.on('close', (code) => {
        if (code === 0) {
          resolve();
        } else {
          reject(new Error(`FFmpeg failed with code ${code}: ${errorOutput}`));
        }
      });

      ffmpeg.on('error', reject);
    });
  }

  /**
   * Process a single frame - upload and create metadata
   */
  private async processFrame(
    filePath: string,
    index: number,
    timestampSeconds: number,
    analysisJobId: string,
    organizationId: string,
    format: string,
    bucket: string,
    isKeyframe: boolean = false
  ): Promise<ExtractedFrame> {
    const fileBuffer = await fs.promises.readFile(filePath);

    // Generate storage key - prefix keyframes for easy identification
    const prefix = isKeyframe ? 'keyframe' : 'frame';
    const storageKey = `analysis/${organizationId}/${analysisJobId}/frames/${prefix}_${index.toString().padStart(4, '0')}.${format}`;

    let url: string;

    if (isS3Configured()) {
      // Upload to S3 with org-specific bucket
      await uploadToS3(storageKey, fileBuffer, `image/${format}`, bucket);
      url = getPublicUrl(storageKey);
    } else {
      // For development, save to local uploads directory
      const localDir = path.join(process.cwd(), 'uploads', 'analysis', analysisJobId, 'frames');
      await fs.promises.mkdir(localDir, { recursive: true });
      const localPath = path.join(
        localDir,
        `${prefix}_${index.toString().padStart(4, '0')}.${format}`
      );
      await fs.promises.writeFile(localPath, fileBuffer);
      url = `/uploads/analysis/${analysisJobId}/frames/${prefix}_${index.toString().padStart(4, '0')}.${format}`;
    }

    // Get image dimensions (basic check for JPEG)
    let width: number | undefined;
    let height: number | undefined;

    if (format === 'jpeg' && fileBuffer.length > 10) {
      const dimensions = this.getJpegDimensions(fileBuffer);
      width = dimensions?.width;
      height = dimensions?.height;
    }

    return {
      index,
      timestampSeconds,
      url,
      storageKey,
      width,
      height,
      isKeyframe,
    };
  }

  /**
   * Get JPEG dimensions from buffer
   */
  private getJpegDimensions(buffer: Buffer): { width: number; height: number } | null {
    try {
      let offset = 2; // Skip SOI marker
      while (offset < buffer.length) {
        if (buffer[offset] !== 0xff) break;
        const marker = buffer[offset + 1];

        // SOF markers (Start of Frame)
        if (marker !== undefined && marker >= 0xc0 && marker <= 0xc3) {
          const height = buffer.readUInt16BE(offset + 5);
          const width = buffer.readUInt16BE(offset + 7);
          return { width, height };
        }

        // Skip marker
        const length = buffer.readUInt16BE(offset + 2);
        offset += 2 + length;
      }
    } catch {
      // Ignore parsing errors
    }
    return null;
  }

  /**
   * Store frame records in database
   */
  private async storeFrameRecords(analysisJobId: string, frames: ExtractedFrame[]): Promise<void> {
    if (frames.length === 0) return;

    const records = frames.map((frame) => ({
      analysis_job_id: analysisJobId,
      frame_index: frame.index,
      timestamp_seconds: frame.timestampSeconds,
      frame_url: frame.url,
      storage_key: frame.storageKey,
      width: frame.width,
      height: frame.height,
      is_keyframe: frame.isKeyframe || false,
    }));

    await db('analysis_frames').insert(records);
  }

  /**
   * Delete frames for an analysis job (from S3 and database)
   * Called after analysis completes to clean up storage
   */
  async deleteFrames(analysisJobId: string): Promise<{ deleted: number; errors: number }> {
    // Get analysis job to find organization
    const analysisJob = await db('analysis_jobs').where('id', analysisJobId).first();

    // Resolve org-specific bucket
    const bucket = await resolveOrganizationBucket(analysisJob?.organization_id);

    // Get frame records
    const frames = await db('analysis_frames')
      .where('analysis_job_id', analysisJobId)
      .select('storage_key');

    let deleted = 0;
    let errors = 0;

    // Delete from S3 if configured
    if (isS3Configured() && frames.length > 0) {
      logger.info(`Deleting ${frames.length} frames from S3 for analysis job ${analysisJobId}`);

      // Delete frames in parallel with concurrency limit
      const BATCH_SIZE = 10;
      for (let i = 0; i < frames.length; i += BATCH_SIZE) {
        const batch = frames.slice(i, i + BATCH_SIZE);
        const results = await Promise.allSettled(
          batch.map(async (frame) => {
            if (frame.storage_key) {
              await deleteFromS3(frame.storage_key, bucket);
              return true;
            }
            return false;
          })
        );

        for (const result of results) {
          if (result.status === 'fulfilled' && result.value) {
            deleted++;
          } else if (result.status === 'rejected') {
            errors++;
            logger.warn(`Failed to delete frame from S3`, { error: result.reason });
          }
        }
      }

      logger.info(`S3 frame cleanup complete: ${deleted} deleted, ${errors} errors`);
    }

    // Delete database records
    await db('analysis_frames').where('analysis_job_id', analysisJobId).delete();

    return { deleted, errors };
  }
}

export const frameExtractionService = new FrameExtractionService();
