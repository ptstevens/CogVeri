import React, { useState, useEffect, useMemo } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  CheckCircle,
  XCircle,
  MessageSquare,
  Clock,
  User,
  Calendar,
  Video,
  ArrowLeft,
  Sparkles,
  Loader2,
  AlertCircle,
  ExternalLink,
  RefreshCw,
  FileText,
} from 'lucide-react';
import api from '../../services/api';
import { useAuth } from '../../contexts/AuthContext';
import toast from 'react-hot-toast';
import { Transcription, ProcessingStatus } from '../../components/recording';
import { RecordingHistoryNav } from '../../components/review';
import { Recording, recordingService } from '../../services/recording.service';
import { templateService, TaskTemplate } from '../../services/template.service';
import Tabs, { Tab } from '../../components/ui/Tabs';
import VideoPlayer, { VideoPlayerHandle } from '../../components/ui/VideoPlayer';
import {
  ResultsHeader,
  ResultsTimeline,
  StepBreakdown,
  MissedItemsPanel,
} from '../../components/analysis';
import { AnalysisResults } from '../../types/rubric.types';

interface Task {
  id: string;
  title: string;
  description: string;
  status: string;
  priority: string;
  assigned_to: string;
  reviewed_by: string;
  assignee_name: string;
  assignee_email: string;
  created_at: string;
  due_date?: string;
  template_id?: string;
}

