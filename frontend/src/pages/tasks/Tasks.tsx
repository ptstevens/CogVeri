import React, { useState, useCallback, useMemo, useRef, useEffect } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  Plus,
  Calendar,
  Clock,
  User,
  AlertCircle,
  CheckCircle,
  Grid3x3,
  List,
  Search,
  MoreVertical,
  ListTodo,
  Hourglass,
  PlayCircle,
  CheckCheck,
  ClipboardCheck,
  AlertTriangle,
  Send,
  Eye,
} from 'lucide-react';
import { taskService, Task, TaskStatistics, TasksByStatus } from '../../services/task.service';
import { useAuth } from '../../contexts/AuthContext';
import CreateTaskModal from '../../components/tasks/CreateTaskModal';
import EditTaskModal from '../../components/tasks/EditTaskModal';
import { StatusBadge, PriorityBadge, ExpandableRichText, ScopeToggle, ScopeValue } from '../../components/ui';
import toast from 'react-hot-toast';

type ViewMode = 'list' | 'kanban';
type FilterStatus = 'all' | 'pending' | 'in_progress' | 'submitted' | 'in_review' | 'completed' | 'reviewed' | 'rejected';

// ★ Memoized task card component for list and kanban views
interface TaskCardProps {
  task: Task;
  onEdit: (task: Task) => void;
  onStatusChange: (taskId: string, status: string) => void;
  onDelete: (taskId: string) => void;
  onViewDetails: (taskId: string) => void;
  canEdit: boolean;
}

const TaskCard = React.memo(
  ({
    task,
    onEdit,
    onStatusChange,
    onDelete,
    onViewDetails,
    canEdit,
  }: TaskCardProps) => {
    const [showActions, setShowActions] = useState(false);
    const menuRef = useRef<HTMLDivElement>(null);

    // Close menu when clicking outside
    useEffect(() => {
      if (!showActions) return;

      const handleClickOutside = (event: MouseEvent) => {
        if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
          setShowActions(false);
        }
      };

      document.addEventListener('mousedown', handleClickOutside);
      return () => document.removeEventListener('mousedown', handleClickOutside);
    }, [showActions]);

    const getStatusIcon = useMemo(() => {
      switch (task.status) {
        case 'completed':
        case 'reviewed':
          return <CheckCircle className="h-4 w-4 text-green-500" />;
        case 'in_progress':
          return <Clock className="h-4 w-4 text-blue-500" />;
        default:
          return <AlertCircle className="h-4 w-4 text-gray-500" />;
      }
    }, [task.status]);

    const handleStatusChange = useCallback(
      (newStatus: string) => {
        onStatusChange(task.id, newStatus);
        setShowActions(false);
      },
      [task.id, onStatusChange]
    );

    const handleDelete = useCallback(() => {
      if (confirm('Are you sure you want to delete this task?')) {
        onDelete(task.id);
      }
      setShowActions(false);
    }, [task.id, onDelete]);

    const handleEdit = useCallback(() => {
      onEdit(task);
      setShowActions(false);
    }, [task, onEdit]);

    const handleViewDetails = useCallback(() => {
      onViewDetails(task.id);
      setShowActions(false);
    }, [task.id, onViewDetails]);

    return (
      <div
        onClick={handleViewDetails}
        className="bg-white rounded-lg border border-gray-200 p-4 hover:shadow-lg hover:border-primary-300 transition-all duration-150 ease-out cursor-pointer group"
      >
        <div className="flex items-start justify-between mb-2">
          <div className="flex items-center gap-2 flex-1 min-w-0">
            {getStatusIcon}
            <h3 className="font-medium text-gray-900 group-hover:text-primary-600 transition-colors truncate">
              {task.title}
            </h3>
          </div>
          <div ref={menuRef} className="relative flex-shrink-0 ml-2">
            <button
              onClick={(e) => {
                e.stopPropagation();
                setShowActions(!showActions);
              }}
              aria-label="Task actions"
              aria-haspopup="true"
              aria-expanded={showActions}
              className="p-1.5 hover:bg-gray-100 rounded-md opacity-0 group-hover:opacity-100 focus:opacity-100 transition-opacity"
            >
              <MoreVertical className="h-4 w-4 text-gray-500" aria-hidden="true" />
            </button>
            {showActions && (
              <div
                className="absolute right-0 mt-1 w-48 bg-white rounded-lg shadow-lg z-20 border border-gray-200 py-1"
                role="menu"
                aria-orientation="vertical"
                onClick={(e) => e.stopPropagation()}
              >
                {canEdit && (
                  <button
                    onClick={handleEdit}
                    className="flex items-center gap-2 w-full text-left px-4 py-2 text-sm text-gray-700 hover:bg-gray-50"
                    role="menuitem"
                  >
                    Edit Task
                  </button>
                )}
                {task.status === 'pending' && (
                  <button
                    onClick={() => handleStatusChange('in_progress')}
                    className="flex items-center gap-2 w-full text-left px-4 py-2 text-sm text-gray-700 hover:bg-gray-50"
                    role="menuitem"
                  >
                    Start Task
                  </button>
                )}
                {task.status === 'in_progress' && (
                  <button
                    onClick={() => handleStatusChange('completed')}
                    className="flex items-center gap-2 w-full text-left px-4 py-2 text-sm text-gray-700 hover:bg-gray-50"
                    role="menuitem"
                  >
                    Mark Complete
                  </button>
                )}
                {canEdit && (
                  <>
                    <div className="border-t border-gray-100 my-1" />
                    <button
                      onClick={handleDelete}
                      className="flex items-center gap-2 w-full text-left px-4 py-2 text-sm text-red-600 hover:bg-red-50"
                      role="menuitem"
                    >
                      Delete Task
                    </button>
                  </>
                )}
              </div>
            )}
          </div>
        </div>

        {task.description && (
          <ExpandableRichText
            content={task.description}
            maxCollapsedHeight={60}
            className="mb-3"
          />
        )}

        <div className="flex flex-wrap gap-2 mb-3">
          <PriorityBadge priority={task.priority} size="sm" showIcon={false} />
          <StatusBadge status={task.status} size="sm" showIcon={false} />
          <span className="px-2 py-1 rounded-full text-xs font-medium bg-blue-100 text-blue-600">
            {task.type.replace('_', ' ')}
          </span>
        </div>

        <div className="flex items-center justify-between text-xs text-gray-500">
          <div className="flex items-center gap-1">
            <User className="h-3 w-3" aria-hidden="true" />
            <span>
              <span className="sr-only">Assigned to: </span>
              {task.assignee_name || 'Unassigned'}
            </span>
          </div>
          {task.due_date && (
            <div className="flex items-center gap-1">
              <Calendar className="h-3 w-3" aria-hidden="true" />
              <span>
                <span className="sr-only">Due date: </span>
                {taskService.formatDueDate(task.due_date)}
              </span>
            </div>
          )}
        </div>
      </div>
    );
  }
);

