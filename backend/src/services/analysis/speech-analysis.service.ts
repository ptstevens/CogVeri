/**
 * Speech Analysis Service
 *
 * Analyzes transcripts against rubric speech criteria using Gemini AI.
 */

import {
  getTextAnalysisModel,
  estimateCost,
  TokenUsage,
  type GenerativeModel,
} from '../../config/gemini';
import { RubricStep, SpeechEvidence, StepScoreValue } from '../../queues/types/job-types';
import { buildSpeechAnalysisPrompt } from './prompts/analysis.prompts';
import { getSpeechAnalysisPrompt } from './prompts/prompt-resolver';
import { logger } from '../../utils/logger';
import { retryGeminiCall } from '../../utils/gemini-retry';
import { geminiRateLimiter } from './gemini-rate-limiter';

/**
 * Transcript segment from database
 */
export interface TranscriptSegment {
  id?: string;
  text: string;
  // Note: decimal columns may return as strings from PostgreSQL
  start_time: number | string;
  end_time: number | string;
  speaker?: string;
  confidence?: number;
}

/**
 * Speech analysis result for a single step
 */
export interface SpeechAnalysisResult {
  stepId: string;
  score: StepScoreValue;
  confidence: number;
  evidence: SpeechEvidence;
  reasoning: string;
}

/**
 * Full speech analysis response
 */
export interface SpeechAnalysisResponse {
  results: SpeechAnalysisResult[];
  tokensUsed: TokenUsage;
  processingTimeMs: number;
}

/**
 * Speech Analysis Service class
 */
class SpeechAnalysisService {
  // Lazy-initialized to avoid errors during import when GEMINI_API_KEY is not set (e.g., in tests)
  private _model: GenerativeModel | null = null;

  private get model(): GenerativeModel {
    if (!this._model) {
      this._model = getTextAnalysisModel();
    }
    return this._model;
  }

  /**
   * Analyze transcript against speech criteria in rubric steps
   */
  async analyzeTranscript(
    transcriptText: string,
    segments: TranscriptSegment[],
    rubricSteps: RubricStep[]
  ): Promise<SpeechAnalysisResponse> {
    const startTime = Date.now();

    // Filter steps that have speech criteria
    const stepsWithSpeech = rubricSteps.filter(
      (s) => s.evidenceType === 'speech' || s.evidenceType === 'both'
    );

    if (stepsWithSpeech.length === 0) {
      return {
        results: [],
        tokensUsed: { inputTokens: 0, outputTokens: 0, totalTokens: 0 },
        processingTimeMs: Date.now() - startTime,
      };
    }

    // If transcript is empty, return NO for all steps
    if (!transcriptText || transcriptText.trim().length === 0) {
      logger.warn('Empty transcript provided for speech analysis');
      return {
        results: stepsWithSpeech.map((step) => ({
          stepId: step.id,
          score: 'NO' as StepScoreValue,
          confidence: 1.0,
          evidence: {
            keywordsFound: [],
            keywordsMissing: step.speechCriteria?.requiredKeywords || [],
            relevantExcerpts: [],
            speechScore: 'NO',
            speechConfidence: 1.0,
          },
          reasoning: 'No transcript available for analysis',
        })),
        tokensUsed: { inputTokens: 0, outputTokens: 0, totalTokens: 0 },
        processingTimeMs: Date.now() - startTime,
      };
    }

    try {
      // Build the analysis prompt
      // Note: decimal columns may return as strings from PostgreSQL, need to ensure numbers
      const prompt = buildSpeechAnalysisPrompt(
        transcriptText,
        segments.map((s) => ({
          text: s.text,
          startTime: typeof s.start_time === 'string' ? parseFloat(s.start_time) : s.start_time,
          endTime: typeof s.end_time === 'string' ? parseFloat(s.end_time) : s.end_time,
        })),
        stepsWithSpeech
      );

      // Wait for rate limit capacity (estimate ~5K tokens for speech analysis)
      await geminiRateLimiter.waitForCapacity(5000);

      // Fetch system prompt (from DB with fallback to hardcoded)
      const systemPrompt = await getSpeechAnalysisPrompt();

      // Call Gemini (with retry for rate limits)
      const result = await retryGeminiCall(
        () => this.model.generateContent([{ text: systemPrompt }, { text: prompt }]),
        'speech analysis'
      );

      const response = result.response;
      const responseText = response.text();

      // Extract token usage
      const usageMetadata = response.usageMetadata;
      const tokensUsed: TokenUsage = {
        inputTokens: usageMetadata?.promptTokenCount || 0,
        outputTokens: usageMetadata?.candidatesTokenCount || 0,
        totalTokens: usageMetadata?.totalTokenCount || 0,
      };

      // Record actual usage for rate limiting
      geminiRateLimiter.recordUsage(tokensUsed.totalTokens);

      // Parse the JSON response
      const analysisResults = this.parseAnalysisResponse(responseText, stepsWithSpeech);

      logger.info(
        `Speech analysis complete: ${analysisResults.length} steps analyzed, ` +
          `${tokensUsed.totalTokens} tokens used, ` +
          `cost: $${estimateCost(tokensUsed).toFixed(4)}`
      );

      return {
        results: analysisResults,
        tokensUsed,
        processingTimeMs: Date.now() - startTime,
      };
    } catch (error) {
      logger.error('Speech analysis failed:', error);

      // Fall back to simple keyword matching
      return this.fallbackAnalysis(transcriptText, segments, stepsWithSpeech, startTime);
    }
  }

