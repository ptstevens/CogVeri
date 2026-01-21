# CogVeri Issue Remediation Task List

This document provides detailed remediation tasks for identified issues, organized from Low to High priority.

---

## Low Priority Issues (L1-L8)

### L1: Inconsistent Naming Conventions
**Location:** Various files throughout codebase
**Impact:** Readability
**Estimated Effort:** 1-2 days

#### Tasks:
- [ ] **L1.1** Audit naming conventions across backend controllers
  - File: `backend/src/controllers/*.ts`
  - Check for consistent use of camelCase for functions/variables
  - Check for consistent use of PascalCase for classes/interfaces
  - Document current inconsistencies

- [ ] **L1.2** Audit naming conventions in services
  - File: `backend/src/services/*.ts`
  - Verify consistent naming between service files (e.g., `permission.service.ts` vs `permissions-service.ts`)
  - Standardize file naming: decide between `kebab-case.service.ts` or `camelCase.service.ts`

- [ ] **L1.3** Standardize on single naming convention
  - Create naming convention documentation
  - Apply consistent naming to all files
  - Update imports across codebase

- [ ] **L1.4** Audit frontend component naming
  - File: `frontend/src/components/**/*.tsx`
  - Ensure PascalCase for component names
  - Ensure consistent file naming pattern

---

### L2: Missing JSDoc on Some Functions
**Location:** Various files
**Impact:** Documentation
**Estimated Effort:** 2-3 days

#### Tasks:
- [ ] **L2.1** Add JSDoc to public controller methods
  - Files: `backend/src/controllers/*.ts`
  - Add `@param`, `@returns`, `@throws` annotations
  - Priority: auth.controller.ts, recording.controller.ts, task.controller.ts

- [ ] **L2.2** Add JSDoc to service layer public methods
  - Files: `backend/src/services/*.ts`
  - Document business logic methods
  - Priority: stripe.service.ts, analysis service files

- [ ] **L2.3** Add JSDoc to utility functions
  - Files: `backend/src/utils/*.ts`
  - Document helper functions and their expected inputs/outputs

- [ ] **L2.4** Add JSDoc to frontend API client methods
  - File: `frontend/src/services/api.ts`
  - Document API call functions with expected request/response types

---

### L3: Unused Imports
**Location:** Various files
**Impact:** Code cleanliness
**Estimated Effort:** < 1 day

#### Tasks:
- [ ] **L3.1** Run ESLint with unused-imports rule
  ```bash
  cd backend && npm run lint -- --rule 'no-unused-vars: warn'
  cd frontend && npm run lint -- --rule 'no-unused-vars: warn'
  ```

- [ ] **L3.2** Configure ESLint for automatic unused import detection
  - Add `eslint-plugin-unused-imports` if not present
  - Configure in `.eslintrc` for both frontend and backend

- [ ] **L3.3** Remove unused imports from backend
  - Fix all warnings from step L3.1
  - Verify build still passes

- [ ] **L3.4** Remove unused imports from frontend
  - Fix all warnings from step L3.1
  - Verify build still passes

---

### L4: Magic Numbers in Code
**Location:** Various files
**Impact:** Maintainability
**Estimated Effort:** 1-2 days

#### Tasks:
- [ ] **L4.1** Audit and identify magic numbers
  - Search for numeric literals in business logic
  - Common areas: pagination limits, timeouts, retry counts, rate limits

- [ ] **L4.2** Create constants file for backend
  - File: `backend/src/config/constants.ts`
  - Define named constants for:
    - Pagination defaults (page size, max page size)
    - Timeout values
    - Retry limits
    - Rate limiting thresholds
    - File size limits
    - Token expiration times

- [ ] **L4.3** Replace magic numbers in controllers
  - Files: `backend/src/controllers/*.ts`
  - Import from constants file
  - Replace inline numbers with named constants

- [ ] **L4.4** Replace magic numbers in services
  - Files: `backend/src/services/*.ts`
  - Priority: stripe.service.ts, analysis services

- [ ] **L4.5** Create constants file for frontend
  - File: `frontend/src/config/constants.ts`
  - Define UI-related constants

---

### L5: Console.log in Transcription Worker
**Location:** `transcription/worker.py`
**Impact:** Production logs
**Estimated Effort:** < 1 day

