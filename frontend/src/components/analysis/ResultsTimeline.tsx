import { Play } from 'lucide-react';
import { StepAnalysisResult } from '../../types/rubric.types';

interface ResultsTimelineProps {
  stepResults: StepAnalysisResult[];
  totalDuration: number; // in seconds
  onSeek: (timestamp: number) => void;
  currentTime?: number;
}

export function ResultsTimeline({
  stepResults,
  totalDuration,
  onSeek,
  currentTime = 0,
}: ResultsTimelineProps) {
  const getStatusColor = (status: string) => {
    switch (status) {
      case 'completed':
        return 'bg-green-500';
      case 'partial':
        return 'bg-yellow-500';
      case 'missing':
        return 'bg-red-500';
      default:
        return 'bg-gray-300';
    }
  };

  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  // Get the primary evidence timestamp for each step (for seeking)
  const getStepTimestamp = (step: StepAnalysisResult): number | null => {
    if (step.detectedAt !== undefined) {
      return step.detectedAt;
    }
    if (step.transcriptEvidence?.timestamps && step.transcriptEvidence.timestamps.length > 0) {
      return step.transcriptEvidence.timestamps[0].start;
    }
    if (step.visualEvidence?.timestamps && step.visualEvidence.timestamps.length > 0) {
      return step.visualEvidence.timestamps[0];
    }
    return null;
  };

  // Sort steps by stepOrder for sequential display
  const sortedSteps = [...stepResults].sort((a, b) => a.stepOrder - b.stepOrder);
  const stepCount = sortedSteps.length;
  const widthPerStep = stepCount > 0 ? 100 / stepCount : 100;

  // Calculate progress percentage for playhead
  const progressPercent = totalDuration > 0 ? (currentTime / totalDuration) * 100 : 0;

  // Handle click on a step region - seek to detected timestamp if available
  const handleStepClick = (step: StepAnalysisResult) => {
    const timestamp = getStepTimestamp(step);
    if (timestamp !== null) {
      onSeek(timestamp);
    }
  };

  return (
    <div className="bg-white rounded-lg border p-4">
      <h3 className="text-sm font-medium text-gray-700 mb-4">Analysis Timeline</h3>

      {/* Timeline track - sequential step regions */}
      <div className="relative">
        <div className="h-6 rounded-full overflow-hidden flex">
          {stepCount === 0 ? (
            // Empty state
            <div className="w-full h-full bg-gray-200 flex items-center justify-center">
              <span className="text-gray-500 text-xs">No steps defined</span>
            </div>
          ) : (
            // Render sequential step regions
            sortedSteps.map((step, index) => {
              const timestamp = getStepTimestamp(step);
              const hasTimestamp = timestamp !== null;
              const isFirst = index === 0;
              const isLast = index === stepCount - 1;

              return (
                <button
                  key={step.stepId}
                  onClick={() => handleStepClick(step)}
                  disabled={!hasTimestamp}
                  className={`
                    relative h-full transition-all group
                    ${getStatusColor(step.status)}
                    ${hasTimestamp ? 'cursor-pointer hover:brightness-110' : 'cursor-default'}
                    ${isFirst ? 'rounded-l-full' : ''}
                    ${isLast ? 'rounded-r-full' : ''}
                    border-r border-white/30 last:border-r-0
                  `}
                  style={{ width: `${widthPerStep}%` }}
                >
                  {/* Step number label */}
                  <span className="absolute inset-0 flex items-center justify-center text-white text-xs font-semibold drop-shadow-sm">
                    {step.stepOrder}
                  </span>

                  {/* Tooltip */}
                  <div className="absolute bottom-full left-1/2 transform -translate-x-1/2 mb-2 opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none z-20">
                    <div className="bg-gray-900 text-white text-xs px-3 py-2 rounded-lg whitespace-nowrap shadow-lg">
                      <div className="font-medium">
                        Step {step.stepOrder}: {step.stepTitle}
                      </div>
                      {hasTimestamp && (
                        <div className="text-gray-400 mt-1">
                          Detected at {formatTime(timestamp)}
                        </div>
                      )}
                      <div
                        className={`mt-1 capitalize font-medium ${
                          step.status === 'completed'
                            ? 'text-green-400'
                            : step.status === 'partial'
                              ? 'text-yellow-400'
                              : 'text-red-400'
                        }`}
                      >
                        {step.status === 'completed'
                          ? '✓ Completed'
                          : step.status === 'partial'
                            ? '◐ Partial'
                            : '✗ Missing'}
                      </div>
                      {!hasTimestamp && step.status === 'missing' && (
                        <div className="text-gray-500 mt-1 text-[10px]">
                          Click a completed step to jump
                        </div>
                      )}
                    </div>
                    {/* Tooltip arrow */}
                    <div className="absolute top-full left-1/2 transform -translate-x-1/2 -mt-1">
                      <div className="border-4 border-transparent border-t-gray-900" />
                    </div>
                  </div>
                </button>
              );
            })
          )}
        </div>

        {/* Current time indicator (playhead) */}
        {totalDuration > 0 && (
          <div
            className="absolute top-0 bottom-0 w-0.5 bg-gray-800 transform -translate-x-1/2 shadow-md z-10"
            style={{ left: `${progressPercent}%` }}
          >
            <div className="absolute -top-1.5 left-1/2 transform -translate-x-1/2 w-2.5 h-2.5 bg-gray-800 rounded-full border-2 border-white shadow" />
          </div>
        )}
      </div>

      {/* Time labels */}
      <div className="flex justify-between text-xs text-gray-500 mt-2">
        <span>0:00</span>
        <span>{formatTime(totalDuration)}</span>
      </div>

      {/* Legend with counts */}
      <div className="flex gap-4 mt-4 text-xs">
        <div className="flex items-center gap-1.5">
          <div className="w-3 h-3 rounded-full bg-green-500" />
          <span className="text-gray-600">
            Completed ({sortedSteps.filter((s) => s.status === 'completed').length})
          </span>
        </div>
        <div className="flex items-center gap-1.5">
          <div className="w-3 h-3 rounded-full bg-yellow-500" />
          <span className="text-gray-600">
            Partial ({sortedSteps.filter((s) => s.status === 'partial').length})
          </span>
        </div>
        <div className="flex items-center gap-1.5">
          <div className="w-3 h-3 rounded-full bg-red-500" />
          <span className="text-gray-600">
            Missing ({sortedSteps.filter((s) => s.status === 'missing').length})
          </span>
        </div>
      </div>

      {/* Quick jump buttons - only show steps with timestamps */}
      {sortedSteps.some((step) => getStepTimestamp(step) !== null) && (
        <div className="mt-4">
          <div className="text-xs text-gray-500 mb-2">Jump to step:</div>
          <div className="flex flex-wrap gap-2">
            {sortedSteps.map((step) => {
              const timestamp = getStepTimestamp(step);
              if (timestamp === null) return null;

              return (
                <button
                  key={step.stepId}
                  onClick={() => onSeek(timestamp)}
                  className={`inline-flex items-center gap-1 px-2 py-1 text-xs rounded border transition-colors ${
                    step.status === 'completed'
                      ? 'border-green-200 bg-green-50 text-green-700 hover:bg-green-100'
                      : step.status === 'partial'
                        ? 'border-yellow-200 bg-yellow-50 text-yellow-700 hover:bg-yellow-100'
                        : 'border-red-200 bg-red-50 text-red-700 hover:bg-red-100'
                  }`}
                >
                  <Play className="w-3 h-3" />
                  Step {step.stepOrder}
                </button>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
