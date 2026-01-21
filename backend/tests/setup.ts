/// <reference types="vitest" />
import dotenv from 'dotenv';
import { vi, beforeAll, afterEach, afterAll } from 'vitest';

/**
 * Global test setup file for Vitest
 * Initializes environment variables, mocks, and test hooks
 */

// Load environment variables for testing
dotenv.config({ path: '.env.test' });

// Set test environment
process.env.NODE_ENV = 'test';

// Default test database URL if not set
if (!process.env.DATABASE_URL) {
  process.env.DATABASE_URL = 'postgresql://test:test@localhost:5432/cogveri_test';
}

// Mock logger to avoid console spam during tests
// Note: We use importOriginal to preserve the redactSensitiveData function for testing
vi.mock('../src/utils/logger', async (importOriginal) => {
  const original = await importOriginal<typeof import('../src/utils/logger')>();
  return {
    ...original,
    logger: {
      info: vi.fn(),
      error: vi.fn(),
      warn: vi.fn(),
      debug: vi.fn(),
      http: vi.fn(),
      verbose: vi.fn(),
      silly: vi.fn(),
      child: vi.fn(() => ({
        info: vi.fn(),
        error: vi.fn(),
        warn: vi.fn(),
        debug: vi.fn(),
      })),
    },
    // Keep the real redactSensitiveData for testing
    redactSensitiveData: original.redactSensitiveData,
  };
});

// Mock async context for organization context
vi.mock('../src/middleware/asyncContext', () => ({
  getAsyncContext: vi.fn(() => ({
    organization_id: '550e8400-e29b-41d4-a716-446655440000',
    user_id: '650e8400-e29b-41d4-a716-446655440001',
  })),
  setAsyncContext: vi.fn(),
  runWithContext: vi.fn((context, fn) => fn()),
}));

// Database mock type for proper TypeScript support
interface MockDbChainable {
  where: ReturnType<typeof vi.fn>;
  whereNull: ReturnType<typeof vi.fn>;
  whereNotNull: ReturnType<typeof vi.fn>;
  whereRaw: ReturnType<typeof vi.fn>;
  whereIn: ReturnType<typeof vi.fn>;
  andWhere: ReturnType<typeof vi.fn>;
  orWhere: ReturnType<typeof vi.fn>;
  first: ReturnType<typeof vi.fn>;
  insert: ReturnType<typeof vi.fn>;
  update: ReturnType<typeof vi.fn>;
  delete: ReturnType<typeof vi.fn>;
  del: ReturnType<typeof vi.fn>;
  select: ReturnType<typeof vi.fn>;
  distinct: ReturnType<typeof vi.fn>;
  sum: ReturnType<typeof vi.fn>;
  count: ReturnType<typeof vi.fn>;
  increment: ReturnType<typeof vi.fn>;
  orderBy: ReturnType<typeof vi.fn>;
  limit: ReturnType<typeof vi.fn>;
  offset: ReturnType<typeof vi.fn>;
  leftJoin: ReturnType<typeof vi.fn>;
  rightJoin: ReturnType<typeof vi.fn>;
  innerJoin: ReturnType<typeof vi.fn>;
  join: ReturnType<typeof vi.fn>;
  returning: ReturnType<typeof vi.fn>;
  raw: ReturnType<typeof vi.fn>;
  then: ReturnType<typeof vi.fn>;
  transacting: ReturnType<typeof vi.fn>;
}

interface MockDb {
  (table: string): MockDbChainable;
  raw: ReturnType<typeof vi.fn>;
  transaction: ReturnType<typeof vi.fn>;
  destroy: ReturnType<typeof vi.fn>;
}

// Create a self-referencing chainable mock object
const createChainableQueryBuilder = () => {
  const builder: any = {};

  // Methods that return the builder (for chaining)
  const chainMethods = [
    'where', 'whereNull', 'whereNotNull', 'whereRaw', 'whereIn',
    'andWhere', 'orWhere', 'select', 'distinct', 'sum', 'count',
    'increment', 'orderBy', 'limit', 'offset', 'leftJoin',
    'rightJoin', 'innerJoin', 'join', 'transacting', 'clone',
    'groupBy', 'having', 'modify', 'with', 'as'
  ];

  chainMethods.forEach(method => {
    builder[method] = vi.fn().mockImplementation(() => builder);
  });

  // Terminal methods (return values)
  builder.first = vi.fn().mockResolvedValue(null);
  builder.insert = vi.fn().mockResolvedValue([]);
  builder.update = vi.fn().mockResolvedValue(0);
  builder.delete = vi.fn().mockResolvedValue(0);
  builder.del = vi.fn().mockResolvedValue(0);
  builder.returning = vi.fn().mockResolvedValue([]);
  builder.raw = vi.fn((sql: string) => sql);
  builder.then = vi.fn();

  return builder;
};

