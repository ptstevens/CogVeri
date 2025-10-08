import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { authService } from '../services/auth.service';
import toast from 'react-hot-toast';

interface User {
  id: string;
  email: string;
  name: string;
  role: 'employee' | 'manager' | 'reviewer' | 'admin';
  avatar?: string;
  department?: string;
  jobTitle?: string;
  phone?: string;
  bio?: string;
}

interface AuthContextType {
  user: User | null;
  isLoading: boolean;
  isAuthenticated: boolean;
  login: (email: string, password: string) => Promise<void>;
  loginWithSSO: () => Promise<void>;
  logout: () => Promise<void>;
  refreshToken: () => Promise<void>;
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

  // Check for existing session on mount
  useEffect(() => {
    const checkAuth = async () => {
      try {
        const token = localStorage.getItem(import.meta.env.VITE_AUTH_TOKEN_KEY || 'relay_auth_token');

        if (token) {
          const userData = await authService.getMe();
          setUser(userData);
        }
      } catch (error) {
        // Token is invalid, clear it
        localStorage.removeItem(import.meta.env.VITE_AUTH_TOKEN_KEY || 'relay_auth_token');
        localStorage.removeItem(import.meta.env.VITE_AUTH_REFRESH_TOKEN_KEY || 'relay_refresh_token');
      } finally {
        setIsLoading(false);
      }
    };

    checkAuth();
  }, []);

  const login = useCallback(async (email: string, password: string) => {
    try {
      setIsLoading(true);
      const response = await authService.login(email, password);

      // Store tokens
      localStorage.setItem(
        import.meta.env.VITE_AUTH_TOKEN_KEY || 'relay_auth_token',
        response.token
      );
      localStorage.setItem(
        import.meta.env.VITE_AUTH_REFRESH_TOKEN_KEY || 'relay_refresh_token',
        response.refreshToken
      );

      setUser(response.user);
      toast.success('Login successful!');
      navigate('/dashboard');
    } catch (error: any) {
      toast.error(error.message || 'Login failed');
      throw error;
    } finally {
      setIsLoading(false);
    }
  }, [navigate]);

  const loginWithSSO = useCallback(async () => {
    try {
      setIsLoading(true);
      // Redirect to SSO provider
      window.location.href = `${import.meta.env.VITE_API_URL}/auth/sso/login`;
    } catch (error: any) {
      toast.error('SSO login failed');
      throw error;
    } finally {
      setIsLoading(false);
    }
  }, []);

  const logout = useCallback(async () => {
    try {
      await authService.logout();
    } catch (error) {
      // Log error but continue with logout
      console.error('Logout error:', error);
    } finally {
      // Clear tokens and user data
      localStorage.removeItem(import.meta.env.VITE_AUTH_TOKEN_KEY || 'relay_auth_token');
      localStorage.removeItem(import.meta.env.VITE_AUTH_REFRESH_TOKEN_KEY || 'relay_refresh_token');
      setUser(null);
      navigate('/login');
      toast.success('Logged out successfully');
    }
  }, [navigate]);

  const refreshToken = useCallback(async () => {
    try {
      const refreshToken = localStorage.getItem(
        import.meta.env.VITE_AUTH_REFRESH_TOKEN_KEY || 'relay_refresh_token'
      );

      if (!refreshToken) {
        throw new Error('No refresh token available');
      }

      const response = await authService.refreshToken(refreshToken);

      // Update tokens
      localStorage.setItem(
        import.meta.env.VITE_AUTH_TOKEN_KEY || 'relay_auth_token',
        response.token
      );
      localStorage.setItem(
        import.meta.env.VITE_AUTH_REFRESH_TOKEN_KEY || 'relay_refresh_token',
        response.refreshToken
      );

      setUser(response.user);
    } catch (error) {
      // Refresh failed, logout user
      await logout();
      throw error;
    }
  }, [logout]);

  const value = {
    user,
    isLoading,
    isAuthenticated: !!user,
    login,
    loginWithSSO,
    logout,
    refreshToken,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};