const TaskReview: React.FC = () => {
  const { taskId } = useParams<{ taskId: string }>();
  const navigate = useNavigate();
  const { user } = useAuth();
  const queryClient = useQueryClient();

  // View state
  const [activeTab, setActiveTab] = useState<string>('recording');
  const [selectedRecordingIndex, setSelectedRecordingIndex] = useState<number>(0);

  // Video player state
  const [_isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [videoError, setVideoError] = useState<string>('');
  const videoRef = React.useRef<VideoPlayerHandle>(null);

  // Review form state
  const [feedback, setFeedback] = useState('');
  const [decision, setDecision] = useState<'approve' | 'reject' | ''>('');

  // Fetch task details
  const { data: task, isLoading: taskLoading } = useQuery<Task>({
    queryKey: ['task', taskId],
    queryFn: async () => {
      const response = await api.get(`/tasks/${taskId}`);
      return response.data.data;
    },
  });

  // Fetch template to check if it has a rubric
  const { data: template } = useQuery<TaskTemplate | null>({
    queryKey: ['template', task?.template_id],
    queryFn: async () => {
      if (!task?.template_id) return null;
      return templateService.getTemplate(task.template_id);
    },
    enabled: !!task?.template_id,
  });

  // Check if template has a rubric with steps
  const hasRubric = Boolean(
    template?.evaluationCriteria?.rubricSteps?.length &&
    template.evaluationCriteria.rubricSteps.length > 0
  );

  // Fetch recordings for the task
  const { data: recordings, isLoading: recordingsLoading } = useQuery<Recording[]>({
    queryKey: ['recordings', taskId],
    queryFn: async () => {
      const response = await api.get(`/recordings?task_id=${taskId}`);
      return response.data.data;
    },
  });

  // Sort recordings oldest-first for display (Recording 1 = first submission)
  // Backend returns newest-first (DESC), so we reverse for chronological order
  const sortedRecordings = useMemo(() =>
    recordings ? [...recordings].reverse() : [],
    [recordings]
  );

  // Get the currently selected recording
  const selectedRecording = sortedRecordings[selectedRecordingIndex];

  // Default to latest recording on load
  useEffect(() => {
    if (sortedRecordings.length > 0) {
      setSelectedRecordingIndex(sortedRecordings.length - 1);
    }
  }, [sortedRecordings.length]);

  // Reset video error when recording changes
  useEffect(() => {
    setVideoError('');
    setCurrentTime(0);
  }, [selectedRecordingIndex]);

  // Fetch playback URL for the selected recording (only if completed)
  const { data: playbackUrl, isLoading: playbackUrlLoading } = useQuery({
    queryKey: ['playback-url', selectedRecording?.id],
    queryFn: async () => {
      if (!selectedRecording?.id) return null;
      const response = await api.get(`/recordings/${selectedRecording.id}/playback-url`);
      return response.data.url;
    },
    enabled: !!selectedRecording?.id && selectedRecording?.status === 'completed',
    staleTime: 1000 * 60 * 60, // 1 hour (since signed URLs expire after 24 hours)
    retry: false,
  });

  // Fetch analysis status for the selected recording
  const {
    data: analysisStatus,
    isLoading: analysisStatusLoading,
    error: analysisStatusError,
    refetch: refetchAnalysisStatus,
  } = useQuery({
    queryKey: ['analysis-status', selectedRecording?.id],
    queryFn: () => recordingService.getAnalysisStatus(selectedRecording!.id),
    enabled: !!selectedRecording?.id && hasRubric,
    retry: (failureCount, error: any) => {
      if (error?.response?.status === 403) return false;
      return failureCount < 3;
    },
    refetchInterval: (query) => {
      const inProgressStatuses = ['pending', 'extracting_frames', 'analyzing_speech', 'analyzing_visual', 'combining_results'];
      const status = query.state.data?.status;
      if (status && inProgressStatuses.includes(status)) {
        return 3000;
      }
      return false;
    },
  });

  // Fetch full analysis results when completed
  const { data: analysisResults } = useQuery<AnalysisResults>({
    queryKey: ['analysis-results', selectedRecording?.id],
    queryFn: () => recordingService.getAnalysisResults(selectedRecording!.id),
    enabled: !!selectedRecording?.id && analysisStatus?.status === 'completed',
  });

  // Check if AI analysis feature is not available (403 error)
  const isAnalysisFeatureUnavailable = (analysisStatusError as any)?.response?.status === 403;

  // Trigger analysis mutation
  const triggerAnalysisMutation = useMutation({
    mutationFn: (recordingId: string) => recordingService.triggerAnalysis(recordingId),
    onSuccess: () => {
      refetchAnalysisStatus();
    },
    onError: (error: any) => {
      const message = error.response?.data?.message || 'Failed to start analysis';
      toast.error(message);
    },
  });

  // Mark task as "in_review" when reviewer opens it
  const startReviewMutation = useMutation({
    mutationFn: async () => {
      const response = await api.patch(`/tasks/${taskId}`, {
        status: 'in_review',
      });
      return response.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['task', taskId] });
    },
  });

  // Auto-transition to "in_review" when page loads with "submitted" task
  useEffect(() => {
    if (task?.status === 'submitted' && !startReviewMutation.isPending) {
      startReviewMutation.mutate();
    }
  }, [task?.status]); // eslint-disable-line react-hooks/exhaustive-deps

  // Submit review mutation
  const submitReviewMutation = useMutation({
    mutationFn: async (data: { decision: string; feedback: string }) => {
      const response = await api.post(`/tasks/${taskId}/review`, {
        status: data.decision === 'approve' ? 'completed' : 'rejected',
        feedback: data.feedback,
        reviewed_at: new Date().toISOString(),
      });
      return response.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['task', taskId] });
      navigate('/reviews');
    },
    onError: (error: any) => {
      toast.error(error.response?.data?.message || 'Failed to submit review');
    },
  });

  const handleTimeUpdate = (time: number) => {
    setCurrentTime(time);
  };

  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  const handleVideoError = (error: Error) => {
    const errorMessage = error.message || 'Unknown video playback error';
    setVideoError(errorMessage);
    toast.error(`Video Error: ${errorMessage}`);
  };

  const handleSeekToTime = (time: number) => {
    if (videoRef.current) {
      videoRef.current.seekTo(time);
      videoRef.current.play();
      setIsPlaying(true);
      // Switch to recording tab to show the video
      setActiveTab('recording');
    }
  };

  const handleSubmitReview = () => {
    if (!decision) {
      toast.error('Please select a decision (Approve or Request Changes)');
      return;
    }

    if (!feedback.trim()) {
      toast.error('Please provide feedback for your decision');
      return;
    }

    submitReviewMutation.mutate({ decision, feedback });
  };

  // Tab definitions
  const tabs: Tab[] = [
    { id: 'recording', label: 'Recording', icon: Video },
    { id: 'transcription', label: 'Transcription', icon: FileText },
    { id: 'ai-review', label: 'AI Review', icon: Sparkles },
  ];

  if (taskLoading || recordingsLoading || playbackUrlLoading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-purple-600"></div>
      </div>
    );
  }

  const isReviewer = user?.id === task?.reviewed_by;

  if (!isReviewer && user?.role !== 'admin') {
    return (
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="bg-yellow-50 border-l-4 border-yellow-400 p-4">
          <p className="text-yellow-700">
            You don&apos;t have permission to review this task.
          </p>
        </div>
      </div>
    );
  }

  // Render AI Analysis content based on status
  const renderAIAnalysisContent = () => {
    if (analysisStatusLoading) {
      return (
        <div className="flex items-center justify-center py-12 text-gray-500">
          <Loader2 className="h-6 w-6 mr-3 animate-spin" />
          Checking analysis status...
        </div>
      );
    }

    if (isAnalysisFeatureUnavailable) {
      return (
        <div className="bg-purple-50 border border-purple-200 rounded-lg p-6">
          <div className="flex items-start gap-4">
            <Sparkles className="h-6 w-6 text-purple-600 flex-shrink-0 mt-0.5" />
            <div>
              <p className="text-lg font-medium text-purple-800">
                Upgrade to unlock AI Analysis
              </p>
              <p className="text-purple-700 mt-2">
                Get AI-powered video analysis with automatic rubric scoring on the Starter plan or higher.
              </p>
              <button
                onClick={() => navigate('/settings/billing')}
                className="mt-4 inline-flex items-center px-4 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700 transition font-medium"
              >
                View Plans
                <ExternalLink className="h-4 w-4 ml-2" />
              </button>
            </div>
          </div>
        </div>
      );
    }

    if (!hasRubric) {
      return (
        <div className="bg-amber-50 border border-amber-200 rounded-lg p-6">
          <div className="flex items-start gap-4">
            <AlertCircle className="h-6 w-6 text-amber-600 flex-shrink-0 mt-0.5" />
            <div>
              <p className="text-lg font-medium text-amber-800">
                No rubric configured
              </p>
              <p className="text-amber-700 mt-2">
                This task&apos;s template doesn&apos;t have evaluation criteria defined.
                Add a rubric to the template to enable AI analysis.
              </p>
            </div>
          </div>
        </div>
      );
    }

    if (analysisStatus?.status === 'none') {
      return (
        <div className="bg-white rounded-lg border p-6">
          <div className="text-center max-w-md mx-auto">
            <Sparkles className="h-12 w-12 text-purple-600 mx-auto mb-4" />
            <h3 className="text-lg font-semibold text-gray-900 mb-2">
              Run AI Analysis
            </h3>
            <p className="text-gray-600 mb-6">
              Automatically score this recording against the task rubric using AI-powered analysis.
            </p>
            <button
              onClick={() => triggerAnalysisMutation.mutate(selectedRecording!.id)}
              disabled={triggerAnalysisMutation.isPending}
              className="w-full max-w-xs py-3 px-6 bg-gradient-to-r from-purple-600 to-indigo-600 text-white rounded-lg hover:from-purple-700 hover:to-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed transition font-medium flex items-center justify-center mx-auto"
            >
              {triggerAnalysisMutation.isPending ? (
                <>
                  <Loader2 className="h-5 w-5 mr-2 animate-spin" />
                  Starting Analysis...
                </>
              ) : (
                <>
                  <Sparkles className="h-5 w-5 mr-2" />
                  Analyze Recording
                </>
              )}
            </button>
          </div>
        </div>
      );
    }

    if (analysisStatus?.status === 'completed' && analysisResults) {
      return (
        <div className="space-y-6">
          {/* Results Header with score */}
          <ResultsHeader results={analysisResults} />

          {/* Timeline - connected to video player */}
          <ResultsTimeline
            stepResults={analysisResults.stepResults}
            totalDuration={selectedRecording?.duration_seconds || 0}
            onSeek={handleSeekToTime}
            currentTime={currentTime}
          />

          {/* Step Breakdown */}
          <StepBreakdown
            stepResults={analysisResults.stepResults}
            onSeek={handleSeekToTime}
          />

          {/* Missed Items / Improvements / Strengths */}
          <MissedItemsPanel
            missedSteps={analysisResults.missedSteps}
            improvements={analysisResults.improvements}
            strengths={analysisResults.strengths}
          />

          {/* Re-run analysis button */}
          <div className="flex justify-center pt-4">
            <button
              onClick={() => triggerAnalysisMutation.mutate(selectedRecording!.id)}
              disabled={triggerAnalysisMutation.isPending}
              className="inline-flex items-center px-4 py-2 text-sm text-gray-600 hover:text-gray-800 hover:bg-gray-100 rounded-lg transition"
            >
              {triggerAnalysisMutation.isPending ? (
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              ) : (
                <RefreshCw className="h-4 w-4 mr-2" />
              )}
              Re-run Analysis
            </button>
          </div>
        </div>
      );
    }

    if (analysisStatus?.status === 'failed') {
      return (
        <div className="bg-red-50 border border-red-200 rounded-lg p-6">
          <div className="flex items-start gap-4">
            <AlertCircle className="h-6 w-6 text-red-600 flex-shrink-0 mt-0.5" />
            <div className="flex-1">
              <p className="text-lg font-medium text-red-800">
                Analysis Failed
              </p>
              <p className="text-red-700 mt-2">
                {analysisStatus.errorMessage || 'An unknown error occurred during analysis.'}
              </p>
              <button
                onClick={() => triggerAnalysisMutation.mutate(selectedRecording!.id)}
                disabled={triggerAnalysisMutation.isPending}
                className="mt-4 inline-flex items-center px-4 py-2 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 transition font-medium"
              >
                <Sparkles className="h-5 w-5 mr-2" />
                Retry Analysis
              </button>
            </div>
          </div>
        </div>
      );
    }

    // In progress states
    return (
      <div className="bg-white rounded-lg border p-8">
        <div className="text-center max-w-md mx-auto">
          <Loader2 className="h-12 w-12 text-purple-600 mx-auto mb-4 animate-spin" />
          <h3 className="text-lg font-semibold text-gray-900 mb-2">
            {analysisStatus?.stage === 'extracting_frames' && 'Extracting video frames...'}
            {analysisStatus?.stage === 'analyzing_speech' && 'Analyzing speech...'}
            {analysisStatus?.stage === 'analyzing_visual' && 'Analyzing visual content...'}
            {analysisStatus?.stage === 'combining_results' && 'Combining results...'}
            {analysisStatus?.status === 'pending' && 'Queued for analysis...'}
            {!analysisStatus?.stage && analysisStatus?.status !== 'pending' && 'Processing...'}
          </h3>
          {analysisStatus?.progress !== undefined && (
            <div className="mt-4">
              <div className="w-full bg-gray-200 rounded-full h-2 mb-2">
                <div
                  className="bg-gradient-to-r from-purple-600 to-indigo-600 h-2 rounded-full transition-all duration-500"
                  style={{ width: `${analysisStatus.progress}%` }}
                />
              </div>
              <p className="text-sm text-gray-500">{analysisStatus.progress}% complete</p>
            </div>
          )}
        </div>
      </div>
    );
  };

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      {/* Header */}
      <div className="mb-6">
        <button
          onClick={() => navigate('/reviews')}
          className="flex items-center text-gray-600 hover:text-gray-900 mb-4"
        >
          <ArrowLeft className="h-5 w-5 mr-2" />
          Back to Reviews
        </button>

        <div className="bg-white shadow rounded-lg p-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-4 flex-1 min-w-0">
              <div className="flex-1 min-w-0">
                <div className="flex items-center space-x-3">
                  <h1 className="text-xl font-bold text-gray-900 truncate">{task?.title}</h1>
                  <span className={`px-2 py-0.5 rounded-full text-xs font-medium whitespace-nowrap
                    ${task?.priority === 'high' ? 'bg-red-100 text-red-800' :
                      task?.priority === 'medium' ? 'bg-yellow-100 text-yellow-800' :
                      'bg-green-100 text-green-800'}`}>
                    {task?.priority}
                  </span>
                </div>
                <div className="flex items-center space-x-4 mt-1 text-sm text-gray-500">
                  <span className="flex items-center">
                    <User className="h-4 w-4 mr-1" />
                    {task?.assignee_name || task?.assignee_email}
                  </span>
                  {task?.due_date && (
                    <span className="flex items-center">
                      <Calendar className="h-4 w-4 mr-1" />
                      Due: {new Date(task.due_date).toLocaleDateString()}
                    </span>
                  )}
                  <span className="flex items-center">
                    <Clock className="h-4 w-4 mr-1" />
                    {task?.status?.replace('_', ' ')}
                  </span>
                </div>
              </div>
            </div>
            <a
              href={`/tasks?highlight=${task?.id}`}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center px-3 py-1.5 text-sm font-medium text-blue-600 hover:text-blue-800 hover:bg-blue-50 rounded-md transition-colors ml-4"
            >
              <ExternalLink className="h-4 w-4 mr-1.5" />
              View Task
            </a>
          </div>
        </div>
      </div>

      {/* Recording History Navigation */}
      <RecordingHistoryNav
        recordings={sortedRecordings}
        selectedIndex={selectedRecordingIndex}
        onSelectRecording={setSelectedRecordingIndex}
      />

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        {/* Main Content Section with Tabs */}
        <div className="lg:col-span-2">
          {selectedRecording ? (
            <div className="bg-white shadow rounded-lg overflow-hidden">
              {/* Tabs */}
              <div className="border-b">
                <Tabs
                  tabs={tabs}
                  activeTab={activeTab}
                  onChange={setActiveTab}
                  className="px-4"
                />
              </div>

              {/* Tab Content */}
              <div className="p-0">
                {/* Recording Tab */}
                {activeTab === 'recording' && (
                  <div>
                    {/* Video Player */}
                    <div className="relative">
                      {videoError && (
                        <div className="absolute top-0 left-0 right-0 bg-red-500 text-white p-2 text-sm z-10">
                          {videoError}
                        </div>
                      )}
                      {selectedRecording?.status !== 'completed' ? (
                        <div className="flex flex-col items-center justify-center bg-gray-100 aspect-video">
                          <Loader2 className="h-8 w-8 animate-spin text-primary-500 mb-3" />
                          <p className="text-gray-600 font-medium">Video is still processing...</p>
                          <p className="text-gray-500 text-sm mt-1">
                            Status: {selectedRecording?.status || 'unknown'}
                          </p>
                        </div>
                      ) : (
                        <VideoPlayer
                          key={playbackUrl}
                          ref={videoRef}
                          src={playbackUrl}
                          poster={selectedRecording?.thumbnail_url}
                          className="w-full max-h-[60vh]"
                          onTimeUpdate={handleTimeUpdate}
                          onPlay={() => setIsPlaying(true)}
                          onPause={() => setIsPlaying(false)}
                          onError={handleVideoError}
                        />
                      )}
                    </div>

                    {/* Recording Info */}
                    <div className="p-4 border-t">
                      <h3 className="font-semibold mb-2">Recording Information</h3>
                      <div className="grid grid-cols-2 gap-4 text-sm">
                        <div>
                          <span className="text-gray-600">Duration:</span>
                          <span className="ml-2 font-medium">{formatTime(selectedRecording.duration_seconds)}</span>
                        </div>
                        <div>
                          <span className="text-gray-600">Submitted:</span>
                          <span className="ml-2 font-medium">
                            {new Date(selectedRecording.created_at).toLocaleString()}
                          </span>
                        </div>
                      </div>
                    </div>

                    {/* Processing Status - only show when not completed */}
                    {selectedRecording.status !== 'completed' && (
                      <div className="px-4 pb-4">
                        <ProcessingStatus
                          recordingId={selectedRecording.id}
                          compact={false}
                          onComplete={() => {
                            // Refresh recordings list when processing completes
                            queryClient.invalidateQueries({ queryKey: ['recordings', taskId] });
                          }}
                        />
                      </div>
                    )}
                  </div>
                )}

                {/* Transcription Tab */}
                {activeTab === 'transcription' && (
                  <div className="p-0">
                    <Transcription
                      recordingId={selectedRecording.id}
                      currentTime={currentTime}
                      onSeek={handleSeekToTime}
                      className="max-h-[600px]"
                    />
                  </div>
                )}

                {/* AI Review Tab */}
                {activeTab === 'ai-review' && (
                  <div className="p-4">
                    {renderAIAnalysisContent()}
                  </div>
                )}
              </div>
            </div>
          ) : (
            <div className="bg-white shadow rounded-lg p-8 text-center text-gray-500">
              <Video className="h-12 w-12 mx-auto mb-4 text-gray-300" />
              No recording available for this task yet.
            </div>
          )}
        </div>

        {/* Review Panel */}
        <div className="lg:col-span-1">
          <div className="bg-white shadow rounded-lg p-6">
            <h2 className="text-xl font-semibold mb-4 flex items-center">
              <MessageSquare className="h-6 w-6 mr-2 text-blue-600" />
              Review Feedback
            </h2>

            {/* Feedback Form */}
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Your Feedback
                </label>
                <textarea
                  value={feedback}
                  onChange={(e) => setFeedback(e.target.value)}
                  rows={6}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-purple-500 focus:border-purple-500"
                  placeholder="Provide detailed feedback about the recording..."
                />
              </div>

              {/* Decision Buttons */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Decision
                </label>
                <div className="grid grid-cols-2 gap-3">
                  <button
                    onClick={() => setDecision('approve')}
                    className={`px-4 py-3 rounded-lg border-2 transition flex flex-col items-center ${
                      decision === 'approve'
                        ? 'border-green-500 bg-green-50 text-green-700'
                        : 'border-gray-300 hover:border-green-400'
                    }`}
                  >
                    <CheckCircle className="h-8 w-8 mb-1" />
                    <span className="text-sm font-medium">Approve</span>
                  </button>
                  <button
                    onClick={() => setDecision('reject')}
                    className={`px-4 py-3 rounded-lg border-2 transition flex flex-col items-center ${
                      decision === 'reject'
                        ? 'border-red-500 bg-red-50 text-red-700'
                        : 'border-gray-300 hover:border-red-400'
                    }`}
                  >
                    <XCircle className="h-8 w-8 mb-1" />
                    <span className="text-sm font-medium">Request Changes</span>
                  </button>
                </div>
              </div>

              {/* Submit Review Button */}
              <button
                onClick={handleSubmitReview}
                disabled={!decision || !feedback.trim() || submitReviewMutation.isPending}
                className="w-full py-3 px-4 bg-purple-600 text-white rounded-lg hover:bg-purple-700 disabled:bg-gray-400 disabled:cursor-not-allowed transition font-medium"
              >
                {submitReviewMutation.isPending ? (
                  <span className="flex items-center justify-center">
                    <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-white mr-2"></div>
                    Submitting...
                  </span>
                ) : (
                  'Submit Review'
                )}
              </button>

              {/* Helper Text */}
              {decision === 'approve' && (
                <p className="text-sm text-green-600 mt-2">
                  ✓ This will mark the task as completed
                </p>
              )}
              {decision === 'reject' && (
                <p className="text-sm text-red-600 mt-2">
                  ⟲ The assignee will be notified to make changes
                </p>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default TaskReview;
