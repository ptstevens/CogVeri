/**
 * CreateTaskModal Component Tests
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';
import CreateTaskModal from './CreateTaskModal';

// Mock services and contexts
const mockCreateTask = vi.fn();
const mockCreateMagicLink = vi.fn();

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

vi.mock('../../services/task.service', () => ({
  taskService: {
    createTask: (...args: unknown[]) => mockCreateTask(...args),
  },
  CreateTaskDto: {},
}));

vi.mock('../../services/magicLink.service', () => ({
  magicLinkService: {
    createMagicLink: (...args: unknown[]) => mockCreateMagicLink(...args),
    getExternalContributors: vi.fn().mockResolvedValue([]),
  },
  ExternalContributor: {},
}));

vi.mock('../../services/template.service', () => ({
  templateService: {
    getOrganizationTemplates: vi.fn().mockResolvedValue([
      {
        id: 'template-1',
        title: 'Product Demo',
        iconEmoji: '📹',
        type: 'recording',
        priority: 'high',
        instructions: 'Record a product demo',
        tags: ['demo'],
      },
    ]),
  },
  TaskTemplate: {},
}));

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

// Mock RichTextEditor as a simple textarea
vi.mock('../ui/RichTextEditor', () => ({
  default: ({
    content,
    onChange,
    placeholder,
  }: {
    content: string;
    onChange: (value: string) => void;
    placeholder?: string;
  }) => (
    <textarea
      data-testid="rich-text-editor"
      value={content}
      onChange={(e) => onChange(e.target.value)}
      placeholder={placeholder}
    />
  ),
}));

describe('CreateTaskModal Component', () => {
  let queryClient: QueryClient;

  beforeEach(() => {
    vi.clearAllMocks();
    queryClient = new QueryClient({
      defaultOptions: {
        queries: { retry: false },
        mutations: { retry: false },
      },
    });
    mockCreateTask.mockReset();
    mockCreateMagicLink.mockReset();
  });

  const renderModal = (isOpen = true, onClose = vi.fn()) => {
    const user = userEvent.setup();
    const result = render(
      <MemoryRouter>
        <QueryClientProvider client={queryClient}>
          <CreateTaskModal isOpen={isOpen} onClose={onClose} />
        </QueryClientProvider>
      </MemoryRouter>
    );
    return { user, onClose, ...result };
  };

  describe('Rendering', () => {
    it('renders when isOpen is true', () => {
      renderModal(true);

      expect(screen.getByRole('dialog')).toBeInTheDocument();
      // Multi-step modal starts with "Create New Task" heading
      expect(screen.getByText('Create New Task')).toBeInTheDocument();
    });

    it('does not render when isOpen is false', () => {
      renderModal(false);

      expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    });

    it('renders start step options', () => {
      renderModal();

      // Check for the two main options in the start step
      expect(screen.getByText('Start from Scratch')).toBeInTheDocument();
      expect(screen.getByText('Use a Template')).toBeInTheDocument();
    });

    it('renders form elements after clicking Start from Scratch', async () => {
      const { user } = renderModal();

      // Click "Start from Scratch" to go to form step
      await user.click(screen.getByText('Start from Scratch'));

      // Now the form should be visible
      await waitFor(() => {
        expect(screen.getByText(/task title/i)).toBeInTheDocument();
      });
      expect(screen.getByText(/type/i)).toBeInTheDocument();
      expect(screen.getByText(/priority/i)).toBeInTheDocument();
    });
  });

  describe('Form Step', () => {
    it('clicking Start from Scratch navigates away from start step', async () => {
      const { user } = renderModal();

      // Verify we're on start step
      expect(screen.getByText('Start from Scratch')).toBeInTheDocument();

      // Click to navigate
      await user.click(screen.getByText('Start from Scratch'));

      // Should no longer show start step text after navigation
      await waitFor(() => {
        expect(screen.queryByText('How would you like to start?')).not.toBeInTheDocument();
      });
    });
  });

  describe('Cancel Button', () => {
    it('calls onClose when cancel is clicked in start step', async () => {
      const { user, onClose } = renderModal();

      await user.click(screen.getByRole('button', { name: /cancel/i }));

      expect(onClose).toHaveBeenCalledTimes(1);
    });
  });

  describe('Template Selection', () => {
    it('navigates to template selection step', async () => {
      const { user } = renderModal();

      await user.click(screen.getByText('Use a Template'));

      await waitFor(() => {
        expect(screen.getByText('Choose a Template')).toBeInTheDocument();
      });
    });

    it('shows back button in template selection', async () => {
      const { user } = renderModal();

      await user.click(screen.getByText('Use a Template'));

      await waitFor(() => {
        expect(screen.getByRole('button', { name: /back/i })).toBeInTheDocument();
      });
    });
  });

  describe('Accessibility', () => {
    it('has modal role', () => {
      renderModal();

      expect(screen.getByRole('dialog')).toBeInTheDocument();
    });

    it('indicates required fields with asterisk in form step', async () => {
      const { user } = renderModal();

      // Navigate to form step
      await user.click(screen.getByText('Start from Scratch'));

      await waitFor(() => {
        // Check for asterisk indicating required fields
        const titleLabel = screen.getByText(/task title/i);
        expect(titleLabel.parentElement?.textContent).toContain('*');
      });
    });
  });
});
