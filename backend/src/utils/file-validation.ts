/**
 * File Validation Utilities
 *
 * SECURITY: Validates file content using magic bytes (file signatures)
 * instead of relying on client-provided MIME types which can be spoofed.
 */

import { logger } from './logger';
import { BadRequestError } from './AppError';

// Allowed video MIME types
const ALLOWED_VIDEO_TYPES = [
  'video/webm',
  'video/mp4',
  'video/x-matroska', // mkv
  'video/quicktime', // mov
  'video/x-msvideo', // avi
  'video/ogg',
];

// Allowed image MIME types
const ALLOWED_IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/gif', 'image/webp'];

export interface FileValidationResult {
  isValid: boolean;
  detectedType: string | null;
  extension: string | null;
  error?: string;
  /** True if validation itself failed (e.g., library error) vs file being definitely invalid */
  validationFailed?: boolean;
}

// Type for file-type detection function
type FileTypeFromBufferFn = (
  buffer: Buffer | Uint8Array
) => Promise<{ ext: string; mime: string } | undefined>;

// Cache the dynamic import
let fileTypeFromBufferFn: FileTypeFromBufferFn | null = null;

async function getFileTypeFromBuffer(): Promise<FileTypeFromBufferFn> {
  if (!fileTypeFromBufferFn) {
    // Dynamic import for ESM module compatibility
    // file-type is ESM-only, so we need dynamic import
    // Handle both v19+ (fileTypeFromBuffer) and v16-18 (fromBuffer) APIs
    const mod = (await import('file-type')) as Record<string, unknown>;
    const fn = mod.fileTypeFromBuffer ?? mod.fromBuffer;
    if (typeof fn !== 'function') {
      throw new Error('file-type module does not export expected function');
    }
    fileTypeFromBufferFn = fn as FileTypeFromBufferFn;
  }
  return fileTypeFromBufferFn;
}

/**
 * Validate file content using magic bytes
 *
 * @param buffer - File buffer to validate
 * @param allowedTypes - Array of allowed MIME types
 * @returns Validation result with detected type
 */
export async function validateFileType(
  buffer: Buffer,
  allowedTypes: string[]
): Promise<FileValidationResult> {
  try {
    if (!buffer || buffer.length === 0) {
      return {
        isValid: false,
        detectedType: null,
        extension: null,
        error: 'Empty file buffer',
      };
    }

    // Detect file type from magic bytes
    const detectFileType = await getFileTypeFromBuffer();
    const fileType = await detectFileType(buffer);

    if (!fileType) {
      // Could not determine file type from content
      logger.warn('Could not determine file type from magic bytes');
      return {
        isValid: false,
        detectedType: null,
        extension: null,
        error: 'Could not determine file type from content',
      };
    }

    const { mime, ext } = fileType;

    // Check if detected type is in allowed list
    if (!allowedTypes.includes(mime)) {
      logger.warn(`File type ${mime} not in allowed types: ${allowedTypes.join(', ')}`);
      return {
        isValid: false,
        detectedType: mime,
        extension: ext,
        error: `File type ${mime} is not allowed`,
      };
    }

    return {
      isValid: true,
      detectedType: mime,
      extension: ext,
    };
  } catch (error) {
    logger.error('Error validating file type:', error);
    return {
      isValid: false,
      detectedType: null,
      extension: null,
      error: 'Error validating file type',
      validationFailed: true, // Distinguish from "definitely invalid file"
    };
  }
}

/**
 * Validate video file content
 *
 * @param buffer - Video file buffer
 * @returns Validation result
 */
export async function validateVideoFile(buffer: Buffer): Promise<FileValidationResult> {
  return validateFileType(buffer, ALLOWED_VIDEO_TYPES);
}

/**
 * Validate image file content
 *
 * @param buffer - Image file buffer
 * @returns Validation result
 */
export async function validateImageFile(buffer: Buffer): Promise<FileValidationResult> {
  return validateFileType(buffer, ALLOWED_IMAGE_TYPES);
}

/**
 * Validate video file and throw error if invalid
 *
 * @param buffer - Video file buffer
 * @param clientMimeType - Client-provided MIME type (for logging)
 * @throws BadRequestError if file is invalid
 */
export async function assertValidVideoFile(
  buffer: Buffer,
  clientMimeType?: string
): Promise<{ detectedType: string; extension: string }> {
  const result = await validateVideoFile(buffer);

  if (!result.isValid) {
    const message = clientMimeType
      ? `Invalid video file. Client claimed ${clientMimeType}, but detected ${result.detectedType || 'unknown'}`
      : `Invalid video file: ${result.error}`;

    logger.warn('Video file validation failed', {
      clientMimeType,
      detectedType: result.detectedType,
      error: result.error,
    });

    throw new BadRequestError(message);
  }

  return {
    detectedType: result.detectedType!,
    extension: result.extension!,
  };
}

/**
 * Check if client MIME type matches detected type
 * Used for logging/auditing suspicious uploads
 *
 * @param buffer - File buffer
 * @param clientMimeType - Client-provided MIME type
 * @returns True if types match, false otherwise
 */
export async function verifyClientMimeType(
  buffer: Buffer,
  clientMimeType: string
): Promise<boolean> {
  const detectFileType = await getFileTypeFromBuffer();
  const fileType = await detectFileType(buffer);

  if (!fileType) {
    return false;
  }

  // Check if the detected type matches client type
  // Be lenient with minor variations (e.g., video/x-matroska vs video/matroska)
  const detectedBase = fileType.mime.split('/')[1]?.replace('x-', '');
  const clientBase = clientMimeType.split('/')[1]?.replace('x-', '');

  const matches = detectedBase === clientBase;

  if (!matches) {
    logger.info('MIME type mismatch', {
      clientMimeType,
      detectedMimeType: fileType.mime,
      detectedExtension: fileType.ext,
    });
  }

  return matches;
}
