import { useState, useCallback, useEffect, useRef } from 'react';
import { Sparkles, Loader2, CheckCircle, AlertCircle, ArrowRight, FileVideo, Plus, X, Clock, Bell } from 'lucide-react';
import toast from 'react-hot-toast';
import Modal from '../ui/Modal';
import Button from '../ui/Button';
import { RubricVideoUploader } from './RubricVideoUploader';
import { TaskTypeSelector } from './TaskTypeSelector';
import { RubricStep, TaskRequirements } from '../../types/rubric.types';
import api, { RubricGenerationStatus } from '../../services/api';

export interface GenerateRubricModalProps {
  isOpen: boolean;
  onClose: () => void;
  /** 'standalone' creates template directly, 'rubric-builder' returns data via callback */
  mode?: 'standalone' | 'rubric-builder';
  /** For rubric-builder mode - callback with generated data */
  onGenerated?: (rubricSteps: RubricStep[], suggestedTitle?: string, taskRequirements?: TaskRequirements) => void;
  /** For standalone mode - callback after template is created */
  onTemplateCreated?: (templateId: string) => void;
}

// Modal steps for the two-step flow:
// 1. upload: User uploads video
// 2. transcribing: Video uploaded, transcription in progress (can configure task type while waiting)
// 3. ready: Transcription complete, user can click "Generate Rubric"
// 4. generating: AI is generating the rubric
// 5. complete: Rubric generated successfully
// 6. error: Something went wrong
type ModalStep = 'upload' | 'transcribing' | 'ready' | 'generating' | 'complete' | 'error';

const POLL_INTERVAL_MS = 2000;
const MAX_POLL_TIME_MS = 10 * 60 * 1000; // 10 minutes max for transcription + generation