TaskCard.displayName = 'TaskCard';

// ★ Memoized list view component
interface ListViewProps {
  tasks: Task[];
  onEdit: (task: Task) => void;
  onStatusChange: (taskId: string, status: string) => void;
  onDelete: (taskId: string) => void;
  onViewDetails: (taskId: string) => void;
  userId?: string;
}

const ListView = React.memo(
  ({
    tasks,
    onEdit,
    onStatusChange,
    onDelete,
    onViewDetails,
    userId,
  }: ListViewProps) => (
    <div className="space-y-4">
      {tasks?.map((task) => (
        <TaskCard
          key={task.id}
          task={task}
          onEdit={onEdit}
          onStatusChange={onStatusChange}
          onDelete={onDelete}
          onViewDetails={onViewDetails}
          canEdit={task.created_by === userId}
        />
      ))}
    </div>
  )
);

ListView.displayName = 'ListView';

// ★ Memoized kanban column component
interface KanbanColumnProps {
  title: string;
  tasks: Task[];
  onEdit: (task: Task) => void;
  onStatusChange: (taskId: string, status: string) => void;
  onDelete: (taskId: string) => void;
  onViewDetails: (taskId: string) => void;
  userId?: string;
  statusColor: string;
}

const KanbanColumn = React.memo(
  ({
    title,
    tasks,
    onEdit,
    onStatusChange,
    onDelete,
    onViewDetails,
    userId,
    statusColor,
  }: KanbanColumnProps) => (
    <div className="bg-gray-50 rounded-lg p-4 min-h-[500px] min-w-[280px] flex-shrink-0 snap-start">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <div className={`w-3 h-3 rounded-full ${statusColor}`}></div>
          <h3 className="font-semibold text-gray-900">{title}</h3>
        </div>
        <span className="bg-gray-200 text-gray-700 px-2 py-1 rounded-full text-xs font-medium">
          {tasks.length}
        </span>
      </div>
      <div className="space-y-3">
        {tasks.map((task) => (
          <TaskCard
            key={task.id}
            task={task}
            onEdit={onEdit}
            onStatusChange={onStatusChange}
            onDelete={onDelete}
            onViewDetails={onViewDetails}
            canEdit={task.created_by === userId}
          />
        ))}
      </div>
    </div>
  )
);

