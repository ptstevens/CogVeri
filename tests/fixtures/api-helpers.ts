/**
 * API Test Helpers
 *
 * Utility functions for making authenticated API requests in E2E tests.
 * These helpers simplify API testing by handling auth tokens automatically.
 *
 * Supports multiple environments via TEST_ENV:
 * - local: ${getBackendUrl()}
 * - staging: STAGING_BACKEND_URL or https://staging-api.cogveri.app
 * - production: PROD_BACKEND_URL or https://api.cogveri.app
 */

import { Page, APIRequestContext, expect } from '@playwright/test';
import { API_ENDPOINTS, TIMEOUTS } from './test-data';

// ============================================================================
// ENVIRONMENT CONFIGURATION
// ============================================================================

const TEST_ENV = process.env.TEST_ENV || 'local';

const BACKEND_URLS: Record<string, string> = {
  local: 'http://localhost:3000',
  staging: process.env.STAGING_BACKEND_URL || 'http://api-staging.cogveri.com',
  production: process.env.PROD_BACKEND_URL || 'https://api.cogveri.com',
};

const FRONTEND_URLS: Record<string, string> = {
  local: 'http://localhost:5173',
  staging: process.env.STAGING_FRONTEND_URL || 'https://staging.cogveri.com',
  production: process.env.PROD_FRONTEND_URL || 'https://cogveri.com',
};

/**
 * Get the backend URL for the current test environment
 */
export function getBackendUrl(): string {
  return BACKEND_URLS[TEST_ENV] || BACKEND_URLS.local;
}

/**
 * Get the frontend URL for the current test environment
 */
export function getFrontendUrl(): string {
  return FRONTEND_URLS[TEST_ENV] || FRONTEND_URLS.local;
}

// ============================================================================
// AUTH TOKEN MANAGEMENT
// ============================================================================

const TOKEN_KEYS = [
  'cogveri_auth_token',
  'cogveri_refresh_token',
  'auth_token',
  'refresh_token',
];

/**
 * Get the current auth token from page storage
 */
export async function getAuthToken(page: Page): Promise<string | null> {
  return page.evaluate((keys) => {
    for (const key of keys) {
      const token = localStorage.getItem(key) || sessionStorage.getItem(key);
      if (token && token.includes('.')) {
        return token;
      }
    }
    return null;
  }, TOKEN_KEYS);
}

/**
 * Get refresh token from page storage
 */
export async function getRefreshToken(page: Page): Promise<string | null> {
  return page.evaluate(() => {
    return (
      localStorage.getItem('cogveri_refresh_token') ||
      localStorage.getItem('refresh_token') ||
      sessionStorage.getItem('cogveri_refresh_token') ||
      sessionStorage.getItem('refresh_token')
    );
  });
}

/**
 * Clear all auth tokens from storage
 */
export async function clearAuthTokens(page: Page): Promise<void> {
  await page.evaluate((keys) => {
    for (const key of keys) {
      localStorage.removeItem(key);
      sessionStorage.removeItem(key);
    }
  }, TOKEN_KEYS);
}

/**
 * Decode JWT token payload (without verification)
 */
export function decodeJwtPayload(token: string): Record<string, unknown> | null {
  try {
    const parts = token.split('.');
    if (parts.length !== 3) return null;
    const payload = Buffer.from(parts[1], 'base64').toString('utf-8');
    return JSON.parse(payload);
  } catch {
    return null;
  }
}

// ============================================================================
// AUTHENTICATED API CLIENT
// ============================================================================

/**
 * Create an authenticated API client from a page's auth token
 */
export class AuthenticatedApiClient {
  private token: string;
  private request: APIRequestContext;
  private baseUrl: string;

  constructor(request: APIRequestContext, token: string, baseUrl = getBackendUrl()) {
    this.request = request;
    this.token = token;
    this.baseUrl = baseUrl;
  }

  private getHeaders() {
    return {
      Authorization: `Bearer ${this.token}`,
      'Content-Type': 'application/json',
    };
  }

  async get<T = unknown>(endpoint: string): Promise<{ status: number; data: T }> {
    const response = await this.request.get(`${this.baseUrl}${endpoint}`, {
      headers: this.getHeaders(),
    });
    const data = await response.json().catch(() => null);
    return { status: response.status(), data: data as T };
  }

  async post<T = unknown>(endpoint: string, body?: unknown): Promise<{ status: number; data: T }> {
    const response = await this.request.post(`${this.baseUrl}${endpoint}`, {
      headers: this.getHeaders(),
      data: body,
    });
    const data = await response.json().catch(() => null);
    return { status: response.status(), data: data as T };
  }

