/**
 * Tasks Page Tests
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import Tasks from './Tasks';

// Mock navigate
const mockNavigate = vi.fn();

vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual('react-router-dom');
  return {
    ...actual,
    useNavigate: () => mockNavigate,
  };
});

// Mock auth context
vi.mock('../../contexts/AuthContext', () => ({
  useAuth: () => ({
    user: {
      id: 'user-123',
      email: 'test@example.com',
      name: 'Test User',
      role: 'manager',
    },
  }),
}));

// Mock task service
const mockGetTasks = vi.fn();
const mockGetTasksByStatus = vi.fn();
const mockGetTaskStatistics = vi.fn();
const mockUpdateTask = vi.fn();
const mockDeleteTask = vi.fn();
const mockFormatDueDate = vi.fn((_date: string) => 'Due in 7 days');

vi.mock('../../services/task.service', () => ({
  taskService: {
    getTasks: (...args: unknown[]) => mockGetTasks(...args),
    getTasksByStatus: (...args: unknown[]) => mockGetTasksByStatus(...args),
    getTaskStatistics: (...args: unknown[]) => mockGetTaskStatistics(...args),
    updateTask: (...args: unknown[]) => mockUpdateTask(...args),
    deleteTask: (...args: unknown[]) => mockDeleteTask(...args),
    formatDueDate: (date: string) => mockFormatDueDate(date),
  },
  Task: {},
  TaskStatistics: {},
  TasksByStatus: {},
}));

// Mock toast
vi.mock('react-hot-toast', () => ({
  toast: {
    success: vi.fn(),
    error: vi.fn(),
  },
  default: {
    success: vi.fn(),
    error: vi.fn(),
  },
}));

// Mock modals
vi.mock('../../components/tasks/CreateTaskModal', () => ({
  default: ({ isOpen, onClose }: { isOpen: boolean; onClose: () => void }) =>
    isOpen ? (
      <div data-testid="create-task-modal">
        <button onClick={onClose}>Close Create Modal</button>
      </div>
    ) : null,
}));

vi.mock('../../components/tasks/EditTaskModal', () => ({
  default: ({
    isOpen,
    onClose,
    task,
  }: {
    isOpen: boolean;
    onClose: () => void;
    task: { id: string };
  }) =>
    isOpen ? (
      <div data-testid="edit-task-modal">
        <span>Editing: {task.id}</span>
        <button onClick={onClose}>Close Edit Modal</button>
      </div>
    ) : null,
}));

describe('Tasks Page', () => {
  let queryClient: QueryClient;

  const mockTasks = [
    {
      id: 'task-1',
      title: 'Task One',
      description: 'First task',
      type: 'recording',
      status: 'pending',
      priority: 'high',
      assigned_to: 'user-123',
      created_by: 'user-123',
      due_date: new Date().toISOString(),
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      assignee_name: 'Test User',
    },
    {
      id: 'task-2',
      title: 'Task Two',
      description: 'Second task',
      type: 'live_demo',
      status: 'in_progress',
      priority: 'medium',
      assigned_to: 'user-456',
      created_by: 'user-789',
      due_date: new Date().toISOString(),
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      assignee_name: 'Other User',
    },
  ];

  const mockStatistics = {
    total: 4,
    pending: 1,
    in_progress: 1,
    completed: 1,
    reviewed: 1,
    overdue: 0,
  };

  const mockTasksByStatus = {
    pending: [mockTasks[0]],
    in_progress: [mockTasks[1]],
    completed: [],
    reviewed: [],
  };

  beforeEach(() => {
    vi.clearAllMocks();
    queryClient = new QueryClient({
      defaultOptions: {
        queries: { retry: false },
        mutations: { retry: false },
      },
    });

    mockGetTasks.mockResolvedValue(mockTasks);
    mockGetTasksByStatus.mockResolvedValue(mockTasksByStatus);
    mockGetTaskStatistics.mockResolvedValue(mockStatistics);
    mockUpdateTask.mockResolvedValue({});
    mockDeleteTask.mockResolvedValue(undefined);
  });

  const renderTasks = () => {
    const user = userEvent.setup();
    const result = render(
      <QueryClientProvider client={queryClient}>
        <MemoryRouter>
          <Tasks />
        </MemoryRouter>
      </QueryClientProvider>
    );
    return { user, ...result };
  };

  describe('Rendering', () => {
    it('renders the page header', async () => {
      renderTasks();

      expect(screen.getByRole('heading', { name: /tasks/i })).toBeInTheDocument();
      expect(screen.getByText(/manage and track your tasks/i)).toBeInTheDocument();
    });

    it('renders tasks after loading', async () => {
      renderTasks();

      await waitFor(() => {
        expect(screen.getByText('Task One')).toBeInTheDocument();
        expect(screen.getByText('Task Two')).toBeInTheDocument();
      });
    });

    it('renders statistics section', async () => {
      renderTasks();

      await waitFor(() => {
        expect(screen.getByText('Task One')).toBeInTheDocument();
      });

      // Statistics cards should show status labels (may appear multiple times)
      expect(screen.getAllByText('Pending').length).toBeGreaterThan(0);
      expect(screen.getAllByText('In Progress').length).toBeGreaterThan(0);
    });

    it('shows loading state initially', () => {
      renderTasks();

      // The loading spinner should be present initially
      const loadingElement = document.querySelector('.animate-spin');
      expect(loadingElement).toBeInTheDocument();
    });
  });

  describe('Controls', () => {
    it('renders search input', async () => {
      renderTasks();

      await waitFor(() => {
        expect(screen.getByPlaceholderText(/search tasks/i)).toBeInTheDocument();
      });
    });

    it('renders view mode toggle buttons', async () => {
      renderTasks();

      await waitFor(() => {
        expect(screen.getByRole('button', { name: /list view/i })).toBeInTheDocument();
        expect(screen.getByRole('button', { name: /kanban board view/i })).toBeInTheDocument();
      });
    });

    it('renders new task button', async () => {
      renderTasks();

      await waitFor(() => {
        expect(screen.getByRole('button', { name: /new task/i })).toBeInTheDocument();
      });
    });

    it('renders status filter in list view', async () => {
      renderTasks();

      await waitFor(() => {
        expect(screen.getByLabelText(/filter by status/i)).toBeInTheDocument();
      });
    });
  });

  describe('Search Functionality', () => {
    it('filters tasks by search query', async () => {
      const { user } = renderTasks();

      await waitFor(() => {
        expect(screen.getByText('Task One')).toBeInTheDocument();
        expect(screen.getByText('Task Two')).toBeInTheDocument();
      });

      const searchInput = screen.getByPlaceholderText(/search tasks/i);
      await user.type(searchInput, 'One');

      await waitFor(() => {
        expect(screen.getByText('Task One')).toBeInTheDocument();
        expect(screen.queryByText('Task Two')).not.toBeInTheDocument();
      });
    });

    it('shows no results message when no tasks match search', async () => {
      const { user } = renderTasks();

      await waitFor(() => {
        expect(screen.getByText('Task One')).toBeInTheDocument();
      });

      const searchInput = screen.getByPlaceholderText(/search tasks/i);
      await user.type(searchInput, 'nonexistent');

      await waitFor(() => {
        expect(screen.getByText(/no tasks found/i)).toBeInTheDocument();
      });
    });
  });

  describe('View Mode Toggle', () => {
    it('starts in list view', async () => {
      renderTasks();

      await waitFor(() => {
        const listButton = screen.getByRole('button', { name: /list view/i });
        expect(listButton).toHaveClass('bg-blue-600');
      });
    });

    it('switches to kanban view', async () => {
      const { user } = renderTasks();

      await waitFor(() => {
        expect(screen.getByText('Task One')).toBeInTheDocument();
      });

      await user.click(screen.getByRole('button', { name: /kanban board view/i }));

      await waitFor(() => {
        const kanbanButton = screen.getByRole('button', { name: /kanban board view/i });
        expect(kanbanButton).toHaveClass('bg-blue-600');
      });
    });
  });

  describe('Status Filter', () => {
    it('filters tasks by status', async () => {
      const { user } = renderTasks();

      await waitFor(() => {
        expect(screen.getByText('Task One')).toBeInTheDocument();
      });

      const statusFilter = screen.getByLabelText(/filter by status/i);
      await user.selectOptions(statusFilter, 'pending');

      await waitFor(() => {
        // Component passes both status and scope (defaults to 'mine')
        expect(mockGetTasks).toHaveBeenCalledWith(
          expect.objectContaining({ status: 'pending' })
        );
      });
    });
  });

  describe('Create Task Modal', () => {
    it('opens create modal when new task button is clicked', async () => {
      const { user } = renderTasks();

      await waitFor(() => {
        expect(screen.getByText('Task One')).toBeInTheDocument();
      });

      await user.click(screen.getByRole('button', { name: /new task/i }));

      await waitFor(() => {
        expect(screen.getByTestId('create-task-modal')).toBeInTheDocument();
      });
    });
  });

  describe('Task Card Interactions', () => {
    it('shows task actions menu', async () => {
      const { user } = renderTasks();

      await waitFor(() => {
        expect(screen.getByText('Task One')).toBeInTheDocument();
      });

      const actionButtons = screen.getAllByRole('button', { name: /task actions/i });
      await user.click(actionButtons[0]);

      await waitFor(() => {
        // Menu shows Edit Task for tasks created by current user
        expect(screen.getByRole('menuitem', { name: /edit task/i })).toBeInTheDocument();
      });
    });

    it('navigates to task details when task card is clicked', async () => {
      const { user } = renderTasks();

      await waitFor(() => {
        expect(screen.getByText('Task One')).toBeInTheDocument();
      });

      // Click on the task card title to navigate (not a menu item)
      await user.click(screen.getByText('Task One'));

      expect(mockNavigate).toHaveBeenCalledWith('/tasks/task-1');
    });

    it('shows edit option for tasks created by user', async () => {
      const { user } = renderTasks();

      await waitFor(() => {
        expect(screen.getByText('Task One')).toBeInTheDocument();
      });

      // Task One is created by user-123 (same as current user)
      const actionButtons = screen.getAllByRole('button', { name: /task actions/i });
      await user.click(actionButtons[0]);

      await waitFor(() => {
        expect(screen.getByRole('menuitem', { name: /edit task/i })).toBeInTheDocument();
      });
    });
  });

  describe('Task Status Changes', () => {
    it('shows start task option for pending tasks', async () => {
      const { user } = renderTasks();

      await waitFor(() => {
        expect(screen.getByText('Task One')).toBeInTheDocument();
      });

      const actionButtons = screen.getAllByRole('button', { name: /task actions/i });
      await user.click(actionButtons[0]);

      await waitFor(() => {
        expect(screen.getByRole('menuitem', { name: /start task/i })).toBeInTheDocument();
      });
    });

    it('updates task status when start task is clicked', async () => {
      const { user } = renderTasks();

      await waitFor(() => {
        expect(screen.getByText('Task One')).toBeInTheDocument();
      });

      const actionButtons = screen.getAllByRole('button', { name: /task actions/i });
      await user.click(actionButtons[0]);

      await user.click(screen.getByRole('menuitem', { name: /start task/i }));

      await waitFor(() => {
        expect(mockUpdateTask).toHaveBeenCalledWith('task-1', { status: 'in_progress' });
      });
    });
  });

  describe('Task Deletion', () => {
    it('shows delete option for tasks created by user', async () => {
      const { user } = renderTasks();

      await waitFor(() => {
        expect(screen.getByText('Task One')).toBeInTheDocument();
      });

      const actionButtons = screen.getAllByRole('button', { name: /task actions/i });
      await user.click(actionButtons[0]);

      await waitFor(() => {
        expect(screen.getByRole('menuitem', { name: /delete task/i })).toBeInTheDocument();
      });
    });
  });

  describe('Empty State', () => {
    it('shows empty state when no tasks exist', async () => {
      mockGetTasks.mockResolvedValueOnce([]);

      renderTasks();

      await waitFor(() => {
        expect(screen.getByText(/no tasks found/i)).toBeInTheDocument();
        expect(screen.getByText(/create your first task/i)).toBeInTheDocument();
      });
    });
  });

  describe('Statistics Display', () => {
    it('displays correct statistics values', async () => {
      renderTasks();

      await waitFor(() => {
        // Find the stat cards and verify values
        expect(screen.getByText('4')).toBeInTheDocument(); // Total
      });
    });
  });

  describe('Accessibility', () => {
    it('has accessible search input', async () => {
      renderTasks();

      await waitFor(() => {
        const searchInput = screen.getByPlaceholderText(/search tasks/i);
        expect(searchInput).toHaveAttribute('aria-label');
      });
    });

    it('has accessible view toggle buttons', async () => {
      renderTasks();

      await waitFor(() => {
        const listButton = screen.getByRole('button', { name: /list view/i });
        const kanbanButton = screen.getByRole('button', { name: /kanban board view/i });

        expect(listButton).toHaveAttribute('aria-pressed');
        expect(kanbanButton).toHaveAttribute('aria-pressed');
      });
    });

    it('has accessible status filter', async () => {
      renderTasks();

      await waitFor(() => {
        const filter = screen.getByLabelText(/filter by status/i);
        expect(filter).toBeInTheDocument();
      });
    });
  });
});
