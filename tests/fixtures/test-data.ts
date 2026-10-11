/**
 * Test Data Constants and Factories
 *
 * Centralized test data for E2E tests. These values should match
 * the seed data in backend/seeds/ for consistent test execution.
 *
 * For staging/production tests, set environment variables:
 * - TEST_USER_EMAIL: Email for staging test account
 * - TEST_USER_PASSWORD: Password for staging test account
 */

const TEST_ENV = process.env.TEST_ENV || 'local';

// ============================================================================
// TEST USERS (from seeds/001_users.ts)
// ============================================================================

// Staging/prod user from environment variables
const stagingUser = {
  email: process.env.TEST_USER_EMAIL || '',
  password: process.env.TEST_USER_PASSWORD || '',
  name: 'Test User',
  role: 'admin',
  orgRole: 'owner',
};

export const TEST_USERS = {
  // Primary test user - uses staging credentials if available, otherwise local seed user
  admin:
    TEST_ENV !== 'local' && stagingUser.email
      ? stagingUser
      : {
          email: 'admin@cogveri.com',
          password: 'password123',
          name: 'Admin User',
          role: 'admin',
          orgRole: 'owner',
        },
  manager: {
    email: 'manager@cogveri.app',
    password: 'password123',
    name: 'Manager User',
    role: 'manager',
    orgRole: 'admin',
  },
  reviewer: {
    email: 'reviewer@cogveri.app',
    password: 'password123',
    name: 'Reviewer User',
    role: 'reviewer',
    orgRole: 'reviewer',
  },
  employee1: {
    email: 'employee1@cogveri.app',
    password: 'password123',
    name: 'Employee One',
    role: 'employee',
    orgRole: 'limited',
  },
  employee2: {
    email: 'employee2@cogveri.app',
    password: 'password123',
    name: 'Employee Two',
    role: 'employee',
    orgRole: 'limited',
  },
  // Legacy test user from existing tests
  legacyAdmin: {
    email: 'admin@relay.company.com',
    password: 'password123',
    name: 'Legacy Admin',
    role: 'admin',
    orgRole: 'owner',
  },
} as const;

// ============================================================================
// TEST ORGANIZATION (from seeds/00_organizations.ts)
// ============================================================================

export const TEST_ORG = {
  id: '00000000-0000-0000-0000-000000000001',
  name: 'CogVeri Admin',
  slug: 'cogveri-admin',
  tier: 'enterprise',
} as const;

// Alternative org for multi-org testing
export const TEST_ORG_ALT = {
  name: 'CogVeri Demo Company',
  tier: 'pro',
} as const;

// ============================================================================
// TEST TASKS (from seeds/02_tasks.ts)
// ============================================================================

export const TEST_TASKS = {
  dashboardDemo: {
    id: 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
    title: 'Dashboard Navigation Demo',
    status: 'assigned',
    priority: 'high',
    type: 'recording',
  },
  customerModule: {
    id: 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb',
    title: 'Customer Management Module',
    status: 'in_progress',
    priority: 'medium',
    type: 'recording',
  },
  liveDemo: {
    id: 'cccccccc-cccc-cccc-cccc-cccccccccccc',
    title: 'Live Sales Presentation Demo',
    status: 'assigned',
    type: 'live_demo',
  },
  securityOverview: {
    id: 'dddddddd-dddd-dddd-dddd-dddddddddddd',
    title: 'Security Features Overview',
    status: 'submitted',
    priority: 'urgent',
    type: 'recording',
  },
  reportingWalkthrough: {
    id: 'eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee',
    title: 'Reporting Module Walkthrough',
    status: 'completed',
    type: 'recording',
  },
} as const;

// ============================================================================
// TASK STATUS WORKFLOW
// ============================================================================

export const TASK_STATUSES = [
  'draft',
  'assigned',
  'in_progress',
  'submitted',
  'in_review',
  'completed',
  'rejected',
] as const;

export const TASK_PRIORITIES = ['low', 'medium', 'high', 'urgent'] as const;

