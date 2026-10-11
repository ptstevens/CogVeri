import { useState } from 'react';
import { Clock, RotateCcw, ChevronDown, ChevronUp, Eye } from 'lucide-react';
import { AIPromptHistory } from '../../types/ai-prompts';

interface PromptVersionHistoryProps {
  history: AIPromptHistory[];
  currentVersion: number;
  onRevert: (version: number) => void;
  reverting: boolean;
  onPreview?: (systemPrompt: string) => void;
}

export default function PromptVersionHistory({
  history,
  currentVersion,
  onRevert,
  reverting,
  onPreview,
}: PromptVersionHistoryProps) {
  const [expandedVersion, setExpandedVersion] = useState<number | null>(null);
  const [confirmRevert, setConfirmRevert] = useState<number | null>(null);

  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    return date.toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  const handleRevertClick = (version: number) => {
    if (confirmRevert === version) {
      onRevert(version);
      setConfirmRevert(null);
    } else {
      setConfirmRevert(version);
      // Auto-cancel confirmation after 5 seconds
      setTimeout(() => setConfirmRevert(null), 5000);
    }
  };

  if (history.length === 0) {
    return (
      <div className="bg-white rounded-lg shadow p-6">
        <h3 className="text-lg font-semibold text-gray-900 mb-4 flex items-center gap-2">
          <Clock className="h-5 w-5 text-gray-500" />
          Version History
        </h3>
        <p className="text-sm text-gray-500">
          No previous versions yet. Edit the prompt to create version history.
        </p>
      </div>
    );
  }

  return (
    <div className="bg-white rounded-lg shadow p-6">
      <h3 className="text-lg font-semibold text-gray-900 mb-4 flex items-center gap-2">
        <Clock className="h-5 w-5 text-gray-500" />
        Version History
      </h3>

      <div className="text-sm text-gray-500 mb-4">
        Current version: <span className="font-medium">v{currentVersion}</span>
      </div>

      <div className="space-y-3 max-h-96 overflow-y-auto">
        {history.map((entry) => (
          <div key={entry.id} className="border border-gray-200 rounded-lg overflow-hidden">
            {/* Header */}
            <div
              className="flex items-center justify-between p-3 bg-gray-50 cursor-pointer hover:bg-gray-100"
              onClick={() =>
                setExpandedVersion(expandedVersion === entry.version ? null : entry.version)
              }
            >
              <div className="flex items-center gap-3">
                <span className="px-2 py-0.5 text-xs font-medium bg-gray-200 text-gray-700 rounded">
                  v{entry.version}
                </span>
                <span className="text-sm text-gray-600">{formatDate(entry.createdAt)}</span>
              </div>
              <div className="flex items-center gap-2">
                {expandedVersion === entry.version ? (
                  <ChevronUp className="h-4 w-4 text-gray-500" />
                ) : (
                  <ChevronDown className="h-4 w-4 text-gray-500" />
                )}
              </div>
            </div>

            {/* Expanded Content */}
            {expandedVersion === entry.version && (
              <div className="p-3 border-t border-gray-200">
                {entry.changeReason && (
                  <div className="mb-3">
                    <span className="text-xs font-medium text-gray-500">Change reason:</span>
                    <p className="text-sm text-gray-700 mt-1">{entry.changeReason}</p>
                  </div>
                )}

                <div className="mb-3">
                  <span className="text-xs font-medium text-gray-500">
                    Prompt preview ({entry.systemPrompt.length} chars):
                  </span>
                  <pre className="mt-1 p-2 bg-gray-100 rounded text-xs text-gray-700 overflow-x-auto max-h-32 overflow-y-auto whitespace-pre-wrap">
                    {entry.systemPrompt.substring(0, 500)}
                    {entry.systemPrompt.length > 500 && '...'}
                  </pre>
                </div>

                <div className="flex gap-2">
                  {onPreview && (
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        onPreview(entry.systemPrompt);
                      }}
                      className="inline-flex items-center px-2 py-1 text-xs font-medium text-gray-700 bg-white border border-gray-300 rounded hover:bg-gray-50"
                    >
                      <Eye className="h-3 w-3 mr-1" />
                      Preview Full
                    </button>
                  )}
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      handleRevertClick(entry.version);
                    }}
                    disabled={reverting}
                    className={`inline-flex items-center px-2 py-1 text-xs font-medium rounded ${
                      confirmRevert === entry.version
                        ? 'text-white bg-orange-600 hover:bg-orange-700'
                        : 'text-orange-700 bg-orange-100 hover:bg-orange-200'
                    } disabled:opacity-50`}
                  >
                    <RotateCcw className="h-3 w-3 mr-1" />
                    {confirmRevert === entry.version
                      ? reverting
                        ? 'Reverting...'
                        : 'Click to confirm'
                      : `Revert to v${entry.version}`}
                  </button>
                </div>
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
