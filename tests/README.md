# CogVeri E2E Test Suite

Comprehensive end-to-end test suite for CogVeri using Playwright.

## Overview

This test suite provides full coverage of CogVeri's critical user flows and production capabilities:

- **Authentication & Authorization** - Login, logout, token management, role-based access
- **Dashboard** - Statistics, quick actions, navigation
- **Tasks** - CRUD operations, filtering, status workflow, external contributor setup
- **Reviews** - Video playback, analysis viewing, feedback submission
- **Magic Links** - External contributor complete flow
- **Organization** - Settings, member management, billing, templates
- **API Security** - Authentication, authorization, multi-tenancy, input validation
- **Health Checks** - System health, database, Redis, storage connectivity

## Directory Structure

```
tests/
├── e2e/                      # E2E test specs
│   ├── auth-flow.spec.ts     # Authentication tests
│   ├── smoke.spec.ts         # Basic smoke tests
│   ├── dashboard.spec.ts     # Dashboard tests
│   ├── tasks.spec.ts         # Task management tests
│   ├── reviews.spec.ts       # Review workflow tests
│   ├── magic-link.spec.ts    # External contributor tests
│   ├── organization.spec.ts  # Organization settings tests
│   ├── api-security.spec.ts  # Security tests
│   ├── health-check.spec.ts  # System health tests
│   └── screenshots.spec.ts   # Visual capture tests
├── fixtures/                 # Test utilities and data
│   ├── auth.ts               # Authentication helpers (legacy)
│   ├── test-data.ts          # Test constants and factories
│   └── api-helpers.ts        # API request helpers
└── page-objects/             # Page Object Models
    ├── base.page.ts          # Base page with common methods
    ├── login.page.ts         # Login page
    ├── dashboard.page.ts     # Dashboard page
    ├── tasks.page.ts         # Tasks page
    ├── recording.page.ts     # Recording page
    ├── reviews.page.ts       # Reviews page
    ├── magic-link.page.ts    # Magic link pages
    └── index.ts              # Page exports
```

## Running Tests

### Prerequisites

1. Backend running on `localhost:3000`
2. Frontend running on `localhost:5173`
3. Database seeded with test data

### Commands

```bash
# Run all E2E tests
npm run test:e2e

# Run tests with browser visible
npm run test:e2e:headed

# Run tests with Playwright UI
npm run test:e2e:ui

# Run tests in debug mode
npm run test:e2e:debug

# Run specific test file
npx playwright test tests/e2e/auth-flow.spec.ts

# Run tests matching pattern
npx playwright test -g "should login"

# Generate HTML report
npm run test:e2e:report
```

### Auto-Start Servers

The Playwright config automatically starts both frontend and backend servers:

- Backend health check: `http://localhost:3000/health`
- Frontend: `http://localhost:5173`

Set `reuseExistingServer: true` (default for local) to use already-running servers.

## Test Data

### Default Test Users

| Email                   | Password    | Role     | Org Role |
| ----------------------- | ----------- | -------- | -------- |
| admin@relay.company.com | password123 | admin    | owner    |
| admin@cogveri.com       | password123 | admin    | owner    |
| manager@cogveri.app     | password123 | manager  | admin    |
| reviewer@cogveri.app    | password123 | reviewer | reviewer |
| employee1@cogveri.app   | password123 | employee | limited  |

### Test Organization

- Name: CogVeri Admin / CogVeri Demo Company
- Tier: enterprise / pro

### Seeded Tasks

Tasks are created by the backend seeds (`backend/seeds/02_tasks.ts`).

## Writing New Tests

### 1. Use Page Objects

```typescript
import { LoginPage, TasksPage } from '../page-objects';

test('should create task', async ({ page }) => {
  const loginPage = new LoginPage(page);
  const tasksPage = new TasksPage(page);

  await loginPage.login(email, password);
  await tasksPage.goto();
  await tasksPage.createTask({ title: 'New Task' });
  await tasksPage.assertTaskExists('New Task');
});
```

### 2. Use Test Data Constants

```typescript
import { TEST_USERS, TIMEOUTS, API_ENDPOINTS } from '../fixtures/test-data';

test('should login admin', async ({ page }) => {
  await loginPage.login(TEST_USERS.legacyAdmin.email, TEST_USERS.legacyAdmin.password);
});
```

### 3. Use API Helpers

```typescript
import { fetchTasks, createTask, createApiClient } from '../fixtures/api-helpers';

test('should fetch tasks via API', async ({ page, request }) => {
  const tasks = await fetchTasks(page, request);
  expect(tasks.length).toBeGreaterThan(0);
});
```

### 4. Handle Optional Features

Many features are conditional (based on tier, role, or feature flags):

```typescript
test('should show billing tab', async ({ page }) => {
  const billingTab = page.locator('button:has-text("Billing")');
  const isVisible = await billingTab.isVisible().catch(() => false);

  if (isVisible) {
    await billingTab.click();
    // Test billing functionality
  }
});
```

### 5. Skip Tests Requiring Setup

For tests that require dynamic setup (like magic links):

