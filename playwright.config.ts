import { defineConfig, devices } from '@playwright/test';

/**
 * E2E Test Configuration
 *
 * Supports multiple environments via environment variables:
 *
 * LOCAL DEVELOPMENT (default):
 *   npm run test:e2e
 *   - Auto-starts frontend and backend locally
 *   - Requires local DB, Redis, etc.
 *
 * STAGING ENVIRONMENT:
 *   TEST_ENV=staging npm run test:e2e
 *   - Runs against deployed staging URLs
 *   - No local servers needed
 *   - Set STAGING_FRONTEND_URL and STAGING_BACKEND_URL
 *
 * PRODUCTION (smoke tests only):
 *   TEST_ENV=production npm run test:e2e -- --grep "@smoke"
 *   - Runs against production URLs
 *   - Only run non-destructive smoke tests!
 *   - Set PROD_FRONTEND_URL and PROD_BACKEND_URL
 *
 * CI/CD:
 *   CI=true TEST_ENV=staging npm run test:e2e
 *   - Runs in CI pipeline against staging
 */

// Environment configuration
const TEST_ENV = process.env.TEST_ENV || 'local';

const environments = {
  local: {
    frontendUrl: 'http://localhost:5173',
    backendUrl: 'http://localhost:3000',
    startServers: true,
  },
  staging: {
    frontendUrl: process.env.STAGING_FRONTEND_URL || 'https://staging.cogveri.com',
    backendUrl: process.env.STAGING_BACKEND_URL || 'http://api-staging.cogveri.com',
    startServers: false,
  },
  production: {
    frontendUrl: process.env.PROD_FRONTEND_URL || 'https://cogveri.app',
    backendUrl: process.env.PROD_BACKEND_URL || 'https://api.cogveri.app',
    startServers: false,
  },
};

const env = environments[TEST_ENV as keyof typeof environments] || environments.local;

console.log(`\n🧪 E2E Tests running against: ${TEST_ENV.toUpperCase()}`);
console.log(`   Frontend: ${env.frontendUrl}`);
console.log(`   Backend: ${env.backendUrl}\n`);

export default defineConfig({
  testDir: './tests/e2e',

  /* Run tests sequentially for stability */
  fullyParallel: false,

  /* Fail the build on CI if you accidentally left test.only in the source code. */
  forbidOnly: !!process.env.CI,

  /* Retry on CI only */
  retries: process.env.CI ? 2 : 0,

  /* Limit workers for stability */
  workers: process.env.CI ? 1 : 2,

  /* Increase test timeout for remote environments */
  timeout: TEST_ENV === 'local' ? 60000 : 90000,

  /* Reporter to use. See https://playwright.dev/docs/test-reporters */
  reporter: [['html'], ['list'], ...(process.env.CI ? [['github'] as const] : [])],

  /* Shared settings for all the projects below. */
  use: {
    /* Base URL for frontend */
    baseURL: env.frontendUrl,

    /* Extra HTTP headers for API requests */
    extraHTTPHeaders: {
      'X-Test-Environment': TEST_ENV,
    },

    /* Collect trace when retrying the failed test. */
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',

    /* Longer timeouts for remote environments */
    actionTimeout: TEST_ENV === 'local' ? 15000 : 30000,
    navigationTimeout: TEST_ENV === 'local' ? 30000 : 60000,
  },

  /* Make backend URL available to tests */
  // @ts-expect-error - custom property for tests
  backendUrl: env.backendUrl,

  /* Configure projects for major browsers */
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },

    // Uncomment to test on more browsers
    // {
    //   name: 'firefox',
    //   use: { ...devices['Desktop Firefox'] },
    // },
    // {
    //   name: 'webkit',
    //   use: { ...devices['Desktop Safari'] },
    // },
    // {
    //   name: 'mobile-chrome',
    //   use: { ...devices['Pixel 5'] },
    // },
  ],

  /* Run local dev server only when testing locally */
  ...(env.startServers && {
    webServer: [
      {
        command: 'npm run dev:backend',
        url: 'http://localhost:3000/health',
        reuseExistingServer: !process.env.CI,
        timeout: 120000,
      },
      {
        command: 'npm run dev:frontend',
        url: 'http://localhost:5173',
        reuseExistingServer: !process.env.CI,
        timeout: 120000,
      },
    ],
  }),
});
