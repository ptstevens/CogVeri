import { CheckCircle, AlertCircle, XCircle, Clock } from 'lucide-react';
import { AnalysisResults, AnalysisVerdict } from '../../types/rubric.types';

interface ResultsHeaderProps {
  results: AnalysisResults;
}

export function ResultsHeader({ results }: ResultsHeaderProps) {
  const verdictConfig: Record<
    AnalysisVerdict,
    {
      icon: typeof CheckCircle;
      bgColor: string;
      textColor: string;
      borderColor: string;
      label: string;
    }
  > = {
    PASS: {
      icon: CheckCircle,
      bgColor: 'bg-green-50',
      textColor: 'text-green-700',
      borderColor: 'border-green-200',
      label: 'Passed',
    },
    PARTIAL_PASS: {
      icon: AlertCircle,
      bgColor: 'bg-yellow-50',
      textColor: 'text-yellow-700',
      borderColor: 'border-yellow-200',
      label: 'Partial Pass',
    },
    FAIL: {
      icon: XCircle,
      bgColor: 'bg-red-50',
      textColor: 'text-red-700',
      borderColor: 'border-red-200',
      label: 'Not Passed',
    },
    NEEDS_REVIEW: {
      icon: Clock,
      bgColor: 'bg-blue-50',
      textColor: 'text-blue-700',
      borderColor: 'border-blue-200',
      label: 'Needs Review',
    },
  };

  const config = verdictConfig[results.overallVerdict];
  const VerdictIcon = config.icon;

  // Calculate score color
  const getScoreColor = (score: number) => {
    if (score >= 80) return 'text-green-600';
    if (score >= 60) return 'text-yellow-600';
    return 'text-red-600';
  };

  return (
    <div className={`rounded-xl border-2 ${config.borderColor} ${config.bgColor} p-6`}>
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          {/* Score Circle */}
          <div className="relative w-24 h-24">
            <svg className="w-24 h-24 transform -rotate-90">
              <circle
                cx="48"
                cy="48"
                r="40"
                fill="none"
                stroke="currentColor"
                strokeWidth="8"
                className="text-gray-200"
              />
              <circle
                cx="48"
                cy="48"
                r="40"
                fill="none"
                stroke="currentColor"
                strokeWidth="8"
                strokeLinecap="round"
                strokeDasharray={`${(results.overallScore / 100) * 251.2} 251.2`}
                className={getScoreColor(results.overallScore)}
              />
            </svg>
            <div className="absolute inset-0 flex items-center justify-center">
              <span className={`text-2xl font-bold ${getScoreColor(results.overallScore)}`}>
                {Math.round(results.overallScore)}%
              </span>
            </div>
          </div>

          <div>
            <div className={`flex items-center gap-2 ${config.textColor}`}>
              <VerdictIcon className="w-6 h-6" />
              <span className="text-xl font-semibold">{config.label}</span>
            </div>
            <p className="text-gray-600 mt-1">{results.summaryText}</p>
          </div>
        </div>

        {/* Stats */}
        <div className="flex gap-6">
          <div className="text-center">
            <div className="text-2xl font-bold text-green-600">
              {results.scoreBreakdown.stepsCompleted}
            </div>
            <div className="text-sm text-gray-500">Completed</div>
          </div>
          <div className="text-center">
            <div className="text-2xl font-bold text-yellow-600">
              {results.stepResults.filter((s) => s.status === 'partial').length}
            </div>
            <div className="text-sm text-gray-500">Partial</div>
          </div>
          <div className="text-center">
            <div className="text-2xl font-bold text-red-600">{results.missedSteps.length}</div>
            <div className="text-sm text-gray-500">Missing</div>
          </div>
          <div className="text-center">
            <div className="text-2xl font-bold text-gray-600">
              {results.scoreBreakdown.stepsTotal}
            </div>
            <div className="text-sm text-gray-500">Total</div>
          </div>
        </div>
      </div>
    </div>
  );
}