KanbanColumn.displayName = 'KanbanColumn';

// Kanban column configuration
const KANBAN_COLUMNS = [
  { key: 'pending', title: 'Pending', color: 'bg-gray-400' },
  { key: 'in_progress', title: 'In Progress', color: 'bg-blue-500' },
  { key: 'completed', title: 'Completed', color: 'bg-green-500' },
  { key: 'reviewed', title: 'Reviewed', color: 'bg-purple-500' },
] as const;

// ★ Memoized kanban view component
interface KanbanViewProps {
  tasksByStatus: TasksByStatus;
  isLoading: boolean;
  onEdit: (task: Task) => void;
  onStatusChange: (taskId: string, status: string) => void;
  onDelete: (taskId: string) => void;
  onViewDetails: (taskId: string) => void;
  userId?: string;
}

const KanbanView = React.memo(
  ({
    tasksByStatus,
    isLoading,
    onEdit,
    onStatusChange,
    onDelete,
    onViewDetails,
    userId,
  }: KanbanViewProps) => {
    const scrollContainerRef = useRef<HTMLDivElement>(null);
    const [activeColumn, setActiveColumn] = useState(0);
    const [showLeftFade, setShowLeftFade] = useState(false);
    const [showRightFade, setShowRightFade] = useState(true);

    // Handle scroll to update active column indicator and fade visibility
    const handleScroll = useCallback(() => {
      const container = scrollContainerRef.current;
      if (!container) return;

      const scrollLeft = container.scrollLeft;
      const columnWidth = 280 + 24; // min-width + gap
      const newActiveColumn = Math.round(scrollLeft / columnWidth);
      setActiveColumn(Math.min(newActiveColumn, KANBAN_COLUMNS.length - 1));

      // Update fade visibility
      setShowLeftFade(scrollLeft > 10);
      setShowRightFade(scrollLeft < container.scrollWidth - container.clientWidth - 10);
    }, []);

    // Scroll to column when dot is clicked
    const scrollToColumn = useCallback((index: number) => {
      const container = scrollContainerRef.current;
      if (!container) return;

      const columnWidth = 280 + 24; // min-width + gap
      container.scrollTo({
        left: index * columnWidth,
        behavior: 'smooth',
      });
    }, []);

    // Check initial fade state
    useEffect(() => {
      const container = scrollContainerRef.current;
      if (container) {
        setShowRightFade(container.scrollWidth > container.clientWidth);
      }
    }, [tasksByStatus]);

    if (isLoading || !tasksByStatus) {
      return <div>Loading...</div>;
    }

    return (
      <div className="relative">
        {/* Mobile column indicator dots */}
        <div className="flex justify-center gap-2 mb-4 lg:hidden">
          {KANBAN_COLUMNS.map((col, index) => (
            <button
              key={col.key}
              onClick={() => scrollToColumn(index)}
              className={`w-2.5 h-2.5 rounded-full transition-all duration-200 ${
                index === activeColumn
                  ? `${col.color} scale-125`
                  : 'bg-gray-300 hover:bg-gray-400'
              }`}
              aria-label={`Scroll to ${col.title} column`}
            />
          ))}
        </div>

        {/* Scroll container with gradient fade indicators */}
        <div className="relative">
          {/* Left fade indicator */}
          <div
            className={`absolute left-0 top-0 bottom-0 w-8 bg-gradient-to-r from-white to-transparent z-10 pointer-events-none lg:hidden transition-opacity duration-200 ${
              showLeftFade ? 'opacity-100' : 'opacity-0'
            }`}
          />

          {/* Right fade indicator */}
          <div
            className={`absolute right-0 top-0 bottom-0 w-8 bg-gradient-to-l from-white to-transparent z-10 pointer-events-none lg:hidden transition-opacity duration-200 ${
              showRightFade ? 'opacity-100' : 'opacity-0'
            }`}
          />

          {/* Kanban columns container */}
          <div
            ref={scrollContainerRef}
            onScroll={handleScroll}
            className="flex gap-6 overflow-x-auto pb-4 snap-x snap-mandatory scrollbar-thin scrollbar-thumb-gray-300 scrollbar-track-transparent lg:grid lg:grid-cols-4 lg:overflow-x-visible lg:snap-none"
            style={{ scrollbarWidth: 'thin' }}
          >
            <KanbanColumn
              title="Pending"
              tasks={tasksByStatus.pending}
              onEdit={onEdit}
              onStatusChange={onStatusChange}
              onDelete={onDelete}
              onViewDetails={onViewDetails}
              userId={userId}
              statusColor="bg-gray-400"
            />
            <KanbanColumn
              title="In Progress"
              tasks={tasksByStatus.in_progress}
              onEdit={onEdit}
              onStatusChange={onStatusChange}
              onDelete={onDelete}
              onViewDetails={onViewDetails}
              userId={userId}
              statusColor="bg-blue-500"
            />
            <KanbanColumn
              title="Completed"
              tasks={tasksByStatus.completed}
              onEdit={onEdit}
              onStatusChange={onStatusChange}
              onDelete={onDelete}
              onViewDetails={onViewDetails}
              userId={userId}
              statusColor="bg-green-500"
            />
            <KanbanColumn
              title="Reviewed"
              tasks={tasksByStatus.reviewed}
              onEdit={onEdit}
              onStatusChange={onStatusChange}
              onDelete={onDelete}
              onViewDetails={onViewDetails}
              userId={userId}
              statusColor="bg-purple-500"
            />
          </div>
        </div>
      </div>
    );
  }
);

