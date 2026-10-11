/**
 * Similarity Scoring Service
 *
 * Calculates direct similarity between submission content and template evidence.
 * This bypasses the AI abstraction layer for more consistent scoring.
 *
 * Scoring approach:
 * - High similarity (>85%): Strong indicator of YES
 * - Medium similarity (30-85%): Blend with AI judgment
 * - Low similarity (<30%): Rely on AI judgment
 *
 * Final score blending:
 *   finalScore = (aiScore * AI_WEIGHT) + (similarityScore * SIMILARITY_WEIGHT)
 */

import { logger } from '../../utils/logger';
import { evidenceExtractionService, ExtractedEvidence } from '../evidence-extraction.service';
import { RubricStep } from '../../schemas/rubric.schema';
import { StepScoreValue } from '../../queues/types/job-types';

/**
 * Configuration for similarity scoring
 */
export const SIMILARITY_CONFIG = {
  // Thresholds for automatic scoring
  HIGH_SIMILARITY_THRESHOLD: 0.85, // Above this → likely YES
  LOW_SIMILARITY_THRESHOLD: 0.3, // Below this → rely on AI

  // Weights for blending AI and similarity scores
  AI_WEIGHT: 0.4,
  SIMILARITY_WEIGHT: 0.6,

  // Minimum word overlap for meaningful comparison
  MIN_WORDS_FOR_COMPARISON: 3,
};

/**
 * Result of similarity comparison for a single step
 */
export interface SimilarityResult {
  stepId: string;
  speechSimilarity?: number; // 0.0-1.0
  visualSimilarity?: number; // 0.0-1.0
  overallSimilarity: number; // 0.0-1.0
  matchedKeywords: string[];
  matchedPhrases: string[];
  confidence: number;
  recommendation: 'YES' | 'PARTIAL' | 'NO' | 'USE_AI';
}

/**
 * Full similarity analysis response
 */
export interface SimilarityAnalysisResponse {
  results: SimilarityResult[];
  templateId?: string;
  hasEvidence: boolean;
  processingTimeMs: number;
}

/**
 * Transcript segment for comparison
 */
interface TranscriptSegment {
  text: string;
  start_time: number;
  end_time: number;
}

class SimilarityScoringService {
  /**
   * Analyze similarity between submission and template evidence
   */
  async analyzeSimilarity(params: {
    templateId: string;
    submissionTranscript: string;
    submissionSegments: TranscriptSegment[];
    rubricSteps: RubricStep[];
  }): Promise<SimilarityAnalysisResponse> {
    const startTime = Date.now();
    const { templateId, submissionTranscript, submissionSegments, rubricSteps } = params;

    // Get template evidence
    const evidence = await evidenceExtractionService.getEvidenceForTemplate(templateId);

    if (evidence.length === 0) {
      logger.info('No template evidence found, will use AI-only analysis', { templateId });
      return {
        results: rubricSteps.map((step) => ({
          stepId: step.id,
          overallSimilarity: 0,
          matchedKeywords: [],
          matchedPhrases: [],
          confidence: 0,
          recommendation: 'USE_AI' as const,
        })),
        templateId,
        hasEvidence: false,
        processingTimeMs: Date.now() - startTime,
      };
    }

    logger.info('Calculating similarity scores', {
      templateId,
      evidenceCount: evidence.length,
      stepsCount: rubricSteps.length,
    });

    const results: SimilarityResult[] = [];

    for (const step of rubricSteps) {
      const stepEvidence = evidence.find((e) => e.rubricStepId === step.id);
      const result = this.calculateStepSimilarity({
        step,
        evidence: stepEvidence,
        submissionTranscript,
        submissionSegments,
      });
      results.push(result);
    }

    return {
      results,
      templateId,
      hasEvidence: true,
      processingTimeMs: Date.now() - startTime,
    };
  }

