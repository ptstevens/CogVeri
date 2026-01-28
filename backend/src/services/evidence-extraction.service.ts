/**
 * Evidence Extraction Service
 *
 * Extracts and stores ground truth evidence from template videos during rubric generation.
 * This evidence enables direct comparison between template and submission videos,
 * addressing the "two-layer AI abstraction" problem.
 *
 * The problem:
 *   Template Video → AI generates abstract criteria → Submission Video → AI re-interprets
 *
 * The solution:
 *   Store verbatim evidence (transcript excerpts, reference frames) for direct comparison.
 */

import { logger } from '../utils/logger';
import { db } from '../config/database';
import crypto from 'crypto';
import { RubricStep } from '../schemas/rubric.schema';

/**
 * Transcript segment with timing information
 */
export interface TranscriptSegment {
  text: string;
  startTime: number;
  endTime: number;
}

/**
 * Frame description from rubric generation
 */
export interface FrameDescription {
  timestampSeconds: number;
  description: string;
  url?: string; // S3 URL if available
}

/**
 * Evidence extracted for a rubric step
 */
export interface ExtractedEvidence {
  rubricStepId: string;
  speechExcerpt?: string;
  speechStartTime?: number;
  speechEndTime?: number;
  visualFrameUrl?: string;
  visualFrameHash?: string;
  visualFrameTimestamp?: number;
  confidence: number;
  extractionMetadata: {
    matchMethod: 'keyword' | 'phrase' | 'timestamp' | 'semantic';
    matchScore: number;
    candidatesConsidered: number;
  };
}

/**
 * Result of evidence extraction
 */
export interface ExtractionResult {
  templateId?: string;
  tempVideoId?: string;
  evidenceCount: number;
  evidence: ExtractedEvidence[];
  processingTimeMs: number;
}

class EvidenceExtractionService {
  /**
   * Extract and store evidence from template video during rubric generation.
   * Can be called with either templateId (if template already exists) or
   * tempVideoId (during rubric generation, before template is created).
   */
  async extractAndStoreEvidence(params: {
    templateId?: string;
    tempVideoId?: string;
    rubricSteps: RubricStep[];
    transcriptSegments: TranscriptSegment[];
    frameDescriptions: FrameDescription[];
    fullTranscript?: string;
  }): Promise<ExtractionResult> {
    const startTime = Date.now();
    const { templateId, tempVideoId, rubricSteps, transcriptSegments, frameDescriptions, fullTranscript } = params;

    if (!templateId && !tempVideoId) {
      throw new Error('Either templateId or tempVideoId must be provided');
    }

    logger.info('Starting evidence extraction', {
      templateId,
      tempVideoId,
      stepsCount: rubricSteps.length,
      segmentsCount: transcriptSegments.length,
      framesCount: frameDescriptions.length,
    });

    const extractedEvidence: ExtractedEvidence[] = [];

    for (const step of rubricSteps) {
      const evidence = await this.extractEvidenceForStep({
        step,
        transcriptSegments,
        frameDescriptions,
        fullTranscript,
      });

      if (evidence) {
        extractedEvidence.push(evidence);
      }
    }

    // Store evidence in database
    if (extractedEvidence.length > 0) {
      await this.storeEvidence({ templateId, tempVideoId }, extractedEvidence);
    }

    const processingTimeMs = Date.now() - startTime;

    logger.info('Evidence extraction completed', {
      templateId,
      tempVideoId,
      evidenceCount: extractedEvidence.length,
      processingTimeMs,
    });

    return {
      templateId,
      tempVideoId,
      evidenceCount: extractedEvidence.length,
      evidence: extractedEvidence,
      processingTimeMs,
    };
  }