KanbanView.displayName = 'KanbanView';

// Statistics card configuration with filter values
const STAT_CARDS = [
  {
    key: 'total',
    filterValue: 'all' as FilterStatus,
    label: 'All Tasks',
    icon: ListTodo,
    gradient: 'from-slate-500 to-gray-600',
    bgGradient: 'from-slate-500/10 to-gray-600/10',
    iconColor: 'text-slate-600',
    ringColor: 'ring-slate-500',
    getValue: (s: TaskStatistics) => s.total,
  },
  {
    key: 'pending',
    filterValue: 'pending' as FilterStatus,
    label: 'Pending',
    icon: Hourglass,
    gradient: 'from-amber-500 to-yellow-500',
    bgGradient: 'from-amber-500/10 to-yellow-500/10',
    iconColor: 'text-amber-500',
    ringColor: 'ring-amber-500',
    getValue: (s: TaskStatistics) => s.pending,
  },
  {
    key: 'in_progress',
    filterValue: 'in_progress' as FilterStatus,
    label: 'In Progress',
    icon: PlayCircle,
    gradient: 'from-blue-500 to-cyan-500',
    bgGradient: 'from-blue-500/10 to-cyan-500/10',
    iconColor: 'text-blue-500',
    ringColor: 'ring-blue-500',
    getValue: (s: TaskStatistics) => s.in_progress,
  },
  {
    key: 'submitted',
    filterValue: 'submitted' as FilterStatus,
    label: 'Awaiting Review',
    icon: Send,
    gradient: 'from-purple-500 to-pink-500',
    bgGradient: 'from-purple-500/10 to-pink-500/10',
    iconColor: 'text-purple-500',
    ringColor: 'ring-purple-500',
    getValue: (s: TaskStatistics) => s.submitted,
  },
  {
    key: 'in_review',
    filterValue: 'in_review' as FilterStatus,
    label: 'In Review',
    icon: Eye,
    gradient: 'from-amber-500 to-orange-500',
    bgGradient: 'from-amber-500/10 to-orange-500/10',
    iconColor: 'text-amber-500',
    ringColor: 'ring-amber-500',
    getValue: (s: TaskStatistics) => s.in_review,
  },
  {
    key: 'completed',
    filterValue: 'completed' as FilterStatus,
    label: 'Completed',
    icon: CheckCheck,
    gradient: 'from-green-500 to-emerald-500',
    bgGradient: 'from-green-500/10 to-emerald-500/10',
    iconColor: 'text-green-500',
    ringColor: 'ring-green-500',
    getValue: (s: TaskStatistics) => s.completed,
  },
  {
    key: 'reviewed',
    filterValue: 'reviewed' as FilterStatus,
    label: 'Reviewed',
    icon: ClipboardCheck,
    gradient: 'from-purple-500 to-violet-500',
    bgGradient: 'from-purple-500/10 to-violet-500/10',
    iconColor: 'text-purple-500',
    ringColor: 'ring-purple-500',
    getValue: (s: TaskStatistics) => s.reviewed,
  },
  {
    key: 'overdue',
    filterValue: null, // Overdue is not a filterable status
    label: 'Overdue',
    icon: AlertTriangle,
    gradient: 'from-red-500 to-rose-500',
    bgGradient: 'from-red-500/10 to-rose-500/10',
    iconColor: 'text-red-500',
    ringColor: 'ring-red-500',
    getValue: (s: TaskStatistics) => s.overdue,
  },
] as const;