  /**
   * Calculate similarity for a single rubric step
   */
  private calculateStepSimilarity(params: {
    step: RubricStep;
    evidence?: ExtractedEvidence;
    submissionTranscript: string;
    submissionSegments: TranscriptSegment[];
  }): SimilarityResult {
    const { step, evidence, submissionTranscript, submissionSegments } = params;

    const result: SimilarityResult = {
      stepId: step.id,
      overallSimilarity: 0,
      matchedKeywords: [],
      matchedPhrases: [],
      confidence: 0,
      recommendation: 'USE_AI',
    };

    // If no evidence, can't calculate similarity
    if (!evidence) {
      return result;
    }

    // Calculate speech similarity if applicable
    if (
      (step.evidenceType === 'speech' || step.evidenceType === 'both') &&
      evidence.speechExcerpt
    ) {
      const speechResult = this.calculateSpeechSimilarity({
        templateExcerpt: evidence.speechExcerpt,
        templateStartTime: evidence.speechStartTime,
        templateEndTime: evidence.speechEndTime,
        submissionTranscript,
        submissionSegments,
        speechCriteria: step.speechCriteria,
      });

      result.speechSimilarity = speechResult.similarity;
      result.matchedKeywords = speechResult.matchedKeywords;
      result.matchedPhrases = speechResult.matchedPhrases;
    }

    // Calculate visual similarity if applicable (placeholder for now)
    if (
      (step.evidenceType === 'visual' || step.evidenceType === 'both') &&
      evidence.visualFrameUrl
    ) {
      // Visual similarity would require frame comparison
      // For now, we'll rely on AI for visual analysis
      result.visualSimilarity = undefined;
    }

    // Calculate overall similarity
    if (step.evidenceType === 'speech' && result.speechSimilarity !== undefined) {
      result.overallSimilarity = result.speechSimilarity;
    } else if (step.evidenceType === 'visual' && result.visualSimilarity !== undefined) {
      result.overallSimilarity = result.visualSimilarity;
    } else if (step.evidenceType === 'both') {
      const speech = result.speechSimilarity ?? 0;
      const visual = result.visualSimilarity ?? 0;
      // If we have both, average. If only speech, use speech.
      if (result.visualSimilarity !== undefined) {
        result.overallSimilarity = (speech + visual) / 2;
      } else {
        result.overallSimilarity = speech;
      }
    }

    // Determine recommendation based on similarity
    result.confidence = evidence.confidence;
    result.recommendation = this.getRecommendation(result.overallSimilarity);

    return result;
  }

  /**
   * Calculate speech similarity between template excerpt and submission
   */
  private calculateSpeechSimilarity(params: {
    templateExcerpt: string;
    templateStartTime?: number;
    templateEndTime?: number;
    submissionTranscript: string;
    submissionSegments: TranscriptSegment[];
    speechCriteria?: RubricStep['speechCriteria'];
  }): {
    similarity: number;
    matchedKeywords: string[];
    matchedPhrases: string[];
  } {
    const { templateExcerpt, submissionTranscript, speechCriteria } = params;

    const templateWords = this.tokenize(templateExcerpt);
    const submissionWords = this.tokenize(submissionTranscript);

    if (templateWords.length < SIMILARITY_CONFIG.MIN_WORDS_FOR_COMPARISON) {
      return { similarity: 0, matchedKeywords: [], matchedPhrases: [] };
    }

    // Calculate word overlap (Jaccard-like similarity)
    const templateSet = new Set(templateWords);
    const submissionSet = new Set(submissionWords);
    const intersection = new Set([...templateSet].filter((x) => submissionSet.has(x)));
    const union = new Set([...templateSet, ...submissionSet]);

    const jaccardSimilarity = intersection.size / union.size;

    // Calculate n-gram similarity for phrase matching
    const templateBigrams = this.getNgrams(templateWords, 2);
    const submissionBigrams = this.getNgrams(submissionWords, 2);
    const bigramIntersection = templateBigrams.filter((bg) => submissionBigrams.includes(bg));
    const bigramSimilarity =
      templateBigrams.length > 0 ? bigramIntersection.length / templateBigrams.length : 0;

    // Check keyword matches from criteria
    const matchedKeywords: string[] = [];
    const matchedPhrases: string[] = [];

    if (speechCriteria) {
      const submissionLower = submissionTranscript.toLowerCase();

      for (const keyword of speechCriteria.requiredKeywords || []) {
        if (submissionLower.includes(keyword.toLowerCase())) {
          matchedKeywords.push(keyword);
        }
      }

      for (const phrase of speechCriteria.requiredPhrases || []) {
        if (submissionLower.includes(phrase.toLowerCase())) {
          matchedPhrases.push(phrase);
        }
      }
    }

    // Boost similarity based on keyword/phrase matches
    let keywordBoost = 0;
    if (speechCriteria) {
      const totalRequired =
        (speechCriteria.requiredKeywords?.length || 0) +
        (speechCriteria.requiredPhrases?.length || 0);
      if (totalRequired > 0) {
        const matchedCount = matchedKeywords.length + matchedPhrases.length * 2; // Phrases worth more
        keywordBoost = Math.min(0.3, (matchedCount / totalRequired) * 0.3);
      }
    }

    // Combine similarities with weights
    const combinedSimilarity = jaccardSimilarity * 0.4 + bigramSimilarity * 0.3 + keywordBoost;

    // Normalize to 0-1 range
    const finalSimilarity = Math.min(1, combinedSimilarity);

    return {
      similarity: finalSimilarity,
      matchedKeywords,
      matchedPhrases,
    };
  }

