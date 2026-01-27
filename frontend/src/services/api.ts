import axios, { AxiosInstance, AxiosError, AxiosRequestConfig, InternalAxiosRequestConfig } from 'axios';
import toast from 'react-hot-toast';
import { storageService } from './storage.service';
import { tokenService } from './token.service';

/**
 * API Service with improved error handling
 *
 * Fixes:
 * - #18: Prevents 401 redirect loop on login page
 * - #19: Implements automatic token refresh
 * - #21: Debounces error toasts to prevent spam
 * - Added CSRF token handling for state-changing requests
 */

// Configuration
const API_BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:3000/api';
const API_TIMEOUT = Number(import.meta.env.VITE_API_TIMEOUT) || 30000;

// CSRF token cache
let csrfToken: string | null = null;
let csrfTokenPromise: Promise<string> | null = null;

/**
 * Fetch CSRF token from server
 * Uses a singleton promise to prevent multiple concurrent requests
 */
async function fetchCsrfToken(): Promise<string> {
  if (csrfToken) {
    return csrfToken;
  }

  if (csrfTokenPromise) {
    return csrfTokenPromise;
  }

  csrfTokenPromise = (async (): Promise<string> => {
    try {
      // Use a separate axios instance to avoid interceptor loops
      const response = await axios.get(`${API_BASE_URL}/auth/csrf-token`, {
        withCredentials: true, // Important: send cookies for CSRF
      });
      csrfToken = response.data.csrfToken;
      return csrfToken!;
    } catch (error) {
      console.error('Failed to fetch CSRF token:', error);
      throw error;
    } finally {
      csrfTokenPromise = null;
    }
  })();

  return csrfTokenPromise!;
}

/**
 * Clear cached CSRF token (call on logout or when token becomes invalid)
 */
export function clearCsrfToken(): void {
  csrfToken = null;
  csrfTokenPromise = null;
}

/**
 * Check if request method requires CSRF token
 */
function requiresCsrfToken(method: string | undefined): boolean {
  const stateChangingMethods = ['POST', 'PUT', 'PATCH', 'DELETE'];
  return stateChangingMethods.includes(method?.toUpperCase() || '');
}

// Paths that should not trigger 401 redirect (they handle auth differently)
// Includes /t/ for magic link task pages which work without authentication
const AUTH_PATHS = ['/login', '/register', '/forgot-password', '/reset-password', '/magic-link', '/join', '/auth/join-organization', '/auth/callback', '/t/'];

// Error toast debouncing
const recentErrors = new Map<string, number>();
const ERROR_DEBOUNCE_MS = 3000;

/**
 * Check if we should show an error toast (debouncing)
 */
function shouldShowErrorToast(errorKey: string): boolean {
  const now = Date.now();
  const lastShown = recentErrors.get(errorKey);

  if (lastShown && now - lastShown < ERROR_DEBOUNCE_MS) {
    return false;
  }

  recentErrors.set(errorKey, now);

  // Clean up old entries periodically
  if (recentErrors.size > 50) {
    const cutoff = now - ERROR_DEBOUNCE_MS * 2;
    for (const [key, time] of recentErrors.entries()) {
      if (time < cutoff) {
        recentErrors.delete(key);
      }
    }
  }

  return true;
}

/**
 * Show error toast with debouncing
 */
function showErrorToast(message: string, errorKey?: string): void {
  const key = errorKey || message;
  if (shouldShowErrorToast(key)) {
    toast.error(message);
  }
}

/**
 * Check if current path is an auth-related page
 */
function isAuthPage(): boolean {
  const path = window.location.pathname;
  return AUTH_PATHS.some(authPath => path.startsWith(authPath));
}

/**
 * Track if we're currently refreshing the token to prevent multiple refresh calls
 */
let isRefreshing = false;
let refreshSubscribers: Array<(token: string) => void> = [];

/**
 * Subscribe to token refresh completion
 */
function subscribeToTokenRefresh(callback: (token: string) => void): void {
  refreshSubscribers.push(callback);
}

/**
 * Notify all subscribers when token is refreshed
 */
function onTokenRefreshed(newToken: string): void {
  refreshSubscribers.forEach(callback => callback(newToken));
  refreshSubscribers = [];
}

/**
 * Attempt to refresh the access token using the refresh token
 * The refresh token is sent automatically via HttpOnly cookie
 */