// ★ Memoized stat card component - clickable filter
interface StatCardProps {
  label: string;
  value: number;
  icon: React.ComponentType<{ className?: string }>;
  gradient: string;
  bgGradient: string;
  iconColor: string;
  ringColor: string;
  isActive: boolean;
  isClickable: boolean;
  onClick?: () => void;
}

const StatCard = React.memo(({
  label,
  value,
  icon: Icon,
  gradient,
  bgGradient,
  iconColor,
  ringColor,
  isActive,
  isClickable,
  onClick
}: StatCardProps) => (
  <button
    type="button"
    onClick={onClick}
    disabled={!isClickable}
    aria-pressed={isActive}
    aria-label={`${label}: ${value}${isClickable ? ' - click to filter' : ''}`}
    className={`relative overflow-hidden rounded-xl bg-gradient-to-br ${bgGradient} backdrop-blur-sm border border-white/50 shadow-sm transition-all duration-200 ease-out text-left w-full ${
      isClickable
        ? 'cursor-pointer hover:shadow-lg hover:scale-[1.02]'
        : 'cursor-default'
    } ${
      isActive
        ? `ring-2 ${ringColor} ring-offset-2`
        : ''
    }`}
  >
    <div className="p-4">
      <div className="flex items-center justify-between mb-3">
        <div className="p-2 rounded-lg bg-white shadow-sm">
          <Icon className={`h-5 w-5 ${iconColor}`} />
        </div>
        <div className={`absolute top-0 right-0 w-20 h-20 bg-gradient-to-br ${gradient} opacity-5 rounded-full -mr-10 -mt-10`}></div>
      </div>
      <p className={`text-3xl font-bold bg-gradient-to-r ${gradient} bg-clip-text text-transparent`}>
        {value}
      </p>
      <p className="text-xs font-medium text-slate-500 mt-1 uppercase tracking-wide">
        {label}
      </p>
    </div>
  </button>
));

StatCard.displayName = 'StatCard';

// ★ Memoized statistics section with clickable filter cards
interface StatisticsSectionProps {
  statistics: TaskStatistics;
  activeFilter: FilterStatus;
  onFilterChange: (filter: FilterStatus) => void;
}

const StatisticsSection = React.memo(({ statistics, activeFilter, onFilterChange }: StatisticsSectionProps) => (
  <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-4 xl:grid-cols-8 gap-4 mb-8">
    {STAT_CARDS.map((card) => (
      <StatCard
        key={card.key}
        label={card.label}
        value={card.getValue(statistics)}
        icon={card.icon}
        gradient={card.gradient}
        bgGradient={card.bgGradient}
        iconColor={card.iconColor}
        ringColor={card.ringColor}
        isActive={card.filterValue === activeFilter}
        isClickable={card.filterValue !== null}
        onClick={card.filterValue !== null ? () => onFilterChange(card.filterValue!) : undefined}
      />
    ))}
  </div>
));

StatisticsSection.displayName = 'StatisticsSection';

