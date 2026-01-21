# E2E Tests for CogVeri

This directory contains end-to-end (E2E) tests for the CogVeri application using Playwright.

## Overview

The E2E tests verify critical user flows including:
- Authentication (login/logout)
- Organization selection
- API token validation
- Protected route access

## Structure

```
tests/
├── e2e/                 # End-to-end test specs
│   └── auth-flow.spec.ts   # Authentication and organization selection tests
├── fixtures/            # Shared test utilities
│   └── auth.ts            # Authentication helper functions
└── README.md           # This file
```

## Setup

### Prerequisites

- Node.js >= 18
- Docker containers running (backend on 3000, frontend on 5173)
- Database seeded with test users

### Installation

Playwright is already installed in the root `package.json`. If needed:

```bash
npm install -D @playwright/test
npx playwright install
```

## Running Tests

### Run all E2E tests

```bash
npm run test:e2e
```

### Run specific test file

```bash
npx playwright test tests/e2e/auth-flow.spec.ts
```

### Run tests in headed mode (see browser)

```bash
npx playwright test --headed
```

### Run tests in UI mode (interactive)

```bash
npx playwright test --ui
```

### Run tests in debug mode

```bash
npx playwright test --debug
```

### Run tests for specific browser

```bash
npx playwright test --project=chromium
npx playwright test --project=firefox
npx playwright test --project=webkit
```

## Test Data

The tests use the following seed user credentials:

- **Admin User**: `admin@cogveri.company.com` / `password123`
- **Manager User**: `manager@cogveri.company.com` / `password123`
- **Reviewer User**: `reviewer@cogveri.company.com` / `password123`
- **Employee 1**: `employee1@cogveri.company.com` / `password123`
- **Employee 2**: `employee2@cogveri.company.com` / `password123`
- **Employee 3**: `employee3@cogveri.company.com` / `password123`

All users belong to the "CogVeri Demo Company" organization.

## Test Coverage

### Authentication Flow (`auth-flow.spec.ts`)

**Login Tests:**
- ✅ Display login page on initial visit
- ✅ Successfully login with valid credentials
- ✅ Reject login with invalid password
- ✅ Logout successfully

**Organization Selection:**
- ✅ Display user organizations after login
- ✅ No "No organization selected" error
- ✅ Valid organization data from API
- ✅ Access dashboard after organization is available

**API Token Validation:**
- ✅ Reject requests with invalid token
- ✅ Reject requests without token
- ✅ Token has correct structure with type field

## CI/CD Integration

In CI/CD environments:
- Tests run with `CI=true` environment variable
- Tests retry up to 2 times on failure
- Tests run serially (workers: 1)
- Screenshots and videos captured on failure
- HTML report generated in `playwright-report/`

## Debugging Failed Tests

1. **HTML Report**: After test run, open the HTML report:
   ```bash
   npx playwright show-report
   ```

2. **Video Recording**: Check `test-results/` for video recordings of failed tests

3. **Screenshots**: View failure screenshots for visual debugging

4. **Debug Mode**: Run with `--debug` flag to step through tests

## Configuration

See `playwright.config.ts` in the root directory for:
- Test directory configuration
- Browser configurations
- Timeout settings
- Screenshot/video options
- Web server startup commands

## Best Practices

1. **Use descriptive test names** - Clearly describe what the test verifies
2. **Use fixtures** - Keep authentication logic in `fixtures/auth.ts`
3. **Wait for network** - Use `page.waitForLoadState('networkidle')` for API calls
4. **Avoid hard waits** - Use `expect()` assertions instead of `page.waitForTimeout()`
5. **Keep tests isolated** - Each test should be independent

## Troubleshooting

### Tests fail with "Connection refused"

Ensure Docker containers are running:
```bash
docker-compose up -d
```

### Tests timeout waiting for elements

Check browser console for JavaScript errors:
```bash
npx playwright test --debug
```

### Elements not found

Use `page.pause()` to pause test execution and inspect the page

## Future Improvements

- [ ] Add visual regression testing with Playwright
- [ ] Add performance testing
- [ ] Create test data fixtures instead of relying on seeded data
- [ ] Add accessibility testing
- [ ] Add mobile device testing