  /**
   * Parse the AI response into structured results
   */
  private parseAnalysisResponse(responseText: string, steps: RubricStep[]): SpeechAnalysisResult[] {
    try {
      // Extract JSON from response (handle markdown code blocks)
      let jsonStr = responseText.trim();

      // Try to match complete code blocks first
      const jsonMatch = responseText.match(/```(?:json)?\s*([\s\S]*?)```/);
      if (jsonMatch && jsonMatch[1]) {
        jsonStr = jsonMatch[1].trim();
      } else {
        // Fallback: strip opening/closing code fences separately
        // Handles cases where AI returns partial code blocks
        jsonStr = jsonStr.replace(/^```(?:json)?\s*\n?/, '');
        jsonStr = jsonStr.replace(/\n?```\s*$/, '');
      }

      const parsed = JSON.parse(jsonStr);
      const stepResults = parsed.stepResults || [];

      return steps.map((step) => {
        const result = stepResults.find((r: any) => r.stepId === step.id);

        if (!result) {
          return {
            stepId: step.id,
            score: 'UNABLE_TO_ASSESS' as StepScoreValue,
            confidence: 0,
            evidence: {
              keywordsFound: [],
              keywordsMissing: step.speechCriteria?.requiredKeywords || [],
              relevantExcerpts: [],
              speechScore: 'NO',
              speechConfidence: 0,
            },
            reasoning: 'Step not found in analysis results',
          };
        }

        return {
          stepId: step.id,
          score: this.normalizeScore(result.score),
          confidence: parseFloat(result.confidence) || 0,
          evidence: {
            keywordsFound: result.keywordsFound || [],
            keywordsMissing: result.keywordsMissing || [],
            relevantExcerpts: (result.relevantExcerpts || []).map((e: any) => ({
              text: e.text,
              startTime: e.startTime,
              endTime: e.endTime,
            })),
            speechScore: this.normalizeScore(result.score) as 'YES' | 'PARTIAL' | 'NO',
            speechConfidence: parseFloat(result.confidence) || 0,
          },
          reasoning: result.reasoning || '',
        };
      });
    } catch (error) {
      logger.error('Failed to parse speech analysis response:', error);
      throw error;
    }
  }

  /**
   * Normalize score string to valid enum value
   */
  private normalizeScore(score: string): StepScoreValue {
    const normalized = score?.toUpperCase();
    if (normalized === 'YES') return 'YES';
    if (normalized === 'PARTIAL') return 'PARTIAL';
    if (normalized === 'NO') return 'NO';
    return 'UNABLE_TO_ASSESS';
  }