#### Tasks:
- [ ] **L5.1** Audit console.log/print statements
  - File: `transcription/worker.py`
  - Identify all print() and logging statements

- [ ] **L5.2** Implement proper structured logging
  - Use `structlog` (already in requirements.txt)
  - Configure log levels (DEBUG, INFO, WARNING, ERROR)
  - Add JSON formatting for production

- [ ] **L5.3** Replace print statements with logger calls
  ```python
  import structlog
  logger = structlog.get_logger()

  # Replace: print("Processing file...")
  # With: logger.info("processing_file", filename=filename)
  ```

- [ ] **L5.4** Add environment-based log level configuration
  - File: `transcription/config.py`
  - Read LOG_LEVEL from environment
  - Default to INFO for production, DEBUG for development

---

### L6: Missing Python Requirements File
**Location:** `transcription/`
**Impact:** Deployment
**Estimated Effort:** < 1 day

#### Status: **RESOLVED**
The `transcription/requirements.txt` file already exists with comprehensive dependencies including:
- openai-whisper
- redis, rq (job queue)
- httpx (HTTP client)
- pydub, soundfile, numpy (audio processing)
- torch, torchaudio (ML inference)
- structlog (logging)
- boto3 (S3 access)

**No action required.**

---

### L7: Duplicate Pagination Logic
**Location:** Various controllers
**Impact:** DRY violation
**Estimated Effort:** 1-2 days

#### Tasks:
- [ ] **L7.1** Audit pagination implementations
  - Files: `backend/src/controllers/*.ts`
  - Identify all pagination patterns
  - Document variations in implementation

- [ ] **L7.2** Create shared pagination utility
  - File: `backend/src/utils/pagination.ts`
  ```typescript
  interface PaginationParams {
    page: number;
    limit: number;
    sortBy?: string;
    sortOrder?: 'asc' | 'desc';
  }

  interface PaginatedResponse<T> {
    data: T[];
    pagination: {
      page: number;
      limit: number;
      total: number;
      totalPages: number;
      hasNext: boolean;
      hasPrev: boolean;
    };
  }

  export function parsePaginationParams(query: any): PaginationParams;
  export function createPaginatedResponse<T>(data: T[], total: number, params: PaginationParams): PaginatedResponse<T>;
  ```

- [ ] **L7.3** Create pagination middleware
  - File: `backend/src/middleware/pagination.middleware.ts`
  - Parse and validate pagination query params
  - Attach to request object

- [ ] **L7.4** Refactor controllers to use shared pagination
  - Update all controllers with pagination
  - Remove duplicate code
  - Ensure consistent response format

---

### L8: Missing Return Type Annotations
**Location:** Various files
**Impact:** Type safety
**Estimated Effort:** 1-2 days

#### Tasks:
- [ ] **L8.1** Configure TypeScript strict mode (if not already)
  - File: `backend/tsconfig.json`, `frontend/tsconfig.json`
  - Enable `noImplicitReturns: true`
  - Enable `noImplicitAny: true` (may overlap with M1)

- [ ] **L8.2** Add return types to controller methods
  - Files: `backend/src/controllers/*.ts`
  - All request handlers should return `Promise<Response>` or specific types

- [ ] **L8.3** Add return types to service methods
  - Files: `backend/src/services/*.ts`
  - Define return types for all public methods
  - Use existing types from `backend/src/types/`

- [ ] **L8.4** Add return types to utility functions
  - Files: `backend/src/utils/*.ts`
  - Ensure all exported functions have explicit return types

- [ ] **L8.5** Add return types to frontend hooks and utilities
  - Files: `frontend/src/hooks/*.ts`, `frontend/src/services/*.ts`
  - Ensure React hooks have proper return types

---

## Medium Priority Issues (M1-M7)

### M1: Any Types in TypeScript
**Location:** Various files
**Impact:** Type safety
**Estimated Effort:** 3-4 days

#### Tasks:
- [ ] **M1.1** Audit `any` type usage
  ```bash
  cd backend && grep -r ": any" src/ --include="*.ts" | wc -l
  cd frontend && grep -r ": any" src/ --include="*.ts" --include="*.tsx" | wc -l
  ```

