import PDFDocument from 'pdfkit';
import { PassThrough } from 'stream';

interface StepScore {
  rubric_step_id: string;
  step_order: number;
  step_title: string;
  score: 'YES' | 'PARTIAL' | 'NO';
  confidence: number;
  ai_reasoning: string | null;
  speech_evidence: string | null;
  visual_evidence: string | null;
  detected_at_seconds: number | null;
}

interface AnalysisData {
  recording: {
    id: string;
    title?: string;
    duration?: number;
  };
  task?: {
    title?: string;
  };
  analysisJob: {
    completed_at: Date;
    processing_duration_seconds: number;
  };
  analysisResults: {
    overall_score: number;
    overall_verdict: string;
    overall_confidence: number;
    steps_passed: number;
    steps_partial: number;
    steps_failed: number;
    steps_total: number;
    summary_text: string;
    strengths: string[];
    improvements: string[];
  };
  stepScores: StepScore[];
}

// Colors
const COLORS = {
  primary: '#4F46E5',
  success: '#16A34A',
  warning: '#CA8A04',
  danger: '#DC2626',
  gray: '#6B7280',
  lightGray: '#F3F4F6',
  text: '#111827',
  textMuted: '#6B7280',
};

function getVerdictColor(verdict: string): string {
  switch (verdict) {
    case 'PASS':
      return COLORS.success;
    case 'PARTIAL_PASS':
      return COLORS.warning;
    case 'FAIL':
      return COLORS.danger;
    default:
      return COLORS.gray;
  }
}

function getScoreColor(score: string): string {
  switch (score) {
    case 'YES':
      return COLORS.success;
    case 'PARTIAL':
      return COLORS.warning;
    case 'NO':
      return COLORS.danger;
    default:
      return COLORS.gray;
  }
}

function formatVerdict(verdict: string): string {
  switch (verdict) {
    case 'PASS':
      return 'PASSED';
    case 'PARTIAL_PASS':
      return 'PARTIAL PASS';
    case 'FAIL':
      return 'NOT PASSED';
    case 'NEEDS_REVIEW':
      return 'NEEDS REVIEW';
    default:
      return verdict;
  }
}

function formatScore(score: string): string {
  switch (score) {
    case 'YES':
      return 'Completed';
    case 'PARTIAL':
      return 'Partial';
    case 'NO':
      return 'Not Done';
    default:
      return score;
  }
}

function formatDuration(seconds: number): string {
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  return `${mins}:${secs.toString().padStart(2, '0')}`;
}

