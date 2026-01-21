import { useEffect, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useAuth } from '../../contexts/AuthContext';
import axios from 'axios';
import api from '../../services/api';
import toast from 'react-hot-toast';
import LoadingSpinner from '../../components/ui/LoadingSpinner';
import Button from '../../components/ui/Button';
import Card from '../../components/ui/Card';
import GoogleSignInButton from '../../components/ui/GoogleSignInButton';
import OAuthPrivacyNotice from '../../components/ui/OAuthPrivacyNotice';
import { tokenService } from '../../services/token.service';

interface InvitationInfo {
  email: string;
  role: string;
  organizationName: string;
  organizationId: string;
}

/**
 * Join Organization Page
 * Handles invitation acceptance flow:
 * 1. If not logged in -> show registration form OR login option
 * 2. If logged in -> validate token and accept invitation
 * 3. Show success and redirect to dashboard
 */
const JoinOrganization = () => {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const { user, isAuthenticated, isLoading: authLoading, logout } = useAuth();
  const [status, setStatus] = useState<'loading' | 'success' | 'error' | 'login_required'>('loading');
  const [message, setMessage] = useState('');
  const [_orgName, setOrgName] = useState('');
  const [invitationInfo, setInvitationInfo] = useState<InvitationInfo | null>(null);
  const [isEmailMismatch, setIsEmailMismatch] = useState(false);

  // Registration form state
  const [formData, setFormData] = useState({
    name: '',
    password: '',
    confirmPassword: '',
  });
  const [formErrors, setFormErrors] = useState<Record<string, string>>({});
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isGoogleLoading, setIsGoogleLoading] = useState(false);

  const token = searchParams.get('token');
  const apiUrl = import.meta.env.VITE_API_URL || 'http://localhost:3001/api';

  useEffect(() => {
    const processInvitation = async () => {
      if (!token) {
        setStatus('error');
        setMessage('Invalid invitation link. No token provided.');
        return;
      }

      // Wait for auth to finish loading
      if (authLoading) {
        return;
      }

      // First, validate the token to get invitation info (needed for both flows)
      try {
        const validateResponse = await axios.get(
          `${apiUrl}/invitations/v2/validate/${token}`
        );

        const { valid, error, organizationName, organizationId, invitation } = validateResponse.data;

        if (!valid) {
          setStatus('error');
          setMessage(error || 'Invalid invitation token');
          return;
        }

        // Store invitation info for the registration form
        setInvitationInfo({
          email: invitation?.email || '',
          role: invitation?.role || 'limited',
          organizationName,
          organizationId,
        });
        setOrgName(organizationName);

        // If not authenticated, show registration form
        if (!isAuthenticated) {
          setStatus('login_required');
          return;
        }

        // User is authenticated - check if their email matches the invitation
        if (user?.email && invitation?.email &&
            user.email.toLowerCase() !== invitation.email.toLowerCase()) {
          setIsEmailMismatch(true);
          setStatus('error');
          setMessage(
            `This invitation was sent to ${invitation.email}, but you're signed in as ${user.email}.`
          );
          return;
        }

        // User is authenticated and email matches, try to accept the invitation
        setStatus('loading');

        // Accept the invitation using api client (includes CSRF token)
        await api.post(
          `/organizations/${organizationId}/members/accept-invitation`,
          { invitationToken: token }
        );

        setStatus('success');
        setMessage(`You've successfully joined ${organizationName}!`);

        // Redirect to dashboard after a short delay
        setTimeout(() => {
          // Force a page reload to refresh organization context
          window.location.href = '/dashboard';
        }, 2000);

      } catch (error: any) {
        setStatus('error');

        const errorMessage = error.response?.data?.error || error.response?.data?.message;

        if (errorMessage?.includes('expired')) {
          setMessage('This invitation has expired. Please ask for a new invitation.');
        } else if (errorMessage?.includes('already a member')) {
          setMessage('You are already a member of this organization.');
          setTimeout(() => navigate('/dashboard'), 2000);
        } else if (errorMessage?.includes('not found')) {
          setMessage('This invitation is no longer valid.');
        } else {
          setMessage(errorMessage || 'Failed to accept invitation. Please try again.');
        }
      }
    };

    processInvitation();
  }, [token, isAuthenticated, authLoading, navigate, apiUrl]);

  const handleLoginRedirect = () => {
    // Redirect to login with return URL
    const returnUrl = `/auth/join-organization?token=${token}`;
    navigate(`/login?returnUrl=${encodeURIComponent(returnUrl)}`);
  };

  const handleGoogleSignup = () => {
    setIsGoogleLoading(true);
    // Redirect to backend Google OAuth endpoint with signup mode and return URL
    const returnUrl = `/auth/join-organization?token=${token}`;
    window.location.href = `${apiUrl}/auth/google?mode=signup&returnUrl=${encodeURIComponent(returnUrl)}`;
  };

  const handleFormChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value } = e.target;
    setFormData(prev => ({ ...prev, [name]: value }));
    // Clear error for this field when user types
    if (formErrors[name]) {
      setFormErrors(prev => ({ ...prev, [name]: '' }));
    }
  };

  const validateForm = (): boolean => {
    const errors: Record<string, string> = {};

    if (!formData.name.trim()) {
      errors.name = 'Name is required';
    }

    if (!formData.password) {
      errors.password = 'Password is required';
    } else if (formData.password.length < 8) {
      errors.password = 'Password must be at least 8 characters';
    }

    if (!formData.confirmPassword) {
      errors.confirmPassword = 'Please confirm your password';
    } else if (formData.password !== formData.confirmPassword) {
      errors.confirmPassword = 'Passwords do not match';
    }

    setFormErrors(errors);
    return Object.keys(errors).length === 0;
  };

  const handleRegisterSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!validateForm() || !invitationInfo || !token) {
      return;
    }

    setIsSubmitting(true);

    try {
      const response = await axios.post(`${apiUrl}/auth/register-for-invitation`, {
        email: invitationInfo.email,
        password: formData.password,
        name: formData.name,
        invitationToken: token,
      });

      // Store access token in memory (refresh token is set via HttpOnly cookie by backend)
      tokenService.setAccessToken(response.data.token);

      setStatus('success');
      setMessage(`You've successfully joined ${invitationInfo.organizationName}!`);

      // Redirect to dashboard after a short delay
      setTimeout(() => {
        window.location.href = '/dashboard';
      }, 1500);
    } catch (error: any) {
      const errorMessage = error.response?.data?.message || error.response?.data?.error;

      if (errorMessage?.includes('already exists')) {
        toast.error('An account with this email already exists. Please sign in instead.');
        setFormErrors({ general: 'An account with this email already exists. Please sign in instead.' });
      } else {
        toast.error(errorMessage || 'Registration failed. Please try again.');
        setFormErrors({ general: errorMessage || 'Registration failed. Please try again.' });
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  // Loading state
  if (status === 'loading' || authLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-slate-50 via-blue-50/30 to-indigo-50/30">
        <div className="text-center p-8 bg-white rounded-2xl shadow-lg">
          <LoadingSpinner />
          <p className="mt-4 text-slate-600">Processing invitation...</p>
        </div>
      </div>
    );
  }

  // Login required state - show registration form
  if (status === 'login_required') {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-slate-50 via-blue-50/30 to-indigo-50/30 p-4">
        <div className="w-full max-w-md">
          {/* Header */}
          <div className="text-center mb-6">
            <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-indigo-100 flex items-center justify-center">
              <svg className="w-8 h-8 text-indigo-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M18 9v3m0 0v3m0-3h3m-3 0h-3m-2-5a4 4 0 11-8 0 4 4 0 018 0zM3 20a6 6 0 0112 0v1H3v-1z" />
              </svg>
            </div>
            <h2 className="text-2xl font-semibold text-slate-900">You're Invited!</h2>
            {invitationInfo && (
              <p className="text-slate-600 mt-2">
                Join <span className="font-semibold text-indigo-600">{invitationInfo.organizationName}</span>
              </p>
            )}
          </div>

          <Card className="p-6">
            {/* Google Sign-Up Button with Privacy Notice */}
            <div className="mb-6 space-y-4">
              <GoogleSignInButton
                variant="continue"
                isLoading={isGoogleLoading}
                onClick={handleGoogleSignup}
              />
              <OAuthPrivacyNotice compact />
            </div>

            <div className="relative mb-6">
              <div className="absolute inset-0 flex items-center">
                <div className="w-full border-t border-gray-300" />
              </div>
              <div className="relative flex justify-center text-sm">
                <span className="px-2 bg-white text-gray-500">Or create account with email</span>
              </div>
            </div>

            {/* Registration Form */}
            <form onSubmit={handleRegisterSubmit} className="space-y-4">
              {/* Email - Read Only (from invitation) */}
              <div>
                <label htmlFor="email" className="block text-sm font-medium text-gray-700 mb-1">
                  Email
                </label>
                <input
                  id="email"
                  type="email"
                  value={invitationInfo?.email || ''}
                  readOnly
                  className="w-full px-3 py-2 border border-gray-200 rounded-lg bg-gray-50 text-gray-600 cursor-not-allowed"
                />
                <p className="text-xs text-gray-500 mt-1">
                  This email was used for the invitation
                </p>
              </div>

              {/* Name */}
              <div>
                <label htmlFor="name" className="block text-sm font-medium text-gray-700 mb-1">
                  Full Name
                </label>
                <input
                  id="name"
                  name="name"
                  type="text"
                  value={formData.name}
                  onChange={handleFormChange}
                  placeholder="John Doe"
                  className={`w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-transparent ${
                    formErrors.name ? 'border-red-500' : 'border-gray-300'
                  }`}
                />
                {formErrors.name && (
                  <p className="text-xs text-red-600 mt-1">{formErrors.name}</p>
                )}
              </div>

              {/* Password */}
              <div>
                <label htmlFor="password" className="block text-sm font-medium text-gray-700 mb-1">
                  Password
                </label>
                <input
                  id="password"
                  name="password"
                  type="password"
                  value={formData.password}
                  onChange={handleFormChange}
                  placeholder="••••••••"
                  className={`w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-transparent ${
                    formErrors.password ? 'border-red-500' : 'border-gray-300'
                  }`}
                />
                {formErrors.password && (
                  <p className="text-xs text-red-600 mt-1">{formErrors.password}</p>
                )}
              </div>

              {/* Confirm Password */}
              <div>
                <label htmlFor="confirmPassword" className="block text-sm font-medium text-gray-700 mb-1">
                  Confirm Password
                </label>
                <input
                  id="confirmPassword"
                  name="confirmPassword"
                  type="password"
                  value={formData.confirmPassword}
                  onChange={handleFormChange}
                  placeholder="••••••••"
                  className={`w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-transparent ${
                    formErrors.confirmPassword ? 'border-red-500' : 'border-gray-300'
                  }`}
                />
                {formErrors.confirmPassword && (
                  <p className="text-xs text-red-600 mt-1">{formErrors.confirmPassword}</p>
                )}
              </div>

              {/* General Error */}
              {formErrors.general && (
                <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">
                  {formErrors.general}
                </div>
              )}

              {/* Submit Button */}
              <Button type="submit" fullWidth disabled={isSubmitting}>
                {isSubmitting ? 'Creating Account...' : 'Create Account & Join'}
              </Button>
            </form>

            {/* Already have an account */}
            <div className="mt-6 text-center">
              <p className="text-sm text-gray-600">
                Already have an account?{' '}
                <button
                  type="button"
                  onClick={handleLoginRedirect}
                  className="text-indigo-600 hover:text-indigo-700 font-medium"
                >
                  Sign in instead
                </button>
              </p>
            </div>
          </Card>
        </div>
      </div>
    );
  }

  // Success state
  if (status === 'success') {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-slate-50 via-blue-50/30 to-indigo-50/30">
        <div className="text-center p-8 bg-white rounded-2xl shadow-lg max-w-md">
          <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-green-100 flex items-center justify-center">
            <svg className="w-8 h-8 text-green-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
            </svg>
          </div>
          <h2 className="text-2xl font-semibold text-slate-900 mb-2">Welcome!</h2>
          <p className="text-slate-600 mb-4">{message}</p>
          <p className="text-sm text-slate-500">Redirecting to dashboard...</p>
        </div>
      </div>
    );
  }

  // Handle sign out for email mismatch
  const handleSignOut = async () => {
    await logout();
    // After logout, the page will re-render and show the registration form
    setIsEmailMismatch(false);
    setStatus('loading');
  };

  // Error state
  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-slate-50 via-blue-50/30 to-indigo-50/30 p-4">
      <div className="text-center p-8 bg-white rounded-2xl shadow-lg max-w-md w-full">
        <div className={`w-16 h-16 mx-auto mb-4 rounded-full flex items-center justify-center ${
          isEmailMismatch ? 'bg-amber-100' : 'bg-red-100'
        }`}>
          {isEmailMismatch ? (
            <svg className="w-8 h-8 text-amber-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
            </svg>
          ) : (
            <svg className="w-8 h-8 text-red-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          )}
        </div>
        <h2 className="text-xl font-semibold text-slate-900 mb-2">
          {isEmailMismatch ? 'Wrong Account' : 'Invitation Error'}
        </h2>
        <p className="text-slate-600 mb-6">{message}</p>

        {isEmailMismatch ? (
          <div className="space-y-3">
            <Button onClick={handleSignOut} fullWidth>
              Sign Out & Use Correct Email
            </Button>
            <Button onClick={() => navigate('/dashboard')} variant="secondary" fullWidth>
              Go to Dashboard
            </Button>
          </div>
        ) : (
          <Button onClick={() => navigate('/dashboard')} fullWidth>
            Go to Dashboard
          </Button>
        )}
      </div>
    </div>
  );
};

export default JoinOrganization;
