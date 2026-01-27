import React, { ReactElement } from 'react';
import { render, RenderOptions } from '@testing-library/react';
import { BrowserRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

// Create a test query client with appropriate defaults
const createTestQueryClient = () =>
  new QueryClient({
    defaultOptions: {
      queries: {
        retry: false,
        gcTime: 0,
        staleTime: 0,
      },
      mutations: {
        retry: false,
      },
    },
  });

interface AllTheProvidersProps {
  children: React.ReactNode;
}

const AllTheProviders = ({ children }: AllTheProvidersProps) => {
  const queryClient = createTestQueryClient();

  return (
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>{children}</BrowserRouter>
    </QueryClientProvider>
  );
};

const customRender = (
  ui: ReactElement,
  options?: Omit<RenderOptions, 'wrapper'>
) => render(ui, { wrapper: AllTheProviders, ...options });

// ============================================================================
// Mock Data Factories
// ============================================================================

export interface MockUser {
  id: string;
  email: string;
  name: string;
  role: string;
  organization_id: string | null;
  is_system_admin: boolean;
  system_role: string | null;
  created_at: string;
}

export interface MockTask {
  id: string;
  title: string;
  description: string;
  status: string;
  priority: string;
  assigned_to: string | null;
  reviewed_by: string | null;
  organization_id: string;
  created_at: string;
  due_date: string | null;
}

export interface MockRecording {
  id: string;
  task_id: string;
  file_url: string;
  duration_seconds: number;
  status: string;
  created_at: string;
  user_id: string;
}

export const createMockUser = (overrides: Partial<MockUser> = {}): MockUser => ({
  id: 'user-123',
  email: 'test@example.com',
  name: 'Test User',
  role: 'member',
  organization_id: 'org-123',
  is_system_admin: false,
  system_role: null,
  created_at: new Date().toISOString(),
  ...overrides,
});

export const createMockTask = (overrides: Partial<MockTask> = {}): MockTask => ({
  id: 'task-123',
  title: 'Test Task',
  description: 'Test task description',
  status: 'assigned',
  priority: 'medium',
  assigned_to: 'user-123',
  reviewed_by: null,
  organization_id: 'org-123',
  created_at: new Date().toISOString(),
  due_date: null,
  ...overrides,
});

export const createMockRecording = (overrides: Partial<MockRecording> = {}): MockRecording => ({
  id: 'recording-123',
  task_id: 'task-123',
  file_url: 'https://example.com/recording.mp4',
  duration_seconds: 120,
  status: 'completed',
  created_at: new Date().toISOString(),
  user_id: 'user-123',
  ...overrides,
});

// Re-export everything
export * from '@testing-library/react';
export { customRender as render };
export { createTestQueryClient };
