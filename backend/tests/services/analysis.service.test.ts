import { describe, it, expect, vi, beforeEach } from 'vitest';

/**
 * Analysis Service Unit Tests
 *
 * Tests the core scoring logic: calculateVerdict, scoreToNumeric,
 * numericToScore, generateSummary. These are private methods tested
 * via the class prototype to validate business logic in isolation.
 */

// We need to access private methods, so we import the class and cast
// to any to test the scoring logic without triggering the full pipeline.
// This avoids needing Gemini/S3/DB connections in unit tests.

// Mock all external deps before importing the service
vi.mock('../../src/config/gemini', () => ({
  getAnalysisConfig: vi.fn(() => ({ enabled: true })),
  isGeminiConfigured: vi.fn(() => false),
  estimateCost: vi.fn(() => 0),
}));

vi.mock('../../src/config/s3', () => ({
  getS3Client: vi.fn(),
  getS3Bucket: vi.fn(() => 'test-bucket'),
  isS3Available: vi.fn(() => false),
}));

vi.mock('../../src/services/analysis/speech-analysis.service', () => ({
  speechAnalysisService: { analyzeTranscript: vi.fn() },
}));

vi.mock('../../src/services/analysis/visual-analysis.service', () => ({
  visualAnalysisService: { analyzeFrames: vi.fn(), analyzeNativeVideo: vi.fn() },
}));

vi.mock('../../src/services/analysis/frame-extraction.service', () => ({
  frameExtractionService: { extractFrames: vi.fn() },
}));

vi.mock('../../src/services/analysis/native-video-analysis.service', () => ({
  getNativeVideoAnalysisService: vi.fn(),
}));

vi.mock('../../src/services/analysis/similarity-scoring.service', () => ({
  similarityScoringService: { analyzeSimilarity: vi.fn() },
}));

vi.mock('../../src/services/template-calibration.service', () => ({
  templateCalibrationService: { getCalibrationData: vi.fn() },
}));

vi.mock('../../src/services/analysis/analysis-observability.service', () => ({
  analysisObservabilityService: {
    startAnalysis: vi.fn(),
    startStage: vi.fn(),
    endStage: vi.fn(),
    recordSpeechAnalysis: vi.fn(),
    recordVisualAnalysis: vi.fn(),
    recordSimilarityAnalysis: vi.fn(),
    recordError: vi.fn(),
    recordScoring: vi.fn(),
    finishAnalysis: vi.fn(),
  },
}));

// Import after mocks are set up
import { analysisService } from '../../src/services/analysis/index';

// Cast to any to access private methods for testing
const service = analysisService as any;

// ─── Test Data ────────────────────────────────────────────────────────────────

const makeStep = (id: string, weight: number, isRequired = false) => ({
  id,
  title: `Step ${id}`,
  weight,
  isRequired,
  evidenceType: 'both' as const,
});

const makeResult = (
  rubricStepId: string,
  score: 'YES' | 'PARTIAL' | 'NO',
  confidence: number,
  weightedScore: number
) => ({
  rubricStepId,
  stepTitle: `Step ${rubricStepId}`,
  score,
  confidence,
  weightedScore,
  speechEvidence: [],
  visualEvidence: [],
  aiReasoning: 'test reasoning',
});

// ─── scoreToNumeric ───────────────────────────────────────────────────────────

describe('scoreToNumeric', () => {
  it('returns 1 for YES', () => {
    expect(service.scoreToNumeric('YES')).toBe(1);
  });

  it('returns 0.75 for PARTIAL', () => {
    expect(service.scoreToNumeric('PARTIAL')).toBe(0.75);
  });

  it('returns 0 for NO', () => {
    expect(service.scoreToNumeric('NO')).toBe(0);
  });

  it('returns 0 for unknown values', () => {
    expect(service.scoreToNumeric('UNKNOWN')).toBe(0);
    expect(service.scoreToNumeric('')).toBe(0);
  });
});

// ─── numericToScore ───────────────────────────────────────────────────────────

describe('numericToScore', () => {
  it('returns YES for values >= 0.75', () => {
    expect(service.numericToScore(1)).toBe('YES');
    expect(service.numericToScore(0.75)).toBe('YES');
    expect(service.numericToScore(0.9)).toBe('YES');
  });

  it('returns PARTIAL for values >= 0.4 and < 0.75', () => {
    expect(service.numericToScore(0.5)).toBe('PARTIAL');
    expect(service.numericToScore(0.4)).toBe('PARTIAL');
    expect(service.numericToScore(0.74)).toBe('PARTIAL');
  });

  it('returns NO for values < 0.4', () => {
    expect(service.numericToScore(0)).toBe('NO');
    expect(service.numericToScore(0.39)).toBe('NO');
    expect(service.numericToScore(0.1)).toBe('NO');
  });
});

// ─── calculateVerdict ─────────────────────────────────────────────────────────

