import React, { useState, useCallback } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  ClipboardCheck,
  PlayCircle,
  CheckCircle,
  XCircle,
  Clock,
  User,
  Calendar,
  AlertTriangle,
  Filter,
  RefreshCw,
  Archive,
  ArchiveRestore,
  List,
} from 'lucide-react';
import api from '../../services/api';
import { useAuth } from '../../contexts/AuthContext';
import LoadingSpinner from '../../components/ui/LoadingSpinner';
import { StatusBadge, PriorityBadge, ExpandableRichText, ScopeToggle, ScopeValue } from '../../components/ui';
import toast from 'react-hot-toast';
import { useRecordingDurations, getDisplayDuration } from '../../hooks/useRecordingDurations';

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
  type: string;
  estimated_duration?: number;
  archived?: boolean;
}

interface Recording {
  id: string;
  task_id: string;
  status: string;
  duration_seconds: number | null;
  created_at: string;
}

const Reviews: React.FC = () => {
  const navigate = useNavigate();
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [searchParams, setSearchParams] = useSearchParams();
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [priorityFilter, setPriorityFilter] = useState<string>('all');
  const [showArchived, setShowArchived] = useState<boolean>(false);

  // Scope filter: 'mine' (default) shows tasks where user is reviewer, 'all' shows all (admin only)
  const urlScope = searchParams.get('scope') as ScopeValue | null;
  const [scope, setScope] = useState<ScopeValue>(urlScope === 'all' ? 'all' : 'mine');

  // Check if user is admin (OWNER or ADMIN role)
  const isAdmin = user?.org_role === 'OWNER' || user?.org_role === 'ADMIN';

  // Handle scope change
  const handleScopeChange = useCallback((newScope: ScopeValue) => {
    setScope(newScope);
    if (newScope === 'mine') {
      searchParams.delete('scope');
    } else {
      searchParams.set('scope', newScope);
    }
    setSearchParams(searchParams, { replace: true });
  }, [searchParams, setSearchParams]);

  // Fetch tasks for review: 'mine' scope shows only tasks where user is reviewer, 'all' shows all reviewable tasks
  const {
    data: tasks,
    isLoading,
    error,
    refetch,
  } = useQuery({
    queryKey: ['review-tasks', scope],
    queryFn: async () => {
      const params: Record<string, string> = {
        scope: scope,
      };
      // When scope is 'mine', also filter by reviewed_by to ensure we only see tasks assigned to us for review
      if (scope === 'mine') {
        params.reviewed_by = user?.id || '';
      }
      const response = await api.get('/tasks', { params });
      return response.data.data || [];
    },
    enabled: !!user?.id,
  });

  // Fetch recordings for all tasks
  const { data: recordings } = useQuery({
    queryKey: ['review-recordings', tasks],
    queryFn: async () => {
      if (!tasks || tasks.length === 0) return {};

      const recordingPromises = tasks.map((task: Task) =>
        api
          .get(`/recordings?task_id=${task.id}`)
          .then((res) => ({ taskId: task.id, recordings: res.data.data || [] }))
          .catch(() => ({ taskId: task.id, recordings: [] }))
      );

      const results = await Promise.all(recordingPromises);
      return results.reduce(
        (acc, { taskId, recordings }) => {
          acc[taskId] = recordings;
          return acc;
        },
        {} as Record<string, Recording[]>
      );
    },
    enabled: !!tasks && tasks.length > 0,
  });

  // Archive/Unarchive mutation
  const archiveMutation = useMutation({
    mutationFn: async ({ taskId, archived }: { taskId: string; archived: boolean }) => {
      const response = await api.patch(`/tasks/${taskId}`, { archived });
      return response.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['review-tasks'] });
    },
    onError: () => {
      toast.error('Failed to update task');
    },
  });

  // Flatten all recordings for duration refresh hook
  const allRecordings = React.useMemo((): Recording[] => {
    if (!recordings) return [];
    return Object.values(recordings).flat() as Recording[];
  }, [recordings]);

  // Lazy-load actual durations for recordings with 0/null duration
  const refreshedDurations = useRecordingDurations(allRecordings);

  const handleArchiveToggle = (taskId: string, currentArchived: boolean) => {
    archiveMutation.mutate({ taskId, archived: !currentArchived });
  };

  const canReview = (task: Task) => {
    // Task can be reviewed if it has a recording and is awaiting or in review
    const taskRecordings = recordings?.[task.id] || [];
    const reviewableStatuses = ['submitted', 'in_review'];
    return reviewableStatuses.includes(task.status) && taskRecordings.length > 0;
  };

  const handleReviewClick = (taskId: string) => {
    navigate(`/tasks/${taskId}/review`);
  };

  const formatDuration = (seconds: number | null | undefined) => {
    // Handle null, undefined, or 0 duration (might still be processing)
    if (!seconds || seconds <= 0) {
      return 'Processing...';
    }
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  // Base filter: reviewer (when scope=mine) + archive status (for counts)
  const baseTasks = (tasks?.filter((task: Task) => {
    // When scope is 'mine', ensure we only show tasks where user is reviewer
    // When scope is 'all', show all tasks (already filtered by backend based on role)
    const matchesReviewer = scope === 'all' || task.reviewed_by === user?.id;
    const matchesArchive = showArchived ? (task as any).archived === true : (task as any).archived !== true;
    return matchesReviewer && matchesArchive;
  }) || []) as Task[];

  // Group tasks by status for overview cards (before applying status/priority filters)
  const tasksByStatus = baseTasks.reduce(
    (acc, task) => {
      acc[task.status] = (acc[task.status] || 0) + 1;
      return acc;
    },
    {} as Record<string, number>
  );

  // Apply status and priority filters for display
  const filteredTasks = baseTasks.filter((task) => {
    const matchesStatus = statusFilter === 'all' || task.status === statusFilter;
    const matchesPriority = priorityFilter === 'all' || task.priority === priorityFilter;
    return matchesStatus && matchesPriority;
  });

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <LoadingSpinner />
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[400px]">
        <AlertTriangle className="h-12 w-12 text-red-500 mb-4" />
        <p className="text-red-600">Failed to load review tasks</p>
        <button
          onClick={() => refetch()}
          className="mt-4 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
        >
          Retry
        </button>
      </div>
    );
  }

  return (
    <div className="max-w-7xl mx-auto">
      {/* Header */}
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-gray-900 mb-2">Review Queue</h1>
        <p className="text-gray-600">Manage and review submitted tasks</p>
      </div>

      {/* Status Overview Cards - Clickable Filters */}
      <section aria-label="Review statistics and filters" className="grid grid-cols-2 md:grid-cols-5 gap-4 mb-8">
        {/* All Reviews */}
        <button
          onClick={() => setStatusFilter('all')}
          className={`bg-white rounded-lg shadow p-6 text-left transition-all hover:shadow-md ${
            statusFilter === 'all'
              ? 'ring-2 ring-blue-500 ring-offset-2'
              : 'hover:ring-2 hover:ring-gray-200'
          }`}
          aria-pressed={statusFilter === 'all'}
          aria-label={`All Reviews: ${filteredTasks.length || 0}`}
        >
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-gray-600">All</p>
              <p className="text-2xl font-bold text-blue-600">
                {Object.values(tasksByStatus).reduce((a, b) => a + b, 0) || 0}
              </p>
            </div>
            <List className="h-10 w-10 text-blue-200" aria-hidden="true" />
          </div>
        </button>

        {/* Awaiting Review */}
        <button
          onClick={() => setStatusFilter('submitted')}
          className={`bg-white rounded-lg shadow p-6 text-left transition-all hover:shadow-md ${
            statusFilter === 'submitted'
              ? 'ring-2 ring-purple-500 ring-offset-2'
              : 'hover:ring-2 hover:ring-gray-200'
          }`}
          aria-pressed={statusFilter === 'submitted'}
          aria-label={`Awaiting Review: ${tasksByStatus['submitted'] || 0}`}
        >
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-gray-600">Awaiting Review</p>
              <p className="text-2xl font-bold text-purple-600">
                {tasksByStatus['submitted'] || 0}
              </p>
            </div>
            <ClipboardCheck className="h-10 w-10 text-purple-200" aria-hidden="true" />
          </div>
        </button>

        {/* In Review */}
        <button
          onClick={() => setStatusFilter('in_review')}
          className={`bg-white rounded-lg shadow p-6 text-left transition-all hover:shadow-md ${
            statusFilter === 'in_review'
              ? 'ring-2 ring-amber-500 ring-offset-2'
              : 'hover:ring-2 hover:ring-gray-200'
          }`}
          aria-pressed={statusFilter === 'in_review'}
          aria-label={`In Review: ${tasksByStatus['in_review'] || 0}`}
        >
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-gray-600">In Review</p>
              <p className="text-2xl font-bold text-amber-600">
                {tasksByStatus['in_review'] || 0}
              </p>
            </div>
            <Clock className="h-10 w-10 text-amber-200" aria-hidden="true" />
          </div>
        </button>

        {/* Completed */}
        <button
          onClick={() => setStatusFilter('completed')}
          className={`bg-white rounded-lg shadow p-6 text-left transition-all hover:shadow-md ${
            statusFilter === 'completed'
              ? 'ring-2 ring-green-500 ring-offset-2'
              : 'hover:ring-2 hover:ring-gray-200'
          }`}
          aria-pressed={statusFilter === 'completed'}
          aria-label={`Completed: ${tasksByStatus['completed'] || 0}`}
        >
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-gray-600">Completed</p>
              <p className="text-2xl font-bold text-green-600">{tasksByStatus['completed'] || 0}</p>
            </div>
            <CheckCircle className="h-10 w-10 text-green-200" aria-hidden="true" />
          </div>
        </button>

        {/* Rejected */}
        <button
          onClick={() => setStatusFilter('rejected')}
          className={`bg-white rounded-lg shadow p-6 text-left transition-all hover:shadow-md ${
            statusFilter === 'rejected'
              ? 'ring-2 ring-red-500 ring-offset-2'
              : 'hover:ring-2 hover:ring-gray-200'
          }`}
          aria-pressed={statusFilter === 'rejected'}
          aria-label={`Rejected: ${tasksByStatus['rejected'] || 0}`}
        >
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-gray-600">Rejected</p>
              <p className="text-2xl font-bold text-red-600">{tasksByStatus['rejected'] || 0}</p>
            </div>
            <XCircle className="h-10 w-10 text-red-200" aria-hidden="true" />
          </div>
        </button>
      </section>

      {/* Filters */}
      <div className="bg-white rounded-lg shadow p-4 mb-6" role="group" aria-label="Filter options">
        <div className="flex items-center space-x-4 flex-wrap gap-2">
          <Filter className="h-5 w-5 text-gray-500" aria-hidden="true" />
          <label htmlFor="review-status-filter" className="sr-only">Filter by status</label>
          <select
            id="review-status-filter"
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            aria-label="Filter reviews by status"
            className="px-3 py-2 border border-gray-300 rounded-md focus:ring-blue-500 focus:border-blue-500"
          >
            <option value="all">All Statuses</option>
            <option value="submitted">Awaiting Review</option>
            <option value="in_review">In Review</option>
            <option value="completed">Completed</option>
            <option value="rejected">Rejected</option>
          </select>

          <label htmlFor="review-priority-filter" className="sr-only">Filter by priority</label>
          <select
            id="review-priority-filter"
            value={priorityFilter}
            onChange={(e) => setPriorityFilter(e.target.value)}
            aria-label="Filter reviews by priority"
            className="px-3 py-2 border border-gray-300 rounded-md focus:ring-blue-500 focus:border-blue-500"
          >
            <option value="all">All Priorities</option>
            <option value="high">High Priority</option>
            <option value="medium">Medium Priority</option>
            <option value="low">Low Priority</option>
          </select>

          <ScopeToggle
            scope={scope}
            onScopeChange={handleScopeChange}
            isAdmin={isAdmin}
            mineLabel="My Reviews"
            allLabel="All Reviews"
          />

          <div className="flex rounded-md border border-gray-300 overflow-hidden" role="group" aria-label="Toggle active or archived view">
            <button
              onClick={() => setShowArchived(false)}
              aria-pressed={!showArchived}
              className={`px-4 py-2 flex items-center transition-colors ${
                !showArchived
                  ? 'bg-blue-600 text-white'
                  : 'bg-white text-gray-700 hover:bg-gray-50'
              }`}
            >
              <List className="h-4 w-4 mr-2" aria-hidden="true" />
              Active
            </button>
            <button
              onClick={() => setShowArchived(true)}
              aria-pressed={showArchived}
              className={`px-4 py-2 flex items-center transition-colors border-l border-gray-300 ${
                showArchived
                  ? 'bg-gray-600 text-white'
                  : 'bg-white text-gray-700 hover:bg-gray-50'
              }`}
            >
              <Archive className="h-4 w-4 mr-2" aria-hidden="true" />
              Archived
            </button>
          </div>

          <button
            onClick={() => refetch()}
            aria-label="Refresh review list"
            className="ml-auto px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 flex items-center"
          >
            <RefreshCw className="h-4 w-4 mr-2" aria-hidden="true" />
            Refresh
          </button>
        </div>
      </div>

      {/* Task List */}
      <section aria-label="Review queue" className="bg-white shadow rounded-lg overflow-hidden">
        {filteredTasks.length === 0 ? (
          <div className="text-center py-12">
            <ClipboardCheck className="mx-auto h-12 w-12 text-gray-400 mb-4" aria-hidden="true" />
            <p className="text-gray-500">No tasks to review</p>
            <p className="text-sm text-gray-400 mt-2">
              Tasks will appear here when they are ready for your review
            </p>
          </div>
        ) : (
          <div className="divide-y divide-gray-200">
            {filteredTasks.map((task) => {
              const taskRecordings = recordings?.[task.id] || [];
              const hasRecording = taskRecordings.length > 0;
              const latestRecording = taskRecordings[0];

              return (
                <div key={task.id} className="p-6 hover:bg-gray-50 transition-colors">
                  <div className="flex items-start justify-between">
                    <div className="flex-1">
                      <div className="flex items-center mb-2">
                        <h3 className="text-lg font-semibold text-gray-900">{task.title}</h3>
                        <div className="ml-4 flex items-center space-x-2">
                          <StatusBadge status={task.status} size="sm" showIcon={false} />
                          <PriorityBadge priority={task.priority} size="sm" showIcon={false} />
                          {task.archived && (
                            <StatusBadge status="archived" size="sm" showIcon={false} />
                          )}
                        </div>
                      </div>

                      {task.description && (
                        <ExpandableRichText
                          content={task.description}
                          maxCollapsedHeight={48}
                          className="mb-3"
                        />
                      )}

                      <div className="flex items-center space-x-6 text-sm text-gray-500">
                        <div className="flex items-center">
                          <User className="h-4 w-4 mr-1" aria-hidden="true" />
                          <span className="sr-only">Assigned to: </span>
                          {task.assignee_name || task.assignee_email}
                        </div>
                        {task.due_date && (
                          <div className="flex items-center">
                            <Calendar className="h-4 w-4 mr-1" aria-hidden="true" />
                            <span className="sr-only">Due date: </span>
                            Due: {new Date(task.due_date).toLocaleDateString()}
                          </div>
                        )}
                        {hasRecording && (
                          <div className="flex items-center">
                            <PlayCircle className="h-4 w-4 mr-1" aria-hidden="true" />
                            <span className="sr-only">Recording duration: </span>
                            Recording: {formatDuration(getDisplayDuration(latestRecording, refreshedDurations))}
                          </div>
                        )}
                      </div>
                    </div>

                    <div className="ml-6 flex flex-col space-y-2">
                      {canReview(task) ? (
                        <button
                          onClick={() => handleReviewClick(task.id)}
                          aria-label={`${task.status === 'in_review' ? 'Continue reviewing' : 'Review recording for'} ${task.title}`}
                          className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition flex items-center justify-center"
                        >
                          <PlayCircle className="h-5 w-5 mr-2" aria-hidden="true" />
                          {task.status === 'in_review' ? 'Continue Review' : 'Review Recording'}
                        </button>
                      ) : task.status === 'completed' ? (
                        <button
                          onClick={() => handleReviewClick(task.id)}
                          aria-label={`View approved task: ${task.title}`}
                          className="px-4 py-2 bg-green-50 text-green-700 border border-green-200 rounded-lg hover:bg-green-100 transition flex items-center justify-center"
                        >
                          <CheckCircle className="h-5 w-5 mr-2" aria-hidden="true" />
                          View Approved
                        </button>
                      ) : task.status === 'rejected' ? (
                        <button
                          onClick={() => handleReviewClick(task.id)}
                          aria-label={`View rejected task: ${task.title}`}
                          className="px-4 py-2 bg-red-50 text-red-700 border border-red-200 rounded-lg hover:bg-red-100 transition flex items-center justify-center"
                        >
                          <XCircle className="h-5 w-5 mr-2" aria-hidden="true" />
                          View Rejected
                        </button>
                      ) : (
                        <div className="text-sm text-gray-500 text-center py-2">
                          Waiting for submission
                        </div>
                      )}

                      <button
                        onClick={() => handleArchiveToggle(task.id, task.archived || false)}
                        aria-label={task.archived ? `Unarchive ${task.title}` : `Archive ${task.title}`}
                        className="px-4 py-2 bg-gray-50 text-gray-700 border border-gray-200 rounded-lg hover:bg-gray-100 transition flex items-center justify-center text-sm"
                        disabled={archiveMutation.isPending}
                      >
                        {task.archived ? (
                          <>
                            <ArchiveRestore className="h-4 w-4 mr-2" aria-hidden="true" />
                            Unarchive
                          </>
                        ) : (
                          <>
                            <Archive className="h-4 w-4 mr-2" aria-hidden="true" />
                            Archive
                          </>
                        )}
                      </button>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </section>
    </div>
  );
};

export default Reviews;