- [ ] **M1.2** Enable ESLint rule for `any`
  - Add `@typescript-eslint/no-explicit-any: warn` to ESLint config
  - Run lint to get full list of violations

- [ ] **M1.3** Fix `any` types in type definitions
  - Files: `backend/src/types/*.ts`
  - Replace with proper interfaces/types
  - Use generics where appropriate

- [ ] **M1.4** Fix `any` types in controllers
  - Files: `backend/src/controllers/*.ts`
  - Replace request body `any` with validated schema types
  - Use Zod schemas from `backend/src/schemas/`

- [ ] **M1.5** Fix `any` types in services
  - Files: `backend/src/services/*.ts`
  - Define proper interfaces for function parameters and returns

- [ ] **M1.6** Fix `any` types in frontend
  - Focus on API response types
  - Use shared types or define frontend-specific interfaces

- [ ] **M1.7** Add `unknown` as safer alternative where truly dynamic
  - Where type is genuinely unknown, use `unknown` with type guards
  - Document why type cannot be known

---

### M2: Large File Sizes
**Location:** `backend/src/services/stripe.service.ts` (1200+ lines)
**Impact:** Maintainability
**Estimated Effort:** 2-3 days

#### Tasks:
- [ ] **M2.1** Analyze stripe.service.ts structure
  - File: `backend/src/services/stripe.service.ts`
  - Identify logical groupings of functions
  - Map dependencies between functions

- [ ] **M2.2** Plan service decomposition
  - Proposed split:
    - `stripe-customer.service.ts` - Customer management
    - `stripe-subscription.service.ts` - Subscription lifecycle
    - `stripe-payment.service.ts` - Payment processing
    - `stripe-webhook.service.ts` - Webhook handling
    - `stripe-pricing.service.ts` - Price/product management

- [ ] **M2.3** Create base stripe utilities
  - File: `backend/src/services/stripe/stripe-client.ts`
  - Shared Stripe client instance
  - Common error handling
  - Common types/interfaces

- [ ] **M2.4** Extract customer management functions
  - File: `backend/src/services/stripe/stripe-customer.service.ts`
  - Move customer create/update/delete
  - Update imports in dependent files

- [ ] **M2.5** Extract subscription functions
  - File: `backend/src/services/stripe/stripe-subscription.service.ts`
  - Move subscription lifecycle methods
  - Update imports

- [ ] **M2.6** Extract webhook handlers
  - File: `backend/src/services/stripe/stripe-webhook.service.ts`
  - Move webhook event handlers
  - Update webhook routes

- [ ] **M2.7** Create barrel export
  - File: `backend/src/services/stripe/index.ts`
  - Re-export all stripe services for backwards compatibility

- [ ] **M2.8** Update all imports throughout codebase
  - Search for imports from old stripe.service.ts
  - Update to new modular imports

---

### M3: Missing Validation on Some Endpoints
**Location:** Various controllers
**Impact:** Data integrity
**Estimated Effort:** 2-3 days

#### Tasks:
- [ ] **M3.1** Audit endpoint validation coverage
  - Review all POST/PUT/PATCH endpoints
  - Identify endpoints missing input validation
  - Document required validations

- [ ] **M3.2** Create missing Zod schemas
  - Directory: `backend/src/schemas/`
  - Define schemas for all request bodies
  - Include proper error messages

- [ ] **M3.3** Add validation to auth endpoints
  - File: `backend/src/controllers/auth.controller.ts`
  - Validate login, register, password reset inputs

- [ ] **M3.4** Add validation to task endpoints
  - File: `backend/src/controllers/task.controller.ts`
  - Validate task creation/update inputs

- [ ] **M3.5** Add validation to recording endpoints
  - File: `backend/src/controllers/recording.controller.ts`
  - Validate recording metadata inputs

- [ ] **M3.6** Add validation to organization endpoints
  - Validate organization settings, member management

- [ ] **M3.7** Create validation middleware
  - File: `backend/src/middleware/validation.middleware.ts`
  - Generic middleware to validate against Zod schema
  ```typescript
  export const validate = (schema: ZodSchema) => (req, res, next) => {
    const result = schema.safeParse(req.body);
    if (!result.success) {
      return res.status(400).json({ errors: result.error.flatten() });
    }
    req.validatedBody = result.data;
    next();
  };
  ```

