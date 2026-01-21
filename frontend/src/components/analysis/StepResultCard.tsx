import { useState } from 'react';
import {
  CheckCircle,
  AlertCircle,
  XCircle,
  ChevronDown,
  ChevronUp,
  MessageSquare,
  Eye,
  Play,
  Quote,
} from 'lucide-react';
import { StepAnalysisResult } from '../../types/rubric.types';

interface StepResultCardProps {
  result: StepAnalysisResult;
  onSeek: (timestamp: number) => void;
}

export function StepResultCard({ result, onSeek }: StepResultCardProps) {
  const [isExpanded, setIsExpanded] = useState(false);

  const getStatusConfig = (status: string) => {
    switch (status) {
      case 'completed':
        return {
          icon: CheckCircle,
          bgColor: 'bg-green-50',
          borderColor: 'border-green-200',
          textColor: 'text-green-700',
          label: 'Completed',
        };
      case 'partial':
        return {
          icon: AlertCircle,
          bgColor: 'bg-yellow-50',
          borderColor: 'border-yellow-200',
          textColor: 'text-yellow-700',
          label: 'Partial',
        };
      case 'missing':
      default:
        return {
          icon: XCircle,
          bgColor: 'bg-red-50',
          borderColor: 'border-red-200',
          textColor: 'text-red-700',
          label: 'Missing',
        };
    }
  };

  const config = getStatusConfig(result.status);
  const StatusIcon = config.icon;

  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  const hasEvidence =
    (result.transcriptEvidence?.excerpts?.length ?? 0) > 0 ||
    (result.visualEvidence?.detectedElements?.length ?? 0) > 0;

  return (
    <div className={`rounded-lg border-2 ${config.borderColor} ${config.bgColor} overflow-hidden`}>
      {/* Header */}
      <div
        className="flex items-center gap-4 p-4 cursor-pointer hover:bg-opacity-50"
        onClick={() => setIsExpanded(!isExpanded)}
      >
        <span className="flex-shrink-0 w-8 h-8 bg-white rounded-full flex items-center justify-center text-sm font-medium text-gray-700 border">
          {result.stepOrder}
        </span>

        <div className="flex-1 min-w-0">
          <h4 className="font-medium text-gray-900 truncate">{result.stepTitle}</h4>
          {result.stepDescription && (
            <p className="text-sm text-gray-600 truncate">{result.stepDescription}</p>
          )}
        </div>

        <div className="flex items-center gap-3">
          {/* Confidence badge */}
          <span className="text-sm text-gray-500">
            {Math.round(result.confidence * 100)}% confident
          </span>

          {/* Status badge */}
          <span className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-sm font-medium ${config.textColor} bg-white border ${config.borderColor}`}>
            <StatusIcon className="w-4 h-4" />
            {config.label}
          </span>

          <button className="p-1 text-gray-400 hover:text-gray-600">
            {isExpanded ? <ChevronUp className="w-5 h-5" /> : <ChevronDown className="w-5 h-5" />}
          </button>
        </div>
      </div>

      {/* Expanded content */}
      {isExpanded && (
        <div className="px-4 pb-4 pt-2 border-t border-gray-200 border-opacity-50 space-y-4">
          {/* AI Reasoning */}
          {result.aiReasoning && (
            <div className="bg-white rounded-lg p-4 border">
              <h5 className="text-sm font-medium text-gray-700 mb-2 flex items-center gap-2">
                <Quote className="w-4 h-4" />
                AI Analysis
              </h5>
              <p className="text-sm text-gray-600">{result.aiReasoning}</p>
            </div>
          )}

          {/* Speech Evidence */}
          {result.transcriptEvidence && result.transcriptEvidence.excerpts?.length > 0 && (
            <div className="bg-blue-50 rounded-lg p-4 border border-blue-200">
              <h5 className="text-sm font-medium text-blue-800 mb-3 flex items-center gap-2">
                <MessageSquare className="w-4 h-4" />
                Speech Evidence
              </h5>

              {/* Keywords found */}
              {result.transcriptEvidence.keywordsFound?.length > 0 && (
                <div className="mb-3">
                  <p className="text-xs text-blue-600 mb-1">Keywords detected:</p>
                  <div className="flex flex-wrap gap-1">
                    {result.transcriptEvidence.keywordsFound.map((keyword, idx) => (
                      <span
                        key={idx}
                        className="px-2 py-0.5 bg-blue-100 text-blue-700 rounded text-xs"
                      >
                        {keyword}
                      </span>
                    ))}
                  </div>
                </div>
              )}

              {/* Transcript excerpts */}
              <div className="space-y-2">
                <p className="text-xs text-blue-600">Relevant excerpts:</p>
                {result.transcriptEvidence.excerpts.map((excerpt, idx) => (
                  <div
                    key={idx}
                    className="bg-white rounded p-3 border border-blue-100 text-sm text-gray-700"
                  >
                    <p className="italic">"{excerpt}"</p>
                    {result.transcriptEvidence?.timestamps?.[idx] && (
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          onSeek(result.transcriptEvidence!.timestamps[idx].start);
                        }}
                        className="mt-2 inline-flex items-center gap-1 text-xs text-blue-600 hover:text-blue-800"
                      >
                        <Play className="w-3 h-3" />
                        Jump to {formatTime(result.transcriptEvidence!.timestamps[idx].start)}
                      </button>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Visual Evidence */}
          {result.visualEvidence && (
            <div className="bg-green-50 rounded-lg p-4 border border-green-200">
              <h5 className="text-sm font-medium text-green-800 mb-3 flex items-center gap-2">
                <Eye className="w-4 h-4" />
                Visual Evidence
              </h5>

              {/* Detected elements */}
              {result.visualEvidence.detectedElements?.length > 0 && (
                <div className="mb-3">
                  <p className="text-xs text-green-600 mb-1">Elements detected:</p>
                  <div className="flex flex-wrap gap-1">
                    {result.visualEvidence.detectedElements.map((element, idx) => (
                      <span
                        key={idx}
                        className="px-2 py-0.5 bg-green-100 text-green-700 rounded text-xs"
                      >
                        {element}
                      </span>
                    ))}
                  </div>
                </div>
              )}

              {/* Detected actions */}
              {result.visualEvidence.detectedActions?.length > 0 && (
                <div className="mb-3">
                  <p className="text-xs text-green-600 mb-1">Actions detected:</p>
                  <div className="flex flex-wrap gap-1">
                    {result.visualEvidence.detectedActions.map((action, idx) => (
                      <span
                        key={idx}
                        className="px-2 py-0.5 bg-green-100 text-green-700 rounded text-xs"
                      >
                        {action}
                      </span>
                    ))}
                  </div>
                </div>
              )}

              {/* Frame thumbnails */}
              {result.visualEvidence.frameUrls?.length > 0 && (
                <div className="mt-3">
                  <p className="text-xs text-green-600 mb-2">Key frames:</p>
                  <div className="flex gap-2 overflow-x-auto pb-2">
                    {result.visualEvidence.frameUrls.map((url, idx) => (
                      <button
                        key={idx}
                        onClick={(e) => {
                          e.stopPropagation();
                          if (result.visualEvidence?.timestamps?.[idx]) {
                            onSeek(result.visualEvidence.timestamps[idx]);
                          }
                        }}
                        className="relative flex-shrink-0 group"
                      >
                        <img
                          src={url}
                          alt={`Frame ${idx + 1}`}
                          className="w-24 h-16 object-cover rounded border border-green-200 hover:border-green-400 transition-colors"
                        />
                        <div className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity bg-black bg-opacity-30 rounded">
                          <Play className="w-6 h-6 text-white" />
                        </div>
                        {result.visualEvidence?.timestamps?.[idx] && (
                          <span className="absolute bottom-1 right-1 px-1 text-xs bg-black bg-opacity-70 text-white rounded">
                            {formatTime(result.visualEvidence.timestamps[idx])}
                          </span>
                        )}
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* No evidence message */}
          {!hasEvidence && result.status === 'missing' && (
            <div className="bg-white rounded-lg p-4 border text-center">
              <p className="text-sm text-gray-500">
                No evidence found for this step in the recording.
              </p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