// Create database mock factory for different test scenarios
const createMockDb = (): MockDb => {
  const baseFn = vi.fn((table: string) => createChainableQueryBuilder());
  const mockDb = baseFn as unknown as MockDb;
  mockDb.raw = vi.fn((sql: string) => sql);
  mockDb.transaction = vi.fn(async (callback: (trx: any) => Promise<any>) => {
    // Create a transaction mock that behaves like the db
    const trxMock = vi.fn((table: string) => createChainableQueryBuilder()) as any;
    trxMock.raw = vi.fn((sql: string) => sql);
    trxMock.commit = vi.fn().mockResolvedValue(undefined);
    trxMock.rollback = vi.fn().mockResolvedValue(undefined);
    return await callback(trxMock);
  });
  mockDb.destroy = vi.fn().mockResolvedValue(undefined);

  return mockDb;
};

// Mock database module
vi.mock('../src/config/database', () => {
  return {
    db: createMockDb(),
    connectDatabase: vi.fn().mockResolvedValue(undefined),
    disconnectDatabase: vi.fn().mockResolvedValue(undefined),
  };
});

// Mock S3 client
vi.mock('@aws-sdk/client-s3', () => ({
  S3Client: vi.fn().mockImplementation(() => ({
    send: vi.fn().mockResolvedValue({}),
  })),
  PutObjectCommand: vi.fn(),
  GetObjectCommand: vi.fn(),
  DeleteObjectCommand: vi.fn(),
  CreateMultipartUploadCommand: vi.fn(),
  UploadPartCommand: vi.fn(),
  CompleteMultipartUploadCommand: vi.fn(),
  AbortMultipartUploadCommand: vi.fn(),
}));

vi.mock('@aws-sdk/s3-request-presigner', () => ({
  getSignedUrl: vi.fn().mockResolvedValue('https://mock-signed-url.example.com/file'),
}));

// Mock nodemailer for email service
vi.mock('nodemailer', () => ({
  default: {
    createTransport: vi.fn(() => ({
      verify: vi.fn((callback) => callback(null, true)),
      sendMail: vi.fn().mockResolvedValue({ messageId: 'mock-message-id' }),
    })),
  },
}));

// Mock googleapis for OAuth
vi.mock('googleapis', () => ({
  google: {
    auth: {
      JWT: vi.fn().mockImplementation(() => ({
        getAccessToken: vi.fn().mockResolvedValue({ token: 'mock-access-token' }),
      })),
    },
  },
}));

// Warn if not using test database
if (!process.env.DATABASE_URL?.includes('test')) {
  console.warn(
    'Warning: DATABASE_URL does not contain "test". Make sure you are using a test database.'
  );
}

// Global test hooks
beforeAll(() => {
  console.log('Starting test suite...');
});

afterEach(() => {
  vi.clearAllMocks();
});

afterAll(() => {
  console.log('Test suite completed');
});

// ============================================================================
// Global test utilities
// ============================================================================

/**
 * Generate consistent test IDs
 */
export function generateTestId(suffix: string = ''): string {
  const base = `test-${Date.now()}-${suffix}`;
  return base.slice(0, 36).padEnd(36, '0');
}

/**
 * Create mock organization data
 */
export function createMockOrganization(overrides: Record<string, any> = {}) {
  return {
    id: '550e8400-e29b-41d4-a716-446655440000',
    name: 'Test Organization',
    slug: 'test-org',
    subscription_tier: 'pro',
    max_members: 50,
    max_recordings_gb: 100,
    max_tasks_per_month: 99999,
    created_at: new Date(),
    updated_at: new Date(),
    ...overrides,
  };
}

/**
 * Create mock user data
 */
export function createMockUser(overrides: Record<string, any> = {}) {
  return {
    id: '650e8400-e29b-41d4-a716-446655440001',
    email: 'test@example.com',
    name: 'Test User',
    role: 'employee',
    organization_id: '550e8400-e29b-41d4-a716-446655440000',
    is_system_admin: false,
    created_at: new Date(),
    updated_at: new Date(),
    ...overrides,
  };
}

/**
 * Create mock task data
 */
