# Testing Strategy - CogVeri SaaS Backend

## Overview

This document outlines the comprehensive testing strategy for the CogVeri SaaS backend, covering unit tests, integration tests, and coverage targets.

## Test Structure

```
backend/
├── tests/
│   ├── setup.ts                           # Global test setup
│   ├── unit/
│   │   ├── services/
│   │   │   ├── metrics.service.test.ts
│   │   │   ├── storage.service.test.ts
│   │   │   └── retention.service.test.ts
│   │   └── middleware/
│   └── integration/
│       └── routes/
│           ├── metrics.routes.test.ts
│           └── ... (other endpoint tests)
├── vitest.config.ts                       # Vitest configuration
└── package.json                           # Test scripts
```

## Running Tests

### Install Test Dependencies

```bash
npm install --save-dev vitest @vitest/ui @vitest/coverage-v8 supertest @types/supertest
```

### Run All Tests

```bash
npm run test
```

### Run Tests in Watch Mode

```bash
npm run test:watch
```

### Run Tests with Coverage Report

```bash
npm run test:coverage
```

### Run Specific Test File

```bash
npm run test -- tests/unit/services/metrics.service.test.ts
```

### Run Tests Matching Pattern

```bash
npm run test -- --grep "recordApiMetric"
```

## Test Categories

### 1. Unit Tests

**Purpose**: Test individual functions and methods in isolation

**Location**: `backend/tests/unit/services/`

**Coverage Targets**:

- Services: 80%+ coverage
- Controllers: 75%+ coverage
- Utilities: 85%+ coverage

**Example Test File**: `metrics.service.test.ts`

```typescript
describe('MetricsService', () => {
  describe('recordApiMetric', () => {
    it('should record an API metric successfully', async () => {
      // Arrange: Set up test data
      const metricData = { ... };

      // Act: Execute function
      await metricsService.recordApiMetric(metricData);

      // Assert: Verify results
      expect(db).toHaveBeenCalled();
    });
  });
});
```

**Key Unit Tests**:

#### MetricsService (`metrics.service.test.ts`)

- `recordApiMetric()`: Recording individual API calls
- `trackFeatureUsage()`: Feature adoption tracking
- `checkRateLimit()`: Rate limit validation
- `createApiKey()`: API key generation with SHA-256
- `verifyApiKey()`: API key authentication
- `getUsageSummary()`: Usage aggregation
- `getUsageByEndpoint()`: Endpoint-level breakdown
- `getUsageByUser()`: Top users analysis
- `getFeatureUsageStats()`: Feature adoption metrics

#### StorageService (`storage.service.test.ts`)

- `initializeStorageMetrics()`: Organization storage setup
- `trackRecordingSize()`: Size tracking on upload
- `untrackRecordingSize()`: Size untracking on delete
- `getStorageMetrics()`: Current usage retrieval
- `updateMaxStorage()`: Tier upgrade/downgrade
- Quota alert creation and management
- `recalculateStorageMetrics()`: Rebuild from source of truth
- BigInt precision for large files

#### RetentionService (`retention.service.test.ts`)

- `createRetentionPolicy()`: Policy creation
- `updateRetentionPolicy()`: Policy updates
- `setDefaultRetentionPolicy()`: Default management
- `enforceRetentionPolicy()`: Single policy execution
- `enforceAllRetentionPolicies()`: Bulk enforcement
- `getPolicyExecutionHistory()`: Execution audit logs
- `deleteRetentionPolicy()`: Policy archival
- Rule validation (by_status, by_type, by_age)
- Period calculations (days, weeks, months, years)

### 2. Integration Tests

**Purpose**: Test complete request/response flows with actual middleware and services

**Location**: `backend/tests/integration/routes/`

**Coverage Targets**:

- API endpoints: 70%+ coverage
- Organization scoping: 100% (critical)
- Error handling: 80%+ coverage

**Example Test File**: `metrics.routes.test.ts`

```typescript
describe('Metrics API Routes', () => {
  describe('GET /api/metrics/usage-summary', () => {
    it('should return 401 without authentication', async () => {
      const res = await request(app).get('/api/metrics/usage-summary');
      expect(res.status).toBe(401);
    });

    it('should return usage summary for authenticated user', async () => {
      const res = await request(app)
        .get('/api/metrics/usage-summary')
        .set('Authorization', `Bearer ${authToken}`)
        .set('X-Organization-Id', organizationId);
      expect(res.status).toBe(200);
    });
  });
});
```