export const TASK_TYPES = ['recording', 'live_demo', 'hybrid'] as const;

// ============================================================================
// RECORDING STATUS WORKFLOW
// ============================================================================

export const RECORDING_STATUSES = [
  'initializing',
  'recording',
  'processing',
  'completed',
  'failed',
  'deleted',
] as const;

export const PROCESSING_STATUSES = ['pending', 'processing', 'completed', 'failed'] as const;

// ============================================================================
// ANALYSIS WORKFLOW
// ============================================================================

export const ANALYSIS_STATUSES = [
  'pending',
  'extracting_frames',
  'analyzing_speech',
  'analyzing_visual',
  'combining_results',
  'completed',
  'failed',
  'cancelled',
] as const;

export const ANALYSIS_VERDICTS = ['PASS', 'PARTIAL_PASS', 'NEEDS_REVIEW', 'FAIL'] as const;

// ============================================================================
// REVIEW WORKFLOW
// ============================================================================

export const REVIEW_STATUSES = ['pending', 'in_progress', 'completed', 'disputed'] as const;

export const REVIEW_DECISIONS = ['approved', 'needs_improvement', 'rejected'] as const;

// ============================================================================
// USER ROLES
// ============================================================================

export const ORG_ROLES = ['owner', 'admin', 'reviewer', 'viewer', 'limited', 'creator'] as const;

export const GLOBAL_ROLES = ['employee', 'manager', 'reviewer', 'admin'] as const;

export const SYSTEM_ROLES = ['USER', 'SUPPORT', 'ADMIN', 'SUPER_ADMIN'] as const;

// ============================================================================
// SUBSCRIPTION TIERS
// ============================================================================

export const SUBSCRIPTION_TIERS = ['free', 'pro', 'enterprise'] as const;

// ============================================================================
// API ENDPOINTS (for direct API testing)
// ============================================================================

export const API_ENDPOINTS = {
  // Auth
  login: '/api/auth/login',
  logout: '/api/auth/logout',
  register: '/api/auth/register',
  refresh: '/api/auth/refresh',
  me: '/api/auth/me',
  googleAuth: '/api/auth/google',

  // Organizations
  organizations: '/api/organizations',
  userOrganizations: '/api/organizations/user',
  organizationMembers: (orgId: string) => `/api/organizations/${orgId}/members`,
  organizationSettings: (orgId: string) => `/api/organizations/${orgId}/settings`,

  // Tasks
  tasks: '/api/tasks',
  taskById: (id: string) => `/api/tasks/${id}`,
  taskStatistics: '/api/tasks/statistics',
  taskProgress: (id: string) => `/api/tasks/${id}/progress`,
  taskSubmit: (id: string) => `/api/tasks/${id}/submit`,
  taskReview: (id: string) => `/api/tasks/${id}/review`,

  // Recordings
  recordings: '/api/recordings',
  recordingById: (id: string) => `/api/recordings/${id}`,
  recordingPlayback: (id: string) => `/api/recordings/${id}/playback-url`,
  recordingAnalysis: (id: string) => `/api/recordings/${id}/analysis`,
  recordingAnalyze: (id: string) => `/api/recordings/${id}/analyze`,

  // Multipart Upload
  multipartInitiate: '/api/recordings/multipart/initiate',
  multipartPresign: '/api/recordings/multipart/presign',
  multipartComplete: '/api/recordings/multipart/complete',

  // Magic Links
  magicLinkValidate: (token: string) => `/api/magic-links/validate/${token}`,
  magicLinkTask: (token: string) => `/api/magic-links/task/${token}`,
  magicLinkClaim: (token: string) => `/api/magic-links/claim/${token}`,
  magicLinkSubmit: (token: string) => `/api/magic-links/submit-recording/${token}`,

  // Reviews
  reviews: '/api/reviews',
  reviewById: (id: string) => `/api/reviews/${id}`,
  reviewFeedback: (id: string) => `/api/reviews/${id}/feedback`,

  // Templates
  templates: '/api/templates',
  templateById: (id: string) => `/api/templates/${id}`,
  templateDefaults: '/api/templates/defaults',

  // Billing
  billingTiers: '/api/billing/tiers',
  billingSubscription: '/api/billing/subscription',
  billingUsage: '/api/billing/usage',
  billingCheckout: '/api/billing/checkout',

  // Dashboard
  dashboardStats: '/api/dashboard/stats',
  dashboardActivity: '/api/dashboard/activity',

  // Notifications
  notifications: '/api/notifications',
  notificationsUnread: '/api/notifications/unread',
  notificationsCount: '/api/notifications/unread/count',

  // Search
  search: '/api/search',
  searchTasks: '/api/search/tasks',
  searchRecordings: '/api/search/recordings',

  // Transcription
  transcriptionStart: (recordingId: string) => `/api/transcription/${recordingId}/start`,
  transcriptionStatus: (recordingId: string) => `/api/transcription/${recordingId}/status`,

  // Admin
  adminOrganizations: '/api/admin/organizations',
  adminMetrics: '/api/admin/metrics',
  adminSystemAdmins: '/api/admin/system-admins',
  adminPricingTiers: '/api/admin/pricing/tiers',
  adminAiPrompts: '/api/admin/ai-prompts',

  // Health
  health: '/health',
  healthReady: '/health/ready',
  healthLive: '/health/live',
} as const;