  /**
   * Extract evidence for a single rubric step
   */
  private async extractEvidenceForStep(params: {
    step: RubricStep;
    transcriptSegments: TranscriptSegment[];
    frameDescriptions: FrameDescription[];
    fullTranscript?: string;
  }): Promise<ExtractedEvidence | null> {
    const { step, transcriptSegments, frameDescriptions, fullTranscript } = params;

    const evidence: ExtractedEvidence = {
      rubricStepId: step.id,
      confidence: 0,
      extractionMetadata: {
        matchMethod: 'keyword',
        matchScore: 0,
        candidatesConsidered: 0,
      },
    };

    let hasEvidence = false;

    // Extract speech evidence for speech or both evidence types
    if (step.evidenceType === 'speech' || step.evidenceType === 'both') {
      const speechEvidence = this.findBestSpeechEvidence({
        step,
        transcriptSegments,
        fullTranscript,
      });

      if (speechEvidence) {
        evidence.speechExcerpt = speechEvidence.excerpt;
        evidence.speechStartTime = speechEvidence.startTime;
        evidence.speechEndTime = speechEvidence.endTime;
        evidence.extractionMetadata = speechEvidence.metadata;
        evidence.confidence = Math.max(evidence.confidence, speechEvidence.confidence);
        hasEvidence = true;
      }
    }

    // Extract visual evidence for visual or both evidence types
    if (step.evidenceType === 'visual' || step.evidenceType === 'both') {
      const visualEvidence = this.findBestVisualEvidence({
        step,
        frameDescriptions,
        speechTimestamp: evidence.speechStartTime,
      });

      if (visualEvidence) {
        evidence.visualFrameUrl = visualEvidence.frameUrl;
        evidence.visualFrameHash = visualEvidence.frameHash;
        evidence.visualFrameTimestamp = visualEvidence.timestamp;
        evidence.confidence = Math.max(evidence.confidence, visualEvidence.confidence);
        hasEvidence = true;
      }
    }

    return hasEvidence ? evidence : null;
  }

  /**
   * Find the best matching transcript segment for a rubric step
   */
  private findBestSpeechEvidence(params: {
    step: RubricStep;
    transcriptSegments: TranscriptSegment[];
    fullTranscript?: string;
  }): {
    excerpt: string;
    startTime: number;
    endTime: number;
    confidence: number;
    metadata: ExtractedEvidence['extractionMetadata'];
  } | null {
    const { step, transcriptSegments } = params;

    if (transcriptSegments.length === 0) {
      return null;
    }

    const speechCriteria = step.speechCriteria;
    if (!speechCriteria) {
      return null;
    }

    const keywords = speechCriteria.requiredKeywords || [];
    const phrases = speechCriteria.requiredPhrases || [];

    // Score each segment based on keyword/phrase matches
    const scoredSegments = transcriptSegments.map((segment) => {
      const text = segment.text.toLowerCase();
      let score = 0;

      // Score keyword matches
      const keywordMatches = keywords.filter((kw) => text.includes(kw.toLowerCase()));
      score += keywordMatches.length * 1;

      // Score phrase matches (worth more)
      const phraseMatches = phrases.filter((phrase) => text.includes(phrase.toLowerCase()));
      score += phraseMatches.length * 3;

      return { segment, score, keywordMatches: keywordMatches.length, phraseMatches: phraseMatches.length };
    });

    // Sort by score descending
    scoredSegments.sort((a, b) => b.score - a.score);

    const best = scoredSegments[0];
    if (!best || best.score === 0) {
      // No matches found - use temporal heuristic based on step order
      const stepIndex = parseInt(step.id.replace('step-', ''), 10) || step.order;
      const segmentIndex = Math.min(
        Math.floor((stepIndex - 1) * (transcriptSegments.length / 10)),
        transcriptSegments.length - 1
      );
      const fallbackSegment = transcriptSegments[segmentIndex];

      if (fallbackSegment) {
        return {
          excerpt: fallbackSegment.text,
          startTime: fallbackSegment.startTime,
          endTime: fallbackSegment.endTime,
          confidence: 0.3, // Low confidence for fallback
          metadata: {
            matchMethod: 'timestamp',
            matchScore: 0,
            candidatesConsidered: transcriptSegments.length,
          },
        };
      }
      return null;
    }

    // For better context, try to include adjacent segments
    const bestIndex = transcriptSegments.indexOf(best.segment);
    let startIndex = bestIndex;
    let endIndex = bestIndex;

    // Include previous segment if it has some matches too
    const prevSegmentScore = bestIndex > 0
      ? scoredSegments.find((s) => s.segment === transcriptSegments[bestIndex - 1])?.score ?? 0
      : 0;
    if (prevSegmentScore > 0) {
      startIndex = bestIndex - 1;
    }

    // Include next segment if it has some matches too
    const nextSegmentScore = bestIndex < transcriptSegments.length - 1
      ? scoredSegments.find((s) => s.segment === transcriptSegments[bestIndex + 1])?.score ?? 0
      : 0;
    if (nextSegmentScore > 0) {
      endIndex = bestIndex + 1;
    }

    const excerptSegments = transcriptSegments.slice(startIndex, endIndex + 1);
    if (excerptSegments.length === 0) {
      return null;
    }

    const excerpt = excerptSegments.map((s) => s.text).join(' ');
    const firstSegment = excerptSegments[0]!; // Safe: we checked length > 0
    const lastSegment = excerptSegments[excerptSegments.length - 1]!; // Safe: we checked length > 0

    // Calculate confidence based on match quality
    const maxPossibleScore = keywords.length + phrases.length * 3;
    const confidence = maxPossibleScore > 0 ? Math.min(1, best.score / maxPossibleScore) : 0.5;

    return {
      excerpt,
      startTime: firstSegment.startTime,
      endTime: lastSegment.endTime,
      confidence: Math.max(0.4, confidence), // Minimum 0.4 if we found matches
      metadata: {
        matchMethod: best.phraseMatches > 0 ? 'phrase' : 'keyword',
        matchScore: best.score,
        candidatesConsidered: transcriptSegments.length,
      },
    };
  }