export function GenerateRubricModal({
  isOpen,
  onClose,
  mode = 'rubric-builder',
  onGenerated,
  onTemplateCreated,
}: GenerateRubricModalProps) {
  const isStandalone = mode === 'standalone';
  const [step, setStep] = useState<ModalStep>('upload');
  const [tempVideoId, setTempVideoId] = useState<string | null>(null);
  const [taskType, setTaskType] = useState('');
  const [context, setContext] = useState('');
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [generationStatus, setGenerationStatus] = useState<RubricGenerationStatus | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [generatedSteps, setGeneratedSteps] = useState<RubricStep[] | null>(null);
  const [suggestedTitle, setSuggestedTitle] = useState<string | null>(null);
  const [_taskRequirements, setTaskRequirements] = useState<TaskRequirements | null>(null);

  // Editable fields for task requirements
  const [editedTitle, setEditedTitle] = useState('');
  const [editedDescription, setEditedDescription] = useState('');
  const [editedRequirements, setEditedRequirements] = useState<string[]>([]);
  const [editedTips, setEditedTips] = useState<string[]>([]);
  const [editedDuration, setEditedDuration] = useState('');

  // Standalone mode fields (for creating new template)
  const [templateType, setTemplateType] = useState<'recording' | 'live_demo' | 'hybrid'>('recording');
  const [templatePriority, setTemplatePriority] = useState<'low' | 'medium' | 'high' | 'urgent'>('medium');
  const [templateCategory, setTemplateCategory] = useState('');
  const [isSaving, setIsSaving] = useState(false);
  const [showProcessingModal, setShowProcessingModal] = useState(false);

  const pollTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pollStartTimeRef = useRef<number>(0);
  const isClosingRef = useRef(false);
  const tempVideoIdRef = useRef<string | null>(null); // Ref to avoid stale closure in pollStatus

  // Cleanup temp video on close
  const cleanupTempVideo = useCallback(async () => {
    if (tempVideoId && !isClosingRef.current) {
      isClosingRef.current = true;
      try {
        await api.delete(`/rubric-generation/${tempVideoId}`);
      } catch {
        // Ignore cleanup errors
      }
    }
  }, [tempVideoId]);

  // Handle modal close
  const handleClose = useCallback(() => {
    // Stop polling
    if (pollTimeoutRef.current) {
      clearTimeout(pollTimeoutRef.current);
      pollTimeoutRef.current = null;
    }

    // Only cleanup temp video if we're in a safe state (not during active transcription)
    // During transcription, the video is needed by the worker - let the 24-hour
    // background job handle cleanup of abandoned videos instead
    // Safe states: upload (no video yet), ready (transcription done), error (can cleanup)
    // Unsafe states: transcribing (worker needs file), generating (processing), complete (user wants result)
    const safeToCleanup = step === 'upload' || step === 'ready' || step === 'error';
    if (safeToCleanup) {
      cleanupTempVideo();
    } else if (step === 'transcribing') {
      // Let user know the video will be cleaned up automatically
      toast('Transcription cancelled. Video will be automatically cleaned up.', {
        icon: '🗑️',
        duration: 3000,
      });
    }

    // Reset state
    setStep('upload');
    setTempVideoId(null);
    tempVideoIdRef.current = null;
    setTaskType('');
    setContext('');
    setUploadError(null);
    setGenerationStatus(null);
    setErrorMessage(null);
    setGeneratedSteps(null);
    setSuggestedTitle(null);
    setTaskRequirements(null);
    setEditedTitle('');
    setEditedDescription('');
    setEditedRequirements([]);
    setEditedTips([]);
    setEditedDuration('');
    setTemplateType('recording');
    setTemplatePriority('medium');
    setTemplateCategory('');
    setIsSaving(false);
    setShowProcessingModal(false);
    isClosingRef.current = false;

    onClose();
  }, [step, cleanupTempVideo, onClose]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (pollTimeoutRef.current) {
        clearTimeout(pollTimeoutRef.current);
      }
    };
  }, []);

  // Poll for status (transcription or generation)
  // Uses tempVideoIdRef to avoid stale closure issues when called from setTimeout
  const pollStatus = useCallback(async () => {
    const videoId = tempVideoIdRef.current;
    if (!videoId || isClosingRef.current) return;

    // Check if we've exceeded max poll time
    if (Date.now() - pollStartTimeRef.current > MAX_POLL_TIME_MS) {
      setStep('error');
      setErrorMessage('Operation timed out. Please try again.');
      return;
    }

    try {
      const response = await api.get(`/rubric-generation/${videoId}/status`);
      const statusData = response.data.data;

      // Map backend status to our RubricGenerationStatus type
      const status: RubricGenerationStatus = {
        status: statusData.status,
        progress: statusData.progress || 0,
        message: statusData.message,
        error: statusData.error,
      };
      setGenerationStatus(status);

      // Handle different stages
      switch (statusData.status) {
        case 'transcription_complete':
          // Transcription is done, user can now generate rubric
          setStep('ready');
          break;

        case 'completed':
          // Rubric generation is complete
          if (statusData.result) {
            const { rubricSteps, suggestedTitle: title, taskRequirements: reqs } = statusData.result;
            setGeneratedSteps(rubricSteps);
            setSuggestedTitle(title);
            if (reqs) {
              setTaskRequirements(reqs);
              // Initialize editable fields
              setEditedTitle(reqs.title || title || '');
              setEditedDescription(reqs.description || '');
              setEditedRequirements(reqs.requirements || []);
              setEditedTips(reqs.tips || []);
              setEditedDuration(reqs.estimatedDuration || '');
            }
            setStep('complete');
          }
          break;

        case 'failed':
          setStep('error');
          setErrorMessage(statusData.error || 'Operation failed. Please try again.');
          break;

        default:
          // Still processing (transcribing, extracting_frames, etc.) - continue polling
          pollTimeoutRef.current = setTimeout(pollStatus, POLL_INTERVAL_MS);
      }
    } catch (error: unknown) {
      const message =
        (error as { response?: { data?: { message?: string } } })?.response?.data?.message ||
        'Failed to check status.';
      setStep('error');
      setErrorMessage(message);
    }
  }, []); // No dependencies - uses refs for mutable values

  // Start polling after upload
  const startPolling = useCallback(() => {
    pollStartTimeRef.current = Date.now();
    pollTimeoutRef.current = setTimeout(pollStatus, POLL_INTERVAL_MS);
  }, [pollStatus]);

  // Handle upload complete - transcription starts automatically
  const handleUploadComplete = useCallback((videoId: string) => {
    // Set ref FIRST so pollStatus has access to it immediately
    tempVideoIdRef.current = videoId;
    setTempVideoId(videoId);
    setUploadError(null);
    setStep('transcribing');
    setGenerationStatus({ status: 'transcribing', progress: 10 });
    setShowProcessingModal(true); // Show confirmation popup
    pollStartTimeRef.current = Date.now();
    // Start polling for transcription status
    pollTimeoutRef.current = setTimeout(pollStatus, POLL_INTERVAL_MS);
  }, [pollStatus]);

  // Handle upload error
  const handleUploadError = useCallback((error: string) => {
    setUploadError(error);
    setTempVideoId(null);
    tempVideoIdRef.current = null;
  }, []);

  // Start rubric generation (when user clicks button after transcription)
  const handleStartGeneration = useCallback(async () => {
    if (!tempVideoId || !taskType) return;

    setStep('generating');
    setGenerationStatus({ status: 'extracting_frames', progress: 55 });

    try {
      // This triggers the rubric generation (frame extraction + AI)
      // Use longer timeout as this can take several minutes for longer videos
      await api.post('/rubric-generation/generate', {
        tempVideoId,
        taskType,
        customContext: context.trim() || undefined,
      }, {
        timeout: 300000, // 5 minutes - generation involves video download, frame extraction, and AI analysis
      });

      // The response includes the result directly since generation is synchronous
      const response = await api.get(`/rubric-generation/${tempVideoId}/status`);
      const statusData = response.data.data;

      if (statusData.status === 'completed' && statusData.result) {
        const { rubricSteps, suggestedTitle: title, taskRequirements: reqs } = statusData.result;
        setGeneratedSteps(rubricSteps);
        setSuggestedTitle(title);
        if (reqs) {
          setTaskRequirements(reqs);
          // Initialize editable fields
          setEditedTitle(reqs.title || title || '');
          setEditedDescription(reqs.description || '');
          setEditedRequirements(reqs.requirements || []);
          setEditedTips(reqs.tips || []);
          setEditedDuration(reqs.estimatedDuration || '');
        }
        setStep('complete');
      } else if (statusData.status === 'failed') {
        setStep('error');
        setErrorMessage(statusData.error || 'Generation failed. Please try again.');
      } else {
        // Still processing - start polling
        startPolling();
      }
    } catch (error: unknown) {
      const message =
        (error as { response?: { data?: { message?: string } } })?.response?.data?.message ||
        'Failed to generate rubric. Please try again.';
      setStep('error');
      setErrorMessage(message);
    }
  }, [tempVideoId, taskType, context, startPolling]);

  // Format requirements and tips into HTML instructions
  const formatInstructions = useCallback((
    requirements: string[],
    tips: string[],
    duration: string
  ): string => {
    let html = '';

    const filteredReqs = requirements.filter(r => r.trim() !== '');
    if (filteredReqs.length > 0) {
      html += '<p><strong>Requirements:</strong></p><ul>';
      filteredReqs.forEach(req => {
        html += `<li>${req}</li>`;
      });
      html += '</ul>';
    }

    const filteredTips = tips.filter(t => t.trim() !== '');
    if (filteredTips.length > 0) {
      html += '<p><strong>Tips:</strong></p><ul>';
      filteredTips.forEach(tip => {
        html += `<li>${tip}</li>`;
      });
      html += '</ul>';
    }

    if (duration) {
      html += `<p><strong>Estimated Duration:</strong> ${duration}</p>`;
    }

    return html;
  }, []);

  // Handle use generated rubric (rubric-builder mode)
  const handleUseRubric = useCallback(() => {
    if (generatedSteps && onGenerated) {
      // Assemble edited task requirements
      const editedTaskRequirements: TaskRequirements = {
        title: editedTitle,
        description: editedDescription,
        requirements: editedRequirements.filter(r => r.trim() !== ''),
        tips: editedTips.filter(t => t.trim() !== ''),
        estimatedDuration: editedDuration,
      };
      onGenerated(generatedSteps, editedTitle || suggestedTitle || undefined, editedTaskRequirements);
      // Clean up the temp video now that the rubric has been used
      cleanupTempVideo();
      handleClose();
    }
  }, [generatedSteps, editedTitle, editedDescription, editedRequirements, editedTips, editedDuration, suggestedTitle, onGenerated, cleanupTempVideo, handleClose]);

  // Handle create template (standalone mode)
  const handleCreateTemplate = useCallback(async () => {
    if (!generatedSteps || !editedTitle.trim()) return;

    setIsSaving(true);
    try {
      const instructions = formatInstructions(editedRequirements, editedTips, editedDuration);

      const response = await api.post('/templates', {
        title: editedTitle,
        description: editedDescription || undefined,
        instructions: instructions || undefined,
        type: templateType,
        priority: templatePriority,
        category: templateCategory || undefined,
        evaluationCriteria: {
          version: '1.0',
          rubricSteps: generatedSteps,
          passingScore: 70,
          scoringMethod: 'weighted',
          autoAnalyze: true,
        },
      });

      toast.success('Template created successfully!');
      onTemplateCreated?.(response.data.data.id);
      // Clean up the temp video now that the template is saved
      cleanupTempVideo();
      handleClose();
    } catch (error: unknown) {
      const message =
        (error as { response?: { data?: { message?: string } } })?.response?.data?.message ||
        'Failed to create template. Please try again.';
      toast.error(message);
    } finally {
      setIsSaving(false);
    }
  }, [
    generatedSteps,
    editedTitle,
    editedDescription,
    editedRequirements,
    editedTips,
    editedDuration,
    templateType,
    templatePriority,
    templateCategory,
    formatInstructions,
    onTemplateCreated,
    cleanupTempVideo,
    handleClose,
  ]);

  // Handle retry
  const handleRetry = useCallback(() => {
    setStep('upload');
    setTempVideoId(null);
    tempVideoIdRef.current = null;
    setGenerationStatus(null);
    setErrorMessage(null);
    setGeneratedSteps(null);
    setSuggestedTitle(null);
    setTaskRequirements(null);
    setEditedTitle('');
    setEditedDescription('');
    setEditedRequirements([]);
    setEditedTips([]);
    setEditedDuration('');
    setTemplateType('recording');
    setTemplatePriority('medium');
    setTemplateCategory('');
    setIsSaving(false);
    isClosingRef.current = false;
  }, []);

  const canStartGeneration = tempVideoId && taskType && step === 'ready';

  const getProgressMessage = (): string => {
    if (!generationStatus) return 'Starting...';

    switch (generationStatus.status) {
      case 'uploaded':
        return 'Preparing video...';
      case 'transcribing':
        return 'Transcribing audio...';
      case 'transcription_complete':
        return 'Transcription complete!';
      case 'extracting_frames':
        return 'Extracting key frames...';
      case 'analyzing_frames':
        return 'Analyzing video content with AI...';
      case 'generating_rubric':
        return 'Generating rubric steps...';
      case 'completed':
        return 'Generation complete!';
      case 'failed':
        return 'Operation failed';
      case 'cancelled':
        return 'Operation cancelled';
      default:
        return generationStatus.message || 'Processing...';
    }
  };

  // Check if modal can be closed (not during critical operations)
  const canClose = step !== 'generating';

  return (
    <Modal
      isOpen={isOpen}
      onClose={handleClose}
      title={isStandalone ? "Create Template from Video" : "Generate Rubric from Video"}
      size="lg"
      closeOnBackdrop={canClose}
      closeOnEscape={canClose}
    >
      {/* Upload Step */}
      {step === 'upload' && (
        <div className="space-y-6">
          <div className="text-center pb-4 border-b border-gray-100">
            <div className="w-12 h-12 rounded-full bg-primary-100 flex items-center justify-center mx-auto mb-3">
              <Sparkles className="w-6 h-6 text-primary-600" />
            </div>
            <p className="text-sm text-gray-600">
              {isStandalone
                ? 'Upload a sample video and our AI will analyze it to create a complete task template with rubric and instructions.'
                : 'Upload a sample video and our AI will analyze it to create a rubric with evaluation criteria based on the video content.'}
            </p>
          </div>

          {/* Video Upload */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Sample Video <span className="text-error">*</span>
            </label>
            <RubricVideoUploader
              onUploadComplete={handleUploadComplete}
              onError={handleUploadError}
              maxSizeMB={200}
              maxDurationSeconds={900}
            />
            {uploadError && (
              <p className="mt-2 text-sm text-error">{uploadError}</p>
            )}
          </div>

          {/* Actions */}
          <div className="flex gap-3 pt-4 border-t border-gray-100">
            <Button variant="secondary" onClick={handleClose} className="flex-1">
              Cancel
            </Button>
          </div>
        </div>
      )}

      {/* Transcribing Step - Configure while waiting */}
      {(step === 'transcribing' || step === 'ready') && (
        <div className="space-y-6">
          {/* Status Header */}
          <div className="text-center pb-4 border-b border-gray-100">
            <div className="w-12 h-12 rounded-full bg-primary-100 flex items-center justify-center mx-auto mb-3">
              {step === 'transcribing' ? (
                <Loader2 className="w-6 h-6 text-primary-600 animate-spin" />
              ) : (
                <CheckCircle className="w-6 h-6 text-success" />
              )}
            </div>
            <h3 className="text-lg font-medium text-gray-900 mb-2">
              {step === 'transcribing' ? 'Transcribing Video...' : 'Ready to Generate'}
            </h3>
            <p className="text-sm text-gray-600">
              {step === 'transcribing'
                ? 'Configure your task type while we process the audio.'
                : 'Transcription complete! Click the button below to generate your rubric.'}
            </p>
          </div>

          {/* Progress Bar */}
          <div className="max-w-xs mx-auto">
            <div className="flex items-center gap-2 mb-2">
              <FileVideo className="w-4 h-4 text-gray-400" />
              <span className="text-sm text-gray-600">{getProgressMessage()}</span>
            </div>
            <div className="h-2 bg-gray-200 rounded-full overflow-hidden">
              <div
                className="h-full bg-primary-600 rounded-full transition-all duration-500"
                style={{ width: `${generationStatus?.progress || 10}%` }}
              />
            </div>
            <p className="text-center text-xs text-gray-500 mt-2">
              {step === 'ready' ? 'Step 1 of 2 complete' : `${generationStatus?.progress || 10}% transcribed`}
            </p>
          </div>

          {/* Task Type (can configure while transcribing) */}
          <TaskTypeSelector
            value={taskType}
            onChange={setTaskType}
            label="Task Type"
            placeholder="Select or type a task type..."
            error={step === 'ready' && !taskType ? 'Please select a task type to continue' : undefined}
          />

          {/* Additional Context */}
          <div>
            <label
              htmlFor="rubric-context"
              className="block text-sm font-medium text-gray-700 mb-1.5"
            >
              Additional Context{' '}
              <span className="text-gray-400 font-normal">(optional)</span>
            </label>
            <textarea
              id="rubric-context"
              value={context}
              onChange={(e) => setContext(e.target.value)}
              placeholder="Any specific requirements or focus areas for the rubric..."
              rows={3}
              className="w-full border border-gray-300 rounded-lg px-4 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary-100 focus:border-primary-500 hover:border-gray-400 transition-colors placeholder:text-gray-400 resize-none"
            />
            <p className="mt-1 text-xs text-gray-500">
              Provide any additional context to help the AI generate more relevant criteria.
            </p>
          </div>

          {/* Actions */}
          <div className="flex gap-3 pt-4 border-t border-gray-100">
            <Button variant="secondary" onClick={handleClose} className="flex-1">
              Cancel
            </Button>
            <Button
              variant="primary"
              onClick={handleStartGeneration}
              disabled={!canStartGeneration}
              className="flex-1"
              icon={<Sparkles className="w-4 h-4" />}
            >
              {step === 'transcribing' ? 'Waiting for transcription...' : 'Generate Rubric'}
            </Button>
          </div>
        </div>
      )}

      {/* Generating Step */}
      {step === 'generating' && (
        <div className="py-8 space-y-6">
          <div className="text-center">
            <div className="w-16 h-16 rounded-full bg-primary-100 flex items-center justify-center mx-auto mb-4">
              <Loader2 className="w-8 h-8 text-primary-600 animate-spin" />
            </div>
            <h3 className="text-lg font-medium text-gray-900 mb-2">
              Generating Your Rubric
            </h3>
            <p className="text-sm text-gray-600">{getProgressMessage()}</p>
          </div>

          {/* Progress Bar */}
          <div className="max-w-xs mx-auto">
            <div className="h-2 bg-gray-200 rounded-full overflow-hidden">
              <div
                className="h-full bg-primary-600 rounded-full transition-all duration-500"
                style={{ width: `${generationStatus?.progress || 55}%` }}
              />
            </div>
            <p className="text-center text-xs text-gray-500 mt-2">
              Step 2 of 2: {generationStatus?.progress || 55}% complete
            </p>
          </div>

          <div className="text-center">
            <p className="text-xs text-gray-400">
              Analyzing video frames and generating rubric criteria...
            </p>
          </div>
        </div>
      )}

      {/* Complete Step */}
      {step === 'complete' && generatedSteps && (
        <div className="space-y-5">
          <div className="text-center pb-3 border-b border-gray-100">
            <div className="w-12 h-12 rounded-full bg-success-100 flex items-center justify-center mx-auto mb-3">
              <CheckCircle className="w-6 h-6 text-success" />
            </div>
            <h3 className="text-lg font-medium text-gray-900 mb-1">
              Generation Complete
            </h3>
            <p className="text-sm text-gray-600">
              Review and edit the template details below, then save.
            </p>
          </div>

          {/* Scrollable content area */}
          <div className="max-h-[55vh] overflow-y-auto space-y-4 pr-1">
            {/* Template Details Section */}
            <div className="space-y-4">
              <h4 className="text-sm font-medium text-gray-700 flex items-center gap-2">
                <span className="w-5 h-5 rounded-full bg-primary-100 flex items-center justify-center text-xs text-primary-600">1</span>
                Template Details
              </h4>

              {/* Title */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Title <span className="text-error">*</span>
                </label>
                <input
                  type="text"
                  value={editedTitle}
                  onChange={(e) => setEditedTitle(e.target.value)}
                  placeholder="Enter task template title..."
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary-100 focus:border-primary-500"
                />
              </div>

              {/* Description */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Description
                </label>
                <textarea
                  value={editedDescription}
                  onChange={(e) => setEditedDescription(e.target.value)}
                  placeholder="Brief summary of what contributors need to do..."
                  rows={2}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary-100 focus:border-primary-500 resize-none"
                />
              </div>

              {/* Estimated Duration */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  <Clock className="w-3.5 h-3.5 inline mr-1" />
                  Estimated Duration
                </label>
                <input
                  type="text"
                  value={editedDuration}
                  onChange={(e) => setEditedDuration(e.target.value)}
                  placeholder="e.g., 2-3 minutes"
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary-100 focus:border-primary-500"
                />
              </div>

              {/* Type, Priority, Category - only in standalone mode */}
              {isStandalone && (
                <div className="grid grid-cols-3 gap-3">
                  {/* Type */}
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Type
                    </label>
                    <select
                      value={templateType}
                      onChange={(e) => setTemplateType(e.target.value as 'recording' | 'live_demo' | 'hybrid')}
                      className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary-100 focus:border-primary-500"
                    >
                      <option value="recording">Recording</option>
                      <option value="live_demo">Live Demo</option>
                      <option value="hybrid">Hybrid</option>
                    </select>
                  </div>

                  {/* Priority */}
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Priority
                    </label>
                    <select
                      value={templatePriority}
                      onChange={(e) => setTemplatePriority(e.target.value as 'low' | 'medium' | 'high' | 'urgent')}
                      className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary-100 focus:border-primary-500"
                    >
                      <option value="low">Low</option>
                      <option value="medium">Medium</option>
                      <option value="high">High</option>
                      <option value="urgent">Urgent</option>
                    </select>
                  </div>

                  {/* Category */}
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Category
                    </label>
                    <input
                      type="text"
                      value={templateCategory}
                      onChange={(e) => setTemplateCategory(e.target.value)}
                      placeholder="Optional"
                      className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary-100 focus:border-primary-500"
                    />
                  </div>
                </div>
              )}
            </div>

            {/* Requirements Section */}
            <div className="space-y-3 pt-2 border-t border-gray-100">
              <h4 className="text-sm font-medium text-gray-700 flex items-center gap-2">
                <span className="w-5 h-5 rounded-full bg-primary-100 flex items-center justify-center text-xs text-primary-600">2</span>
                Requirements
                <span className="text-xs text-gray-400 font-normal">(shown to contributors)</span>
              </h4>
              <div className="space-y-2">
                {editedRequirements.map((req, index) => (
                  <div key={index} className="flex items-center gap-2">
                    <span className="text-gray-400 text-sm">•</span>
                    <input
                      type="text"
                      value={req}
                      onChange={(e) => {
                        const updated = [...editedRequirements];
                        updated[index] = e.target.value;
                        setEditedRequirements(updated);
                      }}
                      className="flex-1 border border-gray-300 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary-100 focus:border-primary-500"
                    />
                    <button
                      type="button"
                      onClick={() => {
                        const updated = editedRequirements.filter((_, i) => i !== index);
                        setEditedRequirements(updated);
                      }}
                      className="p-1 text-gray-400 hover:text-error transition-colors"
                    >
                      <X className="w-4 h-4" />
                    </button>
                  </div>
                ))}
                <button
                  type="button"
                  onClick={() => setEditedRequirements([...editedRequirements, ''])}
                  className="flex items-center gap-1 text-sm text-primary-600 hover:text-primary-700 transition-colors"
                >
                  <Plus className="w-4 h-4" />
                  Add requirement
                </button>
              </div>
            </div>

            {/* Tips Section */}
            <div className="space-y-3 pt-2 border-t border-gray-100">
              <h4 className="text-sm font-medium text-gray-700 flex items-center gap-2">
                <span className="w-5 h-5 rounded-full bg-primary-100 flex items-center justify-center text-xs text-primary-600">3</span>
                Tips
                <span className="text-xs text-gray-400 font-normal">(helpful hints)</span>
              </h4>
              <div className="space-y-2">
                {editedTips.map((tip, index) => (
                  <div key={index} className="flex items-center gap-2">
                    <span className="text-gray-400 text-sm">💡</span>
                    <input
                      type="text"
                      value={tip}
                      onChange={(e) => {
                        const updated = [...editedTips];
                        updated[index] = e.target.value;
                        setEditedTips(updated);
                      }}
                      className="flex-1 border border-gray-300 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary-100 focus:border-primary-500"
                    />
                    <button
                      type="button"
                      onClick={() => {
                        const updated = editedTips.filter((_, i) => i !== index);
                        setEditedTips(updated);
                      }}
                      className="p-1 text-gray-400 hover:text-error transition-colors"
                    >
                      <X className="w-4 h-4" />
                    </button>
                  </div>
                ))}
                <button
                  type="button"
                  onClick={() => setEditedTips([...editedTips, ''])}
                  className="flex items-center gap-1 text-sm text-primary-600 hover:text-primary-700 transition-colors"
                >
                  <Plus className="w-4 h-4" />
                  Add tip
                </button>
              </div>
            </div>

            {/* Rubric Steps Preview */}
            <div className="space-y-3 pt-2 border-t border-gray-100">
              <h4 className="text-sm font-medium text-gray-700 flex items-center gap-2">
                <span className="w-5 h-5 rounded-full bg-primary-100 flex items-center justify-center text-xs text-primary-600">4</span>
                Rubric Steps
                <span className="text-xs text-gray-400 font-normal">({generatedSteps.length} steps - edit in Rubric Builder)</span>
              </h4>
              <div className="border border-gray-200 rounded-lg divide-y divide-gray-100 bg-gray-50">
                {generatedSteps.slice(0, 5).map((rubricStep, index) => (
                  <div key={rubricStep.id} className="p-2.5">
                    <div className="flex items-start gap-2">
                      <span className="flex-shrink-0 w-5 h-5 rounded-full bg-white border border-gray-200 flex items-center justify-center text-xs font-medium text-gray-600">
                        {index + 1}
                      </span>
                      <div className="min-w-0">
                        <p className="text-sm font-medium text-gray-900 truncate">
                          {rubricStep.title}
                        </p>
                        <div className="flex items-center gap-2 mt-0.5">
                          <span className="text-xs text-gray-400">
                            {rubricStep.evidenceType}
                          </span>
                          {rubricStep.isRequired && (
                            <span className="text-xs text-primary-600 font-medium">
                              Required
                            </span>
                          )}
                        </div>
                      </div>
                    </div>
                  </div>
                ))}
                {generatedSteps.length > 5 && (
                  <div className="p-2 text-center text-xs text-gray-500">
                    +{generatedSteps.length - 5} more steps
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Actions */}
          <div className="flex gap-3 pt-4 border-t border-gray-100">
            <Button variant="secondary" onClick={handleClose} className="flex-1" disabled={isSaving}>
              Discard
            </Button>
            <Button
              variant="primary"
              onClick={isStandalone ? handleCreateTemplate : handleUseRubric}
              disabled={!editedTitle.trim() || isSaving}
              className="flex-1"
              icon={isSaving ? <Loader2 className="w-4 h-4 animate-spin" /> : <ArrowRight className="w-4 h-4" />}
            >
              {isSaving ? 'Creating...' : isStandalone ? 'Create Template' : 'Use Template'}
            </Button>
          </div>
        </div>
      )}

      {/* Error Step */}
      {step === 'error' && (
        <div className="py-8 space-y-6">
          <div className="text-center">
            <div className="w-16 h-16 rounded-full bg-red-100 flex items-center justify-center mx-auto mb-4">
              <AlertCircle className="w-8 h-8 text-error" />
            </div>
            <h3 className="text-lg font-medium text-gray-900 mb-2">
              Something Went Wrong
            </h3>
            <p className="text-sm text-gray-600">{errorMessage}</p>
          </div>

          {/* Actions */}
          <div className="flex gap-3 pt-4 border-t border-gray-100">
            <Button variant="secondary" onClick={handleClose} className="flex-1">
              Cancel
            </Button>
            <Button variant="primary" onClick={handleRetry} className="flex-1">
              Try Again
            </Button>
          </div>
        </div>
      )}

      {/* Processing Started Confirmation Modal */}
      {showProcessingModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-[60]">
          <div className="bg-white rounded-lg shadow-xl p-6 max-w-sm mx-4">
            <div className="text-center">
              <div className="mx-auto flex items-center justify-center h-12 w-12 rounded-full bg-blue-100 mb-4">
                <Bell className="h-6 w-6 text-blue-600" />
              </div>
              <h3 className="text-lg font-medium text-gray-900 mb-2">
                Video Processing Started
              </h3>
              <p className="text-gray-600 mb-4">
                Your video has been uploaded and transcription has started. Configure your task type while you wait.
              </p>
              <p className="text-sm text-gray-500 mb-6">
                Processing typically takes 1-2 minutes depending on video length.
              </p>
              <button
                onClick={() => setShowProcessingModal(false)}
                className="w-full px-4 py-2 bg-primary-600 text-white rounded-lg hover:bg-primary-700 transition"
              >
                Got it
              </button>
            </div>
          </div>
        </div>
      )}
    </Modal>
  );
}

export default GenerateRubricModal;
