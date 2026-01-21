import { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import api from '../../services/api';
import LoadingSpinner from '../ui/LoadingSpinner';
import Button from '../ui/Button';
import { toast } from 'react-hot-toast';
import { useTranscriptionAccess } from '../../hooks/useTranscriptionAccess';
import TranscriptionUpgradeBanner from './TranscriptionUpgradeBanner';

interface TranscriptionSegment {
  id: string;
  start_time: number;
  end_time: number;
  text: string;
  speaker?: string;
  segment_index: number;
}

interface TranscriptionData {
  recordingId: string;
  transcriptText: string;
  language: string;
  duration: number;
  segments: TranscriptionSegment[];
  status: string;
  progress: number;
}

interface TranscriptionStatus {
  status: string;
  progress: number;
  stage?: string;
  message?: string;
}

// API response wrapper types
interface ApiResponse<T> {
  data: {
    success: boolean;
    data: T;
  };
}

interface TranscriptionProps {
  recordingId: string;
  currentTime?: number;
  onSeek?: (time: number) => void;
  onTranscriptionReady?: (transcription: TranscriptionData) => void;
  showControls?: boolean;
  className?: string;
}

const formatTime = (seconds: number): string => {
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  return `${mins}:${secs.toString().padStart(2, '0')}`;
};

const Transcription = ({
  recordingId,
  currentTime = 0,
  onSeek,
  onTranscriptionReady,
  showControls = true,
  className = '',
}: TranscriptionProps) => {
  const [searchQuery, setSearchQuery] = useState('');
  const [isStarting, setIsStarting] = useState(false);
  const activeSegmentRef = useRef<HTMLDivElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const queryClient = useQueryClient();

  // Check if organization has access to transcription features
  const { data: featureAccess, isLoading: featureLoading } = useTranscriptionAccess();

  // Fetch transcription status
  const { data: statusData, isLoading: statusLoading } = useQuery<ApiResponse<TranscriptionStatus>>({
    queryKey: ['transcription-status', recordingId],
    queryFn: () => api.get(`/transcription/${recordingId}/status`),
    refetchInterval: (query) => {
      const status = query.state.data?.data?.data?.status;
      // Poll while pending or processing
      if (status === 'pending' || status === 'processing') {
        return 3000; // Poll every 3 seconds
      }
      return false;
    },
    staleTime: 5000,
  });

  // Fetch transcription data when completed
  const { data: transcriptionData, isLoading: transcriptionLoading } = useQuery<ApiResponse<TranscriptionData>>({
    queryKey: ['transcription', recordingId],
    queryFn: () => api.get(`/transcription/${recordingId}`),
    enabled: statusData?.data?.data?.status === 'completed',
    staleTime: Infinity,
  });

  // Start transcription mutation
  const startTranscription = useMutation({
    mutationFn: (options?: { language?: string }) =>
      api.post(`/transcription/${recordingId}/start`, options),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['transcription-status', recordingId] });
      setIsStarting(false);
    },
    onError: (error: any) => {
      toast.error(error.message || 'Failed to start transcription');
      setIsStarting(false);
    },
  });

  // Retry transcription mutation
  const retryTranscription = useMutation({
    mutationFn: () => api.post(`/transcription/${recordingId}/retry`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['transcription-status', recordingId] });
    },
    onError: (error: any) => {
      toast.error(error.message || 'Failed to retry transcription');
    },
  });

  // Notify parent when transcription is ready
  useEffect(() => {
    if (transcriptionData?.data?.data && onTranscriptionReady) {
      onTranscriptionReady(transcriptionData.data.data);
    }
  }, [transcriptionData, onTranscriptionReady]);

  // Find current active segment based on playback time
  const activeSegmentIndex = useMemo(() => {
    if (!transcriptionData?.data?.data?.segments) return -1;

    return transcriptionData.data.data.segments.findIndex(
      (segment: TranscriptionSegment) => currentTime >= segment.start_time && currentTime < segment.end_time
    );
  }, [transcriptionData, currentTime]);

  // Filter segments based on search query
  const filteredSegments = useMemo((): TranscriptionSegment[] => {
    if (!transcriptionData?.data?.data?.segments) return [];

    if (!searchQuery.trim()) {
      return transcriptionData.data.data.segments;
    }

    const query = searchQuery.toLowerCase();
    return transcriptionData.data.data.segments.filter((segment: TranscriptionSegment) =>
      segment.text.toLowerCase().includes(query)
    );
  }, [transcriptionData, searchQuery]);

  // Auto-scroll to active segment
  useEffect(() => {
    if (activeSegmentRef.current && containerRef.current && !searchQuery) {
      const container = containerRef.current;
      const segment = activeSegmentRef.current;

      const containerRect = container.getBoundingClientRect();
      const segmentRect = segment.getBoundingClientRect();

      // Check if segment is outside visible area
      if (
        segmentRect.top < containerRect.top ||
        segmentRect.bottom > containerRect.bottom
      ) {
        segment.scrollIntoView({
          behavior: 'smooth',
          block: 'center',
        });
      }
    }
  }, [activeSegmentIndex, searchQuery]);

  // Handle segment click
  const handleSegmentClick = useCallback(
    (segment: TranscriptionSegment) => {
      if (onSeek) {
        onSeek(segment.start_time);
      }
    },
    [onSeek]
  );

  // Handle start transcription (used for manual trigger if needed)
  const handleStartTranscription = useCallback(() => {
    setIsStarting(true);
    startTranscription.mutate({});
  }, [startTranscription]);

  // Suppress unused variable warning - isStarting used for future manual start UI
  void isStarting;
  void handleStartTranscription;

  const status = statusData?.data?.data?.status || 'none';
  const progress = statusData?.data?.data?.progress || 0;
  const stage = statusData?.data?.data?.stage;
  const hasTranscription = featureAccess?.hasBasicTranscription ?? false;

  // Loading state (check both feature access and status)
  if (featureLoading || statusLoading) {
    return (
      <div className={`flex items-center justify-center py-8 ${className}`}>
        <LoadingSpinner size="md" />
      </div>
    );
  }

  // Feature not available - show upgrade banner
  if (!hasTranscription) {
    return <TranscriptionUpgradeBanner className={className} />;
  }

  // No transcription yet - for Pro+ users, this means transcription is in progress or will start soon
  if (status === 'none' && showControls) {
    return (
      <div className={`text-center py-8 ${className}`}>
        <div className="text-gray-500 mb-4">
          <svg
            className="mx-auto h-12 w-12 text-gray-400"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={1.5}
              d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
            />
          </svg>
        </div>
        <h3 className="text-lg font-medium text-gray-900 mb-2">Transcript Pending</h3>
        <p className="text-sm text-gray-500 mb-4">
          Transcription will start automatically. This page will update when the transcript is ready.
        </p>
      </div>
    );
  }

  // Processing state
  if (status === 'pending' || status === 'processing') {
    return (
      <div className={`text-center py-8 ${className}`}>
        <LoadingSpinner size="md" className="mx-auto mb-4" />
        <h3 className="text-lg font-medium text-gray-900 mb-2">
          {stage === 'transcribing' ? 'Transcribing Audio...' : 'Processing...'}
        </h3>
        <div className="w-full max-w-xs mx-auto mb-2">
          <div className="bg-gray-200 rounded-full h-2">
            <div
              className="bg-blue-600 h-2 rounded-full transition-all duration-500"
              style={{ width: `${progress}%` }}
            />
          </div>
        </div>
        <p className="text-sm text-gray-500">{progress}% complete</p>
        {stage && (
          <p className="text-xs text-gray-400 mt-1 capitalize">{stage.replace('_', ' ')}</p>
        )}
      </div>
    );
  }

  // Failed state
  if (status === 'failed' && showControls) {
    return (
      <div className={`text-center py-8 ${className}`}>
        <div className="text-red-500 mb-4">
          <svg
            className="mx-auto h-12 w-12"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={1.5}
              d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"
            />
          </svg>
        </div>
        <h3 className="text-lg font-medium text-gray-900 mb-2">Transcription Failed</h3>
        <p className="text-sm text-gray-500 mb-4">
          {statusData?.data?.data?.message || 'An error occurred while transcribing the recording.'}
        </p>
        <Button
          onClick={() => retryTranscription.mutate()}
          isLoading={retryTranscription.isPending}
        >
          Retry Transcription
        </Button>
      </div>
    );
  }

  // Loading transcription data
  if (transcriptionLoading) {
    return (
      <div className={`flex items-center justify-center py-8 ${className}`}>
        <LoadingSpinner size="md" />
      </div>
    );
  }

  // Display transcription
  const transcription = transcriptionData?.data?.data;

  if (!transcription?.segments?.length) {
    return (
      <div className={`text-center py-8 text-gray-500 ${className}`}>
        <p>No transcript segments found.</p>
      </div>
    );
  }

  return (
    <div className={`flex flex-col h-full ${className}`}>
      {/* Search bar */}
      <div className="mb-4 flex-shrink-0">
        <div className="relative">
          <input
            type="text"
            placeholder="Search transcript..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full px-4 py-2 pl-10 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
          />
          <svg
            className="absolute left-3 top-2.5 h-5 w-5 text-gray-400"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"
            />
          </svg>
          {searchQuery && (
            <button
              onClick={() => setSearchQuery('')}
              className="absolute right-3 top-2.5 text-gray-400 hover:text-gray-600"
            >
              <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          )}
        </div>
        {searchQuery && (
          <p className="mt-1 text-xs text-gray-500">
            Found {filteredSegments.length} of {transcription.segments.length} segments
          </p>
        )}
      </div>

      {/* Transcript segments */}
      <div
        ref={containerRef}
        className="flex-1 overflow-y-auto space-y-2"
      >
        {filteredSegments.map((segment: TranscriptionSegment) => {
          const isActive = segment.segment_index === transcription.segments[activeSegmentIndex]?.segment_index;

          return (
            <div
              key={segment.id}
              ref={isActive ? activeSegmentRef : null}
              onClick={() => handleSegmentClick(segment)}
              className={`group p-3 rounded-lg cursor-pointer transition-all duration-200 ${
                isActive
                  ? 'bg-blue-50 border-l-4 border-blue-500'
                  : 'hover:bg-gray-50 border-l-4 border-transparent'
              }`}
            >
              <div className="flex items-start gap-3">
                <span
                  className={`text-xs font-mono flex-shrink-0 ${
                    isActive ? 'text-blue-600 font-semibold' : 'text-gray-400'
                  }`}
                >
                  {formatTime(segment.start_time)}
                </span>
                <p
                  className={`text-sm leading-relaxed ${
                    isActive ? 'text-gray-900 font-medium' : 'text-gray-700'
                  }`}
                >
                  {searchQuery ? (
                    <HighlightedText text={segment.text} highlight={searchQuery} />
                  ) : (
                    segment.text
                  )}
                </p>
              </div>
              {segment.speaker && (
                <span className="ml-12 text-xs text-gray-400 mt-1">
                  Speaker: {segment.speaker}
                </span>
              )}
            </div>
          );
        })}
      </div>

      {/* Footer with language info */}
      <div className="mt-4 pt-4 border-t border-gray-200 flex-shrink-0">
        <div className="flex items-center justify-between text-xs text-gray-500">
          <span>Language: {transcription.language.toUpperCase()}</span>
          <span>Duration: {formatTime(transcription.duration)}</span>
        </div>
      </div>
    </div>
  );
};

// Helper component for search highlighting
const HighlightedText = ({ text, highlight }: { text: string; highlight: string }) => {
  if (!highlight.trim()) {
    return <>{text}</>;
  }

  const regex = new RegExp(`(${highlight.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')})`, 'gi');
  const parts = text.split(regex);

  return (
    <>
      {parts.map((part, index) =>
        regex.test(part) ? (
          <mark key={index} className="bg-yellow-200 rounded px-0.5">
            {part}
          </mark>
        ) : (
          <span key={index}>{part}</span>
        )
      )}
    </>
  );
};

export default Transcription;
