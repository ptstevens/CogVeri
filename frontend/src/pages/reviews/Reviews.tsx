import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  ClipboardDocumentCheckIcon,
  PlayCircleIcon,
  CheckCircleIcon,
  XCircleIcon,
  ClockIcon,
  UserIcon,
  CalendarIcon,
  ExclamationTriangleIcon,
  FunnelIcon,
  ArrowPathIcon,
  ArchiveBoxIcon,
  ArchiveBoxArrowDownIcon,
} from '@heroicons/react/24/outline';
import { CheckCircleIcon as CheckCircleSolid } from '@heroicons/react/24/solid';
import api from '../../services/api';
import { useAuth } from '../../contexts/AuthContext';
import LoadingSpinner from '../../components/ui/LoadingSpinner';
import toast from 'react-hot-toast';

interface Task {
  id: string;
  title: string;
  description: string;
  status: string;
  priority: string;
  assigned_to: string;
  reviewer_id: string;
  assignee_name: string;
  assignee_email: string;
  created_at: string;
  due_date: string;
  type: string;
  estimated_duration?: number;
  archived?: boolean;
}

interface Recording {
  id: string;
  task_id: string;
  status: string;
  duration_seconds: number;
  created_at: string;
}

const Reviews: React.FC = () => {
  const navigate = useNavigate();
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [priorityFilter, setPriorityFilter] = useState<string>('all');
  const [showArchived, setShowArchived] = useState<boolean>(false);

  // Truncate description helper
  const truncateText = (text: string, maxLength: number = 100) => {
    if (!text) return '';
    if (text.length <= maxLength) return text;
    return text.substring(0, maxLength).trim() + '...';
  };

  // Fetch tasks where current user is the reviewer
  const { data: tasks, isLoading, error, refetch } = useQuery({
    queryKey: ['review-tasks', statusFilter, priorityFilter],
    queryFn: async () => {
      const response = await api.get('/tasks', {
        params: {
          reviewer_id: user?.id,
          ...(statusFilter !== 'all' && { status: statusFilter }),
          ...(priorityFilter !== 'all' && { priority: priorityFilter }),
        },
      });
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
        api.get(`/recordings?task_id=${task.id}`)
          .then(res => ({ taskId: task.id, recordings: res.data.data || [] }))
          .catch(() => ({ taskId: task.id, recordings: [] }))
      );

      const results = await Promise.all(recordingPromises);
      return results.reduce((acc, { taskId, recordings }) => {
        acc[taskId] = recordings;
        return acc;
      }, {} as Record<string, Recording[]>);
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
      toast.success('Task updated successfully');
    },
    onError: () => {
      toast.error('Failed to update task');
    },
  });

  const handleArchiveToggle = (taskId: string, currentArchived: boolean) => {
    archiveMutation.mutate({ taskId, archived: !currentArchived });
  };

  const getStatusBadge = (status: string) => {
    const statusStyles: Record<string, string> = {
      pending: 'bg-gray-100 text-gray-800',
      in_progress: 'bg-blue-100 text-blue-800',
      submitted: 'bg-purple-100 text-purple-800',
      in_review: 'bg-yellow-100 text-yellow-800',
      completed: 'bg-green-100 text-green-800',
      rejected: 'bg-red-100 text-red-800',
    };

    return (
      <span className={`px-2 py-1 rounded-full text-xs font-medium ${statusStyles[status] || 'bg-gray-100 text-gray-800'}`}>
        {status.replace('_', ' ')}
      </span>
    );
  };

  const getPriorityBadge = (priority: string) => {
    const priorityStyles: Record<string, string> = {
      high: 'bg-red-100 text-red-800',
      medium: 'bg-yellow-100 text-yellow-800',
      low: 'bg-green-100 text-green-800',
    };

    return (
      <span className={`px-2 py-1 rounded-full text-xs font-medium ${priorityStyles[priority] || 'bg-gray-100 text-gray-800'}`}>
        {priority}
      </span>
    );
  };

  const canReview = (task: Task) => {
    // Task can be reviewed if it has a recording and is in submitted status
    const taskRecordings = recordings?.[task.id] || [];
    return task.status === 'submitted' && taskRecordings.length > 0;
  };

  const handleReviewClick = (taskId: string) => {
    navigate(`/tasks/${taskId}/review`);
  };

  const formatDuration = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  const filterTasks = (tasks: Task[]) => {
    return tasks?.filter(task => {
      // Only show tasks that are assigned for review
      const matchesReviewer = task.reviewer_id === user?.id;
      const matchesArchive = showArchived ? task.archived === true : task.archived !== true;
      return matchesReviewer && matchesArchive;
    }) || [];
  };

  const filteredTasks = filterTasks(tasks);

  // Group tasks by status for overview
  const tasksByStatus = filteredTasks.reduce((acc, task) => {
    acc[task.status] = (acc[task.status] || 0) + 1;
    return acc;
  }, {} as Record<string, number>);

  if (isLoading) {
    return <LoadingSpinner fullScreen />;
  }

  if (error) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[400px]">
        <ExclamationTriangleIcon className="h-12 w-12 text-red-500 mb-4" />
        <p className="text-red-600">Failed to load review tasks</p>
        <button
          onClick={() => refetch()}
          className="mt-4 px-4 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700"
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

      {/* Status Overview Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-8">
        <div className="bg-white rounded-lg shadow p-6">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-gray-600">Awaiting Review</p>
              <p className="text-2xl font-bold text-purple-600">
                {tasksByStatus['submitted'] || 0}
              </p>
            </div>
            <ClipboardDocumentCheckIcon className="h-10 w-10 text-purple-200" />
          </div>
        </div>

        <div className="bg-white rounded-lg shadow p-6">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-gray-600">In Review</p>
              <p className="text-2xl font-bold text-yellow-600">
                {tasksByStatus['in_review'] || 0}
              </p>
            </div>
            <ClockIcon className="h-10 w-10 text-yellow-200" />
          </div>
        </div>

        <div className="bg-white rounded-lg shadow p-6">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-gray-600">Completed</p>
              <p className="text-2xl font-bold text-green-600">
                {tasksByStatus['completed'] || 0}
              </p>
            </div>
            <CheckCircleSolid className="h-10 w-10 text-green-200" />
          </div>
        </div>

        <div className="bg-white rounded-lg shadow p-6">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-gray-600">Rejected</p>
              <p className="text-2xl font-bold text-red-600">
                {tasksByStatus['rejected'] || 0}
              </p>
            </div>
            <XCircleIcon className="h-10 w-10 text-red-200" />
          </div>
        </div>
      </div>

      {/* Filters */}
      <div className="bg-white rounded-lg shadow p-4 mb-6">
        <div className="flex items-center space-x-4 flex-wrap gap-2">
          <FunnelIcon className="h-5 w-5 text-gray-500" />
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="px-3 py-2 border border-gray-300 rounded-md focus:ring-purple-500 focus:border-purple-500"
          >
            <option value="all">All Statuses</option>
            <option value="submitted">Awaiting Review</option>
            <option value="in_review">In Review</option>
            <option value="completed">Completed</option>
            <option value="rejected">Rejected</option>
          </select>

          <select
            value={priorityFilter}
            onChange={(e) => setPriorityFilter(e.target.value)}
            className="px-3 py-2 border border-gray-300 rounded-md focus:ring-purple-500 focus:border-purple-500"
          >
            <option value="all">All Priorities</option>
            <option value="high">High Priority</option>
            <option value="medium">Medium Priority</option>
            <option value="low">Low Priority</option>
          </select>

          <button
            onClick={() => setShowArchived(!showArchived)}
            className={`px-4 py-2 rounded-md border flex items-center transition-colors ${
              showArchived
                ? 'bg-gray-600 text-white border-gray-600'
                : 'bg-white text-gray-700 border-gray-300 hover:bg-gray-50'
            }`}
          >
            <ArchiveBoxIcon className="h-4 w-4 mr-2" />
            {showArchived ? 'Show Active' : 'Show Archived'}
          </button>

          <button
            onClick={() => refetch()}
            className="ml-auto px-4 py-2 bg-purple-600 text-white rounded-md hover:bg-purple-700 flex items-center"
          >
            <ArrowPathIcon className="h-4 w-4 mr-2" />
            Refresh
          </button>
        </div>
      </div>

      {/* Task List */}
      <div className="bg-white shadow rounded-lg overflow-hidden">
        {filteredTasks.length === 0 ? (
          <div className="text-center py-12">
            <ClipboardDocumentCheckIcon className="mx-auto h-12 w-12 text-gray-400 mb-4" />
            <p className="text-gray-500">No tasks to review</p>
            <p className="text-sm text-gray-400 mt-2">
              Tasks will appear here when they're ready for your review
            </p>
          </div>
        ) : (
          <div className="divide-y divide-gray-200">
            {filteredTasks.map((task) => {
              const taskRecordings = recordings?.[task.id] || [];
              const hasRecording = taskRecordings.length > 0;
              const latestRecording = taskRecordings[0];

              return (
                <div
                  key={task.id}
                  className="p-6 hover:bg-gray-50 transition-colors"
                >
                  <div className="flex items-start justify-between">
                    <div className="flex-1">
                      <div className="flex items-center mb-2">
                        <h3 className="text-lg font-semibold text-gray-900">
                          {task.title}
                        </h3>
                        <div className="ml-4 flex items-center space-x-2">
                          {getStatusBadge(task.status)}
                          {getPriorityBadge(task.priority)}
                          {task.archived && (
                            <span className="px-2 py-1 rounded-full text-xs font-medium bg-gray-100 text-gray-600">
                              Archived
                            </span>
                          )}
                        </div>
                      </div>

                      <p className="text-gray-600 mb-3 text-sm">{truncateText(task.description, 120)}</p>

                      <div className="flex items-center space-x-6 text-sm text-gray-500">
                        <div className="flex items-center">
                          <UserIcon className="h-4 w-4 mr-1" />
                          {task.assignee_name || task.assignee_email}
                        </div>
                        <div className="flex items-center">
                          <CalendarIcon className="h-4 w-4 mr-1" />
                          Due: {new Date(task.due_date).toLocaleDateString()}
                        </div>
                        {hasRecording && (
                          <div className="flex items-center">
                            <PlayCircleIcon className="h-4 w-4 mr-1" />
                            Recording: {formatDuration(latestRecording.duration_seconds)}
                          </div>
                        )}
                      </div>
                    </div>

                    <div className="ml-6 flex flex-col space-y-2">
                      {canReview(task) ? (
                        <button
                          onClick={() => handleReviewClick(task.id)}
                          className="px-4 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700 transition flex items-center justify-center"
                        >
                          <PlayCircleIcon className="h-5 w-5 mr-2" />
                          Review Recording
                        </button>
                      ) : task.status === 'completed' ? (
                        <button
                          onClick={() => handleReviewClick(task.id)}
                          className="px-4 py-2 bg-green-50 text-green-700 border border-green-200 rounded-lg hover:bg-green-100 transition flex items-center justify-center"
                        >
                          <CheckCircleSolid className="h-5 w-5 mr-2" />
                          View Approved
                        </button>
                      ) : task.status === 'rejected' ? (
                        <button
                          onClick={() => handleReviewClick(task.id)}
                          className="px-4 py-2 bg-red-50 text-red-700 border border-red-200 rounded-lg hover:bg-red-100 transition flex items-center justify-center"
                        >
                          <XCircleIcon className="h-5 w-5 mr-2" />
                          View Rejected
                        </button>
                      ) : (
                        <div className="text-sm text-gray-500 text-center py-2">
                          Waiting for submission
                        </div>
                      )}

                      <button
                        onClick={() => handleArchiveToggle(task.id, task.archived || false)}
                        className="px-4 py-2 bg-gray-50 text-gray-700 border border-gray-200 rounded-lg hover:bg-gray-100 transition flex items-center justify-center text-sm"
                        disabled={archiveMutation.isPending}
                      >
                        {task.archived ? (
                          <>
                            <ArchiveBoxArrowDownIcon className="h-4 w-4 mr-2" />
                            Unarchive
                          </>
                        ) : (
                          <>
                            <ArchiveBoxIcon className="h-4 w-4 mr-2" />
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
      </div>
    </div>
  );
};

export default Reviews;