describe('calculateVerdict', () => {
  const steps = [
    makeStep('s1', 5, true),
    makeStep('s2', 3, false),
    makeStep('s3', 2, false),
  ];

  describe('weighted scoring', () => {
    it('returns PASS when all steps pass and score >= passing', () => {
      // weightedScore = scoreToNumeric('YES') * weight / 10 = 1 * 5 / 10 = 0.5
      // achievedWeight = sum(weightedScore * 10) = (0.5+0.3+0.2)*10 = 10
      // overallScore = (10 / 10) * 100 = 100%
      const results = [
        makeResult('s1', 'YES', 0.95, 0.5),   // 1 * 5 / 10
        makeResult('s2', 'YES', 0.90, 0.3),   // 1 * 3 / 10
        makeResult('s3', 'YES', 0.85, 0.2),   // 1 * 2 / 10
      ];

      const v = service.calculateVerdict(results, steps, 70, 'weighted');
      expect(v.overallScore).toBe(100);
      expect(v.verdict).toBe('PASS');
      expect(v.confidence).toBeCloseTo(0.9, 1);
    });

    it('returns PARTIAL_PASS when score passes but some steps are partial', () => {
      // weightedScore for PARTIAL = 0.75 * weight / 10
      const results = [
        makeResult('s1', 'YES', 0.9, 0.5),       // 1 * 5 / 10
        makeResult('s2', 'PARTIAL', 0.7, 0.225),  // 0.75 * 3 / 10
        makeResult('s3', 'YES', 0.8, 0.2),        // 1 * 2 / 10
      ];

      const v = service.calculateVerdict(results, steps, 70, 'weighted');
      expect(v.overallScore).toBeGreaterThan(70);
      expect(v.verdict).toBe('PARTIAL_PASS');
    });

    it('returns FAIL when a required step fails regardless of score', () => {
      const results = [
        makeResult('s1', 'NO', 0.9, 0),     // Required step failed
        makeResult('s2', 'YES', 0.9, 0.3),  // 1 * 3 / 10
        makeResult('s3', 'YES', 0.9, 0.2),  // 1 * 2 / 10
      ];

      const v = service.calculateVerdict(results, steps, 50, 'weighted');
      expect(v.verdict).toBe('FAIL');
    });

    it('returns NEEDS_REVIEW when score is between 60-100% of passing', () => {
      // Need score in range: passingScore*0.6 <= score < passingScore
      // passingScore = 80; 80 * 0.6 = 48; need score ~50-79
      const results = [
        makeResult('s1', 'PARTIAL', 0.5, 0.375),  // 0.75 * 5 / 10
        makeResult('s2', 'NO', 0.5, 0),
        makeResult('s3', 'PARTIAL', 0.5, 0.15),   // 0.75 * 2 / 10
      ];
      // achievedWeight = (0.375 + 0 + 0.15) * 10 = 5.25; totalWeight = 10
      // overallScore = 52.5%; passingScore = 80; 80*0.6 = 48
      // 48 <= 52.5 < 80 → NEEDS_REVIEW
      const v = service.calculateVerdict(results, steps, 80, 'weighted');
      expect(v.verdict).toBe('NEEDS_REVIEW');
    });

    it('handles zero total weight gracefully', () => {
      const zeroSteps = [makeStep('s1', 0)];
      const results = [makeResult('s1', 'YES', 0.9, 0)];

      const v = service.calculateVerdict(results, zeroSteps, 70, 'weighted');
      expect(v.overallScore).toBe(0);
    });
  });

  describe('equal scoring', () => {
    it('scores by step pass/fail ratio', () => {
      const results = [
        makeResult('s1', 'YES', 0.9, 5),
        makeResult('s2', 'YES', 0.9, 3),
        makeResult('s3', 'NO', 0.5, 0),
      ];

      const v = service.calculateVerdict(results, steps, 70, 'equal');
      // 2 YES + 0 PARTIAL / 3 total = 66.67%
      expect(v.overallScore).toBeCloseTo(66.67, 0);
    });

    it('gives partial credit for PARTIAL scores', () => {
      const results = [
        makeResult('s1', 'YES', 0.9, 5),
        makeResult('s2', 'PARTIAL', 0.7, 2),
        makeResult('s3', 'PARTIAL', 0.6, 1),
      ];

      const v = service.calculateVerdict(results, steps, 50, 'equal');
      // (1 + 0.75 + 0.75) / 3 = 83.33%
      expect(v.overallScore).toBeCloseTo(83.33, 0);
    });

    it('handles empty results', () => {
      const v = service.calculateVerdict([], steps, 70, 'equal');
      expect(v.overallScore).toBe(0);
    });
  });
});

// ─── generateSummary ──────────────────────────────────────────────────────────

describe('generateSummary', () => {
  it('returns strengths for passed steps', () => {
    const results = [
      makeResult('s1', 'YES', 0.9, 5),
      makeResult('s2', 'NO', 0.5, 0),
    ];

    const summary = service.generateSummary(results, 'PARTIAL_PASS');
    expect(summary.strengths).toHaveLength(1);
    expect(summary.strengths[0]).toContain('Completed');
    expect(summary.improvements).toHaveLength(1);
    expect(summary.improvements[0]).toContain('Missing');
  });

  it('returns improvements for failed and partial steps', () => {
    const results = [
      makeResult('s1', 'PARTIAL', 0.6, 3),
      makeResult('s2', 'NO', 0.3, 0),
    ];

    const summary = service.generateSummary(results, 'FAIL');
    expect(summary.improvements).toHaveLength(2);
    expect(summary.text).toContain('Did not meet');
  });

  it('generates correct text for each verdict', () => {
    const passResults = [makeResult('s1', 'YES', 0.9, 5)];
    expect(service.generateSummary(passResults, 'PASS').text).toContain('Excellent');

    const partialResults = [makeResult('s1', 'PARTIAL', 0.7, 3)];
    expect(service.generateSummary(partialResults, 'PARTIAL_PASS').text).toContain('Good effort');

    const reviewResults = [makeResult('s1', 'PARTIAL', 0.5, 2)];
    expect(service.generateSummary(reviewResults, 'NEEDS_REVIEW').text).toContain('needs review');

    const failResults = [makeResult('s1', 'NO', 0.3, 0)];
    expect(service.generateSummary(failResults, 'FAIL').text).toContain('Did not meet');
  });
});