export async function generateAnalysisPDF(data: AnalysisData): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({
      size: 'A4',
      margin: 50,
      bufferPages: true,
    });

    const buffers: Buffer[] = [];
    const stream = new PassThrough();

    stream.on('data', (chunk) => buffers.push(chunk));
    stream.on('end', () => resolve(Buffer.concat(buffers)));
    stream.on('error', reject);

    doc.pipe(stream);

    const { recording, task, analysisJob, analysisResults, stepScores } = data;
    const pageWidth = doc.page.width - 100; // Account for margins

    // ============ HEADER ============
    doc.fontSize(24).fillColor(COLORS.primary).text('Analysis Report', { align: 'center' });

    doc.moveDown(0.5);

    // Recording/Task info
    doc
      .fontSize(14)
      .fillColor(COLORS.text)
      .text(task?.title || recording.title || 'Recording Analysis', { align: 'center' });

    doc
      .fontSize(10)
      .fillColor(COLORS.textMuted)
      .text(
        `Analyzed on ${new Date(analysisJob.completed_at).toLocaleDateString('en-US', {
          year: 'numeric',
          month: 'long',
          day: 'numeric',
          hour: '2-digit',
          minute: '2-digit',
        })}`,
        { align: 'center' }
      );

    doc.moveDown(1.5);

    // ============ OVERALL SCORE BOX ============
    const scoreBoxY = doc.y;
    const scoreBoxHeight = 80;
    const verdictColor = getVerdictColor(analysisResults.overall_verdict);

    // Draw score box background
    doc.roundedRect(50, scoreBoxY, pageWidth, scoreBoxHeight, 8).fillColor(COLORS.lightGray).fill();

    // Score percentage (left side)
    doc
      .fontSize(36)
      .fillColor(verdictColor)
      .text(`${Math.round(analysisResults.overall_score)}%`, 70, scoreBoxY + 20, {
        width: 100,
      });

    // Verdict label (center)
    doc
      .fontSize(18)
      .fillColor(verdictColor)
      .text(formatVerdict(analysisResults.overall_verdict), 180, scoreBoxY + 28, {
        width: 200,
      });

    // Steps summary (right side)
    doc
      .fontSize(10)
      .fillColor(COLORS.textMuted)
      .text(
        `${analysisResults.steps_passed} passed | ${analysisResults.steps_partial} partial | ${analysisResults.steps_failed} missed`,
        350,
        scoreBoxY + 32,
        { width: 180, align: 'right' }
      );

    doc.y = scoreBoxY + scoreBoxHeight + 20;

    // ============ SUMMARY ============
    if (analysisResults.summary_text) {
      doc.fontSize(14).fillColor(COLORS.text).text('Summary', { underline: true });
      doc.moveDown(0.5);
      doc.fontSize(10).fillColor(COLORS.textMuted).text(analysisResults.summary_text, {
        width: pageWidth,
        lineGap: 2,
      });
      doc.moveDown(1);
    }

    // ============ STRENGTHS & IMPROVEMENTS ============
    const strengths = analysisResults.strengths || [];
    const improvements = analysisResults.improvements || [];

    if (strengths.length > 0 || improvements.length > 0) {
      const columnWidth = (pageWidth - 20) / 2;
      const startY = doc.y;

      // Strengths column
      if (strengths.length > 0) {
        doc.fontSize(12).fillColor(COLORS.success).text('Strengths', 50, startY);
        doc.moveDown(0.3);
        strengths.forEach((strength) => {
          doc
            .fontSize(9)
            .fillColor(COLORS.text)
            .text(`+ ${strength}`, 50, doc.y, { width: columnWidth });
          doc.moveDown(0.2);
        });
      }

      // Improvements column
      if (improvements.length > 0) {
        doc
          .fontSize(12)
          .fillColor(COLORS.warning)
          .text('Areas for Improvement', 50 + columnWidth + 20, startY);
        let improvementY = startY + 18;
        improvements.forEach((improvement) => {
          doc
            .fontSize(9)
            .fillColor(COLORS.text)
            .text(`- ${improvement}`, 50 + columnWidth + 20, improvementY, { width: columnWidth });
          improvementY = doc.y + 3;
        });
      }

      doc.y = Math.max(doc.y, startY + 60);
      doc.moveDown(1);
    }

    // ============ STEP-BY-STEP RESULTS ============
    doc.fontSize(14).fillColor(COLORS.text).text('Step-by-Step Results', { underline: true });
    doc.moveDown(0.5);

    stepScores.forEach((step, index) => {
      // Check if we need a new page
      if (doc.y > doc.page.height - 150) {
        doc.addPage();
      }

      const stepY = doc.y;
      const scoreColor = getScoreColor(step.score);

      // Step header with score badge
      doc
        .fontSize(11)
        .fillColor(COLORS.text)
        .text(`${index + 1}. ${step.step_title}`, 50, stepY, {
          width: pageWidth - 80,
          continued: false,
        });

      // Score badge (right aligned)
      doc
        .fontSize(9)
        .fillColor(scoreColor)
        .text(formatScore(step.score), pageWidth - 30, stepY, {
          width: 80,
          align: 'right',
        });

      doc.moveDown(0.3);

      // Reasoning
      if (step.ai_reasoning) {
        doc
          .fontSize(9)
          .fillColor(COLORS.textMuted)
          .text(step.ai_reasoning, 60, doc.y, {
            width: pageWidth - 20,
            lineGap: 1,
          });
      }

      // Timestamp if available
      if (step.detected_at_seconds !== null && step.detected_at_seconds >= 0) {
        doc
          .fontSize(8)
          .fillColor(COLORS.gray)
          .text(`Detected at ${formatDuration(step.detected_at_seconds)}`, 60);
      }

      doc.moveDown(0.8);
    });

    // ============ FOOTER ============
    doc.moveDown(2);

    // Metadata
    doc
      .fontSize(8)
      .fillColor(COLORS.gray)
      .text(`Recording ID: ${recording.id}`, { align: 'center' });

    if (recording.duration) {
      doc.text(`Recording Duration: ${formatDuration(recording.duration)}`, { align: 'center' });
    }

    doc.text(`Processing Time: ${analysisJob.processing_duration_seconds?.toFixed(1) || 'N/A'}s`, {
      align: 'center',
    });

    doc.moveDown(1);
    doc
      .fontSize(8)
      .fillColor(COLORS.textMuted)
      .text('Generated by Relay AI Analysis', { align: 'center' });

    // Finalize
    doc.end();
  });
}

export const pdfExportService = {
  generateAnalysisPDF,
};