async function refreshAccessToken(): Promise<string | null> {
  try {
    // Use a separate axios instance to avoid interceptor loops
    // withCredentials: true sends the HttpOnly refresh token cookie
    const response = await axios.post(
      `${API_BASE_URL}/auth/refresh`,
      {}, // Empty body - refresh token is in HttpOnly cookie
      { withCredentials: true }
    );

    // Backend returns { token, user } - refresh token is in HttpOnly cookie
    const { token } = response.data;

    // Store access token in memory (not localStorage)
    tokenService.setAccessToken(token);

    return token;
  } catch (error) {
    // Refresh failed - clear auth and redirect
    tokenService.clearAccessToken();
    return null;
  }
}

// Create axios instance
const api: AxiosInstance = axios.create({
  baseURL: API_BASE_URL,
  timeout: API_TIMEOUT,
  withCredentials: true, // Send cookies for CSRF
  headers: {
    'Content-Type': 'application/json',
  },
});

// Request interceptor to add auth token and CSRF token
api.interceptors.request.use(
  async (config: InternalAxiosRequestConfig) => {
    // Add auth token from memory (not localStorage for XSS protection)
    const token = tokenService.getAccessToken();
    if (token) {
      config.headers.Authorization = `Bearer ${token}`;
    }

    // Add CSRF token for state-changing requests
    if (requiresCsrfToken(config.method)) {
      try {
        const csrf = await fetchCsrfToken();
        config.headers['X-CSRF-Token'] = csrf;
      } catch {
        // Continue without CSRF token - server will reject if required
        console.warn('Could not fetch CSRF token, request may fail');
      }
    }

    return config;
  },
  (error) => {
    return Promise.reject(error);
  }
);

// Response interceptor for error handling
api.interceptors.response.use(
  (response) => response,
  async (error: AxiosError) => {
    const originalRequest = error.config as AxiosRequestConfig & { _retry?: boolean; _csrfRetry?: boolean };

    if (error.response) {
      const status = error.response.status;

      switch (status) {
        case 401: {
          // FIX #18: Don't redirect if already on auth page (prevents loop)
          if (isAuthPage()) {
            // On auth pages, don't show toast for refresh failures (expected when no session)
            // Only show toast for actual login/register failures
            const isRefreshEndpoint = originalRequest?.url?.includes('/auth/refresh');
            if (!isRefreshEndpoint) {
              const message = (error.response.data as { message?: string })?.message || 'Authentication failed';
              showErrorToast(message, `401-${originalRequest?.url}`);
            }
            return Promise.reject(error);
          }

          // FIX #19: Try to refresh the token before redirecting
          if (!originalRequest?._retry) {
            originalRequest._retry = true;

            if (isRefreshing) {
              // Another request is already refreshing, wait for it
              return new Promise((resolve, reject) => {
                subscribeToTokenRefresh((newToken: string) => {
                  if (originalRequest.headers) {
                    originalRequest.headers.Authorization = `Bearer ${newToken}`;
                  }
                  resolve(api(originalRequest));
                });

                // Timeout if refresh takes too long
                setTimeout(() => {
                  reject(new Error('Token refresh timeout'));
                }, 10000);
              });
            }

            isRefreshing = true;

            try {
              const newToken = await refreshAccessToken();

              if (newToken) {
                isRefreshing = false;
                onTokenRefreshed(newToken);

                // Retry the original request with new token
                if (originalRequest.headers) {
                  originalRequest.headers.Authorization = `Bearer ${newToken}`;
                }
                return api(originalRequest);
              }
            } catch {
              // Refresh failed
            }

            isRefreshing = false;
          }

          // Token refresh failed or wasn't possible - redirect to login
          tokenService.clearAccessToken();
          storageService.clearAuth(); // Also clear any remaining localStorage items
          showErrorToast('Session expired. Please login again.', '401-session-expired');

          // Use replace to prevent back button issues
          window.location.replace('/login');
          break;
        }

        case 403: {
          const errorData = error.response.data as { code?: string; message?: string; error?: string; data?: Record<string, unknown> };

          // Check if organization is suspended (e.g., trial expired)
          if (errorData.code === 'ORGANIZATION_SUSPENDED') {
            // Store suspension data for the suspended page to display
            const suspensionData = errorData.data || {};
            sessionStorage.setItem('suspension_data', JSON.stringify(suspensionData));

            // Redirect to suspended account page
            window.location.replace('/account-suspended');
            return Promise.reject(error);
          }

          // Check if it's a CSRF validation failure
          if (errorData.code === 'CSRF_VALIDATION_FAILED' && !originalRequest?._csrfRetry) {
            // Clear the cached CSRF token and retry once
            clearCsrfToken();
            originalRequest._csrfRetry = true;

            try {
              // Fetch a fresh CSRF token and retry
              const freshToken = await fetchCsrfToken();
              if (originalRequest.headers) {
                originalRequest.headers['X-CSRF-Token'] = freshToken;
              }
              return api(originalRequest);
            } catch {
              // CSRF retry failed
              showErrorToast('Session validation failed. Please refresh the page.', 'csrf-retry-failed');
            }
          } else {
            // Show actual error message from backend
            const message = errorData.message || errorData.error || 'You do not have permission to perform this action.';
            showErrorToast(message, `403-${originalRequest?.url}`);
          }
          break;
        }

        case 404:
          // Only show toast for non-expected 404s (not during page navigation)
          if (!originalRequest?.url?.includes('/check') && !originalRequest?.url?.includes('/exists')) {
            showErrorToast('Resource not found.', `404-${originalRequest?.url}`);
          }
          break;

        case 409:
          // Conflict - likely optimistic locking failure
          const conflictMessage = (error.response.data as { message?: string })?.message ||
            'This resource was modified. Please refresh and try again.';
          showErrorToast(conflictMessage, `409-${originalRequest?.url}`);
          break;

        case 429:
          showErrorToast('Too many requests. Please slow down.', '429-rate-limit');
          break;

        case 500:
        case 502:
        case 503:
        case 504:
          showErrorToast('Server error. Please try again later.', `5xx-${status}`);
          break;

        default: {
          const message = (error.response.data as { message?: string })?.message || 'An error occurred';
          showErrorToast(message, `${status}-${originalRequest?.url}`);
        }
      }
    } else if (error.request) {
      // Network error - debounce aggressively
      showErrorToast('Network error. Please check your connection.', 'network-error');
    } else {
      // Request setup error
      showErrorToast('An unexpected error occurred.', 'unexpected-error');
    }

    return Promise.reject(error);
  }
);

