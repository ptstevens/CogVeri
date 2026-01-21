import { CheckCircle, AlertCircle, XCircle, Play } from 'lucide-react';
import { StepAnalysisResult } from '../../types/rubric.types';

interface TimelineSegment {
  start: number;
  end: number;
  status: string;
  stepId: string;
  stepTitle: string;
  stepOrder: number;
}

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

  const getStatusColorWithOpacity = (status: string) => {
    switch (status) {
      case 'completed':
        return 'bg-green-400';
      case 'partial':
        return 'bg-yellow-400';
      case 'missing':
        return 'bg-red-400';
      default:
        return 'bg-gray-300';
    }
  };

  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  // Get the primary evidence timestamp for each step
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

  // Get time range for a step (start and end)
  const getStepTimeRange = (step: StepAnalysisResult): { start: number; end: number } | null => {
    let start: number | null = null;
    let end: number | null = null;

    // Try detectedAt/completedAt first
    if (step.detectedAt !== undefined) {
      start = step.detectedAt;
      end = step.completedAt ?? step.detectedAt + 10; // Default 10 second segment if no end
    }

    // Try transcript evidence
    if (start === null && step.transcriptEvidence?.timestamps?.length) {
      const timestamps = step.transcriptEvidence.timestamps;
      start = Math.min(...timestamps.map(t => t.start));
      const ends = timestamps.map(t => t.end ?? t.start + 5);
      end = Math.max(...ends);
    }

    // Try visual evidence
    if (start === null && step.visualEvidence?.timestamps?.length) {
      const timestamps = step.visualEvidence.timestamps;
      start = Math.min(...timestamps);
      end = Math.max(...timestamps) + 5; // Visual evidence is a point, add 5 seconds
    }

    if (start === null) return null;
    return { start, end: end ?? start + 10 };
  };

  // Build timeline segments from step results
  const buildSegments = (): TimelineSegment[] => {
    const segments: TimelineSegment[] = [];

    for (const step of stepResults) {
      const range = getStepTimeRange(step);
      if (range) {
        segments.push({
          start: range.start,
          end: Math.min(range.end, totalDuration),
          status: step.status,
          stepId: step.stepId,
          stepTitle: step.stepTitle,
          stepOrder: step.stepOrder,
        });
      }
    }

    // Sort by start time
    return segments.sort((a, b) => a.start - b.start);
  };

  const segments = buildSegments();

  // Calculate progress percentage
  const progressPercent = totalDuration > 0 ? (currentTime / totalDuration) * 100 : 0;

  // Check if all steps are missing (no detected segments)
  const allStepsMissing = segments.length === 0 && stepResults.some(s => s.status === 'missing');

  return (
    <div className="bg-white rounded-lg border p-4">
      <h3 className="text-sm font-medium text-gray-700 mb-4">Analysis Timeline</h3>

      {/* Timeline track */}
      <div className="relative">
        {/* Background track - red if all steps missing, gray otherwise */}
        <div className={`h-4 rounded-full overflow-hidden relative ${
          allStepsMissing ? 'bg-red-400' : 'bg-gray-200'
        }`}>
          {/* Show message when all steps are missing */}
          {allStepsMissing && (
            <div className="absolute inset-0 flex items-center justify-center">
              <span className="text-white text-xs font-medium drop-shadow-sm">
                No steps detected
              </span>
            </div>
          )}
          {/* Colored segments for each step */}
          {segments.map((segment, index) => {
            const leftPercent = totalDuration > 0 ? (segment.start / totalDuration) * 100 : 0;
            const widthPercent = totalDuration > 0 ? ((segment.end - segment.start) / totalDuration) * 100 : 0;

            return (
              <button
                key={`${segment.stepId}-${index}`}
                onClick={() => onSeek(segment.start)}
                className={`absolute top-0 bottom-0 ${getStatusColorWithOpacity(segment.status)} hover:opacity-80 transition-opacity cursor-pointer group`}
                style={{
                  left: `${leftPercent}%`,
                  width: `${Math.max(widthPercent, 1)}%`,
                }}
                title={`Step ${segment.stepOrder}: ${segment.stepTitle}`}
              >
                {/* Tooltip */}
                <div className="absolute bottom-full left-1/2 transform -translate-x-1/2 mb-2 opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none z-20">
                  <div className="bg-gray-900 text-white text-xs px-2 py-1 rounded whitespace-nowrap shadow-lg">
                    <div className="font-medium">Step {segment.stepOrder}: {segment.stepTitle}</div>
                    <div className="text-gray-400">{formatTime(segment.start)} - {formatTime(segment.end)}</div>
                    <div className={`capitalize ${
                      segment.status === 'completed' ? 'text-green-400' :
                      segment.status === 'partial' ? 'text-yellow-400' : 'text-red-400'
                    }`}>
                      {segment.status}
                    </div>
                  </div>
                </div>
              </button>
            );
          })}
        </div>

        {/* Step markers (icons) */}
        <div className="absolute inset-0 flex items-center pointer-events-none">
          {stepResults.map((step) => {
            const timestamp = getStepTimestamp(step);
            if (timestamp === null) return null;

            const position = totalDuration > 0 ? (timestamp / totalDuration) * 100 : 0;

            return (
              <button
                key={step.stepId}
                onClick={() => onSeek(timestamp)}
                className="absolute transform -translate-x-1/2 -translate-y-1/2 top-1/2 group pointer-events-auto"
                style={{ left: `${position}%` }}
                title={`${step.stepTitle} - ${formatTime(timestamp)}`}
              >
                <div
                  className={`w-6 h-6 rounded-full ${getStatusColor(
                    step.status
                  )} flex items-center justify-center shadow-md hover:scale-110 transition-transform border-2 border-white`}
                >
                  {step.status === 'completed' && (
                    <CheckCircle className="w-4 h-4 text-white" />
                  )}
                  {step.status === 'partial' && (
                    <AlertCircle className="w-4 h-4 text-white" />
                  )}
                  {step.status === 'missing' && (
                    <XCircle className="w-4 h-4 text-white" />
                  )}
                </div>

                {/* Tooltip */}
                <div className="absolute bottom-full left-1/2 transform -translate-x-1/2 mb-2 opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none z-10">
                  <div className="bg-gray-900 text-white text-xs px-2 py-1 rounded whitespace-nowrap">
                    {step.stepTitle}
                    <div className="text-gray-400">{formatTime(timestamp)}</div>
                  </div>
                </div>
              </button>
            );
          })}
        </div>

        {/* Current time indicator (playhead) */}
        {totalDuration > 0 && (
          <div
            className="absolute top-0 bottom-0 w-1 bg-primary-600 transform -translate-x-1/2 shadow-md z-10"
            style={{ left: `${progressPercent}%` }}
          >
            <div className="absolute -top-1 left-1/2 transform -translate-x-1/2 w-3 h-3 bg-primary-600 rounded-full" />
          </div>
        )}
      </div>

      {/* Time labels */}
      <div className="flex justify-between text-xs text-gray-500 mt-2">
        <span>0:00</span>
        <span>{formatTime(totalDuration)}</span>
      </div>

      {/* Legend */}
      <div className="flex gap-4 mt-4 text-xs">
        <div className="flex items-center gap-1">
          <div className="w-3 h-3 rounded-full bg-green-500" />
          <span className="text-gray-600">Completed</span>
        </div>
        <div className="flex items-center gap-1">
          <div className="w-3 h-3 rounded-full bg-yellow-500" />
          <span className="text-gray-600">Partial</span>
        </div>
        <div className="flex items-center gap-1">
          <div className="w-3 h-3 rounded-full bg-red-500" />
          <span className="text-gray-600">Missing</span>
        </div>
      </div>

      {/* Quick jump buttons */}
      <div className="mt-4 flex flex-wrap gap-2">
        {stepResults.map((step) => {
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
  );
}