export function createMockTask(overrides: Record<string, any> = {}) {
  return {
    id: '750e8400-e29b-41d4-a716-446655440002',
    organization_id: '550e8400-e29b-41d4-a716-446655440000',
    title: 'Test Task',
    description: 'This is a test task',
    type: 'recording',
    status: 'assigned',
    priority: 'medium',
    assigned_to: '650e8400-e29b-41d4-a716-446655440001',
    created_by: '650e8400-e29b-41d4-a716-446655440001',
    reviewed_by: null,
    due_date: null,
    completed_at: null,
    estimated_duration: null,
    actual_duration: null,
    tags: [],
    metadata: null,
    archived: false,
    created_at: new Date(),
    updated_at: new Date(),
    ...overrides,
  };
}

/**
 * Create mock recording data
 */
export function createMockRecording(overrides: Record<string, any> = {}) {
  return {
    id: '850e8400-e29b-41d4-a716-446655440003',
    task_id: '750e8400-e29b-41d4-a716-446655440002',
    user_id: '650e8400-e29b-41d4-a716-446655440001',
    organization_id: '550e8400-e29b-41d4-a716-446655440000',
    type: 'screen',
    status: 'completed',
    file_url: 'https://storage.example.com/recording.webm',
    thumbnail_url: null,
    file_size_bytes: '10485760',
    file_format: 'webm',
    mime_type: 'video/webm',
    duration_seconds: 300,
    width: 1920,
    height: 1080,
    fps: 30,
    bitrate: 2500000,
    started_at: new Date(),
    ended_at: new Date(),
    uploaded_at: new Date(),
    processed_at: new Date(),
    storage_provider: 's3',
    storage_bucket: 'test-bucket',
    storage_key: 'recordings/test/recording.webm',
    metadata: { has_audio: true },
    created_at: new Date(),
    updated_at: new Date(),
    ...overrides,
  };
}

/**
 * Create mock magic link data
 */
export function createMockMagicLink(overrides: Record<string, any> = {}) {
  const expiresAt = new Date();
  expiresAt.setDate(expiresAt.getDate() + 30);

  return {
    id: '950e8400-e29b-41d4-a716-446655440004',
    task_id: '750e8400-e29b-41d4-a716-446655440002',
    token: 'a'.repeat(64),
    email: 'external@example.com',
    contributor_id: 'a50e8400-e29b-41d4-a716-446655440005',
    organization_id: '550e8400-e29b-41d4-a716-446655440000',
    expires_at: expiresAt,
    max_uses: null,
    current_uses: 0,
    last_used_at: null,
    is_revoked: false,
    created_at: new Date(),
    updated_at: new Date(),
    ...overrides,
  };
}

/**
 * Create mock external contributor data
 */
export function createMockExternalContributor(overrides: Record<string, any> = {}) {
  return {
    id: 'a50e8400-e29b-41d4-a716-446655440005',
    email: 'external@example.com',
    organization_id: '550e8400-e29b-41d4-a716-446655440000',
    first_name: 'External',
    last_name: 'Contributor',
    total_tasks_assigned: 1,
    total_tasks_completed: 0,
    total_tasks_rejected: 0,
    average_completion_time_seconds: null,
    last_active_at: null,
    created_at: new Date(),
    updated_at: new Date(),
    ...overrides,
  };
}

/**
 * Create mock API metric data
 */
export function createMockMetric(overrides: Record<string, any> = {}) {
  return {
    id: 'b50e8400-e29b-41d4-a716-446655440006',
    organization_id: '550e8400-e29b-41d4-a716-446655440000',
    user_id: '650e8400-e29b-41d4-a716-446655440001',
    endpoint: 'POST /api/recordings',
    method: 'POST',
    status_code: 201,
    response_time_ms: 150,
    request_size_bytes: 1024,
    response_size_bytes: 2048,
    ip_address: '192.168.1.1',
    error: false,
    created_at: new Date(),
    ...overrides,
  };
}

/**
 * Create mock storage metric data
 */
export function createMockStorageMetric(overrides: Record<string, any> = {}) {
  return {
    organization_id: '550e8400-e29b-41d4-a716-446655440000',
    total_bytes_used: BigInt(5368709120), // 5 GB
    max_bytes_allowed: BigInt(10737418240), // 10 GB
    bytes_by_recordings: BigInt(5000000000),
    bytes_by_other: BigInt(368709120),
    recording_count: 10,
    file_count: 15,
    last_calculated_at: new Date(),
    created_at: new Date(),
    updated_at: new Date(),
    ...overrides,
  };
}

/**
 * Create mock retention policy data
 */