  /**
   * Find the best matching frame for a rubric step
   */
  private findBestVisualEvidence(params: {
    step: RubricStep;
    frameDescriptions: FrameDescription[];
    speechTimestamp?: number;
  }): {
    frameUrl?: string;
    frameHash?: string;
    timestamp: number;
    confidence: number;
  } | null {
    const { step, frameDescriptions, speechTimestamp } = params;

    if (frameDescriptions.length === 0) {
      return null;
    }

    const visualCriteria = step.visualCriteria;
    if (!visualCriteria && !speechTimestamp) {
      return null;
    }

    const expectedElements = visualCriteria?.expectedElements || [];
    const expectedActions = visualCriteria?.expectedActions || [];

    // Score each frame based on description matches
    const scoredFrames = frameDescriptions.map((frame) => {
      const desc = frame.description.toLowerCase();
      let score = 0;

      // Score element matches
      const elementMatches = expectedElements.filter((el) => desc.includes(el.toLowerCase()));
      score += elementMatches.length * 2;

      // Score action matches
      const actionMatches = expectedActions.filter((action) => desc.includes(action.toLowerCase()));
      score += actionMatches.length * 2;

      // Bonus for temporal proximity to speech evidence
      if (speechTimestamp !== undefined) {
        const timeDiff = Math.abs(frame.timestampSeconds - speechTimestamp);
        if (timeDiff < 5) {
          score += 3; // Strong bonus for close temporal match
        } else if (timeDiff < 10) {
          score += 1; // Small bonus for somewhat close
        }
      }

      return { frame, score };
    });

    // Sort by score descending
    scoredFrames.sort((a, b) => b.score - a.score);

    const best = scoredFrames[0];

    // If no good matches, use temporal heuristic or speech timestamp
    if (!best || best.score === 0) {
      // Use speech timestamp if available
      if (speechTimestamp !== undefined && frameDescriptions.length > 0) {
        const closestFrame = frameDescriptions.reduce((closest, frame) => {
          const closestDiff = Math.abs(closest.timestampSeconds - speechTimestamp);
          const frameDiff = Math.abs(frame.timestampSeconds - speechTimestamp);
          return frameDiff < closestDiff ? frame : closest;
        });

        return {
          frameUrl: closestFrame.url,
          frameHash: closestFrame.url ? this.hashUrl(closestFrame.url) : undefined,
          timestamp: closestFrame.timestampSeconds,
          confidence: 0.4, // Low confidence for temporal fallback
        };
      }

      // Fall back to step order heuristic
      const stepIndex = parseInt(step.id.replace('step-', ''), 10) || step.order;
      const frameIndex = Math.min(
        Math.floor((stepIndex - 1) * (frameDescriptions.length / 10)),
        frameDescriptions.length - 1
      );
      const fallbackFrame = frameDescriptions[frameIndex];

      if (!fallbackFrame) {
        return null;
      }

      return {
        frameUrl: fallbackFrame.url,
        frameHash: fallbackFrame.url ? this.hashUrl(fallbackFrame.url) : undefined,
        timestamp: fallbackFrame.timestampSeconds,
        confidence: 0.3, // Very low confidence for fallback
      };
    }

    // Calculate confidence
    const maxPossibleScore = expectedElements.length * 2 + expectedActions.length * 2 + 3;
    const confidence = maxPossibleScore > 0 ? Math.min(1, best.score / maxPossibleScore) : 0.5;

    return {
      frameUrl: best.frame.url,
      frameHash: best.frame.url ? this.hashUrl(best.frame.url) : undefined,
      timestamp: best.frame.timestampSeconds,
      confidence: Math.max(0.5, confidence),
    };
  }