const Tasks: React.FC = () => {
  const { user } = useAuth();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [searchParams, setSearchParams] = useSearchParams();
  const [viewMode, setViewMode] = useState<ViewMode>('list');

  // Read initial filter from URL params (e.g., /tasks?status=completed)
  const urlStatus = searchParams.get('status') as FilterStatus | null;
  const validStatuses = ['all', 'pending', 'in_progress', 'submitted', 'in_review', 'completed', 'reviewed', 'rejected'];
  const [filterStatus, setFilterStatus] = useState<FilterStatus>(
    urlStatus && validStatuses.includes(urlStatus)
      ? urlStatus
      : 'all'
  );
  const [searchQuery, setSearchQuery] = useState('');

  // Scope filter: 'mine' (default) or 'all' (admin only)
  const urlScope = searchParams.get('scope') as ScopeValue | null;
  const [scope, setScope] = useState<ScopeValue>(
    urlScope === 'all' ? 'all' : 'mine'
  );

  // Check if user is admin (OWNER or ADMIN role)
  const isAdmin = user?.org_role === 'OWNER' || user?.org_role === 'ADMIN';

  // Update URL when filter changes (for shareable links)
  const handleFilterChange = useCallback((newFilter: FilterStatus) => {
    setFilterStatus(newFilter);
    if (newFilter === 'all') {
      searchParams.delete('status');
    } else {
      searchParams.set('status', newFilter);
    }
    setSearchParams(searchParams, { replace: true });
  }, [searchParams, setSearchParams]);

  // Handle scope change (My Tasks / All Tasks)
  const handleScopeChange = useCallback((newScope: ScopeValue) => {
    setScope(newScope);
    if (newScope === 'mine') {
      searchParams.delete('scope');
    } else {
      searchParams.set('scope', newScope);
    }
    setSearchParams(searchParams, { replace: true });
  }, [searchParams, setSearchParams]);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [showEditModal, setShowEditModal] = useState(false);
  const [taskToEdit, setTaskToEdit] = useState<Task | null>(null);

  // Fetch tasks based on view mode
  const { data: tasks, isLoading: tasksLoading } = useQuery({
    queryKey: ['tasks', filterStatus, scope],
    queryFn: () => {
      const filters = filterStatus !== 'all'
        ? { status: filterStatus, scope }
        : { scope };
      return taskService.getTasks(filters);
    },
    staleTime: 2 * 60 * 1000, // ★ 2 minutes - tasks don't change frequently
  });

  // Fetch tasks by status for kanban view
  const { data: tasksByStatus, isLoading: kanbanLoading } = useQuery({
    queryKey: ['tasks-by-status', scope],
    queryFn: () => taskService.getTasksByStatus(scope),
    enabled: viewMode === 'kanban',
    staleTime: 2 * 60 * 1000, // ★ 2 minutes
  });

  // Fetch task statistics
  const { data: statistics } = useQuery({
    queryKey: ['task-statistics', scope],
    queryFn: () => taskService.getTaskStatistics(scope),
    staleTime: 2 * 60 * 1000, // ★ 2 minutes
  });

  // Update task mutation
  const updateTaskMutation = useMutation({
    mutationFn: ({ id, data }: { id: string; data: any }) =>
      taskService.updateTask(id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['tasks'] });
      queryClient.invalidateQueries({ queryKey: ['tasks-by-status'] });
      queryClient.invalidateQueries({ queryKey: ['task-statistics'] });
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
    },
    onError: () => {
      toast.error('Failed to delete task');
    },
  });

  // ★ Memoize filtered tasks to avoid recalculation on every render
  const filteredTasks = useMemo(() => {
    return tasks?.filter((task) => {
      const searchLower = searchQuery.toLowerCase();
      return (
        task.title.toLowerCase().includes(searchLower) ||
        task.description?.toLowerCase().includes(searchLower) ||
        task.assignee_name?.toLowerCase().includes(searchLower)
      );
    });
  }, [tasks, searchQuery]);

  // ★ Memoize callbacks to pass stable references to memoized children
  const handleEditTask = useCallback((task: Task) => {
    setTaskToEdit(task);
    setShowEditModal(true);
  }, []);

  const handleStatusChange = useCallback(
    (taskId: string, status: string) => {
      updateTaskMutation.mutate({
        id: taskId,
        data: { status },
      });
    },
    [updateTaskMutation]
  );

  const handleDeleteTask = useCallback(
    (taskId: string) => {
      deleteTaskMutation.mutate(taskId);
    },
    [deleteTaskMutation]
  );

  const handleViewDetails = useCallback(
    (taskId: string) => {
      navigate(`/tasks/${taskId}`);
    },
    [navigate]
  );

  const handleCloseEditModal = useCallback(() => {
    setShowEditModal(false);
    setTaskToEdit(null);
  }, []);

  return (
    <div>
      {/* Header */}
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-gray-900 mb-2">Tasks</h1>
        <p className="text-gray-600">Manage and track your tasks</p>
      </div>

      {/* Statistics - Clickable Filter Cards */}
      {statistics && (
        <StatisticsSection
          statistics={statistics}
          activeFilter={filterStatus}
          onFilterChange={handleFilterChange}
        />
      )}

      {/* Controls */}
      <div className="flex flex-col sm:flex-row gap-4 mb-6">
        <div className="flex-1 flex flex-wrap gap-4">
          <div className="relative flex-1 min-w-[200px] max-w-md">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-gray-400" aria-hidden="true" />
            <label htmlFor="task-search" className="sr-only">Search tasks</label>
            <input
              id="task-search"
              type="text"
              placeholder="Search tasks..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              aria-label="Search tasks by title, description, or assignee"
              className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>

          {viewMode === 'list' && (
            <>
              <label htmlFor="status-filter" className="sr-only">Filter by status</label>
              <select
                id="status-filter"
                value={filterStatus}
                onChange={(e) => handleFilterChange(e.target.value as FilterStatus)}
                aria-label="Filter tasks by status"
                className="px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                <option value="all">All Status</option>
                <option value="pending">Pending</option>
                <option value="in_progress">In Progress</option>
                <option value="submitted">Awaiting Review</option>
                <option value="in_review">In Review</option>
                <option value="completed">Completed</option>
                <option value="reviewed">Reviewed</option>
                <option value="rejected">Rejected</option>
              </select>
            </>
          )}

          <ScopeToggle
            scope={scope}
            onScopeChange={handleScopeChange}
            isAdmin={isAdmin}
          />
        </div>

        <div className="flex gap-2" role="group" aria-label="View options and actions">
          <button
            onClick={() => setViewMode('list')}
            aria-label="List view"
            aria-pressed={viewMode === 'list'}
            className={`p-2 rounded-lg ${
              viewMode === 'list'
                ? 'bg-blue-600 text-white'
                : 'bg-white text-gray-700 border border-gray-300'
            }`}
          >
            <List className="h-5 w-5" aria-hidden="true" />
          </button>
          <button
            onClick={() => setViewMode('kanban')}
            aria-label="Kanban board view"
            aria-pressed={viewMode === 'kanban'}
            className={`p-2 rounded-lg ${
              viewMode === 'kanban'
                ? 'bg-blue-600 text-white'
                : 'bg-white text-gray-700 border border-gray-300'
            }`}
          >
            <Grid3x3 className="h-5 w-5" aria-hidden="true" />
          </button>
          <button
            onClick={() => setShowCreateModal(true)}
            aria-label="Create new task"
            className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 flex items-center gap-2"
          >
            <Plus className="h-5 w-5" aria-hidden="true" />
            New Task
          </button>
        </div>
      </div>

      {/* Task View */}
      {tasksLoading ? (
        <div className="flex items-center justify-center h-64">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
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
      ) : viewMode === 'list' ? (
        <ListView
          tasks={filteredTasks || []}
          onEdit={handleEditTask}
          onStatusChange={handleStatusChange}
          onDelete={handleDeleteTask}
          onViewDetails={handleViewDetails}
          userId={user?.id}
        />
      ) : (
        <KanbanView
          tasksByStatus={tasksByStatus!}
          isLoading={kanbanLoading}
          onEdit={handleEditTask}
          onStatusChange={handleStatusChange}
          onDelete={handleDeleteTask}
          onViewDetails={handleViewDetails}
          userId={user?.id}
        />
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
          onClose={handleCloseEditModal}
          task={taskToEdit}
        />
      )}
    </div>
  );
};

export default Tasks;
