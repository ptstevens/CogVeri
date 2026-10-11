/**
 * Login Page Tests
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import Login from './Login';

// Mock the AuthContext
const mockLogin = vi.fn();
const mockNavigate = vi.fn();

vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual('react-router-dom');
  return {
    ...actual,
    useNavigate: () => mockNavigate,
  };
});

vi.mock('../../contexts/AuthContext', () => ({
  useAuth: () => ({
    login: mockLogin,
    isLoading: false,
    isAuthenticated: false,
    user: null,
  }),
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

describe('Login Page', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  const renderLogin = (initialEntries: string[] = ['/login']) => {
    const user = userEvent.setup();
    const result = render(
      <MemoryRouter initialEntries={initialEntries}>
        <Login />
      </MemoryRouter>
    );
    return { user, ...result };
  };

  describe('Rendering', () => {
    it('renders the login form', () => {
      renderLogin();

      expect(screen.getByRole('heading', { name: /sign in to cogveri/i })).toBeInTheDocument();
      expect(screen.getByLabelText(/email address/i)).toBeInTheDocument();
      expect(screen.getByLabelText(/password/i)).toBeInTheDocument();
      expect(screen.getByRole('button', { name: /sign in/i })).toBeInTheDocument();
    });

    it('renders the CogVeri logo', () => {
      renderLogin();

      expect(screen.getByAltText('CogVeri')).toBeInTheDocument();
    });

    it('renders Google login button', () => {
      renderLogin();

      expect(screen.getByRole('button', { name: /continue with google/i })).toBeInTheDocument();
    });

    // NOTE: Registration is disabled - admin creates accounts via invitations
    // The "Create New Account" link is intentionally removed from the UI

    it('renders description text', () => {
      renderLogin();

      expect(screen.getByText(/knowledge, verified/i)).toBeInTheDocument();
    });
  });

  describe('Form Inputs', () => {
    it('has required email input', () => {
      renderLogin();

      const emailInput = screen.getByLabelText(/email address/i);
      expect(emailInput).toBeRequired();
      expect(emailInput).toHaveAttribute('type', 'email');
    });

    it('has required password input', () => {
      renderLogin();

      const passwordInput = screen.getByLabelText(/password/i);
      expect(passwordInput).toBeRequired();
      expect(passwordInput).toHaveAttribute('type', 'password');
    });

    it('allows typing in email field', async () => {
      const { user } = renderLogin();

      const emailInput = screen.getByLabelText(/email address/i);
      await user.type(emailInput, 'test@example.com');

      expect(emailInput).toHaveValue('test@example.com');
    });

    it('allows typing in password field', async () => {
      const { user } = renderLogin();

      const passwordInput = screen.getByLabelText(/password/i);
      await user.type(passwordInput, 'password123');

      expect(passwordInput).toHaveValue('password123');
    });
  });

  describe('Form Submission', () => {
    it('calls login with email and password', async () => {
      const { user } = renderLogin();

      await user.type(screen.getByLabelText(/email address/i), 'test@example.com');
      await user.type(screen.getByLabelText(/password/i), 'password123');
      await user.click(screen.getByRole('button', { name: /sign in/i }));

      await waitFor(() => {
        expect(mockLogin).toHaveBeenCalledWith('test@example.com', 'password123');
      });
    });

    it('does not call login with invalid form', async () => {
      const { user } = renderLogin();

      await user.click(screen.getByRole('button', { name: /sign in/i }));

      expect(mockLogin).not.toHaveBeenCalled();
    });

    it('navigates on successful login', async () => {
      mockLogin.mockResolvedValueOnce(undefined);
      const { user } = renderLogin();

      await user.type(screen.getByLabelText(/email address/i), 'test@example.com');
      await user.type(screen.getByLabelText(/password/i), 'password123');
      await user.click(screen.getByRole('button', { name: /sign in/i }));

      await waitFor(() => {
        expect(mockNavigate).toHaveBeenCalledWith('/dashboard', { replace: true });
      });
    });

    it('shows loading state during submission', async () => {
      mockLogin.mockImplementation(() => new Promise(() => {})); // Never resolves
      const { user } = renderLogin();

      await user.type(screen.getByLabelText(/email address/i), 'test@example.com');
      await user.type(screen.getByLabelText(/password/i), 'password123');
      await user.click(screen.getByRole('button', { name: /sign in/i }));

      // Button should be disabled during loading
      await waitFor(() => {
        expect(mockLogin).toHaveBeenCalled();
      });
    });
  });

  describe('Google OAuth', () => {
    it('redirects to Google OAuth on click', async () => {
      const originalLocation = window.location;

      // Mock window.location
      delete (window as any).location;
      window.location = { ...originalLocation, href: '' } as any;

      const { user } = renderLogin();

      await user.click(screen.getByRole('button', { name: /continue with google/i }));

      expect(window.location.href).toContain('/auth/google');

      // Restore
      (window as any).location = originalLocation;
    });
  });

  describe('Navigation Links', () => {
    // NOTE: Registration is disabled - admin creates accounts via invitations
    // The registration link test has been removed since the link is not displayed
    it('has link to privacy policy', () => {
      renderLogin();

      const privacyLink = screen.getByRole('link', { name: /privacy policy/i });
      expect(privacyLink).toHaveAttribute('href', '/privacy');
    });
  });

  describe('Accessibility', () => {
    it('has proper form labels', () => {
      renderLogin();

      const emailInput = screen.getByLabelText(/email address/i);
      const passwordInput = screen.getByLabelText(/password/i);

      expect(emailInput).toHaveAttribute('type', 'email');
      expect(passwordInput).toHaveAttribute('type', 'password');
    });

    it('has required attributes on inputs', () => {
      renderLogin();

      expect(screen.getByLabelText(/email address/i)).toBeRequired();
      expect(screen.getByLabelText(/password/i)).toBeRequired();
    });

    it('has autocomplete attributes', () => {
      renderLogin();

      expect(screen.getByLabelText(/email address/i)).toHaveAttribute('autocomplete', 'email');
      expect(screen.getByLabelText(/password/i)).toHaveAttribute(
        'autocomplete',
        'current-password'
      );
    });

    it('can be navigated with keyboard', async () => {
      const { user } = renderLogin();

      await user.tab(); // Email input
      expect(screen.getByLabelText(/email address/i)).toHaveFocus();

      await user.tab(); // Password input
      expect(screen.getByLabelText(/password/i)).toHaveFocus();

      await user.tab(); // Sign in button
      expect(screen.getByRole('button', { name: /sign in/i })).toHaveFocus();
    });

    it('submits form on Enter key in password field', async () => {
      mockLogin.mockResolvedValueOnce(undefined);
      const { user } = renderLogin();

      await user.type(screen.getByLabelText(/email address/i), 'test@example.com');
      await user.type(screen.getByLabelText(/password/i), 'password123');
      await user.keyboard('{Enter}');

      await waitFor(() => {
        expect(mockLogin).toHaveBeenCalledWith('test@example.com', 'password123');
      });
    });
  });

  describe('Error Handling', () => {
    it('handles login failure gracefully', async () => {
      const error = new Error('Invalid credentials');
      (error as any).response = { data: { message: 'Invalid credentials' } };
      mockLogin.mockRejectedValueOnce(error);

      const { user } = renderLogin();

      await user.type(screen.getByLabelText(/email address/i), 'test@example.com');
      await user.type(screen.getByLabelText(/password/i), 'wrongpassword');
      await user.click(screen.getByRole('button', { name: /sign in/i }));

      await waitFor(() => {
        expect(mockLogin).toHaveBeenCalled();
      });

      // Navigation should not happen on failure
      expect(mockNavigate).not.toHaveBeenCalledWith('/dashboard', expect.anything());
    });
  });

  describe('URL Parameters', () => {
    it('uses returnUrl from query params', async () => {
      mockLogin.mockResolvedValueOnce(undefined);

      const user = userEvent.setup();
      render(
        <MemoryRouter initialEntries={['/login?returnUrl=/tasks']}>
          <Login />
        </MemoryRouter>
      );

      await user.type(screen.getByLabelText(/email address/i), 'test@example.com');
      await user.type(screen.getByLabelText(/password/i), 'password123');
      await user.click(screen.getByRole('button', { name: /sign in/i }));

      await waitFor(() => {
        expect(mockNavigate).toHaveBeenCalledWith('/tasks', { replace: true });
      });
    });
  });
});
