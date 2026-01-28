/**
 * Analysis Observability Controller
 *
 * Provides admin endpoints for debugging and monitoring the analysis pipeline:
 * - View debug logs for specific analyses
 * - Monitor score variance alerts
 * - Check template calibration status
 * - View aggregate performance metrics
 */

import { Request, Response, NextFunction } from 'express';
import { analysisObservabilityService } from '../services/analysis/analysis-observability.service';
import { logger } from '../utils/logger';

/**
 * Get debug log for a specific analysis job
 */
export async function getAnalysisDebugLog(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const { analysisJobId } = req.params;

    if (!analysisJobId) {
      res.status(400).json({ error: 'Analysis job ID is required' });
      return;
    }

    const debugLog = await analysisObservabilityService.getDebugLog(analysisJobId);

    if (!debugLog) {
      res.status(404).json({ error: 'Debug log not found' });
      return;
    }

    res.json(debugLog);
  } catch (error) {
    next(error);
  }
}

/**
 * Get debug logs for a recording
 */
export async function getRecordingDebugLogs(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const { recordingId } = req.params;

    if (!recordingId) {
      res.status(400).json({ error: 'Recording ID is required' });
      return;
    }

    const debugLogs = await analysisObservabilityService.getDebugLogsForRecording(recordingId);

    res.json({ logs: debugLogs, count: debugLogs.length });
  } catch (error) {
    next(error);
  }
}

/**
 * Get score variance alerts (recordings with inconsistent scores)
 */
export async function getVarianceAlerts(_req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const alerts = await analysisObservabilityService.getVarianceAlerts();

    res.json({
      alerts,
      count: alerts.length,
      message: alerts.length > 0
        ? `${alerts.length} recording(s) have inconsistent scores across multiple analyses`
        : 'No score variance alerts',
    });
  } catch (error) {
    next(error);
  }
}

/**
 * Get template calibration stats
 */
export async function getTemplateCalibrationStats(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const { templateId } = req.params;

    if (!templateId) {
      res.status(400).json({ error: 'Template ID is required' });
      return;
    }

    const stats = await analysisObservabilityService.getTemplateCalibrationStats(templateId);

    res.json({
      ...stats,
      isHealthy: stats.avgSelfScore >= 99.5,
      message: stats.calibrationRuns === 0
        ? 'No calibration runs recorded'
        : stats.avgSelfScore >= 99.5
          ? 'Template is calibrated correctly'
          : `Template self-score is ${stats.avgSelfScore.toFixed(1)}% (should be 100%)`,
    });
  } catch (error) {
    next(error);
  }
}

/**
 * Get aggregate performance metrics
 */
export async function getPerformanceMetrics(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const { startDate, endDate, organizationId } = req.query;

    const metrics = await analysisObservabilityService.getPerformanceMetrics({
      startDate: startDate ? new Date(startDate as string) : undefined,
      endDate: endDate ? new Date(endDate as string) : undefined,
      organizationId: organizationId as string | undefined,
    });

    res.json({
      ...metrics,
      avgDurationSeconds: metrics.avgDurationMs / 1000,
      errorRatePercent: (metrics.errorRate * 100).toFixed(2) + '%',
      similarityUsagePercent: (metrics.similarityUsageRate * 100).toFixed(2) + '%',
      normalizationPercent: (metrics.normalizationRate * 100).toFixed(2) + '%',
    });
  } catch (error) {
    next(error);
  }
}

/**
 * Get analysis health dashboard summary
 */
export async function getAnalysisHealthDashboard(_req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    // Get last 7 days of metrics
    const sevenDaysAgo = new Date();
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);

    const [metrics, varianceAlerts] = await Promise.all([
      analysisObservabilityService.getPerformanceMetrics({ startDate: sevenDaysAgo }),
      analysisObservabilityService.getVarianceAlerts(),
    ]);

    const healthStatus = determineHealthStatus(metrics, varianceAlerts.length);

    res.json({
      status: healthStatus,
      period: 'last_7_days',
      metrics: {
        totalAnalyses: metrics.totalAnalyses,
        avgDurationSeconds: (metrics.avgDurationMs / 1000).toFixed(1),
        avgTokensUsed: Math.round(metrics.avgTokensUsed),
        errorRate: (metrics.errorRate * 100).toFixed(2) + '%',
        similarityUsageRate: (metrics.similarityUsageRate * 100).toFixed(2) + '%',
        normalizationRate: (metrics.normalizationRate * 100).toFixed(2) + '%',
      },
      alerts: {
        varianceAlerts: varianceAlerts.length,
        highVarianceRecordings: varianceAlerts.slice(0, 5).map((a) => ({
          recordingId: a.recordingId,
          stdDeviation: (a.stdDeviation * 100).toFixed(2) + '%',
          analysisCount: a.analysisCount,
        })),
      },
      recommendations: generateRecommendations(metrics, varianceAlerts.length),
    });
  } catch (error) {
    logger.error('Failed to generate health dashboard', { error });
    next(error);
  }
}

/**
 * Determine overall health status
 */
function determineHealthStatus(
  metrics: { errorRate: number; avgDurationMs: number },
  varianceAlertCount: number
): 'healthy' | 'warning' | 'critical' {
  // Critical if error rate > 10% or many variance alerts
  if (metrics.errorRate > 0.1 || varianceAlertCount > 10) {
    return 'critical';
  }

  // Warning if error rate > 2% or some variance alerts or slow analysis
  if (metrics.errorRate > 0.02 || varianceAlertCount > 3 || metrics.avgDurationMs > 60000) {
    return 'warning';
  }

  return 'healthy';
}

/**
 * Generate recommendations based on metrics
 */
function generateRecommendations(
  metrics: { errorRate: number; similarityUsageRate: number; normalizationRate: number; avgDurationMs: number },
  varianceAlertCount: number
): string[] {
  const recommendations: string[] = [];

  if (metrics.errorRate > 0.05) {
    recommendations.push('High error rate detected. Review recent analysis failures for common issues.');
  }

  if (metrics.similarityUsageRate < 0.5 && metrics.similarityUsageRate > 0) {
    recommendations.push('Similarity scoring underutilized. Ensure templates have stored evidence.');
  }

  if (varianceAlertCount > 0) {
    recommendations.push(`${varianceAlertCount} recording(s) have inconsistent scores. Review variance alerts.`);
  }

  if (metrics.avgDurationMs > 45000) {
    recommendations.push('Average analysis time is high. Consider optimizing frame extraction or batch sizes.');
  }

  if (recommendations.length === 0) {
    recommendations.push('Analysis pipeline is healthy. No issues detected.');
  }

  return recommendations;
}