// ============================================================================
// ROUTES (Frontend navigation)
// ============================================================================

export const ROUTES = {
  // Public
  login: '/login',
  register: '/register',
  privacy: '/privacy',
  terms: '/terms',

  // Auth
  authCallback: '/auth/callback',
  joinOrganization: '/auth/join-organization',
  accountSuspended: '/account-suspended',

  // Main App
  dashboard: '/dashboard',
  tasks: '/tasks',
  taskDetail: (id: string) => `/tasks/${id}`,
  taskReview: (id: string) => `/tasks/${id}/review`,

  recordings: '/record',
  recordingNew: '/record/new',
  recordingSession: (id: string) => `/record/${id}`,
  recordingAnalysis: (recordingId: string) => `/recordings/${recordingId}/analysis`,

  reviews: '/reviews',

  profile: '/profile',
  settings: '/organizations/settings',

  // External/Magic Link
  publicTask: (token: string) => `/t/${token}`,

  // Admin
  admin: '/admin',
  adminOrganizations: '/admin/organizations',
  adminOrganizationDetail: (id: string) => `/admin/organizations/${id}`,
  adminPricing: '/admin/pricing',
  adminSettings: '/admin/settings',
  adminSystemAdmins: '/admin/system-admins',
  adminAiPrompts: '/admin/ai-prompts',
  adminAiPromptEditor: (key: string) => `/admin/ai-prompts/${key}`,

  // Rubric Builder
  rubricBuilder: (templateId: string) => `/templates/${templateId}/rubric`,
} as const;

// ============================================================================
// TEST TIMEOUTS
// ============================================================================

export const TIMEOUTS = {
  short: 5000,
  medium: 15000,
  long: 30000,
  veryLong: 60000,
  analysis: 120000, // AI analysis can take up to 2 minutes
} as const;

// ============================================================================
// FACTORIES - Generate unique test data
// ============================================================================

let taskCounter = 0;
let userCounter = 0;

export function generateTaskData(
  overrides: Partial<{
    title: string;
    description: string;
    type: (typeof TASK_TYPES)[number];
    priority: (typeof TASK_PRIORITIES)[number];
  }> = {}
) {
  taskCounter++;
  return {
    title: `E2E Test Task ${taskCounter} - ${Date.now()}`,
    description: `Auto-generated task for E2E testing at ${new Date().toISOString()}`,
    type: 'recording' as const,
    priority: 'medium' as const,
    ...overrides,
  };
}

export function generateUserEmail() {
  userCounter++;
  return `e2e-test-user-${userCounter}-${Date.now()}@test.cogveri.app`;
}

export function generateExternalContributor() {
  return {
    email: `external-${Date.now()}@example.com`,
    firstName: 'External',
    lastName: 'Contributor',
  };
}