export function createMockRetentionPolicy(overrides: Record<string, any> = {}) {
  return {
    id: 'c50e8400-e29b-41d4-a716-446655440007',
    organization_id: '550e8400-e29b-41d4-a716-446655440000',
    name: 'Delete old recordings',
    description: 'Automatically delete recordings older than 90 days',
    retention_days: 90,
    retention_unit: 'days',
    action: 'delete',
    apply_rules: JSON.stringify({ by_status: 'completed' }),
    is_default: false,
    archived: false,
    created_at: new Date(),
    updated_at: new Date(),
    ...overrides,
  };
}

/**
 * Create mock rate limit rule data
 */
export function createMockRateLimitRule(overrides: Record<string, any> = {}) {
  return {
    tier: 'pro',
    requests_per_minute: 300,
    requests_per_hour: 10000,
    requests_per_day: 100000,
    burst_limit: 500,
    endpoint_limits: JSON.stringify({}),
    created_at: new Date(),
    updated_at: new Date(),
    ...overrides,
  };
}

/**
 * Create mock multer file
 */
export function createMockFile(overrides: Record<string, any> = {}): Express.Multer.File {
  return {
    fieldname: 'file',
    originalname: 'test-recording.webm',
    encoding: '7bit',
    mimetype: 'video/webm',
    size: 10485760, // 10 MB
    buffer: Buffer.from('mock file content'),
    destination: '/tmp/uploads',
    filename: 'test-recording-123.webm',
    path: '/tmp/uploads/test-recording-123.webm',
    stream: null as any,
    ...overrides,
  };
}

/**
 * Wait for a specified number of milliseconds
 */
