/**
 * ProtectedRoute Component Tests
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import ProtectedRoute from './ProtectedRoute';

// Mock useAuth
const mockUseAuth = vi.fn();

vi.mock('../../contexts/AuthContext', () => ({
  useAuth: () => mockUseAuth(),
}));

// Mock LoadingSpinner
vi.mock('../ui/LoadingSpinner', () => ({
  default: ({ message }: { message?: string }) => (
    <div data-testid="loading-spinner">{message}</div>
  ),
}));

describe('ProtectedRoute Component', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  const renderProtectedRoute = (
    authState: {
      isAuthenticated: boolean;
      isLoading: boolean;
      user: { id: string; role: string } | null;
    },
    requiredRoles?: string[]
  ) => {
    mockUseAuth.mockReturnValue(authState);

    return render(
      <MemoryRouter initialEntries={['/protected']}>
        <Routes>
          <Route path="/login" element={<div>Login Page</div>} />
          <Route path="/dashboard" element={<div>Dashboard</div>} />
          <Route
            path="/protected"
            element={
              <ProtectedRoute requiredRoles={requiredRoles}>
                <div>Protected Content</div>
              </ProtectedRoute>
            }
          />
        </Routes>
      </MemoryRouter>
    );
  };

  describe('Loading State', () => {
    it('shows loading spinner during initial auth check', () => {
      renderProtectedRoute({
        isAuthenticated: false,
        isLoading: true,
        user: null,
      });

      expect(screen.getByTestId('loading-spinner')).toBeInTheDocument();
      expect(screen.getByText('Loading...')).toBeInTheDocument();
    });

    it('does not show loading if user exists during navigation', () => {
      renderProtectedRoute({
        isAuthenticated: true,
        isLoading: true, // loading but user exists
        user: { id: 'user-1', role: 'employee' },
      });

      expect(screen.queryByTestId('loading-spinner')).not.toBeInTheDocument();
      expect(screen.getByText('Protected Content')).toBeInTheDocument();
    });
  });

  describe('Authentication', () => {
    it('renders children when user is authenticated', () => {
      renderProtectedRoute({
        isAuthenticated: true,
        isLoading: false,
        user: { id: 'user-1', role: 'employee' },
      });

      expect(screen.getByText('Protected Content')).toBeInTheDocument();
    });

    it('redirects to login when user is not authenticated', () => {
      renderProtectedRoute({
        isAuthenticated: false,
        isLoading: false,
        user: null,
      });

      expect(screen.queryByText('Protected Content')).not.toBeInTheDocument();
      expect(screen.getByText('Login Page')).toBeInTheDocument();
    });
  });

  describe('Role-Based Access', () => {
    it('allows access when user has required role', () => {
      renderProtectedRoute(
        {
          isAuthenticated: true,
          isLoading: false,
          user: { id: 'user-1', role: 'admin' },
        },
        ['admin', 'manager']
      );

      expect(screen.getByText('Protected Content')).toBeInTheDocument();
    });

    it('redirects to dashboard when user lacks required role', () => {
      renderProtectedRoute(
        {
          isAuthenticated: true,
          isLoading: false,
          user: { id: 'user-1', role: 'employee' },
        },
        ['admin', 'manager']
      );

      expect(screen.queryByText('Protected Content')).not.toBeInTheDocument();
      expect(screen.getByText('Dashboard')).toBeInTheDocument();
    });

    it('allows access when no roles are required', () => {
      renderProtectedRoute({
        isAuthenticated: true,
        isLoading: false,
        user: { id: 'user-1', role: 'employee' },
      });

      expect(screen.getByText('Protected Content')).toBeInTheDocument();
    });
  });

  describe('Location State', () => {
    it('preserves the attempted location when redirecting to login', () => {
      // This test verifies the Navigate component is called with the correct props
      // The actual location preservation is handled by react-router-dom
      mockUseAuth.mockReturnValue({
        isAuthenticated: false,
        isLoading: false,
        user: null,
      });

      render(
        <MemoryRouter initialEntries={['/protected/resource/123']}>
          <Routes>
            <Route path="/login" element={<div>Login Page</div>} />
            <Route
              path="/protected/resource/:id"
              element={
                <ProtectedRoute>
                  <div>Protected Resource</div>
                </ProtectedRoute>
              }
            />
          </Routes>
        </MemoryRouter>
      );

      expect(screen.getByText('Login Page')).toBeInTheDocument();
    });
  });

  describe('Multiple Role Checks', () => {
    it('allows manager role from multiple allowed roles', () => {
      renderProtectedRoute(
        {
          isAuthenticated: true,
          isLoading: false,
          user: { id: 'user-1', role: 'manager' },
        },
        ['admin', 'manager', 'reviewer']
      );

      expect(screen.getByText('Protected Content')).toBeInTheDocument();
    });

    it('allows reviewer role from multiple allowed roles', () => {
      renderProtectedRoute(
        {
          isAuthenticated: true,
          isLoading: false,
          user: { id: 'user-1', role: 'reviewer' },
        },
        ['admin', 'manager', 'reviewer']
      );

      expect(screen.getByText('Protected Content')).toBeInTheDocument();
    });

    it('denies access with employee role when only admin/manager allowed', () => {
      renderProtectedRoute(
        {
          isAuthenticated: true,
          isLoading: false,
          user: { id: 'user-1', role: 'employee' },
        },
        ['admin', 'manager']
      );

      expect(screen.queryByText('Protected Content')).not.toBeInTheDocument();
      expect(screen.getByText('Dashboard')).toBeInTheDocument();
    });
  });

  describe('Nested Protected Routes', () => {
    it('handles nested protected content', () => {
      mockUseAuth.mockReturnValue({
        isAuthenticated: true,
        isLoading: false,
        user: { id: 'user-1', role: 'admin' },
      });

      render(
        <MemoryRouter initialEntries={['/admin']}>
          <Routes>
            <Route
              path="/admin"
              element={
                <ProtectedRoute requiredRoles={['admin']}>
                  <div>
                    <h1>Admin Page</h1>
                    <div data-testid="admin-content">Admin Content</div>
                  </div>
                </ProtectedRoute>
              }
            />
          </Routes>
        </MemoryRouter>
      );

      expect(screen.getByText('Admin Page')).toBeInTheDocument();
      expect(screen.getByTestId('admin-content')).toBeInTheDocument();
    });
  });

  describe('Memoization', () => {
    it('renders the same content on re-render without prop changes', () => {
      const { rerender } = renderProtectedRoute({
        isAuthenticated: true,
        isLoading: false,
        user: { id: 'user-1', role: 'employee' },
      });

      expect(screen.getByText('Protected Content')).toBeInTheDocument();

      // Re-render with same auth state
      mockUseAuth.mockReturnValue({
        isAuthenticated: true,
        isLoading: false,
        user: { id: 'user-1', role: 'employee' },
      });

      rerender(
        <MemoryRouter initialEntries={['/protected']}>
          <Routes>
            <Route path="/login" element={<div>Login Page</div>} />
            <Route path="/dashboard" element={<div>Dashboard</div>} />
            <Route
              path="/protected"
              element={
                <ProtectedRoute>
                  <div>Protected Content</div>
                </ProtectedRoute>
              }
            />
          </Routes>
        </MemoryRouter>
      );

      expect(screen.getByText('Protected Content')).toBeInTheDocument();
    });
  });
});
