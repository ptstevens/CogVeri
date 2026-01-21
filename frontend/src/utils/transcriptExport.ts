/**
 * Transcript Export Utilities
 * Provides functions to export transcription data in various formats:
 * - SRT (SubRip Subtitle) - Most common subtitle format
 * - VTT (WebVTT) - Web-native subtitle format
 * - TXT (Plain Text) - Simple text transcript
 * - JSON - Structured data with timestamps
 */

export interface TranscriptionSegment {
  id?: string;
  start_time: number;
  end_time: number;
  text: string;
  speaker?: string;
}

export interface TranscriptionData {
  recordingId: string;
  transcriptText: string;
  language: string;
  duration: number;
  segments: TranscriptionSegment[];
}

/**
 * Format seconds to SRT timestamp format (HH:MM:SS,mmm)
 */
const formatSRTTime = (seconds: number): string => {
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const secs = Math.floor(seconds % 60);
  const millis = Math.round((seconds % 1) * 1000);

  return (
    `${hours.toString().padStart(2, '0')}:` +
    `${minutes.toString().padStart(2, '0')}:` +
    `${secs.toString().padStart(2, '0')},` +
    `${millis.toString().padStart(3, '0')}`
  );
};

/**
 * Format seconds to VTT timestamp format (HH:MM:SS.mmm)
 */
const formatVTTTime = (seconds: number): string => {
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const secs = Math.floor(seconds % 60);
  const millis = Math.round((seconds % 1) * 1000);

  return (
    `${hours.toString().padStart(2, '0')}:` +
    `${minutes.toString().padStart(2, '0')}:` +
    `${secs.toString().padStart(2, '0')}.` +
    `${millis.toString().padStart(3, '0')}`
  );
};

/**
 * Export transcription as SRT format
 * SRT is the most widely supported subtitle format
 */
export const exportToSRT = (transcription: TranscriptionData): string => {
  const lines: string[] = [];

  transcription.segments.forEach((segment, index) => {
    // Sequence number (1-based)
    lines.push((index + 1).toString());

    // Timestamp line
    lines.push(
      `${formatSRTTime(segment.start_time)} --> ${formatSRTTime(segment.end_time)}`
    );

    // Text (with optional speaker prefix)
    const text = segment.speaker
      ? `[${segment.speaker}] ${segment.text}`
      : segment.text;
    lines.push(text);

    // Empty line between entries
    lines.push('');
  });

  return lines.join('\n');
};

/**
 * Export transcription as WebVTT format
 * VTT is the native web subtitle format, supported by HTML5 video
 */
export const exportToVTT = (transcription: TranscriptionData): string => {
  const lines: string[] = ['WEBVTT', ''];

  // Add metadata
  lines.push(`Language: ${transcription.language}`);
  lines.push('');

  transcription.segments.forEach((segment, index) => {
    // Optional cue identifier
    lines.push(`cue-${index + 1}`);

    // Timestamp line
    lines.push(
      `${formatVTTTime(segment.start_time)} --> ${formatVTTTime(segment.end_time)}`
    );

    // Text (with optional speaker prefix using VTT voice tag)
    const text = segment.speaker
      ? `<v ${segment.speaker}>${segment.text}`
      : segment.text;
    lines.push(text);

    // Empty line between entries
    lines.push('');
  });

  return lines.join('\n');
};

/**
 * Export transcription as plain text
 * Simple format with optional timestamps
 */
export const exportToTXT = (
  transcription: TranscriptionData,
  options: {
    includeTimestamps?: boolean;
    includeSpeakers?: boolean;
    paragraphMode?: boolean;
  } = {}
): string => {
  const {
    includeTimestamps = false,
    includeSpeakers = true,
    paragraphMode = false,
  } = options;

  if (paragraphMode) {
    // Group by speaker and create paragraphs
    const paragraphs: string[] = [];
    let currentSpeaker: string | undefined;
    let currentText: string[] = [];

    transcription.segments.forEach((segment) => {
      if (segment.speaker !== currentSpeaker && currentText.length > 0) {
        // Start new paragraph
        const prefix = includeSpeakers && currentSpeaker ? `[${currentSpeaker}]: ` : '';
        paragraphs.push(prefix + currentText.join(' '));
        currentText = [];
      }

      currentSpeaker = segment.speaker;
      currentText.push(segment.text.trim());
    });

    // Add final paragraph
    if (currentText.length > 0) {
      const prefix = includeSpeakers && currentSpeaker ? `[${currentSpeaker}]: ` : '';
      paragraphs.push(prefix + currentText.join(' '));
    }

    return paragraphs.join('\n\n');
  }

  // Line-by-line format
  const lines: string[] = [];

  transcription.segments.forEach((segment) => {
    const parts: string[] = [];

    if (includeTimestamps) {
      const mins = Math.floor(segment.start_time / 60);
      const secs = Math.floor(segment.start_time % 60);
      parts.push(`[${mins}:${secs.toString().padStart(2, '0')}]`);
    }

    if (includeSpeakers && segment.speaker) {
      parts.push(`${segment.speaker}:`);
    }

    parts.push(segment.text.trim());
    lines.push(parts.join(' '));
  });

  return lines.join('\n');
};

/**
 * Export transcription as JSON
 * Preserves all data including timestamps and metadata
 */
export const exportToJSON = (
  transcription: TranscriptionData,
  options: { pretty?: boolean } = {}
): string => {
  const { pretty = true } = options;

  const exportData = {
    recordingId: transcription.recordingId,
    language: transcription.language,
    duration: transcription.duration,
    generatedAt: new Date().toISOString(),
    transcript: transcription.transcriptText,
    segments: transcription.segments.map((segment, index) => ({
      index,
      startTime: segment.start_time,
      endTime: segment.end_time,
      text: segment.text,
      speaker: segment.speaker,
    })),
  };

  return pretty
    ? JSON.stringify(exportData, null, 2)
    : JSON.stringify(exportData);
};

/**
 * Download transcription as a file
 */
export const downloadTranscript = (
  transcription: TranscriptionData,
  format: 'srt' | 'vtt' | 'txt' | 'json',
  filename?: string
): void => {
  let content: string;
  let mimeType: string;
  let extension: string;

  switch (format) {
    case 'srt':
      content = exportToSRT(transcription);
      mimeType = 'application/x-subrip';
      extension = 'srt';
      break;
    case 'vtt':
      content = exportToVTT(transcription);
      mimeType = 'text/vtt';
      extension = 'vtt';
      break;
    case 'txt':
      content = exportToTXT(transcription, { includeTimestamps: true });
      mimeType = 'text/plain';
      extension = 'txt';
      break;
    case 'json':
      content = exportToJSON(transcription);
      mimeType = 'application/json';
      extension = 'json';
      break;
    default:
      throw new Error(`Unsupported format: ${format}`);
  }

  // Create blob and download
  const blob = new Blob([content], { type: `${mimeType};charset=utf-8` });
  const url = URL.createObjectURL(blob);

  const link = document.createElement('a');
  link.href = url;
  link.download = filename || `transcript-${transcription.recordingId}.${extension}`;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);

  // Cleanup
  URL.revokeObjectURL(url);
};

/**
 * Get VTT data URL for use with HTML5 video track element
 */
export const getVTTDataUrl = (transcription: TranscriptionData): string => {
  const vttContent = exportToVTT(transcription);
  const blob = new Blob([vttContent], { type: 'text/vtt' });
  return URL.createObjectURL(blob);
};

export default {
  exportToSRT,
  exportToVTT,
  exportToTXT,
  exportToJSON,
  downloadTranscript,
  getVTTDataUrl,
};
