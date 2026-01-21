import { AlertTriangle, Lightbulb, Target, ChevronRight } from 'lucide-react';
import { MissedStep } from '../../types/rubric.types';

interface MissedItemsPanelProps {
  missedSteps: MissedStep[];
  improvements: string[];
  strengths: string[];
}

export function MissedItemsPanel({ missedSteps, improvements, strengths }: MissedItemsPanelProps) {
  if (missedSteps.length === 0 && improvements.length === 0) {
    // Perfect score - show celebration
    return (
      <div className="bg-gradient-to-br from-green-50 to-emerald-50 rounded-lg border border-green-200 p-6">
        <div className="text-center">
          <div className="inline-flex items-center justify-center w-16 h-16 bg-green-100 rounded-full mb-4">
            <Target className="w-8 h-8 text-green-600" />
          </div>
          <h3 className="text-lg font-semibold text-green-800 mb-2">Excellent Performance!</h3>
          <p className="text-green-700">All steps were completed successfully.</p>
        </div>

        {/* Strengths */}
        {strengths.length > 0 && (
          <div className="mt-6 pt-4 border-t border-green-200">
            <h4 className="text-sm font-medium text-green-800 mb-3 flex items-center gap-2">
              <Lightbulb className="w-4 h-4" />
              Strengths
            </h4>
            <ul className="space-y-2">
              {strengths.map((strength, idx) => (
                <li key={idx} className="flex items-start gap-2 text-sm text-green-700">
                  <ChevronRight className="w-4 h-4 flex-shrink-0 mt-0.5" />
                  <span>{strength}</span>
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Missed Steps */}
      {missedSteps.length > 0 && (
        <div className="bg-red-50 rounded-lg border border-red-200 p-6">
          <h3 className="text-lg font-semibold text-red-800 mb-4 flex items-center gap-2">
            <AlertTriangle className="w-5 h-5" />
            Missing Steps ({missedSteps.length})
          </h3>

          <div className="space-y-4">
            {missedSteps.map((step, idx) => (
              <div key={idx} className="bg-white rounded-lg p-4 border border-red-200">
                <div className="flex items-start gap-3">
                  <span className="flex-shrink-0 w-6 h-6 bg-red-100 text-red-600 rounded-full flex items-center justify-center text-sm font-medium">
                    {step.stepOrder}
                  </span>
                  <div className="flex-1">
                    <h4 className="font-medium text-gray-900">{step.stepTitle}</h4>
                    {step.stepDescription && (
                      <p className="text-sm text-gray-600 mt-1">{step.stepDescription}</p>
                    )}
                    {step.suggestion && (
                      <div className="mt-3 flex items-start gap-2 text-sm bg-amber-50 border border-amber-200 rounded p-3">
                        <Lightbulb className="w-4 h-4 text-amber-600 flex-shrink-0 mt-0.5" />
                        <span className="text-amber-800">{step.suggestion}</span>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Improvements */}
      {improvements.length > 0 && (
        <div className="bg-amber-50 rounded-lg border border-amber-200 p-6">
          <h3 className="text-lg font-semibold text-amber-800 mb-4 flex items-center gap-2">
            <Lightbulb className="w-5 h-5" />
            Suggestions for Improvement
          </h3>

          <ul className="space-y-3">
            {improvements.map((improvement, idx) => (
              <li key={idx} className="flex items-start gap-3 bg-white rounded-lg p-4 border border-amber-200">
                <span className="flex-shrink-0 w-6 h-6 bg-amber-100 text-amber-700 rounded-full flex items-center justify-center text-sm font-medium">
                  {idx + 1}
                </span>
                <span className="text-gray-700">{improvement}</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Strengths (if any) */}
      {strengths.length > 0 && (
        <div className="bg-green-50 rounded-lg border border-green-200 p-6">
          <h3 className="text-lg font-semibold text-green-800 mb-4 flex items-center gap-2">
            <Target className="w-5 h-5" />
            Strengths
          </h3>

          <ul className="space-y-2">
            {strengths.map((strength, idx) => (
              <li key={idx} className="flex items-start gap-2 text-sm text-green-700">
                <ChevronRight className="w-4 h-4 flex-shrink-0 mt-0.5" />
                <span>{strength}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