  /**
   * Generate a hash for a URL (for comparison purposes)
   */
  private hashUrl(url: string): string {
    return crypto.createHash('sha256').update(url).digest('hex').substring(0, 16);
  }

  /**
   * Store extracted evidence in the database
   */
  private async storeEvidence(
    identifier: { templateId?: string; tempVideoId?: string },
    evidence: ExtractedEvidence[]
  ): Promise<void> {
    const { templateId, tempVideoId } = identifier;

    // Delete existing evidence for this template or temp video (in case of regeneration)
    if (templateId) {
      await db('template_evidence').where('template_id', templateId).delete();
    }
    if (tempVideoId) {
      await db('template_evidence').where('temp_video_id', tempVideoId).delete();
    }

    // Insert new evidence
    const rows = evidence.map((e) => ({
      template_id: templateId || null,
      temp_video_id: tempVideoId || null,
      rubric_step_id: e.rubricStepId,
      speech_excerpt: e.speechExcerpt,
      speech_start_time: e.speechStartTime,
      speech_end_time: e.speechEndTime,
      visual_frame_url: e.visualFrameUrl,
      visual_frame_hash: e.visualFrameHash,
      visual_frame_timestamp: e.visualFrameTimestamp,
      confidence: e.confidence,
      extraction_metadata: JSON.stringify(e.extractionMetadata),
    }));

    if (rows.length > 0) {
      await db('template_evidence').insert(rows);
    }

    logger.info('Stored template evidence', {
      templateId,
      tempVideoId,
      evidenceCount: rows.length,
    });
  }

  /**
   * Link evidence from a temp video to a newly created template.
   * Call this after creating a template from a rubric generation result.
   */
  async linkEvidenceToTemplate(tempVideoId: string, templateId: string): Promise<number> {
    const result = await db('template_evidence')
      .where('temp_video_id', tempVideoId)
      .whereNull('template_id')
      .update({
        template_id: templateId,
        temp_video_id: null, // Clear temp reference
        updated_at: new Date(),
      });

    logger.info('Linked evidence to template', {
      tempVideoId,
      templateId,
      linkedCount: result,
    });

    return result;
  }

  /**
   * Get evidence by temp video ID (during rubric generation preview)
   */
  async getEvidenceByTempVideoId(tempVideoId: string): Promise<ExtractedEvidence[]> {
    const rows = await db('template_evidence')
      .where('temp_video_id', tempVideoId)
      .orderBy('rubric_step_id', 'asc');

    return this.mapEvidenceRows(rows);
  }

  /**
   * Retrieve evidence for a template
   */
  async getEvidenceForTemplate(templateId: string): Promise<ExtractedEvidence[]> {
    const rows = await db('template_evidence').where('template_id', templateId).orderBy('rubric_step_id', 'asc');
    return this.mapEvidenceRows(rows);
  }

  /**
   * Map database rows to ExtractedEvidence objects
   */
  private mapEvidenceRows(
    rows: Array<{
      rubric_step_id: string;
      speech_excerpt: string | null;
      speech_start_time: string | null;
      speech_end_time: string | null;
      visual_frame_url: string | null;
      visual_frame_hash: string | null;
      visual_frame_timestamp: string | null;
      confidence: string | null;
      extraction_metadata: string | null;
    }>
  ): ExtractedEvidence[] {
    return rows.map((row) => ({
      rubricStepId: row.rubric_step_id,
      speechExcerpt: row.speech_excerpt || undefined,
      speechStartTime: row.speech_start_time ? parseFloat(row.speech_start_time) : undefined,
      speechEndTime: row.speech_end_time ? parseFloat(row.speech_end_time) : undefined,
      visualFrameUrl: row.visual_frame_url || undefined,
      visualFrameHash: row.visual_frame_hash || undefined,
      visualFrameTimestamp: row.visual_frame_timestamp ? parseFloat(row.visual_frame_timestamp) : undefined,
      confidence: row.confidence ? parseFloat(row.confidence) : 0,
      extractionMetadata: row.extraction_metadata ? JSON.parse(row.extraction_metadata) : {},
    }));
  }

  /**
   * Check if a template has evidence stored
   */
  async hasEvidence(templateId: string): Promise<boolean> {
    const result = await db('template_evidence').where('template_id', templateId).count('id as count').first();
    const count = result?.count;
    const numCount = typeof count === 'string' ? parseInt(count, 10) : (count ?? 0);
    return numCount > 0;
  }
}

export const evidenceExtractionService = new EvidenceExtractionService();
export default evidenceExtractionService;