  async put<T = unknown>(endpoint: string, body?: unknown): Promise<{ status: number; data: T }> {
    const response = await this.request.put(`${this.baseUrl}${endpoint}`, {
      headers: this.getHeaders(),
      data: body,
    });
    const data = await response.json().catch(() => null);
    return { status: response.status(), data: data as T };
  }

  async patch<T = unknown>(endpoint: string, body?: unknown): Promise<{ status: number; data: T }> {
    const response = await this.request.patch(`${this.baseUrl}${endpoint}`, {
      headers: this.getHeaders(),
      data: body,
    });
    const data = await response.json().catch(() => null);
    return { status: response.status(), data: data as T };
  }

  async delete<T = unknown>(endpoint: string): Promise<{ status: number; data: T }> {
    const response = await this.request.delete(`${this.baseUrl}${endpoint}`, {
      headers: this.getHeaders(),
    });
    const data = await response.json().catch(() => null);
    return { status: response.status(), data: data as T };
  }
}

/**
 * Create an authenticated API client from a logged-in page
 */
export async function createApiClient(
  page: Page,
  request: APIRequestContext
): Promise<AuthenticatedApiClient> {
  const token = await getAuthToken(page);
  if (!token) {
    throw new Error('No auth token found. User must be logged in.');
  }
  return new AuthenticatedApiClient(request, token);
}

// ============================================================================
// COMMON API OPERATIONS
// ============================================================================

/**
 * Fetch current user's organizations
 */
export async function fetchUserOrganizations(
  page: Page,
  request: APIRequestContext
): Promise<Array<{ id: string; name: string; slug: string; tier: string }>> {
  const client = await createApiClient(page, request);
  const { status, data } = await client.get<Array<{ id: string; name: string; slug: string; tier: string }>>(
    API_ENDPOINTS.userOrganizations
  );
  expect(status).toBe(200);
  return data;
}

/**
 * Fetch all tasks for the current organization
 */
export async function fetchTasks(
  page: Page,
  request: APIRequestContext,
  filters?: { status?: string; priority?: string }
): Promise<Array<{ id: string; title: string; status: string }>> {
  const client = await createApiClient(page, request);
  let endpoint = API_ENDPOINTS.tasks;
  if (filters) {
    const params = new URLSearchParams();
    if (filters.status) params.append('status', filters.status);
    if (filters.priority) params.append('priority', filters.priority);
    endpoint += `?${params.toString()}`;
  }
  const { status, data } = await client.get<Array<{ id: string; title: string; status: string }>>(endpoint);
  expect(status).toBe(200);
  return data;
}

/**
 * Fetch a specific task by ID
 */
export async function fetchTask(
  page: Page,
  request: APIRequestContext,
  taskId: string
): Promise<{ id: string; title: string; status: string; description?: string }> {
  const client = await createApiClient(page, request);
  const { status, data } = await client.get<{ id: string; title: string; status: string; description?: string }>(
    API_ENDPOINTS.taskById(taskId)
  );
  expect(status).toBe(200);
  return data;
}

/**
 * Create a new task via API
 */
export async function createTask(
  page: Page,
  request: APIRequestContext,
  taskData: {
    title: string;
    description?: string;
    type?: 'recording' | 'live_demo' | 'hybrid';
    priority?: 'low' | 'medium' | 'high' | 'urgent';
    assignedTo?: string;
    dueDate?: string;
  }
): Promise<{ id: string; title: string }> {
  const client = await createApiClient(page, request);
  const { status, data } = await client.post<{ id: string; title: string }>(API_ENDPOINTS.tasks, taskData);
  expect(status).toBe(201);
  return data;
}

/**
 * Delete a task via API
 */
export async function deleteTask(
  page: Page,
  request: APIRequestContext,
  taskId: string
): Promise<void> {
  const client = await createApiClient(page, request);
  const { status } = await client.delete(API_ENDPOINTS.taskById(taskId));
  expect([200, 204]).toContain(status);
}

/**
 * Fetch recordings for the current organization
 */
export async function fetchRecordings(
  page: Page,
  request: APIRequestContext,
  filters?: { taskId?: string; status?: string }
): Promise<Array<{ id: string; status: string; taskId?: string }>> {
  const client = await createApiClient(page, request);
  let endpoint = API_ENDPOINTS.recordings;
  if (filters) {
    const params = new URLSearchParams();
    if (filters.taskId) params.append('task_id', filters.taskId);
    if (filters.status) params.append('status', filters.status);
    endpoint += `?${params.toString()}`;
  }
  const { status, data } = await client.get<Array<{ id: string; status: string; taskId?: string }>>(endpoint);
  expect(status).toBe(200);
  return data;
}

/**
 * Fetch dashboard statistics
 */