**Key Integration Tests**:

#### Metrics Endpoints

- `GET /api/metrics/usage-summary`: 30-day aggregate usage
- `GET /api/metrics/usage-by-endpoint`: Endpoint breakdown
- `GET /api/metrics/usage-by-user`: Top users (with limit)
- `GET /api/metrics/feature-usage`: Feature adoption stats
- `POST /api/metrics/api-keys`: Create API key
- `GET /api/metrics/api-keys`: List API keys
- `DELETE /api/metrics/api-keys/:keyId`: Revoke key
- `GET /api/metrics/rate-limit-status`: Rate limit status

#### Storage Endpoints

- `GET /api/storage/metrics`: Current storage state
- `GET /api/storage/usage`: Human-readable usage (GB)
- `GET /api/storage/quota-alerts`: List alerts
- `POST /api/storage/quota-alerts`: Create alert
- `PUT /api/storage/quota-alerts/:alertId`: Update alert
- `DELETE /api/storage/quota-alerts/:alertId`: Soft-delete alert
- `POST /api/storage/recalculate`: Rebuild metrics
- `POST /api/storage/check-alerts`: Trigger evaluation

#### Retention Endpoints

- `POST /api/retention/policies`: Create policy
- `GET /api/retention/policies`: List policies
- `GET /api/retention/policies/:policyId`: Get policy
- `PUT /api/retention/policies/:policyId`: Update policy
- `DELETE /api/retention/policies/:policyId`: Archive policy
- `POST /api/retention/policies/:policyId/set-default`: Set default
- `POST /api/retention/policies/:policyId/enforce`: Execute policy
- `GET /api/retention/policies/:policyId/history`: Execution history
- `POST /api/retention/enforce-all`: Bulk enforcement

### 3. Organization Scoping Tests

**Critical Security Tests**: Verify multi-tenant data isolation

**Test Locations**: Integrated into all route tests

**Key Assertions**:

```typescript
it('should isolate metrics by organization', async () => {
  const org1 = '550e8400-e29b-41d4-a716-446655440001';
  const org2 = '550e8400-e29b-41d4-a716-446655440002';

  const res1 = await request(app)
    .get('/api/metrics/usage-summary')
    .set('Authorization', `Bearer ${authToken}`)
    .set('X-Organization-Id', org1);

  const res2 = await request(app)
    .get('/api/metrics/usage-summary')
    .set('Authorization', `Bearer ${authToken}`)
    .set('X-Organization-Id', org2);

  // Verify different orgs get different data
  expect(res1.body.data).not.toEqual(res2.body.data);
});

it('should return 400 without organization ID', async () => {
  const res = await request(app)
    .get('/api/metrics/usage-summary')
    .set('Authorization', `Bearer ${authToken}`)
    .unset('X-Organization-Id');

  expect(res.status).toBe(400);
});
```

## Coverage Requirements

### Target Coverage by Component

| Component   | Lines | Functions | Branches | Statements |
| ----------- | ----- | --------- | -------- | ---------- |
| Services    | 85%   | 85%       | 80%      | 85%        |
| Controllers | 80%   | 80%       | 75%      | 80%        |
| Routes      | 75%   | 75%       | 70%      | 75%        |
| Middleware  | 90%   | 90%       | 85%      | 90%        |

### Coverage Report

Generate HTML coverage report:

```bash
npm run test:coverage
# Opens: coverage/index.html
```

View coverage in CLI:

```bash
npm run test -- --coverage
```

## Test Utilities

### Global Test Helpers (`tests/setup.ts`)

```typescript
// Generate consistent test IDs
testUtils.generateTestId('user');
// → 'test-1729876543210-user000000'

// Create mock organization
testUtils.createMockOrganization({ tier: 'pro' });

// Create mock user
testUtils.createMockUser({ email: 'user@example.com' });

// Create mock API metric
testUtils.createMockMetric({ statusCode: 500, error: true });

// Create mock storage metric
testUtils.createMockStorageMetric({ percentageUsed: 95 });

// Create mock retention policy
testUtils.createMockRetentionPolicy({ action: 'archive' });

// Create mock rate limit rule
testUtils.createMockRateLimitRule({ tier: 'enterprise' });
```

## Test Environment Setup

### Create `.env.test`