```typescript
test('should complete external flow', async ({ page }) => {
  test.skip(!magicLinkToken, 'Requires valid magic link token');
  // Test code
});
```

## Test Categories

### Critical Path Tests (Run Before Deploy)

1. **Health Checks** (`health-check.spec.ts`)
   - Backend health endpoint
   - Database connectivity
   - Frontend loads without errors

2. **Authentication** (`auth-flow.spec.ts`)
   - Login with valid credentials
   - Reject invalid credentials
   - Token structure validation
   - Logout clears session

3. **Dashboard** (`dashboard.spec.ts`)
   - Dashboard loads after login
   - Statistics display
   - Navigation works

4. **Task CRUD** (`tasks.spec.ts`)
   - View task list
   - Create new task
   - Filter and search tasks

5. **API Security** (`api-security.spec.ts`)
   - Protected endpoints reject unauthenticated requests
   - Multi-tenancy isolation
   - Input validation

### Extended Tests

6. **Reviews** (`reviews.spec.ts`)
   - View reviews list
   - Video playback
   - Feedback submission

7. **Organization** (`organization.spec.ts`)
   - Settings access
   - Member management
   - Billing (if applicable)

8. **Magic Links** (`magic-link.spec.ts`)
   - Token validation
   - Claim flow
   - Recording submission

## CI/CD Integration

### GitHub Actions Example

```yaml
name: E2E Tests
on: [push, pull_request]

jobs:
  e2e:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: '20'

      - name: Install dependencies
        run: npm ci

      - name: Install Playwright
        run: npx playwright install --with-deps chromium

      - name: Start services
        run: docker-compose up -d postgres redis

      - name: Run migrations
        run: cd backend && npm run db:migrate

      - name: Seed database
        run: cd backend && npm run db:seed

      - name: Run E2E tests
        run: npm run test:e2e

      - name: Upload report
        uses: actions/upload-artifact@v4
        if: always()
        with:
          name: playwright-report
          path: playwright-report/
```

### Pre-Deploy Checklist

Run these tests before every production deploy:

```bash
# 1. Health checks
npx playwright test tests/e2e/health-check.spec.ts

# 2. Authentication
npx playwright test tests/e2e/auth-flow.spec.ts

# 3. Core functionality
npx playwright test tests/e2e/dashboard.spec.ts tests/e2e/tasks.spec.ts

# 4. Security
npx playwright test tests/e2e/api-security.spec.ts
```

## Debugging Tests

### Visual Debugging

```bash
# Run with headed browser
npx playwright test --headed

# Run with UI mode
npx playwright test --ui

# Debug specific test
npx playwright test --debug -g "test name"
```

### Trace Viewer

Traces are captured on first retry:

```bash
npx playwright show-trace trace.zip
```

### Screenshots

Screenshots are captured on failure in `playwright-report/`.

## Test Coverage Summary

| Area           | Test File            | Tests | Status            |
| -------------- | -------------------- | ----- | ----------------- |
| Health Checks  | health-check.spec.ts | 15+   | ✅ Ready          |
| Authentication | auth-flow.spec.ts    | 12    | ✅ Ready          |
| Dashboard      | dashboard.spec.ts    | 15+   | ✅ Ready          |
| Tasks          | tasks.spec.ts        | 25+   | ✅ Ready          |
| Reviews        | reviews.spec.ts      | 20+   | ✅ Ready          |
| Magic Links    | magic-link.spec.ts   | 20+   | ⚠️ Requires Setup |
| Organization   | organization.spec.ts | 20+   | ✅ Ready          |
| API Security   | api-security.spec.ts | 20+   | ✅ Ready          |

**Total: 150+ test cases**

## Known Limitations

1. **Recording tests** - Require browser media permissions (mocked or skipped)
2. **Magic link tests** - Require dynamic token generation
3. **Billing tests** - Require Stripe test mode
4. **Analysis tests** - Require Gemini API (can be mocked)
5. **WebSocket tests** - Real-time features require active connections

## Best Practices

1. **Use descriptive test names** - Clearly describe what the test verifies
2. **Use page objects** - Keep selectors maintainable
3. **Use fixtures** - Keep test data centralized
4. **Wait for network** - Use `page.waitForLoadState('networkidle')` for API calls
5. **Avoid hard waits** - Use `expect()` assertions instead of `page.waitForTimeout()`
6. **Keep tests isolated** - Each test should be independent
7. **Handle conditional features** - Use `.catch(() => false)` for optional elements

## Troubleshooting

### Tests fail with "Connection refused"

Ensure servers are running:

```bash
npm run dev  # or docker-compose up -d
```

### Tests timeout waiting for elements

Check browser console for JavaScript errors:

```bash
npx playwright test --debug
```

### Elements not found

Use `page.pause()` to pause test execution and inspect the page:

```typescript
await page.pause();
```

## Future Improvements

- [ ] Add visual regression testing
- [ ] Add performance benchmarks
- [ ] Add accessibility testing (a11y)
- [ ] Add mobile device testing
- [ ] Add API contract testing
- [ ] Add WebSocket real-time testing
