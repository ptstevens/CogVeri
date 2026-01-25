import { useState, useEffect, useRef, useCallback } from 'react';
import { Upload, Search, AlertCircle, CheckCircle, Video, RefreshCw } from 'lucide-react';
import { AxiosError } from 'axios';
import api from '../../services/api';
import { AdminService } from '../../services/admin.service';

// Sanitize error messages to prevent information leakage
function sanitizeErrorMessage(message: string): string {
  // Remove potential stack traces, file paths, and internal details
  const sanitized = message
    .replace(/at\s+\S+\s+\([^)]+\)/gi, '') // Remove stack traces
    .replace(/\/[^\s]+\.[jt]s(x)?:\d+:\d+/gi, '') // Remove file paths
    .replace(/Error:\s*/gi, '')  // Remove redundant "Error:" prefixes
    .replace(/\s+/g, ' ')  // Normalize whitespace
    .trim();

  // If message looks like internal error, use generic message
  if (
    sanitized.toLowerCase().includes('internal') ||
    sanitized.toLowerCase().includes('unexpected') ||
    sanitized.includes('ECONNREFUSED') ||
    sanitized.includes('ETIMEDOUT') ||
    !sanitized || sanitized.length < 3
  ) {
    return 'An error occurred. Please try again.';
  }

  return sanitized;
}

// Helper to extract error message from axios errors or generic errors
function getErrorMessage(err: unknown, fallback: string): string {
  let message = fallback;

  if (err instanceof AxiosError) {
    message = (err.response?.data as { error?: string })?.error || err.message || fallback;
  } else if (err instanceof Error) {
    message = err.message || fallback;
  }

  return sanitizeErrorMessage(message);
}

interface Organization {
  id: string;
  name: string;
}

interface EligibleTask {
  id: string;
  title: string;
  status: string;
  assignee_email: string | null;
  assignee_name: string | null;
  organization_name: string;
  template_title: string | null;
  created_at: string;
  has_recording: boolean;
  recording_status: string | null;
}

interface TaskDetails {
  id: string;
  title: string;
  status: string;
  description: string | null;
  assignee_email: string | null;
  assignee_name: string | null;
  organization_name: string;
  template_title: string | null;
  created_at: string;
  has_recording: boolean;
  existing_recording: {
    id: string;
    status: string;
    created_at: string;
    file_size_bytes: string | null;
  } | null;
}

const STATUS_COLORS: Record<string, string> = {
  assigned: 'bg-blue-100 text-blue-800',
  in_progress: 'bg-yellow-100 text-yellow-800',
  rejected: 'bg-red-100 text-red-800',
};

const STATUS_LABELS: Record<string, string> = {
  assigned: 'Assigned',
  in_progress: 'In Progress',
  rejected: 'Rejected',
};

