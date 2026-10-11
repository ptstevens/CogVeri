import { useRef, useState, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { ArrowLeft, Download, Share2, RefreshCw, Loader2, Check } from 'lucide-react';
import toast from 'react-hot-toast';
import { ResultsHeader } from '../../components/analysis/ResultsHeader';
import { ResultsTimeline } from '../../components/analysis/ResultsTimeline';
import { StepBreakdown } from '../../components/analysis/StepBreakdown';
import { MissedItemsPanel } from '../../components/analysis/MissedItemsPanel';
import VideoPlayer, { VideoPlayerHandle } from '../../components/ui/VideoPlayer';
import { AnalysisResults } from '../../types/rubric.types';
import api from '../../services/api';

export default function AnalysisResultsPage() {
  const { recordingId } = useParams<{ recordingId: string }>();
  const navigate = useNavigate();
  const videoRef = useRef<VideoPlayerHandle>(null);
  const [currentTime, setCurrentTime] = useState(0);
  const [isExporting, setIsExporting] = useState(false);
  const [linkCopied, setLinkCopied] = useState(false);

  // Fetch analysis results
  const {
    data: results,
    isLoading,
    error,
    refetch,
  } = useQuery<AnalysisResults>({
    queryKey: ['analysis', recordingId],
    queryFn: async () => {
      const response = await api.get(`/recordings/${recordingId}/analysis`);
      return response.data.data;
    },
    enabled: !!recordingId,
  });

  // Fetch recording details for video URL
  const { data: recording } = useQuery({
    queryKey: ['recording', recordingId],
    queryFn: async () => {
      const response = await api.get(`/recordings/${recordingId}`);
      return response.data.data;
    },
    enabled: !!recordingId,
  });

  const handleSeek = useCallback((timestamp: number) => {
    if (videoRef.current) {
      videoRef.current.seekTo(timestamp);
      videoRef.current.play();
    }
  }, []);

  const handleTimeUpdate = useCallback((time: number) => {
    setCurrentTime(time);
  }, []);

  const handleExport = async () => {
    setIsExporting(true);
    try {
      const response = await api.get(`/recordings/${recordingId}/analysis/export`, {
        responseType: 'blob',
      });
      const url = window.URL.createObjectURL(
        new Blob([response.data], { type: 'application/pdf' })
      );
      const link = document.createElement('a');
      link.href = url;
      link.setAttribute('download', `analysis-${recordingId}.pdf`);
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.URL.revokeObjectURL(url);
      toast.success('Analysis report downloaded');
    } catch (err) {
      console.error('Export failed:', err);
      toast.error('Failed to export analysis. Please try again.');
    } finally {
      setIsExporting(false);
    }
  };

  const handleShare = async () => {
    const shareUrl = window.location.href;
    try {
      await navigator.clipboard.writeText(shareUrl);
      setLinkCopied(true);
      toast.success('Link copied to clipboard');
      setTimeout(() => setLinkCopied(false), 2000);
    } catch (err) {
      // Fallback for older browsers
      const textArea = document.createElement('textarea');
      textArea.value = shareUrl;
      document.body.appendChild(textArea);
      textArea.select();
      document.execCommand('copy');
      document.body.removeChild(textArea);
      setLinkCopied(true);
      toast.success('Link copied to clipboard');
      setTimeout(() => setLinkCopied(false), 2000);
    }
  };

  if (isLoading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <Loader2 className="w-8 h-8 animate-spin text-primary-600 mx-auto mb-4" />
          <p className="text-gray-600">Loading analysis results...</p>
        </div>
      </div>
    );
  }

  if (error || !results) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center max-w-md">
          <div className="bg-red-100 rounded-full w-16 h-16 flex items-center justify-center mx-auto mb-4">
            <RefreshCw className="w-8 h-8 text-red-600" />
          </div>
          <h2 className="text-lg font-semibold text-gray-900 mb-2">Unable to load analysis</h2>
          <p className="text-gray-600 mb-4">
            The analysis results could not be loaded. This might mean the analysis hasn't completed
            yet.
          </p>
          <div className="flex gap-3 justify-center">
            <button
              onClick={() => refetch()}
              className="px-4 py-2 bg-primary-600 text-white rounded-lg hover:bg-primary-700"
            >
              Try Again
            </button>
            <button
              onClick={() => navigate(-1)}
              className="px-4 py-2 border border-gray-300 rounded-lg hover:bg-gray-50"
            >
              Go Back
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <div className="bg-white border-b sticky top-0 z-10">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between h-16">
            <div className="flex items-center gap-4">
              <button
                onClick={() => navigate(-1)}
                className="p-2 text-gray-400 hover:text-gray-600"
              >
                <ArrowLeft className="w-5 h-5" />
              </button>
              <div>
                <h1 className="text-lg font-semibold text-gray-900">Analysis Results</h1>
                <p className="text-sm text-gray-500">
                  {recording?.task?.title || 'Recording Analysis'}
                </p>
              </div>
            </div>
            <div className="flex items-center gap-3">
              <button
                onClick={handleExport}
                disabled={isExporting}
                className="inline-flex items-center gap-2 px-4 py-2 text-gray-600 border rounded-lg hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {isExporting ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <Download className="w-4 h-4" />
                )}
                {isExporting ? 'Exporting...' : 'Export'}
              </button>
              <button
                onClick={handleShare}
                className="inline-flex items-center gap-2 px-4 py-2 text-gray-600 border rounded-lg hover:bg-gray-50"
              >
                {linkCopied ? (
                  <Check className="w-4 h-4 text-green-600" />
                ) : (
                  <Share2 className="w-4 h-4" />
                )}
                {linkCopied ? 'Copied!' : 'Share'}
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Main Content */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          {/* Left Column - Results */}
          <div className="lg:col-span-2 space-y-6">
            {/* Results Header */}
            <ResultsHeader results={results} />

            {/* Timeline */}
            <ResultsTimeline
              stepResults={results.stepResults}
              totalDuration={recording?.duration || 0}
              onSeek={handleSeek}
              currentTime={currentTime}
            />

            {/* Step Breakdown */}
            <StepBreakdown stepResults={results.stepResults} onSeek={handleSeek} />
          </div>

          {/* Right Column - Video + Coaching */}
          <div className="space-y-6">
            {/* Video Player */}
            {recording?.videoUrl && (
              <div className="bg-white rounded-lg border overflow-hidden sticky top-24">
                <div className="aspect-video">
                  <VideoPlayer
                    ref={videoRef}
                    src={recording.videoUrl}
                    poster={recording?.thumbnail_url}
                    className="w-full h-full"
                    onTimeUpdate={handleTimeUpdate}
                  />
                </div>
                <div className="p-3 border-t">
                  <p className="text-xs text-gray-500 text-center">
                    Click timeline markers or evidence to jump to specific moments
                  </p>
                </div>
              </div>
            )}

            {/* Coaching Panel */}
            <MissedItemsPanel
              missedSteps={results.missedSteps}
              improvements={results.improvements}
              strengths={results.strengths}
            />
          </div>
        </div>
      </div>
    </div>
  );
}