  /**
   * Tokenize text into words
   */
  private tokenize(text: string): string[] {
    return text
      .toLowerCase()
      .replace(/[^\w\s]/g, ' ')
      .split(/\s+/)
      .filter((word) => word.length > 2); // Filter very short words
  }

  /**
   * Get n-grams from word array
   */
  private getNgrams(words: string[], n: number): string[] {
    const ngrams: string[] = [];
    for (let i = 0; i <= words.length - n; i++) {
      ngrams.push(words.slice(i, i + n).join(' '));
    }
    return ngrams;
  }

  /**
   * Get recommendation based on similarity score
   */
  private getRecommendation(similarity: number): SimilarityResult['recommendation'] {
    if (similarity >= SIMILARITY_CONFIG.HIGH_SIMILARITY_THRESHOLD) {
      return 'YES';
    } else if (similarity >= SIMILARITY_CONFIG.LOW_SIMILARITY_THRESHOLD) {
      return 'PARTIAL'; // Will be blended with AI
    } else {
      return 'USE_AI';
    }
  }

  /**
   * Blend AI score with similarity score
   */
  blendScores(
    aiScore: StepScoreValue,
    similarityResult: SimilarityResult
  ): {
    finalScore: StepScoreValue;
    blendedNumeric: number;
    reasoning: string;
  } {
    // Convert AI score to numeric
    const aiNumeric = this.scoreToNumeric(aiScore);

    // If no meaningful similarity, use AI score directly
    if (similarityResult.recommendation === 'USE_AI' || similarityResult.overallSimilarity === 0) {
      return {
        finalScore: aiScore,
        blendedNumeric: aiNumeric,
        reasoning: `AI score only (no template evidence): ${aiScore}`,
      };
    }

    // If high similarity, boost toward YES
    if (similarityResult.recommendation === 'YES') {
      const blended =
        aiNumeric * SIMILARITY_CONFIG.AI_WEIGHT + 1.0 * SIMILARITY_CONFIG.SIMILARITY_WEIGHT;
      return {
        finalScore: this.numericToScore(blended),
        blendedNumeric: blended,
        reasoning: `High similarity (${(similarityResult.overallSimilarity * 100).toFixed(0)}%) boosted score. AI: ${aiScore}, Keywords matched: ${similarityResult.matchedKeywords.join(', ')}`,
      };
    }

    // Blend AI and similarity scores
    const similarityNumeric = similarityResult.overallSimilarity;
    const blended =
      aiNumeric * SIMILARITY_CONFIG.AI_WEIGHT +
      similarityNumeric * SIMILARITY_CONFIG.SIMILARITY_WEIGHT;

    return {
      finalScore: this.numericToScore(blended),
      blendedNumeric: blended,
      reasoning: `Blended score. AI: ${aiScore} (${aiNumeric.toFixed(2)}), Similarity: ${(similarityNumeric * 100).toFixed(0)}%, Final: ${blended.toFixed(2)}`,
    };
  }

  /**
   * Convert score enum to numeric value
   */
  private scoreToNumeric(score: StepScoreValue): number {
    switch (score) {
      case 'YES':
        return 1.0;
      case 'PARTIAL':
        return 0.5;
      case 'NO':
        return 0.0;
      case 'UNABLE_TO_ASSESS':
        return 0.0;
      default:
        return 0.0;
    }
  }

  /**
   * Convert numeric score to enum
   */
  private numericToScore(numeric: number): StepScoreValue {
    if (numeric >= 0.75) return 'YES';
    if (numeric >= 0.4) return 'PARTIAL';
    return 'NO';
  }
}

export const similarityScoringService = new SimilarityScoringService();
export default similarityScoringService;