export default function AdminVideoUpload() {
  // Organization selection
  const [organizations, setOrganizations] = useState<Organization[]>([]);
  const [selectedOrgId, setSelectedOrgId] = useState<string>('');
  const [loadingOrgs, setLoadingOrgs] = useState(true);

  // Task list
  const [tasks, setTasks] = useState<EligibleTask[]>([]);
  const [loadingTasks, setLoadingTasks] = useState(false);
  const [tasksError, setTasksError] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [page, setPage] = useState(0);
  const [total, setTotal] = useState(0);
  const limit = 25;

  // Selected task
  const [selectedTaskId, setSelectedTaskId] = useState<string | null>(null);
  const [taskDetails, setTaskDetails] = useState<TaskDetails | null>(null);
  const [loadingTaskDetails, setLoadingTaskDetails] = useState(false);

  // Upload state
  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [uploadSuccess, setUploadSuccess] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Debounce search
  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedSearch(search);
      setPage(0);
    }, 300);
    return () => clearTimeout(timer);
  }, [search]);

  // Load organizations
  useEffect(() => {
    const fetchOrgs = async () => {
      try {
        setLoadingOrgs(true);
        const data = await AdminService.getOrganizations({ limit: 1000 });
        setOrganizations(data.organizations.map(org => ({ id: org.id, name: org.name })));
      } catch (err: unknown) {
        console.error('Failed to load organizations:', err);
      } finally {
        setLoadingOrgs(false);
      }
    };
    fetchOrgs();
  }, []);

  // Load tasks when org or search changes
  useEffect(() => {
    if (!selectedOrgId) {
      setTasks([]);
      setTotal(0);
      return;
    }

    const fetchTasks = async () => {
      try {
        setLoadingTasks(true);
        setTasksError(null);
        const response = await api.get('/admin/video-upload/tasks', {
          params: {
            organizationId: selectedOrgId,
            search: debouncedSearch || undefined,
            page,
            limit,
          },
        });
        setTasks(response.data.data.tasks);
        setTotal(response.data.data.total);
      } catch (err: unknown) {
        setTasksError(getErrorMessage(err, 'Failed to load tasks'));
        setTasks([]);
      } finally {
        setLoadingTasks(false);
      }
    };
    fetchTasks();
  }, [selectedOrgId, debouncedSearch, page]);

  // Load task details when selected
  useEffect(() => {
    if (!selectedTaskId) {
      setTaskDetails(null);
      return;
    }

    const fetchTaskDetails = async () => {
      try {
        setLoadingTaskDetails(true);
        setUploadError(null);
        setUploadSuccess(null);
        const response = await api.get(`/admin/video-upload/tasks/${selectedTaskId}`);
        setTaskDetails(response.data.data);
      } catch (err: unknown) {
        console.error('Failed to load task details:', err);
        setTaskDetails(null);
      } finally {
        setLoadingTaskDetails(false);
      }
    };
    fetchTaskDetails();
  }, [selectedTaskId]);

  // Handle file selection and upload
  const handleFileSelect = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !selectedTaskId) return;

    // Reset states
    setUploading(true);
    setUploadProgress(0);
    setUploadError(null);
    setUploadSuccess(null);

    const formData = new FormData();
    formData.append('video', file);

    try {
      await api.post(`/admin/video-upload/tasks/${selectedTaskId}/upload`, formData, {
        headers: {
          'Content-Type': 'multipart/form-data',
        },
        onUploadProgress: (progressEvent) => {
          if (progressEvent.total) {
            const percent = Math.round((progressEvent.loaded * 100) / progressEvent.total);
            setUploadProgress(percent);
          }
        },
      });

      setUploadSuccess('Video uploaded successfully! Transcription and analysis jobs have been queued.');

      // Clear selected task (it's now "submitted" and no longer eligible)
      setSelectedTaskId(null);
      setTaskDetails(null);

      // Refresh task list only (the uploaded task will no longer appear since it's now "submitted")
      try {
        const res = await api.get('/admin/video-upload/tasks', {
          params: {
            organizationId: selectedOrgId,
            search: debouncedSearch || undefined,
            page,
            limit,
          },
        });
        setTasks(res.data.data.tasks);
        setTotal(res.data.data.total);
      } catch {
        // Ignore refresh errors - the upload already succeeded
      }
    } catch (err: unknown) {
      setUploadError(getErrorMessage(err, 'Upload failed'));
    } finally {
      setUploading(false);
      // Reset file input
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
    }
  }, [selectedTaskId, selectedOrgId, debouncedSearch, page]);

  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  };

  const formatFileSize = (bytes: string | null) => {
    if (!bytes) return 'Unknown size';
    const size = parseInt(bytes, 10);
    if (size < 1024) return `${size} B`;
    if (size < 1024 * 1024) return `${(size / 1024).toFixed(1)} KB`;
    return `${(size / (1024 * 1024)).toFixed(1)} MB`;
  };

  const maxPages = Math.ceil(total / limit);

  return (
    <div className="p-8">
      {/* Header */}
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-3">
          <Upload className="h-7 w-7 text-primary-600" />
          Video Upload
        </h1>
        <p className="text-gray-600 mt-1">
          Upload videos directly to tasks (bypasses recording). For sysadmin testing only.
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left Panel: Organization & Task Selection */}
        <div className="lg:col-span-2 space-y-6">
          {/* Organization Selector */}
          <div className="bg-white rounded-lg shadow p-6">
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Select Organization
            </label>
            <select
              value={selectedOrgId}
              onChange={(e) => {
                setSelectedOrgId(e.target.value);
                setSelectedTaskId(null);
                setPage(0);
              }}
              disabled={loadingOrgs}
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500"
            >
              <option value="">
                {loadingOrgs ? 'Loading organizations...' : 'Choose an organization'}
              </option>
              {organizations.map((org) => (
                <option key={org.id} value={org.id}>
                  {org.name}
                </option>
              ))}
            </select>
          </div>

          {/* Task Search & List */}
          {selectedOrgId && (
            <div className="bg-white rounded-lg shadow">
              {/* Search */}
              <div className="p-4 border-b border-gray-200">
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-5 w-5 text-gray-400" />
                  <input
                    type="text"
                    placeholder="Search tasks by title or assignee..."
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500"
                  />
                </div>
                <p className="text-xs text-gray-500 mt-2">
                  Showing tasks with status: <span className="font-medium">Assigned</span>,{' '}
                  <span className="font-medium">In Progress</span>, or{' '}
                  <span className="font-medium">Rejected</span>
                </p>
              </div>

              {/* Error State */}
              {tasksError && (
                <div className="p-4 bg-red-50 border-b border-red-200">
                  <p className="text-red-800 text-sm">{tasksError}</p>
                </div>
              )}

              {/* Loading State */}
              {loadingTasks && (
                <div className="p-8 text-center">
                  <RefreshCw className="h-8 w-8 text-gray-400 animate-spin mx-auto mb-2" />
                  <p className="text-gray-600">Loading tasks...</p>
                </div>
              )}

              {/* Task List */}
              {!loadingTasks && tasks.length > 0 && (
                <div className="divide-y divide-gray-200">
                  {tasks.map((task) => (
                    <div
                      key={task.id}
                      onClick={() => setSelectedTaskId(task.id)}
                      className={`p-4 cursor-pointer transition hover:bg-gray-50 ${
                        selectedTaskId === task.id ? 'bg-primary-50 border-l-4 border-primary-500' : ''
                      }`}
                    >
                      <div className="flex items-start justify-between">
                        <div className="flex-1 min-w-0">
                          <p className="font-medium text-gray-900 truncate">{task.title}</p>
                          <p className="text-sm text-gray-500 mt-1">
                            {task.assignee_name || task.assignee_email || 'Unassigned'}
                          </p>
                          {task.template_title && (
                            <p className="text-xs text-gray-400 mt-1">
                              Template: {task.template_title}
                            </p>
                          )}
                        </div>
                        <div className="flex flex-col items-end gap-2 ml-4">
                          <span
                            className={`inline-flex items-center px-2 py-1 rounded-full text-xs font-medium ${
                              STATUS_COLORS[task.status] || 'bg-gray-100 text-gray-800'
                            }`}
                          >
                            {STATUS_LABELS[task.status] || task.status}
                          </span>
                          {task.has_recording && (
                            <span className="inline-flex items-center gap-1 text-xs text-amber-600">
                              <Video className="h-3 w-3" />
                              Has recording
                            </span>
                          )}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}

              {/* Empty State */}
              {!loadingTasks && tasks.length === 0 && !tasksError && (
                <div className="p-8 text-center">
                  <Video className="h-12 w-12 text-gray-300 mx-auto mb-3" />
                  <p className="text-gray-600">No eligible tasks found</p>
                  <p className="text-sm text-gray-500 mt-1">
                    Tasks must have status: assigned, in_progress, or rejected
                  </p>
                </div>
              )}

              {/* Pagination */}
              {!loadingTasks && tasks.length > 0 && maxPages > 1 && (
                <div className="p-4 border-t border-gray-200 flex items-center justify-between">
                  <p className="text-sm text-gray-600">
                    Showing {page * limit + 1}-{Math.min((page + 1) * limit, total)} of {total} tasks
                  </p>
                  <div className="flex gap-2">
                    <button
                      onClick={() => setPage(Math.max(0, page - 1))}
                      disabled={page === 0}
                      className="px-3 py-1 text-sm border border-gray-300 rounded-lg disabled:opacity-50 disabled:cursor-not-allowed hover:bg-gray-50"
                    >
                      Previous
                    </button>
                    <button
                      onClick={() => setPage(Math.min(maxPages - 1, page + 1))}
                      disabled={page >= maxPages - 1}
                      className="px-3 py-1 text-sm border border-gray-300 rounded-lg disabled:opacity-50 disabled:cursor-not-allowed hover:bg-gray-50"
                    >
                      Next
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Right Panel: Upload */}
        <div className="lg:col-span-1">
          <div className="bg-white rounded-lg shadow p-6 sticky top-24">
            <h2 className="text-lg font-semibold text-gray-900 mb-4">Upload Video</h2>

            {/* No task selected */}
            {!selectedTaskId && (
              <div className="text-center py-8">
                <Upload className="h-12 w-12 text-gray-300 mx-auto mb-3" />
                <p className="text-gray-500">Select a task to upload a video</p>
              </div>
            )}

            {/* Loading task details */}
            {selectedTaskId && loadingTaskDetails && (
              <div className="text-center py-8">
                <RefreshCw className="h-8 w-8 text-gray-400 animate-spin mx-auto mb-2" />
                <p className="text-gray-600">Loading task...</p>
              </div>
            )}

            {/* Task selected */}
            {selectedTaskId && taskDetails && !loadingTaskDetails && (
              <div className="space-y-4">
                {/* Task Info */}
                <div className="bg-gray-50 rounded-lg p-4">
                  <p className="font-medium text-gray-900 text-sm">{taskDetails.title}</p>
                  <p className="text-xs text-gray-500 mt-1">
                    {taskDetails.assignee_name || taskDetails.assignee_email || 'Unassigned'}
                  </p>
                  <span
                    className={`inline-flex items-center px-2 py-1 rounded-full text-xs font-medium mt-2 ${
                      STATUS_COLORS[taskDetails.status] || 'bg-gray-100 text-gray-800'
                    }`}
                  >
                    {STATUS_LABELS[taskDetails.status] || taskDetails.status}
                  </span>
                </div>

                {/* Existing Recording Warning */}
                {taskDetails.has_recording && taskDetails.existing_recording && (
                  <div className="bg-amber-50 border border-amber-200 rounded-lg p-4">
                    <div className="flex items-start gap-2">
                      <AlertCircle className="h-5 w-5 text-amber-600 flex-shrink-0 mt-0.5" />
                      <div>
                        <p className="text-sm font-medium text-amber-800">
                          Existing recording will be replaced
                        </p>
                        <p className="text-xs text-amber-700 mt-1">
                          Status: {taskDetails.existing_recording.status}
                          <br />
                          Size: {formatFileSize(taskDetails.existing_recording.file_size_bytes)}
                          <br />
                          Created: {formatDate(taskDetails.existing_recording.created_at)}
                        </p>
                      </div>
                    </div>
                  </div>
                )}

                {/* Upload Success */}
                {uploadSuccess && (
                  <div className="bg-green-50 border border-green-200 rounded-lg p-4">
                    <div className="flex items-start gap-2">
                      <CheckCircle className="h-5 w-5 text-green-600 flex-shrink-0 mt-0.5" />
                      <p className="text-sm text-green-800">{uploadSuccess}</p>
                    </div>
                  </div>
                )}

                {/* Upload Error */}
                {uploadError && (
                  <div className="bg-red-50 border border-red-200 rounded-lg p-4">
                    <div className="flex items-start gap-2">
                      <AlertCircle className="h-5 w-5 text-red-600 flex-shrink-0 mt-0.5" />
                      <p className="text-sm text-red-800">{uploadError}</p>
                    </div>
                  </div>
                )}

                {/* Upload Progress */}
                {uploading && (
                  <div className="space-y-2">
                    <div className="flex items-center justify-between text-sm">
                      <span className="text-gray-600">Uploading...</span>
                      <span className="font-medium text-primary-600">{uploadProgress}%</span>
                    </div>
                    <div className="w-full bg-gray-200 rounded-full h-2.5">
                      <div
                        className="bg-primary-600 h-2.5 rounded-full transition-all duration-300"
                        style={{ width: `${uploadProgress}%` }}
                      />
                    </div>
                  </div>
                )}

                {/* File Input */}
                <div>
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept="video/mp4,video/webm,video/quicktime,.mp4,.webm,.mov"
                    onChange={handleFileSelect}
                    disabled={uploading}
                    className="hidden"
                    id="video-upload"
                  />
                  <label
                    htmlFor="video-upload"
                    className={`flex flex-col items-center justify-center w-full h-32 border-2 border-dashed rounded-lg cursor-pointer transition ${
                      uploading
                        ? 'border-gray-200 bg-gray-50 cursor-not-allowed'
                        : 'border-gray-300 hover:border-primary-400 hover:bg-primary-50'
                    }`}
                  >
                    <Upload
                      className={`h-8 w-8 mb-2 ${uploading ? 'text-gray-300' : 'text-gray-400'}`}
                    />
                    <p className={`text-sm ${uploading ? 'text-gray-400' : 'text-gray-600'}`}>
                      {uploading ? 'Uploading...' : 'Click to select video'}
                    </p>
                    <p className="text-xs text-gray-400 mt-1">MP4, WebM, or MOV (max 500MB)</p>
                  </label>
                </div>

                {/* Instructions */}
                <div className="text-xs text-gray-500 space-y-1">
                  <p>After upload:</p>
                  <ul className="list-disc list-inside space-y-0.5 text-gray-400">
                    <li>Task status changes to &quot;Submitted&quot;</li>
                    <li>Transcription job is queued</li>
                    <li>Thumbnail generation starts</li>
                    <li>Video appears in Reviews section</li>
                  </ul>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
