import React, { useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import {
  ArrowLeft,
  Clock,
  Calendar,
  User,
  Tag,
  AlertCircle,
  CheckCircle,
  Edit,
} from 'lucide-react';
import { RichTextContent } from '../../components/ui/RichTextEditor';
import { taskService } from '../../services/task.service';
import { useAuth } from '../../contexts/AuthContext';
import EditTaskModal from '../../components/tasks/EditTaskModal';
import { StatusBadge, PriorityBadge } from '../../components/ui';

const TaskDetail: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { user } = useAuth();
  const [showEditModal, setShowEditModal] = useState(false);

  // Fetch task details
  const { data: task, isLoading, error } = useQuery({
    queryKey: ['task', id],
    queryFn: () => taskService.getTaskById(id!),
    enabled: !!id,
  });

  // Format task type display
  const formatTaskType = (type: string): string => {
    const typeMap: Record<string, string> = {
      'recording': 'Screen Recording',
      'live_demo': 'Live Demo',
      'hybrid': 'Hybrid Session'
    };
    return typeMap[type] || type;
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
      </div>
    );
  }

  if (error || !task) {
    return (
      <div className="flex flex-col items-center justify-center min-h-screen">
        <AlertCircle className="h-12 w-12 text-red-500 mb-4" />
        <p className="text-gray-600">Task not found</p>
        <button
          onClick={() => navigate('/tasks')}
          className="mt-4 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
        >
          Back to Tasks
        </button>
      </div>
    );
  }

  return (
    <div className="max-w-6xl mx-auto px-4 py-8">
      {/* Header */}
      <div className="mb-8">
        <button
          onClick={() => navigate('/tasks')}
          className="flex items-center text-gray-600 hover:text-gray-900 mb-4"
        >
          <ArrowLeft className="h-5 w-5 mr-2" />
          Back to Tasks
        </button>

        <div className="bg-white rounded-lg shadow-sm p-6">
          <div className="flex items-start justify-between mb-4">
            <div className="flex-1">
              <h1 className="text-2xl font-bold text-gray-900 mb-2">
                {task.title}
              </h1>
              <div className="flex items-center gap-4 text-sm text-gray-600">
                <StatusBadge status={task.status} size="sm" />
                <PriorityBadge priority={task.priority} size="sm" />
                <span className="flex items-center">
                  <Tag className="h-4 w-4 mr-1" />
                  {formatTaskType(task.type)}
                </span>
              </div>
            </div>
            {task.created_by === user?.id && (
              <button
                onClick={() => setShowEditModal(true)}
                className="ml-4 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors flex items-center gap-2"
              >
                <Edit className="h-4 w-4" />
                Edit Task
              </button>
            )}
          </div>

          {/* Task Details */}
          <div className="border-t pt-4">
            {task.description && (
              <div className="mb-4">
                <h3 className="text-sm font-medium text-gray-700 mb-2">Description</h3>
                <RichTextContent
                  content={task.description}
                  className="text-gray-600"
                />
              </div>
            )}

            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
              <div>
                <span className="text-gray-500 flex items-center">
                  <User className="h-4 w-4 mr-1" />
                  Assigned to:
                </span>
                <span className="text-gray-900">{task.assignee_name || task.assignee_email}</span>
              </div>

              {task.due_date && (
                <div>
                  <span className="text-gray-500 flex items-center">
                    <Calendar className="h-4 w-4 mr-1" />
                    Due date:
                  </span>
                  <span className="text-gray-900">
                    {new Date(task.due_date).toLocaleDateString()}
                  </span>
                </div>
              )}

              {task.estimated_duration && (
                <div>
                  <span className="text-gray-500 flex items-center">
                    <Clock className="h-4 w-4 mr-1" />
                    Estimated:
                  </span>
                  <span className="text-gray-900">{task.estimated_duration} minutes</span>
                </div>
              )}

              {task.reviewed_by && (
                <div>
                  <span className="text-gray-500">Reviewer:</span>
                  <span className="text-gray-900">{task.reviewer_name}</span>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Task Status */}
      <div className="bg-white rounded-lg shadow-sm p-6">
        <h2 className="text-lg font-semibold text-gray-900 mb-4">Task Status</h2>

        <div className="text-gray-700">
          {task.status === 'completed' || task.status === 'submitted' ? (
            <>
              <div className="flex items-center mb-3">
                <CheckCircle className="h-5 w-5 text-green-600 mr-2" />
                <span className="font-medium text-green-800">
                  Recording submitted for review
                </span>
              </div>
              <p className="mb-2">
                Submitted by: {task.claim_name || task.claim_email || task.assignee_name || task.assignee_email}
              </p>
              {task.reviewed_by === user?.id && (
                <div className="mt-4 bg-blue-50 border border-blue-200 rounded-lg p-4">
                  <p className="text-blue-900 font-medium">
                    You are the reviewer for this task.
                  </p>
                  <p className="mt-1 text-blue-700">
                    Go to the <strong>Reviews</strong> section to view the recording and approve or reject this submission.
                  </p>
                </div>
              )}
            </>
          ) : task.claim_email ? (
            <>
              <p className="mb-2">
                Task claimed by: {task.claim_name || task.claim_email}
              </p>
              <p className="text-gray-600">
                The assignee will complete and submit this task via the magic link.
              </p>
            </>
          ) : (
            <>
              <p className="mb-2">
                Assigned to: {task.assignee_name || task.assignee_email || 'Pending assignment'}
              </p>
              <p className="text-gray-600">
                Waiting for the assignee to claim and complete this task via the magic link.
              </p>
            </>
          )}
        </div>

        {/* Instructions */}
        <div className="mt-6 bg-blue-50 rounded-lg p-4">
          <h3 className="text-sm font-medium text-blue-900 mb-2">📝 How Tasks Work</h3>
          <ol className="text-sm text-blue-800 space-y-1">
            <li>1. Share the task via magic link with the assignee</li>
            <li>2. The assignee accesses the link to claim the task</li>
            <li>3. They record their screen while completing the task</li>
            <li>4. The recording is submitted for review</li>
            <li>5. Reviewer approves or requests changes</li>
          </ol>
        </div>
      </div>

      {/* Edit Task Modal */}
      {task && (
        <EditTaskModal
          isOpen={showEditModal}
          onClose={() => setShowEditModal(false)}
          task={task}
        />
      )}
    </div>
  );
};

export default TaskDetail;