/**
 * Silent API call that doesn't show toasts on error
 * Useful for background polling or optional data fetching
 */
export async function silentFetch<T>(url: string, config?: AxiosRequestConfig): Promise<T | null> {
  try {
    const token = tokenService.getAccessToken();
    const response = await axios.get<T>(`${API_BASE_URL}${url}`, {
      ...config,
      withCredentials: true,
      headers: {
        ...config?.headers,
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
    });
    return response.data;
  } catch {
    return null;
  }
}

// =============================================================================
// Rubric Generation API
// =============================================================================

import { RubricStep, TaskRequirements } from '../types/rubric.types';

export interface RubricGenerationUploadResponse {
  tempVideoId: string;
}

export interface RubricGenerationResult {
  rubricSteps: RubricStep[];
  suggestedTitle: string;
  taskRequirements: TaskRequirements;
}

export type RubricGenerationStatusType =
  | 'uploaded'
  | 'transcribing'
  | 'transcription_complete'
  | 'extracting_frames'
  | 'analyzing_frames'
  | 'generating_rubric'
  | 'completed'
  | 'failed'
  | 'cancelled';

export interface RubricGenerationStatus {
  status: RubricGenerationStatusType;
  progress: number;
  message?: string;
  error?: string;
  result?: RubricGenerationResult;
}

/**
 * Rubric generation API methods
 */
export const rubricGenerationApi = {
  /**
   * Upload a video for rubric generation
   * Returns a temporary video ID to use for generation
   */
  uploadVideo: async (
    file: File,
    onProgress?: (progress: number) => void
  ): Promise<RubricGenerationUploadResponse> => {
    const formData = new FormData();
    formData.append('video', file);

    const response = await api.post('/rubric-generation/upload', formData, {
      headers: {
        'Content-Type': 'multipart/form-data',
      },
      onUploadProgress: (progressEvent) => {
        if (progressEvent.total && onProgress) {
          const percent = Math.round((progressEvent.loaded * 100) / progressEvent.total);
          onProgress(percent);
        }
      },
    });

    return response.data.data;
  },

  /**
   * Start rubric generation from an uploaded video
   */
  generateFromVideo: async (
    tempVideoId: string,
    taskType: string,
    context?: string
  ): Promise<void> => {
    await api.post('/rubric-generation/generate', {
      tempVideoId,
      taskType,
      context,
    });
  },

  /**
   * Get the status of a rubric generation job
   * The result is included in the status response when completed
   */
  getStatus: async (tempVideoId: string): Promise<RubricGenerationStatus> => {
    const response = await api.get(`/rubric-generation/${tempVideoId}/status`);
    return response.data.data;
  },

  /**
   * Delete a temporary video (cleanup)
   */
  deleteVideo: async (tempVideoId: string): Promise<void> => {
    await api.delete(`/rubric-generation/${tempVideoId}`);
  },
};

export default api;
