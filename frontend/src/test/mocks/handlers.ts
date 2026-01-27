/**
 * Mock API Handlers
 *
 * These mock handlers simulate backend API responses for testing.
 * They can be used with MSW or directly in tests.
 */

import { vi } from 'vitest';
import { createMockUser, createMockTask, createMockRecording } from '../test-utils';

// ============================================================================
// Mock Response Factories
// ============================================================================

export const createSuccessResponse = <T>(data: T) => ({
  success: true,
  data,
});

export const createErrorResponse = (message: string, status: number = 400) => ({
  success: false,
  error: message,
  status,
});

// ============================================================================
// Auth API Mocks
// ============================================================================

export const mockAuthApi = {
  login: vi.fn().mockImplementation(async (email: string, password: string) => {
    if (email === 'test@example.com' && password === 'password123') {
      return {
        token: 'mock-token-123',
        refreshToken: 'mock-refresh-token-123',
        user: createMockUser(),
      };
    }
    throw new Error('Invalid credentials');
  }),

  logout: vi.fn().mockResolvedValue(undefined),

  refreshToken: vi.fn().mockImplementation(async (refreshToken: string) => {
    if (refreshToken === 'mock-refresh-token-123') {
      return {
        token: 'new-mock-token-123',
        refreshToken: 'new-mock-refresh-token-123',
        user: createMockUser(),
      };
    }
    throw new Error('Invalid refresh token');
  }),

  getMe: vi.fn().mockResolvedValue(createMockUser()),
};

// ============================================================================
// Task API Mocks
// ============================================================================

const mockTasks = [
  createMockTask({ id: 'task-1', title: 'Task 1', status: 'assigned' }),
  createMockTask({ id: 'task-2', title: 'Task 2', status: 'in_progress' }),
  createMockTask({ id: 'task-3', title: 'Task 3', status: 'completed' }),
  createMockTask({ id: 'task-4', title: 'Task 4', status: 'submitted' }),
];

export const mockTaskApi = {
  getTasks: vi.fn().mockResolvedValue(mockTasks),

  getTaskById: vi.fn().mockImplementation(async (id: string) => {
    const task = mockTasks.find((t) => t.id === id);
    if (!task) throw new Error('Task not found');
    return task;
  }),

  createTask: vi.fn().mockImplementation(async (data: Record<string, unknown>) => {
    return createMockTask({ ...data, id: `task-${Date.now()}` });
  }),

  updateTask: vi.fn().mockImplementation(async (id: string, data: Record<string, unknown>) => {
    const task = mockTasks.find((t) => t.id === id);
    if (!task) throw new Error('Task not found');
    return { ...task, ...data };
  }),

  deleteTask: vi.fn().mockResolvedValue(undefined),

  getTaskStatistics: vi.fn().mockResolvedValue({
    total: 4,
    pending: 1,
    in_progress: 1,
    completed: 1,
    reviewed: 1,
    overdue: 0,
  }),

  getTasksByStatus: vi.fn().mockResolvedValue({
    pending: [mockTasks[0]],
    in_progress: [mockTasks[1]],
    completed: [mockTasks[2]],
    reviewed: [mockTasks[3]],
  }),
};

// ============================================================================
// Recording API Mocks
// ============================================================================

const mockRecordings = [
  createMockRecording({ id: 'rec-1', task_id: 'task-1' }),
  createMockRecording({ id: 'rec-2', task_id: 'task-2' }),
];

export const mockRecordingApi = {
  getRecordings: vi.fn().mockResolvedValue(mockRecordings),

  getRecordingById: vi.fn().mockImplementation(async (id: string) => {
    const recording = mockRecordings.find((r) => r.id === id);
    if (!recording) throw new Error('Recording not found');
    return recording;
  }),

  createRecording: vi.fn().mockImplementation(async (data: Record<string, unknown>) => {
    return createMockRecording({ ...data, id: `rec-${Date.now()}` });
  }),

  uploadRecording: vi.fn().mockResolvedValue({
    url: 'https://example.com/uploaded-recording.mp4',
  }),

  deleteRecording: vi.fn().mockResolvedValue(undefined),
};

// ============================================================================
// Template API Mocks
// ============================================================================

export const mockTemplateApi = {
  getOrganizationTemplates: vi.fn().mockResolvedValue([
    {
      id: 'template-1',
      title: 'Product Demo',
      iconEmoji: '🎬',
      type: 'recording',
      priority: 'medium',
      instructions: 'Record a product demo',
      tags: ['demo', 'product'],
    },
    {
      id: 'template-2',
      title: 'Knowledge Share',
      iconEmoji: '📚',
      type: 'recording',
      priority: 'low',
      instructions: 'Share your knowledge',
      tags: ['knowledge', 'training'],
    },
  ]),
};

// ============================================================================
// Magic Link API Mocks
// ============================================================================

export const mockMagicLinkApi = {
  createMagicLink: vi.fn().mockImplementation(async (data: { taskId: string; email: string }) => ({
    id: `link-${Date.now()}`,
    url: `http://localhost:5173/t/mock-token-${Date.now()}`,
    taskId: data.taskId,
    email: data.email,
    expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
  })),

  getExternalContributors: vi.fn().mockResolvedValue([
    { id: 'contrib-1', email: 'contributor1@example.com', first_name: 'John', last_name: 'Doe' },
    { id: 'contrib-2', email: 'contributor2@example.com', first_name: 'Jane', last_name: 'Smith' },
  ]),
};

// ============================================================================
// Reset All Mocks
// ============================================================================

export const resetAllMocks = (): void => {
  Object.values(mockAuthApi).forEach((mock) => mock.mockClear());
  Object.values(mockTaskApi).forEach((mock) => mock.mockClear());
  Object.values(mockRecordingApi).forEach((mock) => mock.mockClear());
  Object.values(mockTemplateApi).forEach((mock) => mock.mockClear());
  Object.values(mockMagicLinkApi).forEach((mock) => mock.mockClear());
};
