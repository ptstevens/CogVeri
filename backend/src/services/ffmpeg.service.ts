/**
 * FFmpeg Service
 * Handles video/audio processing operations using FFmpeg.
 * - Audio extraction for transcription
 * - Video transcoding to multiple resolutions
 * - Thumbnail generation
 * - HLS segment generation for adaptive streaming
 */

import { exec, spawn, ChildProcess } from 'child_process';
import { promisify } from 'util';
import path from 'path';
import fs from 'fs/promises';
import os from 'os';
import { v4 as uuidv4 } from 'uuid';
import { logger } from '../utils/logger';
import { BadRequestError } from '../utils/AppError';

const execPromise = promisify(exec);

// Track active FFmpeg processes for cleanup on shutdown
const activeProcesses = new Set<ChildProcess>();

// Default timeout for FFmpeg operations (30 minutes)
const DEFAULT_TIMEOUT_MS = 30 * 60 * 1000;

// Security: Path validation constants
const SAFE_PATH_REGEX = /^[a-zA-Z0-9_\-\/\.\s:]+$/;
const MAX_PATH_LENGTH = 4096;

/**
 * Kill all active FFmpeg processes - called on app shutdown
 */
export function cleanupAllFFmpegProcesses(): void {
  logger.info(`Cleaning up ${activeProcesses.size} active FFmpeg processes`);
  for (const proc of activeProcesses) {
    try {
      proc.kill('SIGTERM');
      // Give it 5 seconds then force kill
      setTimeout(() => {
        if (!proc.killed) {
          proc.kill('SIGKILL');
        }
      }, 5000);
    } catch (error) {
      logger.warn('Error killing FFmpeg process:', error);
    }
  }
  activeProcesses.clear();
}

// Register shutdown handlers
process.on('SIGTERM', () => {
  cleanupAllFFmpegProcesses();
});
process.on('SIGINT', () => {
  cleanupAllFFmpegProcesses();
});

export interface VideoMetadata {
  duration: number;
  width: number;
  height: number;
  fps: number;
  bitrate: number;
  codec: string;
  audioCodec?: string;
  hasAudio: boolean;
  format: string;
  size: number;
}

export interface TranscodeOptions {
  quality: 'low' | 'medium' | 'high' | 'original';
  format: 'mp4' | 'webm';
  maxBitrate?: number;
  audioBitrate?: number;
  frameRate?: number;
  stripAudio?: boolean;
}

export interface ThumbnailOptions {
  timestamp?: number;
  width?: number;
  height?: number;
  format?: 'jpeg' | 'png' | 'webp';
}

export interface HLSOptions {
  segmentDuration?: number;
  qualities?: Array<{
    width: number;
    height: number;
    bitrate: number;
    name: string;
  }>;
}

interface ProgressCallback {
  (progress: number, stage: string): void;
}

// Quality presets for transcoding
const QUALITY_PRESETS = {
  low: { width: 854, height: 480, bitrate: 1000, audioBitrate: 96 },
  medium: { width: 1280, height: 720, bitrate: 2500, audioBitrate: 128 },
  high: { width: 1920, height: 1080, bitrate: 5000, audioBitrate: 192 },
  original: { width: 0, height: 0, bitrate: 0, audioBitrate: 0 }, // Keep original
};

class FFmpegService {
  private tempDir: string;
  private ffmpegPath: string;
  private ffprobePath: string;

  constructor() {
    this.tempDir = process.env.FFMPEG_TEMP_DIR || path.join(os.tmpdir(), 'cogveri-ffmpeg');
    this.ffmpegPath = process.env.FFMPEG_PATH || 'ffmpeg';
    this.ffprobePath = process.env.FFPROBE_PATH || 'ffprobe';

    // Ensure temp directory exists
    this.ensureTempDir();
  }

  private async ensureTempDir(): Promise<void> {
    try {
      await fs.mkdir(this.tempDir, { recursive: true });
    } catch (error) {
      logger.error('Failed to create FFmpeg temp directory:', error);
    }
  }