---

### M4: N+1 Queries in Analysis Service
**Location:** `backend/src/services/analysis/`
**Impact:** Performance
**Estimated Effort:** 1-2 days

#### Tasks:
- [ ] **M4.1** Profile analysis service queries
  - Enable query logging in development
  - Run analysis workflow and capture all queries
  - Identify N+1 patterns

- [ ] **M4.2** Identify relationship loading issues
  - Look for loops that query related data
  - Common patterns:
    - Loading recordings then looping to load tasks
    - Loading analysis results then looping for scores

- [ ] **M4.3** Implement eager loading
  - Use Knex `.join()` or subqueries
  - Example fix:
  ```typescript
  // Before (N+1):
  const recordings = await db('recordings').where('task_id', taskId);
  for (const rec of recordings) {
    rec.analysis = await db('analysis').where('recording_id', rec.id).first();
  }

  // After (single query):
  const recordings = await db('recordings')
    .where('recordings.task_id', taskId)
    .leftJoin('analysis', 'recordings.id', 'analysis.recording_id')
    .select('recordings.*', 'analysis.score', 'analysis.feedback');
  ```

- [ ] **M4.4** Add batch loading utilities
  - File: `backend/src/utils/batch-loader.ts`
  - Create utility for loading related records in batch

- [ ] **M4.5** Add query performance tests
  - File: `backend/tests/performance/analysis-queries.test.ts`
  - Test that common operations use expected number of queries

---

### M5: Limited Backend Caching
**Location:** `backend/src/config/redis.ts`
**Impact:** Performance
**Estimated Effort:** 3-5 days

#### Tasks:
- [ ] **M5.1** Audit current caching usage
  - File: `backend/src/services/cache.service.ts`
  - Document what is currently cached
  - Identify high-frequency, cacheable data

- [ ] **M5.2** Define caching strategy
  - Identify data suitable for caching:
    - Organization settings (changes infrequently)
    - Pricing/plan data (changes rarely)
    - User permissions (session duration)
    - Dashboard aggregations (expensive queries)
  - Define TTLs for each cache type

- [ ] **M5.3** Implement organization settings cache
  - Cache organization config on first load
  - Invalidate on settings update
  - TTL: 5-10 minutes

- [ ] **M5.4** Implement pricing data cache
  - Cache Stripe pricing/product data
  - Invalidate on webhook events
  - TTL: 1 hour

- [ ] **M5.5** Implement dashboard cache
  - Cache expensive aggregation queries
  - User-specific or org-specific keys
  - TTL: 1-5 minutes

- [ ] **M5.6** Add cache invalidation patterns
  - Create helper for cache key generation
  - Create invalidation triggers in relevant services
  ```typescript
  // In organization.service.ts
  async updateSettings(orgId: string, settings: OrgSettings) {
    await db('organizations').where('id', orgId).update(settings);
    await cacheService.invalidate(`org:${orgId}:settings`);
  }
  ```

- [ ] **M5.7** Add cache metrics
  - Track hit/miss ratios
  - Monitor cache size
  - Alert on low hit rates

---

### M6: Missing API Documentation
**Location:** `backend/`
**Impact:** Developer experience
**Estimated Effort:** 3-5 days

#### Tasks:
- [ ] **M6.1** Choose documentation approach
  - Option A: OpenAPI/Swagger (recommended)
  - Option B: Markdown documentation
  - Option C: TypeDoc for code-level docs

- [ ] **M6.2** Set up Swagger/OpenAPI infrastructure
  ```bash
  cd backend && npm install swagger-jsdoc swagger-ui-express @types/swagger-jsdoc @types/swagger-ui-express
  ```

- [ ] **M6.3** Create OpenAPI base configuration
  - File: `backend/src/config/swagger.ts`
  ```typescript
  export const swaggerOptions = {
    definition: {
      openapi: '3.0.0',
      info: {
        title: 'CogVeri API',
        version: '1.0.0',
        description: 'API documentation for CogVeri platform',
      },
      servers: [{ url: '/api' }],
      components: {
        securitySchemes: {
          bearerAuth: { type: 'http', scheme: 'bearer', bearerFormat: 'JWT' }
        }
      }
    },
    apis: ['./src/routes/*.ts', './src/schemas/*.ts']
  };
  ```

