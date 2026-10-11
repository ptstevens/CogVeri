import { useEffect, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useAuth } from '../../contexts/AuthContext';
import { tokenService } from '../../services/token.service';
import { authService } from '../../services/auth.service';
import LoadingSpinner from '../../components/ui/LoadingSpinner';
import toast from 'react-hot-toast';

/**
 * OAuth Callback Page
 * Handles the redirect from OAuth providers (Google, etc.)
 * Extracts access token from URL and stores in memory
 * Refresh token is now set via HttpOnly cookie by the backend
 */
const OAuthCallback = () => {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const { updateUser } = useAuth();
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const handleCallback = async () => {
      // Get access token and metadata from URL
      const token = searchParams.get('token');
      const returnUrl = searchParams.get('returnUrl') || '/dashboard';
      // isNewUser available for future use (e.g., onboarding flow)
      searchParams.get('isNewUser');
      const errorParam = searchParams.get('error');
      const errorMessage = searchParams.get('message');

      // Handle errors
      if (errorParam) {
        setError(errorMessage || 'Authentication failed');
        toast.error(errorMessage || 'Authentication failed');
        setTimeout(() => navigate('/login'), 3000);
        return;
      }

      // Validate access token (refresh token is now in HttpOnly cookie)
      if (!token) {
        setError('Invalid authentication response');
        toast.error('Invalid authentication response');
        setTimeout(() => navigate('/login'), 3000);
        return;
      }

      try {
        // Store access token in memory (XSS protection)
        // Refresh token is set as HttpOnly cookie by the backend
        tokenService.setAccessToken(token);

        // Fetch user data to complete authentication
        const userData = await authService.getMe();
        // Cast to User type since we're setting the full user object
        updateUser(userData as Parameters<typeof updateUser>[0]);

        // Redirect to intended destination
        navigate(returnUrl, { replace: true });
      } catch (err) {
        tokenService.clearAccessToken();
        setError('Failed to complete authentication');
        toast.error('Failed to complete authentication');
        setTimeout(() => navigate('/login'), 3000);
      }
    };

    handleCallback();
  }, [searchParams, navigate, updateUser]);

  if (error) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-slate-50 via-blue-50/30 to-teal-50/30">
        <div className="text-center p-8 bg-white rounded-2xl shadow-lg max-w-md">
          <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-red-100 flex items-center justify-center">
            <svg
              className="w-8 h-8 text-red-500"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M6 18L18 6M6 6l12 12"
              />
            </svg>
          </div>
          <h2 className="text-xl font-semibold text-slate-900 mb-2">Authentication Failed</h2>
          <p className="text-slate-600 mb-4">{error}</p>
          <p className="text-sm text-slate-500">Redirecting to login...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-slate-50 via-blue-50/30 to-teal-50/30">
      <div className="text-center p-8 bg-white rounded-2xl shadow-lg">
        <LoadingSpinner />
        <p className="mt-4 text-slate-600">Completing sign in...</p>
      </div>
    </div>
  );
};

export default OAuthCallback;