export function wait(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Create a mock Express request
 */
export function createMockRequest(overrides: Record<string, any> = {}) {
  return {
    body: {},
    params: {},
    query: {},
    headers: {},
    user: createMockUser(),
    organization_id: '550e8400-e29b-41d4-a716-446655440000',
    ip: '127.0.0.1',
    get: vi.fn((header: string) => overrides.headers?.[header.toLowerCase()]),
    ...overrides,
  };
}

/**
 * Create a mock Express response
 */
export function createMockResponse() {
  const res: any = {};
  res.status = vi.fn().mockReturnValue(res);
  res.json = vi.fn().mockReturnValue(res);
  res.send = vi.fn().mockReturnValue(res);
  res.set = vi.fn().mockReturnValue(res);
  res.setHeader = vi.fn().mockReturnValue(res);
  res.cookie = vi.fn().mockReturnValue(res);
  res.clearCookie = vi.fn().mockReturnValue(res);
  res.redirect = vi.fn().mockReturnValue(res);
  res.end = vi.fn().mockReturnValue(res);
  return res;
}

/**
 * Create a mock next function
 */
export function createMockNext() {
  return vi.fn();
}

// ============================================================================
// Chainable Query Builder Mocks (Fix #3 - Support chained .where() calls)
// ============================================================================

/**
 * Options for customizing the chainable query builder
 */
export interface QueryBuilderMockOptions {
  /** Result for .first() - defaults to null */
  firstResult?: unknown;
  /** Result for .insert().returning() - defaults to [] */
  insertResult?: unknown[];
  /** Result for .update() (rows affected) - defaults to 0 */
  updateResult?: number;
  /** Result for .update().returning() - defaults to [] */
  updateReturningResult?: unknown[];
  /** Result for .delete()/.del() (rows affected) - defaults to 0 */
  deleteResult?: number;
  /** Result for .select() as array - defaults to [] */
  selectResult?: unknown[];
  /** Result for .count() - defaults to [{ count: 0 }] */
  countResult?: unknown[];
  /** Custom handler for .where() to capture arguments */
  whereHandler?: (...args: unknown[]) => void;
}

/**
 * Create a chainable query builder mock that supports multiple .where() calls.
 * This fixes issues where security improvements add organization_id filtering
 * with chained .where() calls.
 *
 * @example
 * // Basic usage
 * const mockBuilder = createMockQueryBuilder({ updateReturningResult: [updatedTask] });
 * (db as any).mockReturnValue(mockBuilder);
 *
 * @example
 * // Track .where() calls
 * const whereCalls: unknown[][] = [];
 * const mockBuilder = createMockQueryBuilder({
 *   updateReturningResult: [result],
 *   whereHandler: (...args) => whereCalls.push(args),
 * });
 */
export function createMockQueryBuilder(options: QueryBuilderMockOptions = {}) {
  const {
    firstResult = null,
    insertResult = [],
    updateResult = 0,
    updateReturningResult = [],
    deleteResult = 0,
    selectResult = [],
    countResult = [{ count: 0 }],
    whereHandler,
  } = options;

  // Create a self-referencing builder that supports unlimited chaining
  const builder: Record<string, unknown> = {};

  // Methods that return the builder for chaining
  const chainMethods = [
    'where', 'whereNull', 'whereNotNull', 'whereRaw', 'whereIn', 'whereLike',
    'andWhere', 'orWhere', 'select', 'distinct', 'sum', 'count',
    'increment', 'decrement', 'orderBy', 'limit', 'offset', 'leftJoin',
    'rightJoin', 'innerJoin', 'join', 'transacting', 'clone',
    'groupBy', 'having', 'modify', 'with', 'as', 'from',
  ];

  chainMethods.forEach(method => {
    if (method === 'where' && whereHandler) {
      builder[method] = vi.fn((...args: unknown[]) => {
        whereHandler(...args);
        return builder;
      });
    } else {
      builder[method] = vi.fn().mockImplementation(() => builder);
    }
  });

  // Terminal methods that return results
  builder.first = vi.fn().mockResolvedValue(firstResult);
  builder.del = vi.fn().mockResolvedValue(deleteResult);
  builder.delete = vi.fn().mockResolvedValue(deleteResult);

  // .insert() and .update() support .returning() chaining
  const returningMock = vi.fn().mockResolvedValue(updateReturningResult);
  builder.update = vi.fn().mockImplementation(() => ({
    returning: returningMock,
    then: (resolve: (value: number) => void) => Promise.resolve(updateResult).then(resolve),
  }));

  builder.insert = vi.fn().mockImplementation(() => ({
    returning: vi.fn().mockResolvedValue(insertResult),
    then: (resolve: (value: unknown[]) => void) => Promise.resolve(insertResult).then(resolve),
  }));

  // Count returns array with count property
  builder.count = vi.fn().mockResolvedValue(countResult);

  // Select returns array
  builder.then = vi.fn((resolve: (value: unknown[]) => void) =>
    Promise.resolve(selectResult).then(resolve)
  );

  // Raw SQL passthrough
  builder.raw = vi.fn((sql: string) => sql);

  return builder;
}

/**
 * Create a mock database function with table-based routing.
 * Useful when a test needs different mock results for different tables.
 *
 * @example
 * const mockDb = createMockDbWithTables({
 *   tasks: createMockQueryBuilder({ updateReturningResult: [task] }),
 *   notifications: createMockQueryBuilder({ insertResult: [notification] }),
 * });
 * (db as any).mockImplementation(mockDb);
 */
export function createMockDbWithTables(
  tableMocks: Record<string, ReturnType<typeof createMockQueryBuilder>>
) {
  return (table: string) => {
    return tableMocks[table] || createMockQueryBuilder();
  };
}

// Define the test utilities type explicitly
interface TestUtils {
  generateTestId: typeof generateTestId;
  createMockOrganization: typeof createMockOrganization;
  createMockUser: typeof createMockUser;
  createMockTask: typeof createMockTask;
  createMockRecording: typeof createMockRecording;
  createMockMagicLink: typeof createMockMagicLink;
  createMockExternalContributor: typeof createMockExternalContributor;
  createMockMetric: typeof createMockMetric;
  createMockStorageMetric: typeof createMockStorageMetric;
  createMockRetentionPolicy: typeof createMockRetentionPolicy;
  createMockRateLimitRule: typeof createMockRateLimitRule;
  createMockFile: typeof createMockFile;
  createMockRequest: typeof createMockRequest;
  createMockResponse: typeof createMockResponse;
  createMockNext: typeof createMockNext;
  wait: typeof wait;
  createMockQueryBuilder: typeof createMockQueryBuilder;
  createMockDbWithTables: typeof createMockDbWithTables;
}

// Export all utilities for use in tests
export const testUtils: TestUtils = {
  generateTestId,
  createMockOrganization,
  createMockUser,
  createMockTask,
  createMockRecording,
  createMockMagicLink,
  createMockExternalContributor,
  createMockMetric,
  createMockStorageMetric,
  createMockRetentionPolicy,
  createMockRateLimitRule,
  createMockFile,
  createMockRequest,
  createMockResponse,
  createMockNext,
  wait,
  createMockQueryBuilder,
  createMockDbWithTables,
};

// Extend global for TypeScript
declare global {
  var testUtils: TestUtils;
}

globalThis.testUtils = testUtils;
