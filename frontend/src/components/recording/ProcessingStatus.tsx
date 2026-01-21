import { useState, useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import api from '../../services/api';
import LoadingSpinner from '../ui/LoadingSpinner';

interface ProcessingJob {
  id: string;
  jobType: 'transcode' | 'thumbnail' | 'transcription';
  quality?: string;
  status: 'pending' | 'processing' | 'completed' | 'failed';
  progress: number;
  stage?: string;
  message?: string;
  startedAt?: string;
  completedAt?: string;
  errorMessage?: string;
}

interface ProcessingStatusData {
  recordingId: string;
  overallStatus: 'pending' | 'processing' | 'completed' | 'failed' | 'partial';
  jobs: ProcessingJob[];
  variants: Array<{
    quality: string;
    format: string;
    width: number;
    height: number;
    fileSize: number;
    isReady: boolean;
  }>;
  thumbnailUrl?: string;
  transcriptionStatus?: string;
}

interface ProcessingStatusProps {
  recordingId: string;
  onComplete?: () => void;
  showDetails?: boolean;
  compact?: boolean;
  className?: string;
}

const getStatusIcon = (status: string) => {
  switch (status) {
    case 'completed':
      return (
        <svg className="h-5 w-5 text-green-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
        </svg>
      );
    case 'processing':
      return <LoadingSpinner size="sm" />;
    case 'failed':
      return (
        <svg className="h-5 w-5 text-red-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
        </svg>
      );
    case 'pending':
      return (
        <svg className="h-5 w-5 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
        </svg>
      );
    default:
      return null;
  }
};

const getJobLabel = (job: ProcessingJob) => {
  switch (job.jobType) {
    case 'transcode':
      return `Transcode (${job.quality || 'unknown'})`;
    case 'thumbnail':
      return 'Thumbnail';
    case 'transcription':
      return 'Transcription';
    default:
      return job.jobType;
  }
};

const formatFileSize = (bytes: number) => {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`;
};

const ProcessingStatus = ({
  recordingId,
  onComplete,
  showDetails = true,
  compact = false,
  className = '',
}: ProcessingStatusProps) => {
  const [hasNotifiedComplete, setHasNotifiedComplete] = useState(false);

  // Fetch processing status
  const { data, isLoading, error } = useQuery<{ data: ProcessingStatusData }>({
    queryKey: ['processing-status', recordingId],
    queryFn: () => api.get(`/recordings/${recordingId}/processing-status`),
    refetchInterval: (query) => {
      const status = query.state.data?.data?.overallStatus;
      // Poll while processing
      if (status === 'pending' || status === 'processing') {
        return 3000;
      }
      return false;
    },
    staleTime: 5000,
  });

  const statusData = data?.data;

  // Notify on complete
  useEffect(() => {
    if (
      statusData?.overallStatus === 'completed' &&
      !hasNotifiedComplete &&
      onComplete
    ) {
      setHasNotifiedComplete(true);
      onComplete();
    }
  }, [statusData?.overallStatus, hasNotifiedComplete, onComplete]);

  if (isLoading) {
    return (
      <div className={`flex items-center gap-2 ${className}`}>
        <LoadingSpinner size="sm" />
        <span className="text-sm text-gray-500">Loading status...</span>
      </div>
    );
  }

  if (error || !statusData) {
    return null;
  }

  const { overallStatus, jobs = [], variants = [] } = statusData;

  // Compact view - just show overall status
  if (compact) {
    return (
      <div className={`flex items-center gap-2 ${className}`}>
        {getStatusIcon(overallStatus)}
        <span className={`text-sm capitalize ${
          overallStatus === 'completed' ? 'text-green-600' :
          overallStatus === 'failed' ? 'text-red-600' :
          overallStatus === 'processing' ? 'text-blue-600' :
          'text-gray-500'
        }`}>
          {overallStatus === 'processing' ? 'Processing...' : overallStatus}
        </span>
        {overallStatus === 'processing' && jobs.length > 0 && (
          <span className="text-xs text-gray-400">
            ({jobs.filter(j => j.status === 'completed').length}/{jobs.length})
          </span>
        )}
      </div>
    );
  }

  // Full view
  return (
    <div className={`bg-white rounded-lg border border-gray-200 ${className}`}>
      {/* Header */}
      <div className="px-4 py-3 border-b border-gray-100">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            {getStatusIcon(overallStatus)}
            <h4 className="font-medium text-gray-900">Processing Status</h4>
          </div>
          <span className={`text-sm px-2 py-0.5 rounded-full ${
            overallStatus === 'completed' ? 'bg-green-100 text-green-700' :
            overallStatus === 'failed' ? 'bg-red-100 text-red-700' :
            overallStatus === 'processing' ? 'bg-blue-100 text-blue-700' :
            'bg-gray-100 text-gray-600'
          }`}>
            {overallStatus}
          </span>
        </div>
      </div>

      {/* Jobs List */}
      {showDetails && jobs.length > 0 && (
        <div className="px-4 py-3 space-y-3">
          {jobs.map((job) => (
            <div key={job.id} className="flex items-center gap-3">
              <div className="flex-shrink-0">
                {getStatusIcon(job.status)}
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center justify-between">
                  <span className="text-sm font-medium text-gray-700">
                    {getJobLabel(job)}
                  </span>
                  <span className="text-xs text-gray-500">
                    {job.status === 'processing' ? `${job.progress}%` : job.status}
                  </span>
                </div>
                {job.status === 'processing' && (
                  <div className="mt-1">
                    <div className="bg-gray-200 rounded-full h-1.5">
                      <div
                        className="bg-blue-600 h-1.5 rounded-full transition-all duration-300"
                        style={{ width: `${job.progress}%` }}
                      />
                    </div>
                    {job.stage && (
                      <p className="mt-1 text-xs text-gray-500 capitalize">
                        {job.stage.replace('_', ' ')}
                      </p>
                    )}
                  </div>
                )}
                {job.status === 'failed' && job.errorMessage && (
                  <p className="mt-1 text-xs text-red-500 truncate">
                    {job.errorMessage}
                  </p>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Empty State - No Active Jobs */}
      {showDetails && jobs.length === 0 && (
        <div className="px-4 py-4">
          {overallStatus === 'completed' ? (
            <div className="flex items-center gap-3 text-green-700">
              <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              <span className="text-sm">All processing complete. Video is ready for playback.</span>
            </div>
          ) : overallStatus === 'failed' ? (
            <div className="flex items-center gap-3 text-red-600">
              <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              <span className="text-sm">Processing encountered errors. Please contact support if the issue persists.</span>
            </div>
          ) : overallStatus === 'pending' ? (
            <div className="flex items-center gap-3 text-gray-500">
              <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              <span className="text-sm">Waiting in queue. Processing will begin shortly.</span>
            </div>
          ) : (
            <div className="flex items-center gap-3 text-blue-600">
              <LoadingSpinner size="sm" />
              <span className="text-sm">Processing video...</span>
            </div>
          )}
        </div>
      )}

      {/* Available Variants */}
      {showDetails && variants.length > 0 && (
        <div className="px-4 py-3 border-t border-gray-100">
          <h5 className="text-xs font-medium text-gray-500 uppercase mb-2">
            Available Qualities
          </h5>
          <div className="flex flex-wrap gap-2">
            {variants.map((variant) => (
              <div
                key={variant.quality}
                className={`px-2 py-1 rounded text-xs ${
                  variant.isReady
                    ? 'bg-green-50 text-green-700 border border-green-200'
                    : 'bg-gray-50 text-gray-500 border border-gray-200'
                }`}
              >
                <span className="font-medium">{variant.quality}</span>
                <span className="text-gray-400 ml-1">
                  {variant.width}x{variant.height}
                </span>
                <span className="text-gray-400 ml-1">
                  ({formatFileSize(variant.fileSize)})
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Transcription Status */}
      {showDetails && statusData.transcriptionStatus !== undefined && (
        <div className="px-4 py-3 border-t border-gray-100">
          <div className="flex items-center gap-3">
            <div className="flex-shrink-0">
              {getStatusIcon(statusData.transcriptionStatus)}
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center justify-between">
                <span className="text-sm font-medium text-gray-700">
                  Transcription
                </span>
                <span className={`text-xs px-2 py-0.5 rounded-full ${
                  statusData.transcriptionStatus === 'completed' ? 'bg-green-100 text-green-700' :
                  statusData.transcriptionStatus === 'failed' ? 'bg-red-100 text-red-700' :
                  statusData.transcriptionStatus === 'processing' || statusData.transcriptionStatus === 'pending' ? 'bg-blue-100 text-blue-700' :
                  'bg-gray-100 text-gray-600'
                }`}>
                  {statusData.transcriptionStatus === 'none' ? 'Not started' :
                   statusData.transcriptionStatus === 'pending' ? 'Queued' :
                   statusData.transcriptionStatus === 'processing' ? 'Processing...' :
                   statusData.transcriptionStatus}
                </span>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Thumbnail Preview */}
      {showDetails && statusData.thumbnailUrl && (
        <div className="px-4 py-3 border-t border-gray-100">
          <h5 className="text-xs font-medium text-gray-500 uppercase mb-2">
            Thumbnail
          </h5>
          <img
            src={statusData.thumbnailUrl}
            alt="Video thumbnail"
            className="w-32 h-18 object-cover rounded border border-gray-200"
          />
        </div>
      )}
    </div>
  );
};

export default ProcessingStatus;
