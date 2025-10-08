import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  Plus,
  Filter,
  Calendar,
  Clock,
  User,
  Tag,
  AlertCircle,
  CheckCircle,
  XCircle,
  Grid3x3,
  List,
  Search,
  ChevronDown,
  MoreVertical,
} from 'lucide-react';
import { taskService, Task, TaskStatistics, TasksByStatus } from '../../services/task.service';
import { useAuth } from '../../contexts/AuthContext';
import CreateTaskModal from '../../components/tasks/CreateTaskModal';
import EditTaskModal from '../../components/tasks/EditTaskModal';
import toast from 'react-hot-toast';

type ViewMode = 'list' | 'kanban';
type FilterStatus = 'all' | 'pending' | 'in_progress' | 'completed' | 'reviewed';

const Tasks: React.FC = () => {
  const { user } = useAuth();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [viewMode, setViewMode] = useState<ViewMode>('list');
  const [filterStatus, setFilterStatus] = useState<FilterStatus>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [showEditModal, setShowEditModal] = useState(false);
  const [taskToEdit, setTaskToEdit] = useState<Task | null>(null);

  // Fetch tasks based on view mode
  const { data: tasks, isLoading: tasksLoading } = useQuery({
    queryKey: ['tasks', filterStatus],
    queryFn: () => {
      const filters = filterStatus !== 'all' ? { status: filterStatus } : undefined;
      return taskService.getTasks(filters);
    },
  });

  // Fetch tasks by status for kanban view
  const { data: tasksByStatus, isLoading: kanbanLoading } = useQuery({
    queryKey: ['tasks-by-status'],
    queryFn: () => taskService.getTasksByStatus(),
    enabled: viewMode === 'kanban',
  });

  // Fetch task statistics
  const { data: statistics } = useQuery({
    queryKey: ['task-statistics'],
    queryFn: () => taskService.getTaskStatistics(),
  });

  // Update task mutation
  const updateTaskMutation = useMutation({
    mutationFn: ({ id, data }: { id: string; data: any }) =>
      taskService.updateTask(id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['tasks'] });
      queryClient.invalidateQueries({ queryKey: ['tasks-by-status'] });
      queryClient.invalidateQueries({ queryKey: ['task-statistics'] });
      toast.success('Task updated successfully');
    },
    onError: () => {
      toast.error('Failed to update task');
    },
  });

  // Delete task mutation
  const deleteTaskMutation = useMutation({
    mutationFn: (id: string) => taskService.deleteTask(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['tasks'] });
      queryClient.invalidateQueries({ queryKey: ['task-statistics'] });
      toast.success('Task deleted successfully');
    },
    onError: () => {
      toast.error('Failed to delete task');
    },
  });

  // Filter tasks based on search query
  const filteredTasks = tasks?.filter((task) => {
    const searchLower = searchQuery.toLowerCase();
    return (
      task.title.toLowerCase().includes(searchLower) ||
      task.description?.toLowerCase().includes(searchLower) ||
      task.assignee_name?.toLowerCase().includes(searchLower)
    );
  });

  const getPriorityIcon = (priority: string) => {
    switch (priority) {
      case 'urgent':
        return <AlertCircle className="h-4 w-4 text-red-500" />;
      case 'high':
        return <AlertCircle className="h-4 w-4 text-orange-500" />;
      case 'medium':
        return <AlertCircle className="h-4 w-4 text-yellow-500" />;
      case 'low':
        return <AlertCircle className="h-4 w-4 text-green-500" />;
      default:
        return null;
    }
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'completed':
      case 'reviewed':
        return <CheckCircle className="h-4 w-4 text-green-500" />;
      case 'in_progress':
        return <Clock className="h-4 w-4 text-blue-500" />;
      default:
        return <AlertCircle className="h-4 w-4 text-gray-500" />;
    }
  };

  const TaskCard: React.FC<{ task: Task; showColumn?: boolean }> = ({ task, showColumn = false }) => {
    const [showActions, setShowActions] = useState(false);

    return (
      <div className="bg-white rounded-lg border border-gray-200 p-4 hover:shadow-md transition-shadow">
        <div className="flex items-start justify-between mb-2">
          <div className="flex items-center gap-2">
            {getStatusIcon(task.status)}
            <h3
              className="font-medium text-gray-900 cursor-pointer hover:text-indigo-600 hover:underline"
              onClick={() => navigate(`/tasks/${task.id}`)}
            >
              {task.title}
            </h3>
          </div>
          <div className="relative">
            <button
              onClick={() => setShowActions(!showActions)}
              className="p-1 hover:bg-gray-100 rounded"
            >
              <MoreVertical className="h-4 w-4 text-gray-500" />
            </button>
            {showActions && (
              <div className="absolute right-0 mt-1 w-48 bg-white rounded-md shadow-lg z-10">
                <button
                  onClick={() => {
                    navigate(`/tasks/${task.id}`);
                    setShowActions(false);
                  }}
                  className="block w-full text-left px-4 py-2 text-sm text-gray-700 hover:bg-gray-100"
                >
                  View Details
                </button>
                {task.created_by === user?.id && (
                  <button
                    onClick={() => {
                      setTaskToEdit(task);
                      setShowEditModal(true);
                      setShowActions(false);
                    }}
                    className="block w-full text-left px-4 py-2 text-sm text-gray-700 hover:bg-gray-100"
                  >
                    Edit Task
                  </button>
                )}
                {task.status === 'pending' && (
                  <button
                    onClick={() => {
                      updateTaskMutation.mutate({
                        id: task.id,
                        data: { status: 'in_progress' },
                      });
                      setShowActions(false);
                    }}
                    className="block w-full text-left px-4 py-2 text-sm text-gray-700 hover:bg-gray-100"
                  >
                    Start Task
                  </button>
                )}
                {task.status === 'in_progress' && (
                  <button
                    onClick={() => {
                      updateTaskMutation.mutate({
                        id: task.id,
                        data: { status: 'completed' },
                      });
                      setShowActions(false);
                    }}
                    className="block w-full text-left px-4 py-2 text-sm text-gray-700 hover:bg-gray-100"
                  >
                    Mark Complete
                  </button>
                )}
                {task.created_by === user?.id && (
                  <button
                    onClick={() => {
                      if (confirm('Are you sure you want to delete this task?')) {
                        deleteTaskMutation.mutate(task.id);
                      }
                      setShowActions(false);
                    }}
                    className="block w-full text-left px-4 py-2 text-sm text-red-600 hover:bg-red-50"
                  >
                    Delete Task
                  </button>
                )}
              </div>
            )}
          </div>
        </div>

        {task.description && (
          <p className="text-sm text-gray-600 mb-3 line-clamp-2">{task.description}</p>
        )}

        <div className="flex flex-wrap gap-2 mb-3">
          <span className={`px-2 py-1 rounded-full text-xs font-medium ${taskService.getPriorityColor(task.priority)}`}>
            {task.priority}
          </span>
          <span className={`px-2 py-1 rounded-full text-xs font-medium ${taskService.getStatusColor(task.status)}`}>
            {task.status.replace('_', ' ')}
          </span>
          <span className="px-2 py-1 rounded-full text-xs font-medium bg-blue-100 text-blue-600">
            {task.type.replace('_', ' ')}
          </span>
        </div>

        <div className="flex items-center justify-between text-xs text-gray-500">
          <div className="flex items-center gap-1">
            <User className="h-3 w-3" />
            <span>{task.assignee_name || 'Unassigned'}</span>
          </div>
          {task.due_date && (
            <div className="flex items-center gap-1">
              <Calendar className="h-3 w-3" />
              <span>{taskService.formatDueDate(task.due_date)}</span>
            </div>
          )}
        </div>
      </div>
    );
  };

  const ListView = () => (
    <div className="space-y-4">
      {filteredTasks?.map((task) => (
        <TaskCard key={task.id} task={task} />
      ))}
    </div>
  );

  const KanbanColumn: React.FC<{ title: string; tasks: Task[]; status: string }> = ({
    title,
    tasks,
    status,
  }) => (
    <div className="bg-gray-50 rounded-lg p-4 min-h-[500px]">
      <div className="flex items-center justify-between mb-4">
        <h3 className="font-semibold text-gray-900">{title}</h3>
        <span className="bg-gray-200 text-gray-700 px-2 py-1 rounded-full text-xs font-medium">
          {tasks.length}
        </span>
      </div>
      <div className="space-y-3">
        {tasks.map((task) => (
          <TaskCard key={task.id} task={task} />
        ))}
      </div>
    </div>
  );

  const KanbanView = () => {
    if (kanbanLoading || !tasksByStatus) {
      return <div>Loading...</div>;
    }

    return (
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        <KanbanColumn title="Pending" tasks={tasksByStatus.pending} status="pending" />
        <KanbanColumn title="In Progress" tasks={tasksByStatus.in_progress} status="in_progress" />
        <KanbanColumn title="Completed" tasks={tasksByStatus.completed} status="completed" />
        <KanbanColumn title="Reviewed" tasks={tasksByStatus.reviewed} status="reviewed" />
      </div>
    );
  };

  return (
    <div>
      {/* Header */}
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-gray-900 mb-2">Tasks</h1>
        <p className="text-gray-600">Manage and track your tasks</p>
      </div>

      {/* Statistics */}
      {statistics && (
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4 mb-8">
          <div className="bg-white rounded-lg border border-gray-200 p-4">
            <div className="text-2xl font-bold text-gray-900">{statistics.total}</div>
            <div className="text-sm text-gray-600">Total Tasks</div>
          </div>
          <div className="bg-white rounded-lg border border-gray-200 p-4">
            <div className="text-2xl font-bold text-gray-500">{statistics.pending}</div>
            <div className="text-sm text-gray-600">Pending</div>
          </div>
          <div className="bg-white rounded-lg border border-gray-200 p-4">
            <div className="text-2xl font-bold text-blue-600">{statistics['in-progress']}</div>
            <div className="text-sm text-gray-600">In Progress</div>
          </div>
          <div className="bg-white rounded-lg border border-gray-200 p-4">
            <div className="text-2xl font-bold text-green-600">{statistics.completed}</div>
            <div className="text-sm text-gray-600">Completed</div>
          </div>
          <div className="bg-white rounded-lg border border-gray-200 p-4">
            <div className="text-2xl font-bold text-purple-600">{statistics.reviewed}</div>
            <div className="text-sm text-gray-600">Reviewed</div>
          </div>
          <div className="bg-white rounded-lg border border-gray-200 p-4">
            <div className="text-2xl font-bold text-red-600">{statistics.overdue}</div>
            <div className="text-sm text-gray-600">Overdue</div>
          </div>
        </div>
      )}

      {/* Controls */}
      <div className="flex flex-col sm:flex-row gap-4 mb-6">
        <div className="flex-1 flex gap-4">
          <div className="relative flex-1 max-w-md">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-gray-400" />
            <input
              type="text"
              placeholder="Search tasks..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500"
            />
          </div>

          {viewMode === 'list' && (
            <select
              value={filterStatus}
              onChange={(e) => setFilterStatus(e.target.value as FilterStatus)}
              className="px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500"
            >
              <option value="all">All Status</option>
              <option value="pending">Pending</option>
              <option value="in_progress">In Progress</option>
              <option value="completed">Completed</option>
              <option value="reviewed">Reviewed</option>
            </select>
          )}
        </div>

        <div className="flex gap-2">
          <button
            onClick={() => setViewMode('list')}
            className={`p-2 rounded-lg ${
              viewMode === 'list'
                ? 'bg-indigo-600 text-white'
                : 'bg-white text-gray-700 border border-gray-300'
            }`}
          >
            <List className="h-5 w-5" />
          </button>
          <button
            onClick={() => setViewMode('kanban')}
            className={`p-2 rounded-lg ${
              viewMode === 'kanban'
                ? 'bg-indigo-600 text-white'
                : 'bg-white text-gray-700 border border-gray-300'
            }`}
          >
            <Grid3x3 className="h-5 w-5" />
          </button>
          <button
            onClick={() => setShowCreateModal(true)}
            className="px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 flex items-center gap-2"
          >
            <Plus className="h-5 w-5" />
            New Task
          </button>
        </div>
      </div>

      {/* Task View */}
      {tasksLoading ? (
        <div className="flex items-center justify-center h-64">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-indigo-600"></div>
        </div>
      ) : filteredTasks && filteredTasks.length === 0 ? (
        <div className="text-center py-12">
          <AlertCircle className="h-12 w-12 text-gray-400 mx-auto mb-4" />
          <h3 className="text-lg font-medium text-gray-900 mb-2">No tasks found</h3>
          <p className="text-gray-600">
            {searchQuery
              ? 'Try adjusting your search criteria'
              : 'Create your first task to get started'}
          </p>
        </div>
      ) : (
        viewMode === 'list' ? <ListView /> : <KanbanView />
      )}

      {/* Create Task Modal */}
      <CreateTaskModal
        isOpen={showCreateModal}
        onClose={() => setShowCreateModal(false)}
      />

      {/* Edit Task Modal */}
      {taskToEdit && (
        <EditTaskModal
          isOpen={showEditModal}
          onClose={() => {
            setShowEditModal(false);
            setTaskToEdit(null);
          }}
          task={taskToEdit}
        />
      )}
    </div>
  );
};

export default Tasks;