- [ ] **M6.4** Add OpenAPI annotations to auth routes
  - File: `backend/src/routes/auth.routes.ts`
  - Document login, register, refresh, logout endpoints

- [ ] **M6.5** Add OpenAPI annotations to task routes
  - File: `backend/src/routes/task.routes.ts`
  - Document CRUD operations

- [ ] **M6.6** Add OpenAPI annotations to recording routes
  - File: `backend/src/routes/recording.routes.ts`
  - Document upload, list, get, delete operations

- [ ] **M6.7** Add OpenAPI annotations to remaining routes
  - Organization, billing, analysis, etc.

- [ ] **M6.8** Set up Swagger UI endpoint
  - Add `/api/docs` route serving Swagger UI
  - Optionally protect with authentication in production

---

### M7: Inconsistent Error Messages
**Location:** Various files
**Impact:** User experience
**Estimated Effort:** 2-3 days

#### Tasks:
- [ ] **M7.1** Audit current error handling
  - Review all `res.status().json()` calls
  - Document error message formats
  - Identify inconsistencies

- [ ] **M7.2** Define standard error format
  - File: `backend/src/types/errors.ts`
  ```typescript
  interface ApiError {
    code: string;          // Machine-readable error code
    message: string;       // Human-readable message
    details?: unknown;     // Additional context
    field?: string;        // For validation errors
  }

  interface ApiErrorResponse {
    success: false;
    error: ApiError;
  }
  ```

- [ ] **M7.3** Create error constants
  - File: `backend/src/config/error-codes.ts`
  ```typescript
  export const ErrorCodes = {
    UNAUTHORIZED: { code: 'UNAUTHORIZED', message: 'Authentication required' },
    FORBIDDEN: { code: 'FORBIDDEN', message: 'You do not have permission to perform this action' },
    NOT_FOUND: { code: 'NOT_FOUND', message: 'Resource not found' },
    VALIDATION_ERROR: { code: 'VALIDATION_ERROR', message: 'Invalid input data' },
    // ... etc
  } as const;
  ```

- [ ] **M7.4** Create error helper functions
  - File: `backend/src/utils/errors.ts`
  ```typescript
  export class AppError extends Error {
    constructor(
      public code: string,
      public message: string,
      public statusCode: number,
      public details?: unknown
    ) {
      super(message);
    }
  }

  export const notFound = (resource: string) =>
    new AppError('NOT_FOUND', `${resource} not found`, 404);

  export const forbidden = (action?: string) =>
    new AppError('FORBIDDEN', action || 'Access denied', 403);
  ```

- [ ] **M7.5** Update error handling middleware
  - File: `backend/src/middleware/error.middleware.ts`
  - Catch all errors and format consistently
  - Log errors appropriately

- [ ] **M7.6** Refactor controllers to use standard errors
  - Replace ad-hoc error responses with helper functions
  - Ensure consistent format across all endpoints

---

## High Priority Issues (H1-H3)

### H1: Missing Unit Tests for Backend
**Location:** `backend/src/`
**Impact:** Risk of regressions
**Estimated Effort:** 2-3 weeks

#### Tasks:
- [ ] **H1.1** Assess current test coverage
  ```bash
  cd backend && npx vitest run --coverage
  ```
  - Document current coverage percentage
  - Identify completely untested files

- [ ] **H1.2** Set up test infrastructure improvements
  - File: `backend/tests/setup.ts`
  - Add database mocking/fixtures
  - Add common test utilities

- [ ] **H1.3** Create test utilities
  - File: `backend/tests/utils/test-helpers.ts`
  - Factory functions for test data
  - Mock request/response helpers
  - Database seeding utilities

- [ ] **H1.4** Write tests for auth service
  - File: `backend/tests/services/auth.service.test.ts`
  - Test user registration
  - Test login/logout
  - Test token refresh
  - Test password reset flow

- [ ] **H1.5** Write tests for task service
  - File: `backend/tests/services/task.service.test.ts`
  - Test CRUD operations
  - Test permission checks
  - Test task assignment