```env
NODE_ENV=test
DATABASE_URL=postgresql://user:password@localhost:5432/cogveri_test|cogveri_db
JWT_SECRET=test-secret-key
CORS_ORIGIN=http://localhost:3000

# Disable external services in tests
ENABLE_REAL_STORAGE=false
ENABLE_REAL_EMAIL=false
```

### Database Setup for Tests

```bash
# Create test database
createdb cogveri_test|cogveri_db

# Run migrations
npm run migrate:test

# Seed test data
npm run seed:test
```

## Mocking Strategy

### Database Mocking

```typescript
vi.mock('../../../src/config/database', () => ({
  default: {
    from: vi.fn().mockReturnThis(),
    where: vi.fn().mockReturnThis(),
    insert: vi.fn().mockResolvedValue([1]),
  },
}));
```

### Service Mocking

```typescript
vi.mock('../../../src/services/metricsService', () => ({
  default: {
    recordApiMetric: vi.fn(),
    checkRateLimit: vi.fn().mockResolvedValue({ allowed: true }),
  },
}));
```

### Logger Mocking

```typescript
vi.mock('../../../src/utils/logger', () => ({
  default: {
    info: vi.fn(),
    error: vi.fn(),
    warn: vi.fn(),
  },
}));
```

## Continuous Integration

### GitHub Actions Workflow

```yaml
name: Test Suite
on: [push, pull_request]

jobs:
  test:
    runs-on: ubuntu-latest
    services:
      postgres:
        image: postgres:16
        env:
          POSTGRES_DB: cogveri_test|cogveri_db
          POSTGRES_PASSWORD: test
        options: >-
          --health-cmd pg_isready
          --health-interval 10s
          --health-timeout 5s
          --health-retries 5

    steps:
      - uses: actions/checkout@v3
      - uses: actions/setup-node@v3
        with:
          node-version: 18

      - run: npm ci
      - run: npm run migrate:test
      - run: npm run test:coverage
      - run: npm run test:coverage -- --reporter=json --outputFile=coverage.json

      - uses: codecov/codecov-action@v3
        with:
          files: ./coverage.json
```

## Best Practices

### 1. Test Naming

- Use descriptive, human-readable names
- Follow pattern: `should [action] when [condition]`
- Examples:
  ```typescript
  it('should record metric with status code', async () => {});
  it('should allow request within rate limit', async () => {});
  it('should prevent deletion of default policy', async () => {});
  ```

### 2. Test Organization

- Group related tests with `describe()` blocks
- One assertion per test when possible
- Arrange-Act-Assert pattern

### 3. Isolation

- Clear mocks before each test: `beforeEach(() => vi.clearAllMocks())`
- Use unique test IDs: `testUtils.generateTestId()`
- Clean up resources after tests

### 4. Error Testing

- Test both success and failure paths
- Verify error messages and status codes
- Test non-blocking error handling

### 5. Organization Scoping

- **Always test** that different organizations see different data
- **Always test** that missing org ID returns error
- **Always test** that invalid org ID is rejected

## Test Execution Speed Optimization

### Parallel Execution

Tests run in parallel by default. To disable:

```bash
npm run test -- --no-pool
```

### Skip Slow Tests

```bash
npm run test -- --grep "^(?!.*slow)"
```

### Watch Mode for Development

```bash
npm run test:watch -- tests/unit/services/metrics.service.test.ts
```

## Debugging Tests

### Enable Debug Output

```bash
DEBUG=* npm run test
```

### Run Single Test

```typescript
it.only('should test specific case', async () => {});
```

### Add Breakpoints

```typescript
it('should debug', async () => {
  debugger; // Pauses execution
  await someFunction();
});

// Run with Node debugger
node --inspect-brk ./node_modules/vitest/vitest.mjs
```

## Coverage Goals

### Phase 16 Targets

- **Unit Tests**: 150+ test cases across all services
- **Integration Tests**: 80+ endpoint tests
- **Overall Coverage**: 80%+ line coverage
- **Critical Paths**: 100% coverage for multi-tenancy and auth

### Phase 17 Integration

- All passing tests required before deployment
- Coverage reports in CI/CD pipeline
- Failed tests block merges to main branch

## Additional Resources

- [Vitest Documentation](https://vitest.dev/)
- [Supertest Documentation](https://github.com/visionmedia/supertest)
- [Testing Best Practices](https://testingjavascript.com/)
