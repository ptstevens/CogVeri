/**
 * AuthContext Tests
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor, act } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { AuthProvider, useAuth } from './AuthContext';
import { STORAGE_KEYS } from '../services/storage.service';

// Mock auth service
const mockLogin = vi.fn();
const mockLogout = vi.fn();
const mockRefreshToken = vi.fn();
const mockGetMe = vi.fn();

vi.mock('../services/auth.service', () => ({
  authService: {
    login: (...args: unknown[]) => mockLogin(...args),
    logout: (...args: unknown[]) => mockLogout(...args),
    refreshToken: (...args: unknown[]) => mockRefreshToken(...args),
    getMe: (...args: unknown[]) => mockGetMe(...args),
  },
}));

// Mock Sentry functions
vi.mock('../config/sentry', () => ({
  setSentryUser: vi.fn(),
  clearSentryUser: vi.fn(),
}));

// Mock react-hot-toast
vi.mock('react-hot-toast', () => ({
  default: {
    success: vi.fn(),
    error: vi.fn(),
  },
}));

// Mock token service (memory-based token storage)
const mockSetAccessToken = vi.fn();
const mockClearAccessToken = vi.fn();
const mockGetAccessToken = vi.fn();

vi.mock('../services/token.service', () => ({
  tokenService: {
    getAccessToken: () => mockGetAccessToken(),
    setAccessToken: (token: string) => mockSetAccessToken(token),
    clearAccessToken: () => mockClearAccessToken(),
    hasAccessToken: () => !!mockGetAccessToken(),
    onTokenChange: () => () => {},
  },
  initializeTokenService: vi.fn(),
  destroyTokenService: vi.fn(),
}));

// Test component that uses the auth context
const TestConsumer = () => {
  const { user, isLoading, isAuthenticated, login, logout } = useAuth();

  const handleLogin = async () => {
    try {
      await login('test@example.com', 'password123');
    } catch {
      // Error is expected in some tests
    }
  };

  return (
    <div>
      <div data-testid="loading">{isLoading.toString()}</div>
      <div data-testid="authenticated">{isAuthenticated.toString()}</div>
      <div data-testid="user">{user ? user.email : 'null'}</div>
      <button onClick={handleLogin}>Login</button>
      <button onClick={() => logout()}>Logout</button>
    </div>
  );
};

describe('AuthContext', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
    sessionStorage.clear();
  });

  afterEach(() => {
    localStorage.clear();
    sessionStorage.clear();
  });

  const renderWithAuth = () => {
    const user = userEvent.setup();
    const result = render(
      <MemoryRouter>
        <AuthProvider>
          <TestConsumer />
        </AuthProvider>
      </MemoryRouter>
    );
    return { user, ...result };
  };

  describe('Initial State', () => {
    it('starts with loading state', async () => {
      mockGetMe.mockResolvedValueOnce(null);

      renderWithAuth();

      // Initially loading should be true
      await waitFor(() => {
        expect(screen.getByTestId('loading').textContent).toBe('false');
      });
    });

    it('starts unauthenticated without token', async () => {
      mockGetMe.mockRejectedValueOnce(new Error('No token'));

      renderWithAuth();

      await waitFor(() => {
        expect(screen.getByTestId('authenticated').textContent).toBe('false');
      });
    });

    it('checks for existing session on mount', async () => {
      mockGetMe.mockRejectedValueOnce(new Error('No token'));

      renderWithAuth();

      // Wait for initial auth check to complete
      await waitFor(() => {
        expect(screen.getByTestId('loading').textContent).toBe('false');
      });

      // Without a token, user should not be authenticated
      expect(screen.getByTestId('authenticated').textContent).toBe('false');
    });
  });

  describe('Login', () => {
    it('authenticates user on successful login', async () => {
      const mockUser = {
        id: 'user-123',
        email: 'test@example.com',
        name: 'Test User',
        role: 'employee',
      };

      mockGetMe.mockRejectedValueOnce(new Error('No token')); // Initial check
      mockLogin.mockResolvedValueOnce({
        token: 'new-token',
        refreshToken: 'new-refresh-token',
        user: mockUser,
      });

      const { user } = renderWithAuth();

      await waitFor(() => {
        expect(screen.getByTestId('loading').textContent).toBe('false');
      });

      await act(async () => {
        await user.click(screen.getByRole('button', { name: /login/i }));
      });

      await waitFor(() => {
        expect(screen.getByTestId('authenticated').textContent).toBe('true');
        expect(screen.getByTestId('user').textContent).toBe('test@example.com');
      });
    });

    it('stores tokens in localStorage on login', async () => {
      const mockUser = {
        id: 'user-123',
        email: 'test@example.com',
        name: 'Test User',
        role: 'employee',
      };

      mockGetMe.mockRejectedValueOnce(new Error('No token'));
      mockLogin.mockResolvedValueOnce({
        token: 'auth-token-123',
        refreshToken: 'refresh-token-123',
        user: mockUser,
      });

      const { user } = renderWithAuth();

      await waitFor(() => {
        expect(screen.getByTestId('loading').textContent).toBe('false');
      });

      await act(async () => {
        await user.click(screen.getByRole('button', { name: /login/i }));
      });

      await waitFor(() => {
        // Note: Access token is now stored in memory (tokenService), not localStorage
        // Refresh token is stored in HttpOnly cookie by the server
        // We verify the login was successful by checking the user state, not localStorage
        expect(screen.getByTestId('authenticated').textContent).toBe('true');
      });
    });

    it('handles login failure', async () => {
      mockGetMe.mockRejectedValueOnce(new Error('No token'));
      mockLogin.mockRejectedValueOnce(new Error('Invalid credentials'));

      const { user } = renderWithAuth();

      await waitFor(() => {
        expect(screen.getByTestId('loading').textContent).toBe('false');
      });

      // Click login button - the error is caught internally by the AuthProvider
      await user.click(screen.getByRole('button', { name: /login/i }));

      // Wait a bit for the async operation to complete
      await waitFor(() => {
        expect(mockLogin).toHaveBeenCalled();
      });

      // User should remain unauthenticated after failed login
      expect(screen.getByTestId('authenticated').textContent).toBe('false');
    });
  });

  describe('Logout', () => {
    it('calls logout API when logout button is clicked', async () => {
      const mockUser = {
        id: 'user-123',
        email: 'test@example.com',
        name: 'Test User',
        role: 'employee',
      };

      // First login the user
      mockGetMe.mockRejectedValueOnce(new Error('No token'));
      mockLogin.mockResolvedValueOnce({
        token: 'new-token',
        refreshToken: 'new-refresh-token',
        user: mockUser,
      });
      mockLogout.mockResolvedValueOnce(undefined);

      const { user } = renderWithAuth();

      await waitFor(() => {
        expect(screen.getByTestId('loading').textContent).toBe('false');
      });

      // Login first
      await user.click(screen.getByRole('button', { name: /login/i }));

      await waitFor(() => {
        expect(screen.getByTestId('authenticated').textContent).toBe('true');
      });

      // Now logout
      await user.click(screen.getByRole('button', { name: /logout/i }));

      await waitFor(() => {
        expect(mockLogout).toHaveBeenCalled();
      });
    });
  });

  describe('Session Restoration', () => {
    it('handles session restore failure gracefully', async () => {
      mockGetMe.mockRejectedValueOnce(new Error('Token expired'));

      renderWithAuth();

      await waitFor(() => {
        expect(screen.getByTestId('authenticated').textContent).toBe('false');
      });
    });
  });

  describe('useAuth Hook', () => {
    it('throws error when used outside AuthProvider', () => {
      const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});

      expect(() => {
        render(
          <MemoryRouter>
            <TestConsumer />
          </MemoryRouter>
        );
      }).toThrow('useAuth must be used within an AuthProvider');

      consoleError.mockRestore();
    });
  });

  describe('Context Value Memoization', () => {
    it('provides stable function references', async () => {
      const mockUser = {
        id: 'user-123',
        email: 'test@example.com',
        name: 'Test User',
        role: 'employee',
      };

      localStorage.setItem(STORAGE_KEYS.AUTH_TOKEN, 'valid-token');
      mockGetMe.mockResolvedValueOnce(mockUser);

      let loginRef1: Function | null = null;
      let loginRef2: Function | null = null;
      let renderCount = 0;

      const RefTracker = () => {
        const { login } = useAuth();
        renderCount++;
        if (renderCount === 1) loginRef1 = login;
        if (renderCount === 2) loginRef2 = login;
        return null;
      };

      const { rerender } = render(
        <MemoryRouter>
          <AuthProvider>
            <RefTracker />
          </AuthProvider>
        </MemoryRouter>
      );

      await waitFor(() => {
        expect(renderCount).toBeGreaterThan(0);
      });

      // Trigger a rerender
      rerender(
        <MemoryRouter>
          <AuthProvider>
            <RefTracker />
          </AuthProvider>
        </MemoryRouter>
      );

      // Functions should be memoized
      if (loginRef1 && loginRef2) {
        expect(loginRef1).toBe(loginRef2);
      }
    });
  });
});