- [ ] **H1.6** Write tests for recording service
  - File: `backend/tests/services/recording.service.test.ts`
  - Test upload handling
  - Test metadata management
  - Test access control

- [ ] **H1.7** Write tests for analysis service
  - File: `backend/tests/services/analysis.service.test.ts`
  - Test analysis pipeline
  - Test scoring logic
  - Test rubric evaluation

- [ ] **H1.8** Write tests for stripe service
  - File: `backend/tests/services/stripe.service.test.ts`
  - Mock Stripe API calls
  - Test subscription management
  - Test webhook handling

- [ ] **H1.9** Write tests for remaining services
  - organization.service.ts
  - email.service.ts
  - storage.service.ts
  - queue.service.ts

- [ ] **H1.10** Write controller integration tests
  - Test request validation
  - Test response formats
  - Test error handling

- [ ] **H1.11** Set up coverage thresholds
  - File: `backend/vitest.config.ts`
  - Set minimum coverage requirements
  - Fail CI if coverage drops

- [ ] **H1.12** Add tests to CI pipeline
  - Update GitHub Actions workflow
  - Run tests on every PR
  - Report coverage changes

---

### H2: Commented-Out Controller Code
**Location:** `backend/src/controllers/recording.controller.ts`
**Impact:** Technical debt
**Estimated Effort:** 1-2 days

#### Tasks:
- [ ] **H2.1** Audit commented code in recording.controller.ts
  - File: `backend/src/controllers/recording.controller.ts`
  - Identify all commented sections
  - Determine if code is needed or obsolete

- [ ] **H2.2** Review git history for context
  ```bash
  git log -p --follow -- backend/src/controllers/recording.controller.ts | grep -A5 -B5 "^-.*\/\/"
  ```
  - Understand why code was commented
  - Check if there are related issues/PRs

- [ ] **H2.3** Decision: Remove or restore
  - For each commented block:
    - If obsolete: Remove completely
    - If needed: Restore and fix
    - If uncertain: Create issue to discuss

- [ ] **H2.4** Audit other controllers for commented code
  ```bash
  grep -r "// " backend/src/controllers/ | grep -v "// TODO\|// NOTE\|// eslint" | head -50
  ```

- [ ] **H2.5** Remove obsolete commented code
  - Delete code that is no longer relevant
  - Git history preserves it if ever needed

- [ ] **H2.6** Add ESLint rule to prevent future commented code
  - Add `eslint-plugin-no-commented-code` or custom rule
  - Allow specific comment patterns (TODO, FIXME, NOTE)

---

### H3: Missing CSRF Protection
**Location:** Various POST endpoints
**Impact:** Security risk
**Estimated Effort:** 3-5 days

#### Tasks:
- [ ] **H3.1** Audit current CSRF protections
  - Review existing middleware
  - Check if any CSRF measures are in place
  - Document vulnerable endpoints

- [ ] **H3.2** Choose CSRF protection strategy
  - Option A: Double Submit Cookie (recommended for SPAs)
  - Option B: Synchronizer Token Pattern
  - Option C: SameSite cookies only (partial protection)

- [ ] **H3.3** Install CSRF middleware
  ```bash
  cd backend && npm install csurf cookie-parser
  # Or for modern approach:
  cd backend && npm install csrf-csrf
  ```

- [ ] **H3.4** Implement CSRF middleware
  - File: `backend/src/middleware/csrf.middleware.ts`
  ```typescript
  import { doubleCsrf } from 'csrf-csrf';

  const { generateToken, doubleCsrfProtection } = doubleCsrf({
    getSecret: () => process.env.CSRF_SECRET!,
    cookieName: 'x-csrf-token',
    cookieOptions: {
      httpOnly: true,
      sameSite: 'strict',
      secure: process.env.NODE_ENV === 'production',
    },
    getTokenFromRequest: (req) => req.headers['x-csrf-token'],
  });

  export { generateToken, doubleCsrfProtection };
  ```

- [ ] **H3.5** Add CSRF token endpoint
  - File: `backend/src/routes/auth.routes.ts`
  - Add GET `/api/auth/csrf-token` endpoint
  - Return token for frontend to use

