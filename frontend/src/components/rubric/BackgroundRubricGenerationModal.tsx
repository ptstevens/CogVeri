import { useState, useCallback, useRef } from 'react';
import { Sparkles, Loader2, CheckCircle, AlertCircle, Upload, Bell } from 'lucide-react';
import toast from 'react-hot-toast';
import Modal from '../ui/Modal';
import Button from '../ui/Button';
import { TaskTypeSelector } from './TaskTypeSelector';
import api from '../../services/api';

export interface BackgroundRubricGenerationModalProps {
  isOpen: boolean;
  onClose: () => void;
  /** Called after the background job is successfully queued */
  onQueued?: () => void;
}

// Modal states
type ModalState = 'form' | 'uploading' | 'success' | 'error';

// Max file size for direct upload (500MB - no Cloudflare limit)
const MAX_FILE_SIZE_MB = 500;
const MAX_FILE_SIZE_BYTES = MAX_FILE_SIZE_MB * 1024 * 1024;

// Allowed video MIME types
const ALLOWED_MIME_TYPES = [
  'video/webm',
  'video/mp4',
  'video/quicktime',
  'video/x-msvideo',
  'video/x-matroska',
  'video/ogg',
];

export function BackgroundRubricGenerationModal({
  isOpen,
  onClose,
  onQueued,
}: BackgroundRubricGenerationModalProps) {
  // Form state
  const [templateTitle, setTemplateTitle] = useState('');
  const [taskType, setTaskType] = useState('');
  const [templateDescription, setTemplateDescription] = useState('');
  const [templateCategory, setTemplateCategory] = useState('');
  const [templatePriority, setTemplatePriority] = useState<'low' | 'medium' | 'high' | 'urgent'>(
    'medium'
  );
  const [customContext, setCustomContext] = useState('');

  // Upload state
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [modalState, setModalState] = useState<ModalState>('form');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);

  // Reset form
  const resetForm = useCallback(() => {
    setTemplateTitle('');
    setTaskType('');
    setTemplateDescription('');
    setTemplateCategory('');
    setTemplatePriority('medium');
    setCustomContext('');
    setSelectedFile(null);
    setUploadProgress(0);
    setModalState('form');
    setErrorMessage(null);
  }, []);

  // Handle modal close
  const handleClose = useCallback(() => {
    if (modalState === 'uploading') {
      // Don't allow closing during upload
      return;
    }
    resetForm();
    onClose();
  }, [modalState, resetForm, onClose]);

  // Handle file selection
  const handleFileSelect = useCallback((event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    // Validate file type
    if (!file.type.startsWith('video/') || !ALLOWED_MIME_TYPES.includes(file.type)) {
      toast.error('Please select a valid video file (MP4, WebM, MOV, AVI, MKV, or OGG)');
      return;
    }

    // Validate file size
    if (file.size > MAX_FILE_SIZE_BYTES) {
      toast.error(`File size exceeds ${MAX_FILE_SIZE_MB}MB limit`);
      return;
    }

    setSelectedFile(file);
  }, []);

  // Handle form submission and upload
  const handleSubmit = useCallback(async () => {
    if (!templateTitle.trim() || !taskType || !selectedFile) return;

    setModalState('uploading');
    setUploadProgress(0);
    setErrorMessage(null);

    try {
      // Step 1: Get presigned upload URL
      setUploadProgress(5);
      const uploadUrlResponse = await api.post('/rubric-generation/get-upload-url', {
        filename: selectedFile.name,
        contentType: selectedFile.type,
        fileSize: selectedFile.size,
      });

      const { uploadUrl, tempVideoId, storageKey } = uploadUrlResponse.data.data;

      // Step 2: Upload file directly to R2
      setUploadProgress(10);
      await new Promise<void>((resolve, reject) => {
        const xhr = new XMLHttpRequest();
        xhr.open('PUT', uploadUrl, true);
        xhr.setRequestHeader('Content-Type', selectedFile.type);

        xhr.upload.onprogress = (event) => {
          if (event.lengthComputable) {
            // Map upload progress to 10-80%
            const percent = 10 + Math.round((event.loaded / event.total) * 70);
            setUploadProgress(percent);
          }
        };

        xhr.onload = () => {
          if (xhr.status >= 200 && xhr.status < 300) {
            resolve();
          } else {
            reject(new Error(`Upload failed with status ${xhr.status}`));
          }
        };

        xhr.onerror = () => reject(new Error('Upload failed'));
        xhr.send(selectedFile);
      });

      // Step 3: Confirm upload and queue background job
      setUploadProgress(85);
      await api.post('/rubric-generation/confirm-upload-background', {
        tempVideoId,
        storageKey,
        filename: selectedFile.name,
        fileSize: selectedFile.size,
        contentType: selectedFile.type,
        templateTitle: templateTitle.trim(),
        taskType,
        templateDescription: templateDescription.trim() || undefined,
        templateCategory: templateCategory.trim() || undefined,
        templatePriority,
        customContext: customContext.trim() || undefined,
      });

      setUploadProgress(100);
      setModalState('success');
      onQueued?.();
    } catch (error: unknown) {
      console.error('Background rubric generation failed:', error);
      const message =
        (error as { response?: { data?: { message?: string } } })?.response?.data?.message ||
        'Failed to start rubric generation. Please try again.';
      setErrorMessage(message);
      setModalState('error');
    }
  }, [
    templateTitle,
    taskType,
    templateDescription,
    templateCategory,
    templatePriority,
    customContext,
    selectedFile,
    onQueued,
  ]);

  // Handle success close - close modal after showing success
  const handleSuccessClose = useCallback(() => {
    resetForm();
    onClose();
    toast.success('Task template generation started! Check your notifications for updates.', {
      duration: 5000,
      icon: <Bell className="w-5 h-5" />,
    });
  }, [resetForm, onClose]);

  // Form validation
  const isFormValid = templateTitle.trim() && taskType && selectedFile;

  return (
    <Modal
      isOpen={isOpen}
      onClose={handleClose}
      title="Create Template from Video"
      size="lg"
      closeOnBackdrop={modalState !== 'uploading'}
      closeOnEscape={modalState !== 'uploading'}
    >
      {/* Form State */}
      {modalState === 'form' && (
        <div className="space-y-5">
          {/* Header */}
          <div className="text-center pb-4 border-b border-gray-100">
            <div className="w-12 h-12 rounded-full bg-primary-100 flex items-center justify-center mx-auto mb-3">
              <Sparkles className="w-6 h-6 text-primary-600" />
            </div>
            <p className="text-sm text-gray-600">
              Upload a sample video and our AI will analyze it to create a complete task template
              with rubric. The template will be created as a draft for your review.
            </p>
          </div>

          {/* Title (Required) */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1.5">
              Template Title <span className="text-error">*</span>
            </label>
            <input
              type="text"
              value={templateTitle}
              onChange={(e) => setTemplateTitle(e.target.value)}
              placeholder="e.g., Product Demo Walkthrough"
              className="w-full border border-gray-300 rounded-lg px-4 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary-100 focus:border-primary-500 hover:border-gray-400 transition-colors placeholder:text-gray-400"
            />
          </div>

          {/* Task Type (Required) */}
          <TaskTypeSelector
            value={taskType}
            onChange={setTaskType}
            label="Task Type"
            placeholder="Select or type a task type..."
          />

          {/* Optional Fields */}
          <div className="grid grid-cols-2 gap-4">
            {/* Category */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">Category</label>
              <input
                type="text"
                value={templateCategory}
                onChange={(e) => setTemplateCategory(e.target.value)}
                placeholder="e.g., Sales, Support"
                className="w-full border border-gray-300 rounded-lg px-4 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary-100 focus:border-primary-500 hover:border-gray-400 transition-colors placeholder:text-gray-400"
              />
            </div>

            {/* Priority */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">Priority</label>
              <select
                value={templatePriority}
                onChange={(e) =>
                  setTemplatePriority(e.target.value as 'low' | 'medium' | 'high' | 'urgent')
                }
                className="w-full border border-gray-300 rounded-lg px-4 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary-100 focus:border-primary-500 hover:border-gray-400 transition-colors"
              >
                <option value="low">Low</option>
                <option value="medium">Medium</option>
                <option value="high">High</option>
                <option value="urgent">Urgent</option>
              </select>
            </div>
          </div>

          {/* Description */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1.5">
              Description <span className="text-gray-400 font-normal">(optional)</span>
            </label>
            <textarea
              value={templateDescription}
              onChange={(e) => setTemplateDescription(e.target.value)}
              placeholder="Brief description of the task..."
              rows={2}
              className="w-full border border-gray-300 rounded-lg px-4 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary-100 focus:border-primary-500 hover:border-gray-400 transition-colors placeholder:text-gray-400 resize-none"
            />
          </div>

          {/* Additional Context */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1.5">
              Additional Context <span className="text-gray-400 font-normal">(optional)</span>
            </label>
            <textarea
              value={customContext}
              onChange={(e) => setCustomContext(e.target.value)}
              placeholder="Any specific requirements or focus areas for the rubric..."
              rows={2}
              className="w-full border border-gray-300 rounded-lg px-4 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary-100 focus:border-primary-500 hover:border-gray-400 transition-colors placeholder:text-gray-400 resize-none"
            />
          </div>

          {/* Video Upload */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1.5">
              Sample Video <span className="text-error">*</span>
            </label>
            <div
              onClick={() => fileInputRef.current?.click()}
              className={`
                border-2 border-dashed rounded-lg p-6 text-center cursor-pointer transition-colors
                ${
                  selectedFile
                    ? 'border-primary-300 bg-primary-50'
                    : 'border-gray-300 hover:border-primary-300 hover:bg-gray-50'
                }
              `}
            >
              <input
                ref={fileInputRef}
                type="file"
                accept="video/*"
                onChange={handleFileSelect}
                className="hidden"
              />
              {selectedFile ? (
                <div className="flex items-center justify-center gap-3">
                  <CheckCircle className="w-5 h-5 text-success" />
                  <div className="text-left">
                    <p className="text-sm font-medium text-gray-900">{selectedFile.name}</p>
                    <p className="text-xs text-gray-500">
                      {(selectedFile.size / (1024 * 1024)).toFixed(1)} MB
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      setSelectedFile(null);
                    }}
                    className="ml-2 text-gray-400 hover:text-error transition-colors"
                  >
                    Change
                  </button>
                </div>
              ) : (
                <div>
                  <Upload className="w-8 h-8 text-gray-400 mx-auto mb-2" />
                  <p className="text-sm text-gray-600">Click to select a video file</p>
                  <p className="text-xs text-gray-400 mt-1">
                    MP4, WebM, MOV, AVI, MKV, or OGG up to {MAX_FILE_SIZE_MB}MB
                  </p>
                </div>
              )}
            </div>
          </div>

          {/* Actions */}
          <div className="flex gap-3 pt-4 border-t border-gray-100">
            <Button variant="secondary" onClick={handleClose} className="flex-1">
              Cancel
            </Button>
            <Button
              variant="primary"
              onClick={handleSubmit}
              disabled={!isFormValid}
              className="flex-1"
              icon={<Sparkles className="w-4 h-4" />}
            >
              Start Generation
            </Button>
          </div>
        </div>
      )}

      {/* Uploading State */}
      {modalState === 'uploading' && (
        <div className="py-8 space-y-6">
          <div className="text-center">
            <div className="w-16 h-16 rounded-full bg-primary-100 flex items-center justify-center mx-auto mb-4">
              <Loader2 className="w-8 h-8 text-primary-600 animate-spin" />
            </div>
            <h3 className="text-lg font-medium text-gray-900 mb-2">Uploading Video</h3>
            <p className="text-sm text-gray-600">Please wait while we upload your video...</p>
          </div>

          {/* Progress Bar */}
          <div className="max-w-xs mx-auto">
            <div className="h-2 bg-gray-200 rounded-full overflow-hidden">
              <div
                className="h-full bg-primary-600 rounded-full transition-all duration-300"
                style={{ width: `${uploadProgress}%` }}
              />
            </div>
            <p className="text-center text-xs text-gray-500 mt-2">{uploadProgress}% complete</p>
          </div>
        </div>
      )}

      {/* Success State */}
      {modalState === 'success' && (
        <div className="py-8 space-y-6">
          <div className="text-center">
            <div className="w-16 h-16 rounded-full bg-success-100 flex items-center justify-center mx-auto mb-4">
              <Bell className="w-8 h-8 text-success" />
            </div>
            <h3 className="text-lg font-medium text-gray-900 mb-2">Template Generation Started</h3>
            <p className="text-sm text-gray-600">
              Your video is being processed in the background. You'll receive a notification when
              your task template is ready for review.
            </p>
          </div>

          <div className="bg-primary-50 border border-primary-100 rounded-lg p-4">
            <div className="flex items-start gap-3">
              <div className="flex-shrink-0 w-8 h-8 rounded-full bg-primary-100 flex items-center justify-center">
                <Bell className="w-4 h-4 text-primary-600" />
              </div>
              <div>
                <h4 className="text-sm font-medium text-gray-900">What happens next?</h4>
                <ul className="mt-2 space-y-1 text-sm text-gray-600">
                  <li>1. Your video will be transcribed</li>
                  <li>2. AI will analyze the content and generate a rubric</li>
                  <li>3. A draft template will be created</li>
                  <li>4. You'll be notified when it's ready</li>
                </ul>
              </div>
            </div>
          </div>

          {/* Actions */}
          <div className="flex gap-3 pt-4 border-t border-gray-100">
            <Button variant="primary" onClick={handleSuccessClose} className="w-full">
              Got it
            </Button>
          </div>
        </div>
      )}

      {/* Error State */}
      {modalState === 'error' && (
        <div className="py-8 space-y-6">
          <div className="text-center">
            <div className="w-16 h-16 rounded-full bg-red-100 flex items-center justify-center mx-auto mb-4">
              <AlertCircle className="w-8 h-8 text-error" />
            </div>
            <h3 className="text-lg font-medium text-gray-900 mb-2">Something Went Wrong</h3>
            <p className="text-sm text-gray-600">{errorMessage}</p>
          </div>

          {/* Actions */}
          <div className="flex gap-3 pt-4 border-t border-gray-100">
            <Button variant="secondary" onClick={handleClose} className="flex-1">
              Cancel
            </Button>
            <Button variant="primary" onClick={() => setModalState('form')} className="flex-1">
              Try Again
            </Button>
          </div>
        </div>
      )}
    </Modal>
  );
}

export default BackgroundRubricGenerationModal;