  /**
   * Security: Validate file paths to prevent command injection and path traversal
   * @throws BadRequestError if path is invalid
   */
  private validateFilePath(filePath: string, context: string): void {
    if (!filePath || typeof filePath !== 'string') {
      throw new BadRequestError(`Invalid file path for ${context}: path is required`);
    }
    if (filePath.length > MAX_PATH_LENGTH) {
      throw new BadRequestError(`File path too long for ${context}`);
    }
    if (!SAFE_PATH_REGEX.test(filePath)) {
      logger.warn(`Security: Invalid characters in file path for ${context}`, {
        pathLength: filePath.length,
        context
      });
      throw new BadRequestError(`File path contains invalid characters for ${context}`);
    }
    if (filePath.includes('..')) {
      logger.warn(`Security: Path traversal attempt detected for ${context}`, { context });
      throw new BadRequestError(`Path traversal not allowed for ${context}`);
    }
  }

  /**
   * Check if FFmpeg is available on the system
   */
  async isAvailable(): Promise<boolean> {
    try {
      await execPromise(`${this.ffmpegPath} -version`);
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Get video metadata using FFprobe
   */
  async getMetadata(inputPath: string): Promise<VideoMetadata> {
    this.validateFilePath(inputPath, 'getMetadata');
    try {
      const { stdout } = await execPromise(
        `${this.ffprobePath} -v quiet -print_format json -show_format -show_streams "${inputPath}"`
      );

      const probeData = JSON.parse(stdout);
      const videoStream = probeData.streams?.find((s: any) => s.codec_type === 'video');
      const audioStream = probeData.streams?.find((s: any) => s.codec_type === 'audio');
      const format = probeData.format;

      if (!videoStream) {
        throw new BadRequestError('No video stream found in file');
      }

      // Parse frame rate (can be "30/1" or "29.97")
      let fps = 30;
      if (videoStream.r_frame_rate) {
        const [num, den] = videoStream.r_frame_rate.split('/');
        fps = den ? Number(num) / Number(den) : Number(num);
      }

      return {
        duration: parseFloat(format.duration) || 0,
        width: videoStream.width || 0,
        height: videoStream.height || 0,
        fps: Math.round(fps * 100) / 100,
        bitrate: parseInt(format.bit_rate) || 0,
        codec: videoStream.codec_name || 'unknown',
        audioCodec: audioStream?.codec_name,
        hasAudio: !!audioStream,
        format: format.format_name || 'unknown',
        size: parseInt(format.size) || 0,
      };
    } catch (error) {
      logger.error('Error getting video metadata:', error);
      throw new BadRequestError('Failed to read video metadata');
    }
  }

  /**
   * Extract audio from video for transcription
   * Outputs 16kHz mono WAV (optimal for Whisper)
   */
  async extractAudio(
    inputPath: string,
    outputPath?: string,
    onProgress?: ProgressCallback
  ): Promise<string> {
    this.validateFilePath(inputPath, 'extractAudio');
    if (outputPath) {
      this.validateFilePath(outputPath, 'extractAudio output');
    }
    const output = outputPath || path.join(this.tempDir, `${uuidv4()}.wav`);

    try {
      // First get duration for progress calculation
      const metadata = await this.getMetadata(inputPath);
      const duration = metadata.duration;

      onProgress?.(0, 'extracting');

      // FFmpeg command for optimal Whisper input:
      // -vn: no video
      // -acodec pcm_s16le: 16-bit PCM (lossless)
      // -ar 16000: 16kHz sample rate (Whisper optimal)
      // -ac 1: mono channel
      const args = [
        '-i', inputPath,
        '-vn',
        '-acodec', 'pcm_s16le',
        '-ar', '16000',
        '-ac', '1',
        '-y', // Overwrite output
        output,
      ];

      await this.runFFmpegWithProgress(args, duration, (progress) => {
        onProgress?.(progress, 'extracting');
      });

      onProgress?.(100, 'completed');
      logger.info(`Audio extracted: ${output}`);

      return output;
    } catch (error) {
      logger.error('Error extracting audio:', error);
      // Cleanup on error
      try {
        await fs.unlink(output);
      } catch {}
      throw error;
    }
  }

  /**
   * Transcode video to specified quality/format
   */
  async transcodeVideo(
    inputPath: string,
    options: TranscodeOptions,
    outputPath?: string,
    onProgress?: ProgressCallback
  ): Promise<{ outputPath: string; metadata: VideoMetadata }> {
    this.validateFilePath(inputPath, 'transcodeVideo');
    if (outputPath) {
      this.validateFilePath(outputPath, 'transcodeVideo output');
    }
    const format = options.format || 'mp4';
    const output = outputPath || path.join(this.tempDir, `${uuidv4()}.${format}`);

    try {
      const inputMetadata = await this.getMetadata(inputPath);
      const duration = inputMetadata.duration;

      onProgress?.(0, 'transcoding');

      const preset = QUALITY_PRESETS[options.quality];
      const args: string[] = ['-i', inputPath];

      // Video codec settings
      if (format === 'mp4') {
        args.push('-c:v', 'libx264', '-preset', 'medium', '-profile:v', 'high');
      } else {
        args.push('-c:v', 'libvpx-vp9', '-deadline', 'good', '-cpu-used', '2');
      }

      // Scale if not original quality
      if (options.quality !== 'original' && preset.width > 0) {
        // Scale to target height, maintain aspect ratio
        // -2 ensures width is divisible by 2 (required for H.264)
        const targetHeight = Math.min(preset.height, inputMetadata.height);
        args.push('-vf', `scale=-2:${targetHeight}`);
      }

      // Bitrate settings
      if (options.maxBitrate || (options.quality !== 'original' && preset.bitrate > 0)) {
        const bitrate = options.maxBitrate || preset.bitrate;
        args.push('-b:v', `${bitrate}k`, '-maxrate', `${bitrate * 1.2}k`, '-bufsize', `${bitrate * 2}k`);
      }

      // Frame rate
      if (options.frameRate) {
        args.push('-r', options.frameRate.toString());
      }

      // Audio settings
      if (options.stripAudio) {
        args.push('-an');
      } else {
        if (format === 'mp4') {
          args.push('-c:a', 'aac');
        } else {
          args.push('-c:a', 'libopus');
        }
        const audioBitrate = options.audioBitrate || preset.audioBitrate || 128;
        args.push('-b:a', `${audioBitrate}k`);
      }

      // Output settings
      args.push('-movflags', '+faststart'); // Enable fast start for web playback
      args.push('-y', output);

      await this.runFFmpegWithProgress(args, duration, (progress) => {
        onProgress?.(progress, 'transcoding');
      });

      const outputMetadata = await this.getMetadata(output);
      onProgress?.(100, 'completed');

      logger.info(`Video transcoded: ${output}`, {
        quality: options.quality,
        format,
        outputSize: outputMetadata.size,
      });

      return { outputPath: output, metadata: outputMetadata };
    } catch (error) {
      logger.error('Error transcoding video:', error);
      try {
        await fs.unlink(output);
      } catch {}
      throw error;
    }
  }

  /**
   * Generate thumbnail from video
   */
  async generateThumbnail(
    inputPath: string,
    options: ThumbnailOptions = {},
    outputPath?: string
  ): Promise<{ outputPath: string; width: number; height: number; size: number }> {
    this.validateFilePath(inputPath, 'generateThumbnail');
    if (outputPath) {
      this.validateFilePath(outputPath, 'generateThumbnail output');
    }
    const format = options.format || 'jpeg';
    const extension = format === 'jpeg' ? 'jpg' : format;
    const output = outputPath || path.join(this.tempDir, `${uuidv4()}.${extension}`);

    try {
      const metadata = await this.getMetadata(inputPath);

      // Default to 20 seconds in (avoids blank screens at start)
      // Falls back to 25% of duration if video is shorter than 25 seconds
      const defaultTimestamp = metadata.duration > 25 ? 20 : metadata.duration * 0.25;
      const timestamp = options.timestamp ?? defaultTimestamp;

      // Build FFmpeg command
      const args = [
        '-ss', timestamp.toString(),
        '-i', inputPath,
        '-vframes', '1',
      ];

      // Scale if dimensions specified
      if (options.width || options.height) {
        const width = options.width || -1;
        const height = options.height || -1;
        args.push('-vf', `scale=${width}:${height}`);
      }

      // Format-specific settings
      if (format === 'jpeg') {
        args.push('-q:v', '2'); // High quality JPEG
      } else if (format === 'webp') {
        args.push('-quality', '85');
      }

      args.push('-y', output);

      await execPromise(`${this.ffmpegPath} ${args.map(a => `"${a}"`).join(' ')}`);

      // Get output dimensions
      const { stdout } = await execPromise(
        `${this.ffprobePath} -v quiet -print_format json -show_streams "${output}"`
      );
      const probeData = JSON.parse(stdout);
      const imageStream = probeData.streams?.[0];

      const stats = await fs.stat(output);

      logger.info(`Thumbnail generated: ${output}`);

      return {
        outputPath: output,
        width: imageStream?.width || 0,
        height: imageStream?.height || 0,
        size: stats.size,
      };
    } catch (error) {
      logger.error('Error generating thumbnail:', error);
      try {
        await fs.unlink(output);
      } catch {}
      throw error;
    }
  }

  /**
   * Generate HLS segments for adaptive streaming
   */
  async generateHLS(
    inputPath: string,
    outputDir: string,
    options: HLSOptions = {},
    onProgress?: ProgressCallback
  ): Promise<{ playlistPath: string; segments: string[] }> {
    this.validateFilePath(inputPath, 'generateHLS');
    this.validateFilePath(outputDir, 'generateHLS output');
    const segmentDuration = options.segmentDuration || 6;
    const qualities = options.qualities || [
      { width: 854, height: 480, bitrate: 1000, name: '480p' },
      { width: 1280, height: 720, bitrate: 2500, name: '720p' },
      { width: 1920, height: 1080, bitrate: 5000, name: '1080p' },
    ];

    try {
      await fs.mkdir(outputDir, { recursive: true });

      const metadata = await this.getMetadata(inputPath);
      const duration = metadata.duration;

      onProgress?.(0, 'generating_hls');

      // Generate each quality variant
      const variantPlaylists: string[] = [];

      for (let i = 0; i < qualities.length; i++) {
        const quality = qualities[i];

        // Skip qualities higher than source or undefined qualities
        if (!quality || quality.height > metadata.height) continue;

        const variantDir = path.join(outputDir, quality.name);
        await fs.mkdir(variantDir, { recursive: true });

        const playlistName = `${quality.name}.m3u8`;
        const segmentPattern = `segment_%03d.ts`;

        const args = [
          '-i', inputPath,
          '-c:v', 'libx264',
          '-preset', 'fast',
          '-profile:v', 'main',
          '-vf', `scale=-2:${quality.height}`,
          '-b:v', `${quality.bitrate}k`,
          '-maxrate', `${quality.bitrate * 1.2}k`,
          '-bufsize', `${quality.bitrate * 2}k`,
          '-c:a', 'aac',
          '-b:a', '128k',
          '-hls_time', segmentDuration.toString(),
          '-hls_list_size', '0',
          '-hls_segment_filename', path.join(variantDir, segmentPattern),
          '-y', path.join(variantDir, playlistName),
        ];

        const progressOffset = (i / qualities.length) * 100;
        const progressScale = 100 / qualities.length;

        await this.runFFmpegWithProgress(args, duration, (progress) => {
          const totalProgress = progressOffset + (progress * progressScale / 100);
          onProgress?.(Math.round(totalProgress), 'generating_hls');
        });

        variantPlaylists.push({
          path: `${quality.name}/${playlistName}`,
          bandwidth: quality.bitrate * 1000,
          resolution: `${quality.width}x${quality.height}`,
        } as any);
      }

      // Generate master playlist
      const masterPlaylist = this.generateMasterPlaylist(variantPlaylists as any);
      const masterPlaylistPath = path.join(outputDir, 'master.m3u8');
      await fs.writeFile(masterPlaylistPath, masterPlaylist);

      // Collect all segment files
      const segments: string[] = [];
      for (const quality of qualities) {
        const variantDir = path.join(outputDir, quality.name);
        try {
          const files = await fs.readdir(variantDir);
          segments.push(...files.filter(f => f.endsWith('.ts')).map(f => `${quality.name}/${f}`));
        } catch {}
      }

      onProgress?.(100, 'completed');
      logger.info(`HLS generated: ${masterPlaylistPath}`, { segments: segments.length });

      return { playlistPath: masterPlaylistPath, segments };
    } catch (error) {
      logger.error('Error generating HLS:', error);
      throw error;
    }
  }

  /**
   * Generate master playlist content
   */
  private generateMasterPlaylist(
    variants: Array<{ path: string; bandwidth: number; resolution: string }>
  ): string {
    let content = '#EXTM3U\n#EXT-X-VERSION:3\n\n';

    for (const variant of variants) {
      content += `#EXT-X-STREAM-INF:BANDWIDTH=${variant.bandwidth},RESOLUTION=${variant.resolution}\n`;
      content += `${variant.path}\n\n`;
    }

    return content;
  }

  /**
   * Run FFmpeg with progress tracking
   */
  private runFFmpegWithProgress(
    args: string[],
    duration: number,
    onProgress?: (progress: number) => void,
    timeoutMs: number = DEFAULT_TIMEOUT_MS
  ): Promise<void> {
    return new Promise((resolve, reject) => {
      const ffmpegProcess = spawn(this.ffmpegPath, args);
      
      // Track this process for cleanup on app shutdown
      activeProcesses.add(ffmpegProcess);
      
      let stderr = '';
      let isCompleted = false;
      
      // Setup timeout to prevent hanging processes
      const timeoutId = setTimeout(() => {
        if (!isCompleted) {
          logger.error(`FFmpeg process timed out after ${timeoutMs}ms`);
          cleanup();
          ffmpegProcess.kill('SIGKILL');
          reject(new Error(`FFmpeg operation timed out after ${timeoutMs / 1000} seconds`));
        }
      }, timeoutMs);
      
      // Cleanup function to remove from tracking and clear timeout
      const cleanup = () => {
        isCompleted = true;
        clearTimeout(timeoutId);
        activeProcesses.delete(ffmpegProcess);
      };

      ffmpegProcess.stderr.on('data', (data) => {
        stderr += data.toString();

        // Parse FFmpeg progress output
        const timeMatch = stderr.match(/time=(\d{2}):(\d{2}):(\d{2})\.(\d{2})/);
        if (timeMatch && duration > 0) {
          const hours = parseInt(timeMatch[1]!);
          const minutes = parseInt(timeMatch[2]!);
          const seconds = parseInt(timeMatch[3]!);
          const currentTime = hours * 3600 + minutes * 60 + seconds;
          const progress = Math.min(99, Math.round((currentTime / duration) * 100));
          onProgress?.(progress);
        }
      });

      ffmpegProcess.on('close', (code) => {
        cleanup();
        if (code === 0) {
          resolve();
        } else {
          reject(new Error(`FFmpeg exited with code ${code}: ${stderr.slice(-500)}`));
        }
      });

      ffmpegProcess.on('error', (err) => {
        cleanup();
        // Ensure process is killed on error
        if (!ffmpegProcess.killed) {
          ffmpegProcess.kill('SIGKILL');
        }
        reject(err);
      });
    });
  }

  /**
   * Clean up temporary files
   */
  async cleanup(filePath: string): Promise<void> {
    try {
      await fs.unlink(filePath);
      logger.debug(`Cleaned up temp file: ${filePath}`);
    } catch (error) {
      logger.warn(`Failed to cleanup temp file: ${filePath}`, error);
    }
  }

  /**
   * Clean up old temp files (older than maxAge hours)
   */
  async cleanupOldFiles(maxAgeHours: number = 24): Promise<number> {
    try {
      const files = await fs.readdir(this.tempDir);
      const maxAgeMs = maxAgeHours * 60 * 60 * 1000;
      const now = Date.now();
      let cleaned = 0;

      for (const file of files) {
        const filePath = path.join(this.tempDir, file);
        try {
          const stats = await fs.stat(filePath);
          if (now - stats.mtimeMs > maxAgeMs) {
            await fs.unlink(filePath);
            cleaned++;
          }
        } catch {}
      }

      if (cleaned > 0) {
        logger.info(`Cleaned up ${cleaned} old temp files`);
      }

      return cleaned;
    } catch (error) {
      logger.error('Error cleaning up old files:', error);
      return 0;
    }
  }
}

export const ffmpegService = new FFmpegService();
export default ffmpegService;