- [ ] **H3.6** Apply CSRF middleware to state-changing routes
  - Apply to all POST, PUT, PATCH, DELETE endpoints
  - Exclude webhooks (use signature verification instead)
  - Exclude public/unauthenticated endpoints

- [ ] **H3.7** Update frontend API client
  - File: `frontend/src/services/api.ts`
  - Fetch CSRF token on app init
  - Include token in all requests

- [ ] **H3.8** Update webhook routes
  - Ensure webhooks use signature verification
  - Exempt from CSRF protection
  - Document webhook security model

- [ ] **H3.9** Test CSRF protection
  - Verify token is required for protected endpoints
  - Verify token is correctly validated
  - Test token refresh on expiry

- [ ] **H3.10** Update security documentation
  - Document CSRF protection implementation
  - Add to security considerations in README

---

## Implementation Order Recommendation

### Phase 1: Quick Wins (Week 1)
1. L3 - Unused imports (< 1 day)
2. L5 - Console.log in transcription (< 1 day)
3. H2 - Commented-out code (1-2 days)

### Phase 2: Foundation (Week 2)
4. L4 - Magic numbers (1-2 days)
5. L8 - Return type annotations (1-2 days)
6. M7 - Inconsistent error messages (2-3 days)

### Phase 3: Code Quality (Week 3)
7. L1 - Naming conventions (1-2 days)
8. L7 - Duplicate pagination (1-2 days)
9. M1 - Any types (3-4 days)

### Phase 4: Security & Performance (Week 4)
10. H3 - CSRF protection (3-5 days)
11. M4 - N+1 queries (1-2 days)

### Phase 5: Documentation & Testing (Weeks 5-6)
12. L2 - JSDoc comments (2-3 days)
13. M6 - API documentation (3-5 days)
14. M3 - Missing validation (2-3 days)

### Phase 6: Architecture & Testing (Weeks 7-9)
15. M2 - Large file refactoring (2-3 days)
16. M5 - Backend caching (3-5 days)
17. H1 - Unit tests (2-3 weeks, ongoing)

---

## Progress Tracking

| Issue | Status | Assigned To | Started | Completed | Notes |
|-------|--------|-------------|---------|-----------|-------|
| L1 | Deferred | - | - | - | Requires breaking import changes |
| L2 | **Completed** | Claude | 2026-01-12 | 2026-01-12 | Added JSDoc to user, task, recording services |
| L3 | **Completed** | Claude | 2026-01-12 | 2026-01-12 | Removed unused imports in backend & frontend |
| L4 | **Completed** | Claude | 2026-01-12 | 2026-01-12 | Created backend/src/config/constants.ts |
| L5 | **Completed** | Claude | 2026-01-12 | 2026-01-12 | Replaced print() with structlog in worker.py |
| L6 | **Resolved** | - | - | - | requirements.txt exists |
| L7 | **Completed** | Claude | 2026-01-12 | 2026-01-12 | Created backend/src/utils/pagination.ts |
| L8 | Deferred | | | | Large scope - 5000+ functions |
| M1 | Deferred | | | | Large scope - 5000+ ESLint errors |
| M2 | **Completed** | Claude | 2026-01-12 | 2026-01-12 | Refactored into backend/src/services/stripe/* |
| M3 | **Completed** | Claude | 2026-01-12 | 2026-01-12 | Added Zod schemas to auth, task, user controllers |
| M4 | **Completed** | Claude | 2026-01-12 | 2026-01-12 | Created backend/src/utils/batch-loader.ts |
| M5 | **Completed** | Claude | 2026-01-12 | 2026-01-12 | Enhanced cache.service.ts with patterns & utilities |
| M6 | Not Started | | | | API documentation - defer |
| M7 | **Completed** | Claude | 2026-01-12 | 2026-01-12 | Created error-codes.ts and error-helpers.ts |
| H1 | Not Started | | | | Largest item - 2-3 weeks effort |
| H2 | **Completed** | Claude | 2026-01-12 | 2026-01-12 | Removed commented code from recording.controller.ts |
| H3 | **Completed** | Claude | 2026-01-12 | 2026-01-12 | Implemented CSRF protection with csrf-csrf |