export async function fetchDashboardStats(
  page: Page,
  request: APIRequestContext
): Promise<{
  tasksAssigned?: number;
  pendingReviews?: number;
  recordingsInProgress?: number;
  completedThisMonth?: number;
}> {
  const client = await createApiClient(page, request);
  const { status, data } = await client.get<{
    tasksAssigned?: number;
    pendingReviews?: number;
    recordingsInProgress?: number;
    completedThisMonth?: number;
  }>(API_ENDPOINTS.dashboardStats);
  expect(status).toBe(200);
  return data;
}

/**
 * Fetch notification count
 */
export async function fetchUnreadNotificationCount(
  page: Page,
  request: APIRequestContext
): Promise<number> {
  const client = await createApiClient(page, request);
  const { status, data } = await client.get<{ count: number }>(API_ENDPOINTS.notificationsCount);
  expect(status).toBe(200);
  return data?.count ?? 0;
}

// ============================================================================
// MAGIC LINK HELPERS (Public API - no auth required)
// ============================================================================

/**
 * Validate a magic link token (public endpoint)
 */
export async function validateMagicLink(
  request: APIRequestContext,
  token: string,
  baseUrl = getBackendUrl()
): Promise<{ valid: boolean; task?: { id: string; title: string } }> {
  const response = await request.get(`${baseUrl}${API_ENDPOINTS.magicLinkValidate(token)}`);
  return { valid: response.status() === 200, task: await response.json().catch(() => null) };
}

/**
 * Claim a task via magic link (public endpoint)
 */
export async function claimMagicLink(
  request: APIRequestContext,
  token: string,
  claimData: { name: string; email: string },
  baseUrl = getBackendUrl()
): Promise<{ success: boolean; data?: unknown }> {
  const response = await request.post(`${baseUrl}${API_ENDPOINTS.magicLinkClaim(token)}`, {
    data: claimData,
    headers: { 'Content-Type': 'application/json' },
  });
  return {
    success: response.status() === 200,
    data: await response.json().catch(() => null),
  };
}

// ============================================================================
// HEALTH CHECK HELPERS
// ============================================================================

/**
 * Check if the backend is healthy
 */
export async function checkBackendHealth(
  request: APIRequestContext,
  baseUrl = getBackendUrl()
): Promise<boolean> {
  try {
    const response = await request.get(`${baseUrl}${API_ENDPOINTS.health}`);
    return response.status() === 200;
  } catch {
    return false;
  }
}

/**
 * Wait for backend to be ready
 */
export async function waitForBackend(
  request: APIRequestContext,
  baseUrl = getBackendUrl(),
  timeout = TIMEOUTS.long
): Promise<void> {
  const start = Date.now();
  while (Date.now() - start < timeout) {
    if (await checkBackendHealth(request, baseUrl)) {
      return;
    }
    await new Promise((resolve) => setTimeout(resolve, 1000));
  }
  throw new Error(`Backend not ready after ${timeout}ms`);
}

// ============================================================================
// POLLING HELPERS (for async operations)
// ============================================================================

/**
 * Poll an endpoint until a condition is met
 */
export async function pollUntil<T>(
  client: AuthenticatedApiClient,
  endpoint: string,
  condition: (data: T) => boolean,
  options: {
    timeout?: number;
    interval?: number;
    errorMessage?: string;
  } = {}
): Promise<T> {
  const { timeout = TIMEOUTS.long, interval = 1000, errorMessage = 'Polling timeout' } = options;
  const start = Date.now();

  while (Date.now() - start < timeout) {
    const { status, data } = await client.get<T>(endpoint);
    if (status === 200 && condition(data)) {
      return data;
    }
    await new Promise((resolve) => setTimeout(resolve, interval));
  }

  throw new Error(errorMessage);
}

/**
 * Wait for analysis to complete
 */
export async function waitForAnalysisComplete(
  page: Page,
  request: APIRequestContext,
  recordingId: string,
  timeout = TIMEOUTS.analysis
): Promise<{ status: string; progress: number }> {
  const client = await createApiClient(page, request);
  const endpoint = `${API_ENDPOINTS.recordingAnalysis(recordingId)}/status`;

  return pollUntil<{ status: string; progress: number }>(
    client,
    endpoint,
    (data) => data.status === 'completed' || data.status === 'failed',
    { timeout, interval: 2000, errorMessage: `Analysis did not complete within ${timeout}ms` }
  );
}

/**
 * Wait for transcription to complete
 */
export async function waitForTranscriptionComplete(
  page: Page,
  request: APIRequestContext,
  recordingId: string,
  timeout = TIMEOUTS.long
): Promise<{ status: string }> {
  const client = await createApiClient(page, request);
  const endpoint = API_ENDPOINTS.transcriptionStatus(recordingId);

  return pollUntil<{ status: string }>(
    client,
    endpoint,
    (data) => data.status === 'completed' || data.status === 'failed',
    { timeout, interval: 2000, errorMessage: `Transcription did not complete within ${timeout}ms` }
  );
}
