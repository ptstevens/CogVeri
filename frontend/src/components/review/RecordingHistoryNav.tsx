import { ChevronLeft, ChevronRight } from 'lucide-react';
import { Recording } from '../../services/recording.service';

interface RecordingHistoryNavProps {
  recordings: Recording[];
  selectedIndex: number;
  onSelectRecording: (index: number) => void;
}

export function RecordingHistoryNav({
  recordings,
  selectedIndex,
  onSelectRecording,
}: RecordingHistoryNavProps) {
  // Don't render if there's only one or no recordings
  if (!recordings || recordings.length <= 1) {
    return null;
  }

  const currentRecording = recordings[selectedIndex];
  const isLatest = selectedIndex === recordings.length - 1;
  const canGoBack = selectedIndex > 0;
  const canGoForward = selectedIndex < recordings.length - 1;

  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    return date.toLocaleDateString(undefined, {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    });
  };

  const formatTime = (dateString: string) => {
    const date = new Date(dateString);
    return date.toLocaleTimeString(undefined, {
      hour: 'numeric',
      minute: '2-digit',
    });
  };

  return (
    <div className="bg-white shadow rounded-lg p-4 mb-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          {/* Navigation arrows */}
          <div className="flex items-center gap-1">
            <button
              onClick={() => onSelectRecording(selectedIndex - 1)}
              disabled={!canGoBack}
              className="p-1.5 rounded-md hover:bg-gray-100 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
              aria-label="Previous recording"
            >
              <ChevronLeft className="h-5 w-5 text-gray-600" />
            </button>

            <span className="text-sm font-medium text-gray-700 min-w-[100px] text-center">
              Recording {selectedIndex + 1} of {recordings.length}
            </span>

            <button
              onClick={() => onSelectRecording(selectedIndex + 1)}
              disabled={!canGoForward}
              className="p-1.5 rounded-md hover:bg-gray-100 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
              aria-label="Next recording"
            >
              <ChevronRight className="h-5 w-5 text-gray-600" />
            </button>
          </div>

          {/* Latest badge */}
          {isLatest && (
            <span className="px-2 py-0.5 text-xs font-medium bg-green-100 text-green-700 rounded-full">
              Latest
            </span>
          )}
        </div>

        {/* Submission date/time */}
        <div className="text-sm text-gray-500">
          Submitted: {formatDate(currentRecording.created_at)} at{' '}
          {formatTime(currentRecording.created_at)}
        </div>
      </div>
    </div>
  );
}
