/**
 * CalibrationStatusBanner
 *
 * Displays the calibration status for a template, showing whether
 * the template video achieved 100% against its own rubric.
 *
 * Calibration ensures that if a template video can't score 100%,
 * the rubric may need adjustment before use.
 */

import { CheckCircle, Clock, AlertTriangle, XCircle, Loader2, Info } from 'lucide-react';

export type CalibrationStatus = 'pending' | 'in_progress' | 'completed' | 'failed' | 'needs_review' | null;

interface CalibrationStatusBannerProps {
  calibrationStatus?: CalibrationStatus;
  baselineScore?: number | null;
  calibratedAt?: string | null;
  className?: string;
}

const statusConfig: Record<NonNullable<CalibrationStatus>, {
  icon: React.ElementType;
  bgColor: string;
  borderColor: string;
  textColor: string;
  iconColor: string;
  title: string;
  getMessage: (score?: number | null) => string;
}> = {
  pending: {
    icon: Clock,
    bgColor: 'bg-gray-50',
    borderColor: 'border-gray-200',
    textColor: 'text-gray-700',
    iconColor: 'text-gray-500',
    title: 'Calibration Pending',
    getMessage: () => 'Calibration will verify the rubric accuracy by analyzing the template video.',
  },
  in_progress: {
    icon: Loader2,
    bgColor: 'bg-blue-50',
    borderColor: 'border-blue-200',
    textColor: 'text-blue-700',
    iconColor: 'text-blue-500',
    title: 'Calibration Running',
    getMessage: () => 'Analyzing template video against the rubric to verify accuracy...',
  },
  completed: {
    icon: CheckCircle,
    bgColor: 'bg-green-50',
    borderColor: 'border-green-200',
    textColor: 'text-green-700',
    iconColor: 'text-green-500',
    title: 'Calibration Complete',
    getMessage: (score) => score !== null && score !== undefined
      ? `Template video achieved ${score.toFixed(0)}% against its rubric. ${score >= 95 ? 'Rubric is well-calibrated.' : ''}`
      : 'Template video analyzed successfully.',
  },
  needs_review: {
    icon: AlertTriangle,
    bgColor: 'bg-amber-50',
    borderColor: 'border-amber-200',
    textColor: 'text-amber-700',
    iconColor: 'text-amber-500',
    title: 'Calibration Needs Review',
    getMessage: (score) => score !== null && score !== undefined
      ? `Template video scored ${score.toFixed(0)}% against its rubric. Some steps may need adjustment for accurate scoring.`
      : 'Some rubric steps may need adjustment.',
  },
  failed: {
    icon: XCircle,
    bgColor: 'bg-red-50',
    borderColor: 'border-red-200',
    textColor: 'text-red-700',
    iconColor: 'text-red-500',
    title: 'Calibration Failed',
    getMessage: () => 'Unable to analyze the template video. Scoring may be less accurate.',
  },
};

export function CalibrationStatusBanner({
  calibrationStatus,
  baselineScore,
  calibratedAt,
  className = '',
}: CalibrationStatusBannerProps) {
  // Don't render if no calibration status
  if (!calibrationStatus) {
    return null;
  }

  const config = statusConfig[calibrationStatus];
  if (!config) {
    return null;
  }

  const Icon = config.icon;
  const isLoading = calibrationStatus === 'in_progress';

  return (
    <div className={`${config.bgColor} border-b ${config.borderColor} ${className}`}>
      <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-3">
        <div className="flex items-start gap-3">
          {/* Icon */}
          <div className={`flex-shrink-0 mt-0.5 ${config.iconColor}`}>
            <Icon className={`w-5 h-5 ${isLoading ? 'animate-spin' : ''}`} />
          </div>

          {/* Content */}
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2">
              <h4 className={`text-sm font-medium ${config.textColor}`}>
                {config.title}
              </h4>
              {baselineScore !== null && baselineScore !== undefined && calibrationStatus !== 'pending' && calibrationStatus !== 'in_progress' && (
                <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${
                  baselineScore >= 95
                    ? 'bg-green-100 text-green-700'
                    : baselineScore >= 70
                      ? 'bg-amber-100 text-amber-700'
                      : 'bg-red-100 text-red-700'
                }`}>
                  {baselineScore.toFixed(0)}%
                </span>
              )}
            </div>
            <p className={`text-sm ${config.textColor} opacity-80 mt-0.5`}>
              {config.getMessage(baselineScore)}
            </p>
            {calibratedAt && calibrationStatus === 'completed' && (
              <p className="text-xs text-gray-500 mt-1">
                Calibrated {new Date(calibratedAt).toLocaleDateString()}
              </p>
            )}
          </div>

          {/* Info tooltip hint */}
          <div className="flex-shrink-0 hidden sm:block">
            <div className="group relative">
              <Info className="w-4 h-4 text-gray-400 hover:text-gray-600 cursor-help" />
              <div className="absolute right-0 top-6 w-64 p-3 bg-gray-900 text-white text-xs rounded-lg shadow-lg opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all z-10">
                <p className="font-medium mb-1">What is calibration?</p>
                <p className="opacity-90">
                  Calibration runs the template video through the rubric to verify accuracy.
                  If the template doesn't score 100%, submission scores are automatically
                  normalized for fairness.
                </p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

export default CalibrationStatusBanner;