  /**
   * Fallback to simple keyword matching if AI fails
   */
  private fallbackAnalysis(
    transcriptText: string,
    segments: TranscriptSegment[],
    steps: RubricStep[],
    startTime: number
  ): SpeechAnalysisResponse {
    logger.info('Using fallback keyword matching for speech analysis');

    const transcriptLower = transcriptText.toLowerCase();

    const results: SpeechAnalysisResult[] = steps.map((step) => {
      const speechCriteria = step.speechCriteria;

      if (!speechCriteria) {
        return {
          stepId: step.id,
          score: 'UNABLE_TO_ASSESS' as StepScoreValue,
          confidence: 0,
          evidence: {
            keywordsFound: [],
            keywordsMissing: [],
            relevantExcerpts: [],
            speechScore: 'NO',
            speechConfidence: 0,
          },
          reasoning: 'No speech criteria defined',
        };
      }

      // ── Keyword matching with stemming-lite ──
      // Use word-boundary matching and common suffix stripping to handle
      // plurals, tenses, and minor Whisper transcription variations
      const stemLite = (word: string) =>
        word
          .toLowerCase()
          .replace(
            /(ing|tion|sion|ment|ness|able|ible|ful|less|ous|ive|ise|ize|ised|ized|ising|izing|ed|er|est|ly|s|es)$/,
            ''
          );

      const transcriptWords = transcriptLower.split(/\s+/).map((w) => w.replace(/[^a-z0-9]/g, ''));
      const transcriptStems = transcriptWords.map(stemLite);

      const fuzzyKeywordMatch = (kw: string): boolean => {
        const kwLower = kw.toLowerCase();
        // Exact substring match (original behavior)
        if (transcriptLower.includes(kwLower)) return true;
        // Stem match — handles plurals, tenses, etc.
        const kwStem = stemLite(kwLower);
        if (
          kwStem.length >= 3 &&
          transcriptStems.some((ts) => ts === kwStem || ts.includes(kwStem) || kwStem.includes(ts))
        )
          return true;
        return false;
      };

      const fuzzyPhraseMatch = (phrase: string): boolean => {
        const phraseLower = phrase.toLowerCase();
        // Exact substring match
        if (transcriptLower.includes(phraseLower)) return true;
        // Word overlap: if >60% of phrase words appear in transcript, it's a match
        const phraseWords = phraseLower.split(/\s+/).filter((w) => w.length > 2);
        if (phraseWords.length === 0) return false;
        const matchedWords = phraseWords.filter((pw) =>
          transcriptWords.some(
            (tw) => tw.includes(pw) || pw.includes(tw) || stemLite(tw) === stemLite(pw)
          )
        );
        return matchedWords.length / phraseWords.length >= 0.6;
      };

      const keywordsFound = speechCriteria.requiredKeywords.filter(fuzzyKeywordMatch);
      const keywordsMissing = speechCriteria.requiredKeywords.filter(
        (kw) => !fuzzyKeywordMatch(kw)
      );

      const phrasesFound = speechCriteria.requiredPhrases.filter(fuzzyPhraseMatch);

      // Find relevant excerpts (also use fuzzy matching)
      const relevantExcerpts = segments
        .filter((seg) => {
          const segLower = seg.text.toLowerCase();
          return (
            speechCriteria.requiredKeywords.some(
              (kw) => segLower.includes(kw.toLowerCase()) || fuzzyKeywordMatch(kw)
            ) ||
            speechCriteria.requiredPhrases.some((phrase) => segLower.includes(phrase.toLowerCase()))
          );
        })
        .slice(0, 5)
        .map((seg) => ({
          text: seg.text,
          startTime:
            typeof seg.start_time === 'string' ? parseFloat(seg.start_time) : seg.start_time,
          endTime: typeof seg.end_time === 'string' ? parseFloat(seg.end_time) : seg.end_time,
        }));

      // Calculate score — more generous thresholds since same-video should score high
      const totalRequired =
        speechCriteria.requiredKeywords.length + speechCriteria.requiredPhrases.length;
      const found = keywordsFound.length + phrasesFound.length;
      const ratio = totalRequired > 0 ? found / totalRequired : 0;

      // Also count optional keywords as bonus signal
      const optionalFound = (speechCriteria.optionalKeywords || []).filter(
        fuzzyKeywordMatch
      ).length;
      const hasOptionalBonus = optionalFound > 0;
      const adjustedRatio = hasOptionalBonus ? Math.min(ratio + 0.1, 1.0) : ratio;

      let score: StepScoreValue;
      if (adjustedRatio >= 0.6)
        score = 'YES'; // Lowered from 0.8 — more generous
      else if (adjustedRatio >= 0.3)
        score = 'PARTIAL'; // Lowered from 0.4
      else score = 'NO';

      return {
        stepId: step.id,
        score,
        confidence: ratio,
        evidence: {
          keywordsFound,
          keywordsMissing,
          relevantExcerpts,
          speechScore: score as 'YES' | 'PARTIAL' | 'NO',
          speechConfidence: ratio,
        },
        reasoning: `Found ${found}/${totalRequired} required keywords/phrases (fallback analysis)`,
      };
    });

    return {
      results,
      tokensUsed: { inputTokens: 0, outputTokens: 0, totalTokens: 0 },
      processingTimeMs: Date.now() - startTime,
    };
  }
}

// Export singleton instance
export const speechAnalysisService = new SpeechAnalysisService();
