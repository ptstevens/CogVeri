import React, {
  createContext,
  useContext,
  useState,
  useEffect,
  useCallback,
  useMemo,
  useRef,
} from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { authService } from '../services/auth.service';
import { storageService } from '../services/storage.service';
import {
  tokenService,
  initializeTokenService,
  destroyTokenService,
} from '../services/token.service';
import { clearCsrfToken } from '../services/api';
import { setSentryUser, clearSentryUser } from '../config/sentry';
import toast from 'react-hot-toast';

// Auth pages where we don't need to attempt session restoration
const AUTH_PAGES = [
  '/login',
  '/register',
  '/forgot-password',
  '/reset-password',
  '/magic-link',
  '/join',
  '/auth/join-organization',
  '/auth/callback',
];

interface User {
  id: string;
  email: string;
  name: string;
  role: string;
  avatar?: string | null;
  department?: string | null;
  jobTitle?: string | null;
  phone?: string | null;
  bio?: string | null;
  is_system_admin?: boolean;
  system_role?: 'SUPER_ADMIN' | 'ADMIN' | 'SUPPORT' | 'USER' | null;
  organization_id?: string | null;
  org_role?: string | null;
  [key: string]: unknown;
}

interface AuthContextType {
  user: User | null;
  isLoading: boolean;
  isAuthenticated: boolean;
  login: (email: string, password: string) => Promise<void>;
  loginWithSSO: () => Promise<void>;
  logout: () => Promise<void>;
  refreshToken: () => Promise<void>;
  updateUser: (userData: Partial<User>) => void;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};

interface AuthProviderProps {
  children: React.ReactNode;
}

export const AuthProvider: React.FC<AuthProviderProps> = ({ children }) => {
  const [user, setUser] = useState<User | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const navigate = useNavigate();
  const location = useLocation();

  // FIX #20: Track mounted state to prevent memory leak from async operations
  const isMountedRef = useRef(true);

  // Helper to safely set state only if component is mounted
  const safeSetUser = useCallback(
    (userData: User | null | ((prev: User | null) => User | null)) => {
      if (isMountedRef.current) {
        setUser(userData);
      }
    },
    []
  );

  const safeSetIsLoading = useCallback((loading: boolean) => {
    if (isMountedRef.current) {
      setIsLoading(loading);
    }
  }, []);

  // Capture initial pathname to check if we're on an auth page at mount time
  // This prevents the race condition where navigating from /auth/callback to /dashboard
  // would re-run checkAuth and potentially clear user state
  const initialPathnameRef = useRef(location.pathname);

  // Check for existing session on mount only (not on pathname changes)
  useEffect(() => {
    // Mark as mounted
    isMountedRef.current = true;

    // Initialize cross-tab logout synchronization
    initializeTokenService(() => {
      // Called when another tab logs out
      if (isMountedRef.current) {
        setUser(null);
        clearSentryUser();
        navigate('/login');
      }
    });

    const checkAuth = async () => {
      try {
        // Check if we started on an auth page - don't attempt refresh there
        // Users on login/register pages don't need session restoration
        // Use the initial pathname captured at mount time to avoid race conditions
        const isAuthPage = AUTH_PAGES.some((page) => initialPathnameRef.current.startsWith(page));

        // First check if we have a token in memory
        let token = tokenService.getAccessToken();

        // If no token in memory and NOT on an auth page, try to refresh from HttpOnly cookie
        if (!token && !isAuthPage) {
          // Attempt to get a new access token using the refresh token cookie
          try {
            const response = await authService.refreshToken();
            token = response?.token || null;
            if (token) {
              tokenService.setAccessToken(token);
            }
          } catch {
            // No valid refresh token, user needs to login
            token = null;
          }
        }

        if (token) {
          const userData = await authService.getMe();

          // Only update state if still mounted
          if (isMountedRef.current) {
            setUser(userData as User);
            setSentryUser({
              id: userData.id,
              email: userData.email,
              name: userData.name,
              organizationId: userData.organization_id ?? undefined,
              role: userData.role,
            });
          }
        }
      } catch {
        // Token is invalid, clear it
        tokenService.clearAccessToken();
        storageService.clearAuth();
        clearSentryUser();
      } finally {
        // Only update state if still mounted
        if (isMountedRef.current) {
          setIsLoading(false);
        }
      }
    };

    checkAuth();

    // Cleanup function to mark as unmounted and destroy token service
    return () => {
      isMountedRef.current = false;
      destroyTokenService();
    };
    // Only run on mount - removing location.pathname prevents race condition
    // where navigating after OAuth would re-trigger checkAuth
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [navigate]);

  const login = useCallback(
    async (email: string, password: string) => {
      try {
        safeSetIsLoading(true);
        const response = await authService.login(email, password);

        // Store access token in memory (XSS protection)
        // Refresh token is now in HttpOnly cookie (set by server)
        tokenService.setAccessToken(response.token);

        safeSetUser(response.user as User);

        // Set Sentry user context on login
        setSentryUser({
          id: response.user.id,
          email: response.user.email,
          name: response.user.name,
          organizationId: response.user.organization_id ?? undefined,
          role: response.user.role,
        });

        navigate('/dashboard');
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'Login failed';
        toast.error(errorMessage);
        throw error;
      } finally {
        safeSetIsLoading(false);
      }
    },
    [navigate, safeSetUser, safeSetIsLoading]
  );

  const loginWithSSO = useCallback(async () => {
    try {
      safeSetIsLoading(true);
      // Redirect to SSO provider
      window.location.href = `${import.meta.env.VITE_API_URL}/auth/sso/login`;
    } catch {
      toast.error('SSO login failed');
    } finally {
      safeSetIsLoading(false);
    }
  }, [safeSetIsLoading]);

  const logout = useCallback(async () => {
    try {
      // Server will clear the HttpOnly refresh token cookie
      await authService.logout();
    } catch {
      // Continue with logout even if API call fails
    } finally {
      // Clear access token from memory and broadcast to other tabs
      tokenService.clearAccessToken();
      // Clear any remaining localStorage items
      storageService.clearAuth();
      clearCsrfToken();
      safeSetUser(null);
      clearSentryUser();
      navigate('/login');
    }
  }, [navigate, safeSetUser]);

  const refreshToken = useCallback(async () => {
    try {
      // Refresh token is now sent automatically via HttpOnly cookie
      const response = await authService.refreshToken();

      // Store new access token in memory
      tokenService.setAccessToken(response.token);

      safeSetUser(response.user as User);
    } catch (error) {
      // Refresh failed, logout user
      await logout();
      throw error;
    }
  }, [logout, safeSetUser]);

  // Allow updating or setting user data
  // Can be used for profile edits (partial update) or initial login (full user object)
  const updateUser = useCallback(
    (userData: Partial<User>) => {
      safeSetUser((prevUser) => {
        // If no previous user, treat userData as the full user object (initial login)
        // If there is a previous user, merge with existing data (profile update)
        const updated = prevUser ? { ...prevUser, ...userData } : (userData as User);

        // Update Sentry context
        setSentryUser({
          id: updated.id,
          email: updated.email,
          name: updated.name,
          organizationId: updated.organization_id ?? undefined,
          role: updated.role,
        });

        return updated;
      });
    },
    [safeSetUser]
  );

  // Memoize context value to prevent unnecessary re-renders
  const value = useMemo(
    () => ({
      user,
      isLoading,
      isAuthenticated: !!user,
      login,
      loginWithSSO,
      logout,
      refreshToken,
      updateUser,
    }),
    [user, isLoading, login, loginWithSSO, logout, refreshToken, updateUser]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};
